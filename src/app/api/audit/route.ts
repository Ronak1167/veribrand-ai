import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import { auditContentWithEvidence } from '@/lib/engine/evidence-verifier';
import type { ChannelType } from '@/types';

const CHANNELS: ChannelType[] = ['enterprise_web', 'linkedin', 'twitter', 'press_release', 'marketing_email'];

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status || 401 });
  }
  const orgId = auth.context.organizationId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'A JSON object is required.' }, { status: 400 });
  if (typeof body.text !== 'string' || !body.text.trim()) return NextResponse.json({ error: 'Non-empty text is required.' }, { status: 400 });
  if (body.text.length > 100_000) return NextResponse.json({ error: 'Text exceeds the 100 KB limit.' }, { status: 413 });
  const channel = body.channel === undefined ? 'enterprise_web' : body.channel;
  if (typeof channel !== 'string' || !CHANNELS.includes(channel as ChannelType)) return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
  try {
    const result = auditContentWithEvidence(body.text, channel as ChannelType, orgId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Evidence-grounded audit failed.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status || 401 });
  }
  const orgId = auth.context.organizationId;
  return NextResponse.json({
    engine: 'VeriBrand AI Evidence-Grounded TypeScript Verifier',
    version: '2.0.0',
    organizationId: orgId,
    status: 'operational',
    authority: 'server-side TypeScript engine; Python service is not used for authoritative verdicts',
    verdictPolicy: 'Only current reviewer-approved evidence facts may produce VERIFIED claim findings.',
  });
}
