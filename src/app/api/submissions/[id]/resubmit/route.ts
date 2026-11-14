import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, addSubmissionRevision, getSubmissionOwnerId } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';
import { auditContent } from '@/lib/engine/verifier';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['creator']);
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const { id } = await params;
    const sub = getSubmissionById(id);
    if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    if (getSubmissionOwnerId(id) !== session!.user.id && session!.user.role !== 'admin') return NextResponse.json({ error: 'You may only revise your own submissions.' }, { status: 403 });
    if (sub.status !== 'changes_requested') return NextResponse.json({ error: 'Submission is not awaiting changes.' }, { status: 409 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body.revisedText !== 'string' || !body.revisedText.trim()) return NextResponse.json({ error: 'Revised text is required.' }, { status: 400 });
    if (body.revisedText.length > 100_000) return NextResponse.json({ error: 'Revised text exceeds 100 KB.' }, { status: 413 });
    const auditResult = auditContent(body.revisedText, sub.channel);
    const { revisionId, version } = addSubmissionRevision(id, body.revisedText, auditResult, session!.user.name);
    return NextResponse.json({ ok: true, submission: getSubmissionById(id), newRevisionId: revisionId, newVersion: version });
  } catch {
    return NextResponse.json({ error: 'Unable to resubmit revision.' }, { status: 500 });
  }
}
