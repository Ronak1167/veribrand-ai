// VeriBrand AI — REST API Endpoint for Content Auditing
// Route: POST /api/audit

import { NextRequest, NextResponse } from 'next/server';
import { auditContent } from '@/lib/engine/verifier';
import { ChannelType } from '@/types';

const ALLOWED_CHANNELS: ChannelType[] = [
  'enterprise_web',
  'linkedin',
  'twitter',
  'press_release',
  'marketing_email',
];

export async function POST(req: NextRequest) {
  let body: { text?: unknown; channel?: unknown };

  // Strict JSON payload parsing with client-error (400) handling
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload in request body.' },
      { status: 400 }
    );
  }

  const { text, channel = 'enterprise_web' } = body;

  if (!text || typeof text !== 'string') {
    return NextResponse.json(
      { error: 'Field "text" is required and must be a string.' },
      { status: 400 }
    );
  }

  // Strict channel validation
  if (channel && typeof channel === 'string' && !ALLOWED_CHANNELS.includes(channel as ChannelType)) {
    return NextResponse.json(
      {
        error: `Invalid channel "${channel}". Allowed channels: ${ALLOWED_CHANNELS.join(', ')}`,
      },
      { status: 400 }
    );
  }

  try {
    const result = auditContent(text, (channel as ChannelType) || 'enterprise_web');
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    engine: 'VeriBrand AI Audit Engine',
    version: '1.0.0-round2-build',
    status: 'operational',
    tier1: 'Aho-Corasick Deterministic Filter (<1ms)',
    tier2: 'Grounded Hybrid Claim Verifier (Tri-State)',
  });
}
