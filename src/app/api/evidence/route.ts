// VeriBrand AI — Evidence Management API
import { NextRequest, NextResponse } from 'next/server';
import { getAllEvidence, addEvidenceDocument } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';

export async function GET() {
  try {
    const evidenceList = getAllEvidence();
    return NextResponse.json({
      ok: true,
      count: evidenceList.length,
      evidence: evidenceList,
    });
  } catch (err: unknown) {
    console.error('Evidence GET error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal error retrieving evidence documents' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    const authCheck = requireRole(session?.user || null, ['reviewer', 'admin']);
    if (!authCheck.allowed) {
      return NextResponse.json({ ok: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { metricId, documentName, sectionCitation, mimeType, fileSizeBytes, sha256Checksum, status } = body;

    if (!metricId || typeof metricId !== 'string') {
      return NextResponse.json({ ok: false, error: 'metricId is required and must be a string' }, { status: 400 });
    }
    if (!documentName || typeof documentName !== 'string') {
      return NextResponse.json({ ok: false, error: 'documentName is required and must be a string' }, { status: 400 });
    }
    if (!sectionCitation || typeof sectionCitation !== 'string') {
      return NextResponse.json({ ok: false, error: 'sectionCitation is required and must be a string' }, { status: 400 });
    }

    const doc = addEvidenceDocument({
      metricId: metricId.trim(),
      documentName: documentName.trim(),
      sectionCitation: sectionCitation.trim(),
      mimeType: typeof mimeType === 'string' ? mimeType : undefined,
      fileSizeBytes: typeof fileSizeBytes === 'number' ? fileSizeBytes : undefined,
      sha256Checksum: typeof sha256Checksum === 'string' ? sha256Checksum : undefined,
      status: typeof status === 'string' ? status : 'verified',
      uploadedBy: session!.user.name,
    });

    return NextResponse.json({
      ok: true,
      evidence: doc,
    }, { status: 201 });
  } catch (err: unknown) {
    console.error('Evidence POST error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal error creating evidence document' },
      { status: 500 }
    );
  }
}
