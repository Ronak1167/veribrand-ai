import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getBrandAssets, addBrandAsset, deleteBrandAsset, getEvidenceStorageDirectory } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import { BrandAsset } from '@/types';

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const orgId = auth.context.organizationId;
    const url = new URL(req.url);
    const assetType = url.searchParams.get('type') as BrandAsset['assetType'] | null;
    const assets = getBrandAssets(orgId, assetType || undefined);

    return NextResponse.json({ ok: true, organizationId: orgId, count: assets.length, assets });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve brand assets.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['admin', 'owner', 'reviewer']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  const orgId = auth.context.organizationId;
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const name = String(formData.get('name') || '').trim();
      const assetType = String(formData.get('assetType') || 'logo_primary').trim() as BrandAsset['assetType'];
      const allowedAssetTypes: BrandAsset['assetType'][] = ['logo_primary', 'logo_secondary', 'logo_monochrome', 'logo_icon', 'palette_swatch', 'marketing_image', 'font'];
      if (!allowedAssetTypes.includes(assetType)) return NextResponse.json({ ok: false, error: 'Unsupported brand asset type.' }, { status: 400 });

      if (!file || typeof file === 'string') {
        return NextResponse.json({ ok: false, error: 'A valid file is required.' }, { status: 400 });
      }

      if (!name) {
        return NextResponse.json({ ok: false, error: 'Asset name is required.' }, { status: 400 });
      }

      if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: 'Asset must be between 1 byte and 10 MB.' }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!isPng && !isJpeg && !isWebp) {
        return NextResponse.json({ ok: false, error: 'Only valid PNG, JPEG and WebP raster assets are accepted.' }, { status: 415 });
      }
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      const storageDir = getEvidenceStorageDirectory(orgId);
      const fileExt = isPng ? '.png' : isJpeg ? '.jpg' : '.webp';
      const storageKey = `asset-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${fileExt}`;
      const storagePath = path.join(storageDir, storageKey);

      fs.writeFileSync(storagePath, buffer);

      const asset = addBrandAsset({
        organizationId: orgId,
        name,
        assetType,
        storagePath,
        mimeType: isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/webp',
        fileSizeBytes: file.size,
        sha256Checksum: sha256,
        // Dimensions are intentionally not accepted from client metadata. Pixel inspection derives them from the file.
        uploadedBy: auth.context.user.id,
      });

      return NextResponse.json({ ok: true, asset }, { status: 201 });
    } catch {
      return NextResponse.json({ ok: false, error: 'Failed to process asset upload.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: 'Brand assets must be uploaded as multipart/form-data; metadata-only registration is disabled.' }, { status: 415 });
}

export async function DELETE(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['admin', 'owner']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  const url = new URL(req.url);
  const assetId = url.searchParams.get('id');
  if (!assetId) {
    return NextResponse.json({ ok: false, error: 'Asset id query parameter is required.' }, { status: 400 });
  }

  const deleted = deleteBrandAsset(assetId, auth.context.organizationId);
  return NextResponse.json({ ok: deleted, deleted, assetId });
}
