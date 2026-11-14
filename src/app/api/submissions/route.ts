import { NextRequest, NextResponse } from 'next/server';
import { getAllSubmissions, createSubmission, getDatabase } from '@/lib/db/database';
import { getSessionFromRequest } from '@/lib/auth/session';
import { auditContent } from '@/lib/engine/verifier';
import { ChannelType } from '@/types';
import { PRESET_DRAFTS } from '@/lib/engine/brand-vault-data';

const ALLOWED_CHANNELS: ChannelType[] = [
  'enterprise_web',
  'linkedin',
  'twitter',
  'press_release',
  'marketing_email',
];

function ensureInitialSubmissions() {
  const db = getDatabase();
  const countRow = db.prepare('SELECT count(*) as count FROM submissions;').get() as { count: number };
  if (countRow.count === 0) {
    // Seed default submissions
    createSubmission({
      id: 'SUB-INIT-01',
      title: 'Q4 Product Launch Press Release',
      channel: 'press_release',
      creatorId: 'USR-CREATOR-01',
      creatorName: 'Elena Rostova (Senior Copywriter)',
      text: PRESET_DRAFTS[1].content,
      auditResult: auditContent(PRESET_DRAFTS[1].content, 'press_release'),
    });

    createSubmission({
      id: 'SUB-INIT-02',
      title: 'Global Social Ad Campaign',
      channel: 'linkedin',
      creatorId: 'USR-REVIEWER-01',
      creatorName: 'Marcus Vance (Growth Lead)',
      text: PRESET_DRAFTS[2].content,
      auditResult: auditContent(PRESET_DRAFTS[2].content, 'linkedin'),
    });
  }
}

export async function GET() {
  try {
    ensureInitialSubmissions();
    const list = getAllSubmissions();
    return NextResponse.json({ ok: true, submissions: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    // Fallback: If in unauthenticated local test mode, allow demo creator
    const creatorId = session?.user?.id || 'USR-CREATOR-01';
    const creatorName = session?.user?.name || 'Elena Rostova';

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Malformed JSON payload.' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const channel = body.channel as ChannelType;
    const bodyText = typeof body.text === 'string'
      ? body.text
      : (typeof body.originalText === 'string' ? body.originalText : '');
    const clientCreator = typeof body.creatorName === 'string' && body.creatorName.trim().length > 0
      ? body.creatorName.trim()
      : null;
    const effectiveCreatorName = clientCreator || creatorName;

    if (!title) {
      return NextResponse.json({ ok: false, error: 'Field "title" is required.' }, { status: 400 });
    }
    if (!bodyText || bodyText.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'Field "text" (or "originalText") is required.' }, { status: 400 });
    }
    if (bodyText.length > 500_000) {
      return NextResponse.json({ ok: false, error: 'Payload exceeds maximum limit of 500KB.' }, { status: 413 });
    }

    const validatedChannel: ChannelType = ALLOWED_CHANNELS.includes(channel) ? channel : 'enterprise_web';
    const auditResult = auditContent(bodyText, validatedChannel);

    const submission = createSubmission({
      title,
      channel: validatedChannel,
      creatorId,
      creatorName: effectiveCreatorName,
      text: bodyText,
      auditResult,
    });

    return NextResponse.json({ ok: true, submission }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
