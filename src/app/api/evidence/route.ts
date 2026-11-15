import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getAllEvidence, addEvidenceDocument, getEvidenceStorageDirectory, getSubmissionOwnerId, isRevisionForSubmission } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const orgId = auth.context.organizationId;
    const evidence = auth.context.orgRole === 'creator'
      ? getAllEvidence(orgId, auth.context.user.id)
      : getAllEvidence(orgId);

    return NextResponse.json({ ok: true, organizationId: orgId, count: evidence.length, evidence });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve evidence.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['creator', 'reviewer', 'admin']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  const orgId = auth.context.organizationId;
  const contentType = req.headers.get('content-type') || '';

  // 1. Multipart Form-Data (Actual File Upload)
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const metricId = String(formData.get('metricId') || '').trim();
      const sectionCitation = String(formData.get('sectionCitation') || '').trim();
      const customDocName = String(formData.get('documentName') || '').trim();
      const submissionId = String(formData.get('submissionId') || '').trim();
      const revisionId = String(formData.get('revisionId') || '').trim();
      const sourceUrl = String(formData.get('sourceUrl') || '').trim() || undefined;
      const sourcePublisher = String(formData.get('sourcePublisher') || '').trim() || undefined;

      if (!metricId || !sectionCitation) {
        return NextResponse.json(
          { ok: false, error: 'metricId and sectionCitation are required.' },
          { status: 400 }
        );
      }

      if (Boolean(submissionId) !== Boolean(revisionId)) {
        return NextResponse.json({ ok: false, error: 'submissionId and revisionId must be provided together.' }, { status: 400 });
      }
      if (submissionId && revisionId) {
        if (!isRevisionForSubmission(submissionId, revisionId)) {
          return NextResponse.json({ ok: false, error: 'The selected revision does not belong to this submission.' }, { status: 400 });
        }
        if (auth.context.orgRole === 'creator' && getSubmissionOwnerId(submissionId) !== auth.context.user.id) {
          return NextResponse.json({ ok: false, error: 'You can only attach evidence to your own submissions.' }, { status: 403 });
        }
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
      const evidenceDir = getEvidenceStorageDirectory();

      const fileExt = path.extname(file.name).toLowerCase() || '.bin';
      // Safe storage key based on UUID and checksum — prevents path traversal
      const storageKey = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;
      const storagePath = path.join(evidenceDir, storageKey);

      fs.writeFileSync(storagePath, buffer);

      const documentName = customDocName || path.basename(file.name);

      const evidence = addEvidenceDocument({
        organizationId: orgId,
        metricId,
        documentName,
        sectionCitation,
        mimeType: file.type,
        fileSizeBytes: file.size,
        sha256Checksum,
        status: 'pending',
        uploadedBy: auth.context.user.id,
        storagePath,
        submissionId: submissionId || undefined,
        revisionId: revisionId || undefined,
        sourceUrl,
        sourcePublisher,
        provenanceState: 'uploaded',
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

    const { metricId, documentName, sectionCitation, sourceUrl, sourcePublisher } = body;
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
      organizationId: orgId,
      metricId: metricId.trim(),
      documentName: documentName.trim(),
      sectionCitation: sectionCitation.trim(),
      uploadedBy: auth.context.user.id,
      status: 'pending',
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl.trim() : undefined,
      sourcePublisher: typeof sourcePublisher === 'string' ? sourcePublisher.trim() : undefined,
      provenanceState: 'uploaded',
    });

    return NextResponse.json({ ok: true, evidence }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to add evidence metadata.' }, { status: 500 });
  }
}
