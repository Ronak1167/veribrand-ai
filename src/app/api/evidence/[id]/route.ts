import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getEvidenceById, updateEvidenceStatus } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['creator', 'reviewer', 'admin']);
  if (!access.allowed) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const { id } = await params;
    const evidence = getEvidenceById(id);
    if (!evidence) {
      return NextResponse.json({ ok: false, error: 'Evidence record not found.' }, { status: 404 });
    }

    const url = new URL(req.url);
    const shouldDownload = url.searchParams.get('download') === '1';

    if (shouldDownload && evidence.storagePath && fs.existsSync(evidence.storagePath)) {
      const fileBuffer = fs.readFileSync(evidence.storagePath);
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

    return NextResponse.json({ ok: true, evidence });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to retrieve evidence.' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['reviewer', 'admin']);
  if (!access.allowed) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const { id } = await params;
    const existing = getEvidenceById(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Evidence record not found.' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const { status, notes } = body;
    if (status !== 'verified' && status !== 'rejected') {
      return NextResponse.json(
        { ok: false, error: 'Status must be either "verified" or "rejected".' },
        { status: 400 }
      );
    }

    const updated = updateEvidenceStatus({
      id,
      status,
      reviewerId: session!.user.id,
      notes: typeof notes === 'string' ? notes.trim() : undefined,
    });

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Failed to update evidence status.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      evidence: getEvidenceById(id),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error updating evidence.' }, { status: 500 });
  }
}
