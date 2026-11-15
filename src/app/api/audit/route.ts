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
  let body: unknown;

  // Strict JSON payload parsing with client-error (400) handling
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload in request body.' },
      { status: 400 }
    );
  }

  // Reject null, primitives, and arrays as root JSON values
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be a valid JSON object.' },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const text = payload.text;
  if (typeof text === 'string' && text.length > 100_000) return NextResponse.json({ error: 'Text exceeds the 100 KB limit.' }, { status: 413 });

  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json(
      { error: 'Field "text" is required and must be a non-empty string.' },
      { status: 400 }
    );
  }

  // Strict channel validation — reject non-string, null, empty, or unlisted channels
  let channel: ChannelType = 'enterprise_web';
  if ('channel' in payload && payload.channel !== undefined) {
    if (
      typeof payload.channel !== 'string' ||
      payload.channel.trim().length === 0 ||
      !ALLOWED_CHANNELS.includes(payload.channel as ChannelType)
    ) {
      return NextResponse.json(
        {
          error: `Invalid channel "${String(payload.channel)}". Allowed channels: ${ALLOWED_CHANNELS.join(', ')}`,
        },
        { status: 400 }
      );
    }
    channel = payload.channel as ChannelType;
  }

  try {
    // If external Python verification service is configured, query it with server-side API key
    if (process.env.PYTHON_ENGINE_URL && process.env.VERIBRAND_PYTHON_API_KEY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const pyResp = await fetch(`${process.env.PYTHON_ENGINE_URL.replace(/\/$/, '')}/api/audit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.VERIBRAND_PYTHON_API_KEY,
          },
          body: JSON.stringify({ text, channel }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (pyResp.ok) {
          const pyResult = await pyResp.json();
          return NextResponse.json(pyResult, { status: 200 });
        }
      } catch {
        // Fall back gracefully to native TypeScript engine if Python service is unreachable
      }
    }

    const result = auditContent(text, channel);
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
    tier1: 'Aho-Corasick Deterministic Filter',
    tier2: 'Configured-Metric Claim Verifier (Tri-State)',
  });
}
