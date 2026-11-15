import { NextRequest, NextResponse } from 'next/server';
import { getAllSubmissions, getSubmissionsForCreator, createSubmission, verifySubmissionApprovalIntegrity } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import { auditContentWithEvidence } from '@/lib/engine/evidence-verifier';
import { ChannelType } from '@/types';

const ALLOWED_CHANNELS: ChannelType[] = ['enterprise_web', 'linkedin', 'twitter', 'press_release', 'marketing_email'];

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const orgId = auth.context.organizationId;
    const records = auth.context.orgRole === 'creator'
      ? getSubmissionsForCreator(auth.context.user.id, orgId)
      : getAllSubmissions(orgId);

    const submissions = records.map(sub => ({
      ...sub,
      integrityVerified: sub.status === 'approved' ? verifySubmissionApprovalIntegrity(sub.id) : null,
    }));

    return NextResponse.json({ ok: true, organizationId: orgId, submissions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve submissions.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['creator', 'reviewer', 'admin']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'A JSON object is required.' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const text = typeof body.text === 'string' ? body.text : typeof body.originalText === 'string' ? body.originalText : '';
    const channel = body.channel as ChannelType;

    if (!title || title.length > 160) {
      return NextResponse.json({ ok: false, error: 'Title is required and must be at most 160 characters.' }, { status: 400 });
    }
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'Submission text is required.' }, { status: 400 });
    }
    if (text.length > 100_000) {
      return NextResponse.json({ ok: false, error: 'Submission exceeds the 100 KB limit.' }, { status: 413 });
    }
    if (!ALLOWED_CHANNELS.includes(channel)) {
      return NextResponse.json({ ok: false, error: 'Invalid channel.' }, { status: 400 });
    }

    const orgId = auth.context.organizationId;
    const auditResult = auditContentWithEvidence(text, channel, orgId);
    const submission = createSubmission({
      title,
      channel,
      creatorId: auth.context.user.id,
      creatorName: auth.context.user.name,
      text,
      auditResult,
      organizationId: orgId,
    });

    return NextResponse.json({ ok: true, submission }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint/.test(error.message)) {
      return NextResponse.json({ ok: false, error: 'A submission with this identifier already exists.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'Unable to create submission.' }, { status: 500 });
  }
}
