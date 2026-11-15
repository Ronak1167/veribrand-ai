import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, addAppealDecision } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import { computeFindingFingerprint } from '@/lib/engine/crypto-audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['reviewer', 'admin']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const sub = getSubmissionById(id, orgId);
    if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    if (sub.status !== 'pending_review') return NextResponse.json({ error: 'Appeals can only be decided on a pending current revision.' }, { status: 409 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    const { findingId, decision, rationale, revisionId } = body;
    const currentRevisionId = sub.currentRevisionId;
    if (!currentRevisionId || revisionId !== currentRevisionId) return NextResponse.json({ error: 'Appeal refers to a stale revision.' }, { status: 409 });
    if (typeof findingId !== 'string' || (decision !== 'accepted' && decision !== 'rejected')) return NextResponse.json({ error: 'Invalid finding or decision.' }, { status: 400 });
    if (typeof rationale !== 'string' || rationale.trim().length < 10 || rationale.length > 5000) return NextResponse.json({ error: 'Rationale must contain 10–5000 characters.' }, { status: 400 });

    const finding = sub.auditResult.findings.find(f => f.id === findingId);
    if (!finding) return NextResponse.json({ error: 'Finding does not belong to the current revision.' }, { status: 409 });

    const fingerprint = computeFindingFingerprint(finding);
    const duplicate = (sub.appealDecisions || []).some(d => d.revisionId === currentRevisionId && d.findingId === findingId);
    if (duplicate) return NextResponse.json({ error: 'This finding already has a decision for the current revision.' }, { status: 409 });

    const appeal = addAppealDecision({
      submissionId: id,
      revisionId: currentRevisionId,
      findingId,
      findingFingerprint: fingerprint,
      decision,
      rationale: rationale.trim(),
      reviewerId: auth.context.user.id,
      reviewerName: auth.context.user.name,
    });
    return NextResponse.json({ ok: true, appeal }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to record appeal decision.' }, { status: 500 });
  }
}
