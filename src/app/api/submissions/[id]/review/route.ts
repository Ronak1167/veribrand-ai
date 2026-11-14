import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSubmissionById, updateSubmissionApproval, requestSubmissionChanges } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';
import { computeFindingFingerprint } from '@/lib/engine/crypto-audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['reviewer']);
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const { id } = await params;
    const sub = getSubmissionById(id);
    if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    if (sub.status !== 'pending_review') return NextResponse.json({ error: 'Only the current pending revision can be reviewed.' }, { status: 409 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    const reviewerId = session!.user.id;
    const reviewerName = session!.user.name;
    if (body.action === 'request_changes') {
      if (typeof body.commentText !== 'string' || body.commentText.trim().length < 5 || body.commentText.length > 5000) return NextResponse.json({ error: 'A revision request of 5–5000 characters is required.' }, { status: 400 });
      return NextResponse.json({ ok: true, submission: requestSubmissionChanges(id, reviewerId, reviewerName, body.commentText.trim()) });
    }
    if (body.action !== 'approve') return NextResponse.json({ error: 'Action must be approve or request_changes.' }, { status: 400 });
    const currentRevisionId = sub.currentRevisionId;
    const unresolved = sub.auditResult.findings.filter(f => f.severity === 'critical' && f.verdict !== 'VERIFIED' && !(sub.appealDecisions || []).some(d => d.decision === 'accepted' && d.revisionId === currentRevisionId && d.findingId === f.id && d.findingFingerprint === computeFindingFingerprint(f)));
    const mode = body.approvalMode === 'exception' ? 'exception' : 'standard';
    if (unresolved.length && mode !== 'exception') return NextResponse.json({ error: 'Approval blocked by unresolved critical findings.', unresolvedCount: unresolved.length }, { status: 409 });
    if (mode === 'exception' && (typeof body.exceptionRationale !== 'string' || body.exceptionRationale.trim().length < 20)) return NextResponse.json({ error: 'Exception rationale must contain at least 20 characters.' }, { status: 400 });
    const revision = (sub.revisionHistory || []).find(r => r.revisionId === currentRevisionId);
    const revisionContentHash = crypto.createHash('sha256').update(sub.currentText, 'utf8').digest('hex');
    if (!revision || revision.text !== sub.currentText || revision.sha256Hash !== revisionContentHash) return NextResponse.json({ error: 'Current revision integrity check failed.' }, { status: 409 });
    const timestamp = new Date().toISOString();
    const canonicalApproval = JSON.stringify({ version: 1, submissionId: id, revisionId: currentRevisionId, channel: sub.channel, text: sub.currentText, reviewer: reviewerName, approvedAt: timestamp });
    const sha256Hash = crypto.createHash('sha256').update(canonicalApproval, 'utf8').digest('hex');
    const updated = updateSubmissionApproval(id, reviewerId, reviewerName, mode, sha256Hash, mode === 'exception' ? (body.exceptionRationale as string).trim() : undefined, currentRevisionId, timestamp);
    return NextResponse.json({ ok: true, submission: updated, approvedRevisionId: currentRevisionId, approvedAt: timestamp });
  } catch {
    return NextResponse.json({ error: 'Unable to complete review action.' }, { status: 500 });
  }
}
