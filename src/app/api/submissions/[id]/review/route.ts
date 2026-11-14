import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, updateSubmissionApproval, requestSubmissionChanges } from '@/lib/db/database';
import { getSessionFromRequest } from '@/lib/auth/session';
import { generateContentHash, computeFindingFingerprint } from '@/lib/engine/crypto-audit';

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
    // Allow demo/test reviewer fallback if not authenticated in browser
    const reviewerId = session?.user?.id || 'USR-REVIEWER-01';
    const reviewerName = session?.user?.name || 'Marcus Vance (Brand Reviewer)';

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 });
    }

    const { action, approvalMode, exceptionRationale, commentText } = body || {};

    if (action === 'request_changes') {
      if (!commentText || typeof commentText !== 'string' || commentText.trim().length === 0) {
        return NextResponse.json({ error: 'Field "commentText" is required when requesting changes.' }, { status: 400 });
      }
      const updated = requestSubmissionChanges(id, reviewerId, reviewerName, commentText.trim());
      return NextResponse.json(updated);
    }

    if (action === 'approve') {
      // 1. Check approval gate against active revision's accepted appeals
      const currentRevId = sub.currentRevisionId || `${sub.id}-REV-1`;
      const acceptedDecisions = (sub.appealDecisions || []).filter(
        (d) => d.decision === 'accepted' && d.revisionId === currentRevId
      );

      const acceptedKeys = new Set<string>();
      for (const d of acceptedDecisions) {
        if (d.findingFingerprint) acceptedKeys.add(d.findingFingerprint);
        if (d.findingId) acceptedKeys.add(d.findingId);
      }

      const unresolvedCritical = sub.auditResult.findings.filter(
        (f) =>
          f.severity === 'critical' &&
          f.verdict !== 'VERIFIED' &&
          !acceptedKeys.has(computeFindingFingerprint(f)) &&
          !acceptedKeys.has(f.id)
      );

      const mode = approvalMode === 'exception' ? 'exception' : 'standard';

      if (unresolvedCritical.length > 0) {
        if (mode !== 'exception') {
          return NextResponse.json(
            {
              error: `Approval blocked: ${unresolvedCritical.length} critical unresolved findings present on revision '${currentRevId}'. Standard sign-off is restricted. Either accept appeals for these findings on the current revision or provide a structured exception rationale with governance authorization.`,
              unresolvedCount: unresolvedCritical.length,
            },
            { status: 400 }
          );
        }

        if (!exceptionRationale || typeof exceptionRationale !== 'string' || exceptionRationale.trim().length < 15) {
          return NextResponse.json(
            {
              error: 'Exception sign-off requires a detailed governance rationale (minimum 15 characters) specifying executive authorization.',
            },
            { status: 400 }
          );
        }
      }

      // 2. Generate canonical cryptographic SHA-256 hash server-side
      const now = new Date().toISOString();
      const sha256Hash = await generateContentHash(sub.currentText, reviewerName, now);

      const updated = updateSubmissionApproval(
        id,
        reviewerId,
        reviewerName,
        mode,
        sha256Hash,
        mode === 'exception' && typeof exceptionRationale === 'string' ? exceptionRationale.trim() : undefined
      );

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Action must be "approve" or "request_changes".' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
