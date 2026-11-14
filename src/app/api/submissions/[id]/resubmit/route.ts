import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, addSubmissionRevision } from '@/lib/db/database';
import { getSessionFromRequest } from '@/lib/auth/session';
import { auditContent } from '@/lib/engine/verifier';

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
    const defaultCreatorName = session?.user?.name || sub.creatorName || 'Elena Rostova';

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 });
    }

    const { revisedText, creatorName } = body || {};

    if (!revisedText || typeof revisedText !== 'string' || revisedText.trim().length === 0) {
      return NextResponse.json({ error: 'Field "revisedText" is required.' }, { status: 400 });
    }
    if (revisedText.length > 500_000) {
      return NextResponse.json({ error: 'Payload exceeds maximum limit of 500KB.' }, { status: 413 });
    }

    const finalCreatorName = (creatorName && typeof creatorName === 'string' && creatorName.trim().length > 0)
      ? creatorName.trim()
      : defaultCreatorName;

    // Fresh programmatic audit of the revised text
    const auditResult = auditContent(revisedText, sub.channel);

    const { revisionId, version } = addSubmissionRevision(
      id,
      revisedText,
      auditResult,
      finalCreatorName
    );

    const updated = getSubmissionById(id);
    return NextResponse.json({
      ...updated,
      newRevisionId: revisionId,
      newVersion: version,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
