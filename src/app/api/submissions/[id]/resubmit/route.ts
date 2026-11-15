import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, addSubmissionRevision, getSubmissionOwnerId } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import { auditContentWithEvidence } from '@/lib/engine/evidence-verifier';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['creator', 'admin']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const sub = getSubmissionById(id, orgId);
    if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });

    if (getSubmissionOwnerId(id) !== auth.context.user.id && auth.context.user.role !== 'admin' && auth.context.orgRole !== 'owner') {
      return NextResponse.json({ error: 'You may only revise your own submissions.' }, { status: 403 });
    }
    if (sub.status !== 'changes_requested') {
      return NextResponse.json({ error: 'Submission is not awaiting changes.' }, { status: 409 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.revisedText !== 'string' || !body.revisedText.trim()) {
      return NextResponse.json({ error: 'Revised text is required.' }, { status: 400 });
    }
    if (body.revisedText.length > 100_000) {
      return NextResponse.json({ error: 'Revised text exceeds 100 KB.' }, { status: 413 });
    }

    const targetOrg = sub.organizationId || auth.context.organizationId;
    const auditResult = auditContentWithEvidence(body.revisedText, sub.channel, targetOrg);
    const { revisionId, version } = addSubmissionRevision(id, body.revisedText, auditResult, auth.context.user.name);
    return NextResponse.json({
      ok: true,
      submission: getSubmissionById(id, targetOrg),
      newRevisionId: revisionId,
      newVersion: version,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to resubmit revision.' }, { status: 500 });
  }
}
