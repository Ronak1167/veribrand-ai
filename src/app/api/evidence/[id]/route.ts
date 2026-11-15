import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getEvidenceById, updateEvidenceStatus, getEvidenceStorageDirectory } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';

function toPublicEvidence<T extends { storagePath?: string | null }>(record: T): Omit<T, 'storagePath'> {
  const safe = { ...record };
  Reflect.deleteProperty(safe, 'storagePath');
  return safe;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const evidence = getEvidenceById(id, orgId);

    if (!evidence || (auth.context.orgRole === 'creator' && evidence.uploadedBy !== auth.context.user.id)) {
      return NextResponse.json({ ok: false, error: 'Evidence record not found in active organization.' }, { status: 404 });
    }

    const url = new URL(req.url);
    const shouldDownload = url.searchParams.get('download') === '1';

    if (shouldDownload && evidence.storagePath) {
      const resolvedPath = path.resolve(evidence.storagePath);
      const evidenceRoot = path.resolve(getEvidenceStorageDirectory()) + path.sep;
      if (!resolvedPath.startsWith(evidenceRoot) || !fs.existsSync(resolvedPath)) {
        return NextResponse.json({ ok: false, error: 'Evidence file is unavailable.' }, { status: 404 });
      }
      const fileBuffer = fs.readFileSync(resolvedPath);
      const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      if (!evidence.sha256Checksum || actualChecksum !== evidence.sha256Checksum) {
        return NextResponse.json({ ok: false, error: 'Evidence integrity check failed; download blocked.' }, { status: 409 });
      }
      const safeFilename = path.basename(evidence.documentName).replace(/[^a-zA-Z0-9._-]/g, '_');

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': evidence.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
          'Content-Length': String(fileBuffer.length),
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    return NextResponse.json({ ok: true, evidence: toPublicEvidence(evidence) });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to retrieve evidence.' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['reviewer', 'admin']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const existing = getEvidenceById(id, orgId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Evidence record not found in active organization.' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const { status, notes, approvedValue, validFrom, validUntil } = body;
    if (status === 'verified' && (!existing.hasFile || !existing.sha256Checksum)) {
      return NextResponse.json({ ok: false, error: 'Metadata-only records cannot become trusted facts. Upload and inspect the source file first.' }, { status: 409 });
    }
    if (status !== 'verified' && status !== 'rejected') {
      return NextResponse.json(
        { ok: false, error: 'Status must be either "verified" or "rejected".' },
        { status: 400 }
      );
    }

    if (status === 'verified' && (typeof approvedValue !== 'string' || !approvedValue.trim())) {
      return NextResponse.json({ ok: false, error: 'Enter the exact approved fact/value transcribed from the source before marking it verified.' }, { status: 400 });
    }
    if (validFrom && (typeof validFrom !== 'string' || Number.isNaN(Date.parse(validFrom)))) {
      return NextResponse.json({ ok: false, error: 'validFrom must be a valid date.' }, { status: 400 });
    }
    if (validUntil && (typeof validUntil !== 'string' || Number.isNaN(Date.parse(validUntil)))) {
      return NextResponse.json({ ok: false, error: 'validUntil must be a valid date.' }, { status: 400 });
    }
    if (validFrom && validUntil && Date.parse(validUntil) < Date.parse(validFrom)) {
      return NextResponse.json({ ok: false, error: 'validUntil cannot precede validFrom.' }, { status: 400 });
    }

    const updated = updateEvidenceStatus({
      id,
      status,
      reviewerId: auth.context.user.id,
      notes: typeof notes === 'string' ? notes.trim() : undefined,
      approvedValue: typeof approvedValue === 'string' ? approvedValue.trim() : undefined,
      validFrom: typeof validFrom === 'string' ? validFrom : undefined,
      validUntil: typeof validUntil === 'string' ? validUntil : undefined,
    });

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Failed to update evidence status.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      evidence: (() => {
        const record = getEvidenceById(id, orgId);
        if (!record) return null;
        return toPublicEvidence(record);
      })(),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error updating evidence.' }, { status: 500 });
  }
}
