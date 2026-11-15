import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getAllEvidence, addEvidenceDocument } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['creator', 'reviewer']);
  if (!access.allowed) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const evidence = getAllEvidence();
    return NextResponse.json({ ok: true, count: evidence.length, evidence });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve evidence.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['creator', 'reviewer']);
  if (!access.allowed) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const contentType = req.headers.get('content-type') || '';

  // 1. Multipart Form-Data (Actual File Upload)
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const metricId = String(formData.get('metricId') || '').trim();
      const sectionCitation = String(formData.get('sectionCitation') || '').trim();
      const customDocName = String(formData.get('documentName') || '').trim();

      if (!metricId || !sectionCitation) {
        return NextResponse.json(
          { ok: false, error: 'metricId and sectionCitation are required.' },
          { status: 400 }
        );
      }

      if (!file || typeof file === 'string') {
        return NextResponse.json(
          { ok: false, error: 'A valid file is required in the "file" field.' },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, error: 'File size exceeds maximum limit of 10 MB.' },
          { status: 413 }
        );
      }

      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Unsupported file type "${file.type}". Allowed types: application/pdf, image/png, image/jpeg, text/plain.`,
          },
          { status: 415 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const sha256Checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      // Secure file storage in data/evidence/
      const evidenceDir = path.resolve(process.cwd(), 'data', 'evidence');
      if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
      }

      const fileExt = path.extname(file.name).toLowerCase() || '.bin';
      // Safe storage key based on UUID and checksum — prevents path traversal
      const storageKey = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;
      const storagePath = path.join(evidenceDir, storageKey);

      fs.writeFileSync(storagePath, buffer);

      const documentName = customDocName || path.basename(file.name);

      const evidence = addEvidenceDocument({
        metricId,
        documentName,
        sectionCitation,
        mimeType: file.type,
        fileSizeBytes: file.size,
        sha256Checksum,
        status: 'pending',
        uploadedBy: session!.user.id,
        storagePath,
      });

      return NextResponse.json({ ok: true, evidence }, { status: 201 });
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Failed to process evidence file upload.' },
        { status: 500 }
      );
    }
  }

  // 2. JSON Body (Metadata Registration)
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { metricId, documentName, sectionCitation } = body;
    if (
      typeof metricId !== 'string' ||
      typeof documentName !== 'string' ||
      typeof sectionCitation !== 'string' ||
      !metricId.trim() ||
      !documentName.trim() ||
      !sectionCitation.trim()
    ) {
      return NextResponse.json(
        { ok: false, error: 'Evidence metadata is incomplete.' },
        { status: 400 }
      );
    }

    const evidence = addEvidenceDocument({
      metricId: metricId.trim(),
      documentName: documentName.trim(),
      sectionCitation: sectionCitation.trim(),
      uploadedBy: session!.user.id,
      status: 'pending',
    });

    return NextResponse.json({ ok: true, evidence }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to add evidence metadata.' }, { status: 500 });
  }
}
