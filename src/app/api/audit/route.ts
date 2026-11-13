// VeriBrand AI — REST API Endpoint for Content Auditing
// Route: POST /api/audit

import { NextRequest, NextResponse } from 'next/server';
import { auditContent } from '@/lib/engine/verifier';
import { ChannelType } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, channel = 'enterprise_web' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Field "text" is required and must be a string.' },
        { status: 400 }
      );
    }

    const result = auditContent(text, channel as ChannelType);

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
    tier1: 'Aho-Corasick Deterministic Filter (<50ms)',
    tier2: 'Grounded Hybrid Claim Verifier (Tri-State)',
  });
}
