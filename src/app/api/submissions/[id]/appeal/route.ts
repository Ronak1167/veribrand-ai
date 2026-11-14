import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, addAppealDecision } from '@/lib/db/database';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sub = getSubmissionById(id);
    if (!sub) {
      return NextResponse.json({ error: `Submission '${id}' not found.` }, { status: 404 });
    }

    const session = getSessionFromRequest(req);
    const reviewerId = session?.user?.id || 'USR-REVIEWER-01';
    const defaultReviewerName = session?.user?.name || 'Marcus Vance (Brand Reviewer)';

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 });
    }

    const { findingId, findingFingerprint, decision, rationale, reviewerName } = body || {};

    if (!findingId || typeof findingId !== 'string') {
      return NextResponse.json({ error: 'Field "findingId" is required.' }, { status: 400 });
    }
    if (decision !== 'accepted' && decision !== 'rejected') {
      return NextResponse.json({ error: 'Field "decision" must be "accepted" or "rejected".' }, { status: 400 });
    }
    if (!rationale || typeof rationale !== 'string' || rationale.trim().length === 0) {
      return NextResponse.json({ error: 'Field "rationale" is required for appeal adjudication.' }, { status: 400 });
    }

    const currentRevisionId = sub.currentRevisionId || `${sub.id}-REV-1`;
    const finalReviewerName = (reviewerName && typeof reviewerName === 'string' && reviewerName.trim().length > 0)
      ? reviewerName.trim()
      : defaultReviewerName;

    const appeal = addAppealDecision({
      submissionId: id,
      revisionId: currentRevisionId,
      findingId,
      findingFingerprint: typeof findingFingerprint === 'string' && findingFingerprint ? findingFingerprint : findingId,
      decision,
      rationale: rationale.trim(),
      reviewerId,
      reviewerName: finalReviewerName,
    });

    return NextResponse.json(appeal, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
