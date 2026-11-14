import { NextRequest, NextResponse } from 'next/server';
import { getAllEvidence, addEvidenceDocument } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['creator', 'reviewer']);
  if (!access.allowed) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try { const evidence = getAllEvidence(); return NextResponse.json({ ok: true, count: evidence.length, evidence }); }
  catch { return NextResponse.json({ ok: false, error: 'Unable to retrieve evidence.' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['reviewer']);
  if (!access.allowed) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
    const { metricId, documentName, sectionCitation } = body;
    if (typeof metricId !== 'string' || typeof documentName !== 'string' || typeof sectionCitation !== 'string' || !metricId.trim() || !documentName.trim() || !sectionCitation.trim()) return NextResponse.json({ ok: false, error: 'Evidence metadata is incomplete.' }, { status: 400 });
    return NextResponse.json({ ok: true, evidence: addEvidenceDocument({ metricId: metricId.trim(), documentName: documentName.trim(), sectionCitation: sectionCitation.trim(), uploadedBy: session!.user.id, status: 'pending' }) }, { status: 201 });
  } catch { return NextResponse.json({ ok: false, error: 'Unable to add evidence metadata.' }, { status: 500 }); }
}
