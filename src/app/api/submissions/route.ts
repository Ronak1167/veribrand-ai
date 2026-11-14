import { NextRequest, NextResponse } from 'next/server';
import { getAllSubmissions, getSubmissionsForCreator, createSubmission, verifySubmissionApprovalIntegrity } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';
import { auditContent } from '@/lib/engine/verifier';
import { ChannelType } from '@/types';

const ALLOWED_CHANNELS: ChannelType[] = ['enterprise_web', 'linkedin', 'twitter', 'press_release', 'marketing_email'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
  try {
    const records = session.user.role === 'creator' ? getSubmissionsForCreator(session.user.id) : getAllSubmissions();
    const submissions = records.map(sub => ({ ...sub, integrityVerified: sub.status === 'approved' ? verifySubmissionApprovalIntegrity(sub.id) : null }));
    return NextResponse.json({ ok: true, submissions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve submissions.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['creator']);
  if (!access.allowed) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ ok: false, error: 'A JSON object is required.' }, { status: 400 });
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const text = typeof body.text === 'string' ? body.text : typeof body.originalText === 'string' ? body.originalText : '';
    const channel = body.channel as ChannelType;
    if (!title || title.length > 160) return NextResponse.json({ ok: false, error: 'Title is required and must be at most 160 characters.' }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ ok: false, error: 'Submission text is required.' }, { status: 400 });
    if (text.length > 100_000) return NextResponse.json({ ok: false, error: 'Submission exceeds the 100 KB limit.' }, { status: 413 });
    if (!ALLOWED_CHANNELS.includes(channel)) return NextResponse.json({ ok: false, error: 'Invalid channel.' }, { status: 400 });
    const submission = createSubmission({ title, channel, creatorId: session!.user.id, creatorName: session!.user.name, text, auditResult: auditContent(text, channel) });
    return NextResponse.json({ ok: true, submission }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint/.test(error.message)) return NextResponse.json({ ok: false, error: 'A submission with this identifier already exists.' }, { status: 409 });
    return NextResponse.json({ ok: false, error: 'Unable to create submission.' }, { status: 500 });
  }
}
