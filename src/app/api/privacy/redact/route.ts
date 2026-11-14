// VeriBrand AI — PII & Secret Redaction Governance API
// Redacts emails, phones, SSNs, credit cards, credentials, and internal IPs.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

interface RedactionFinding {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'api_key' | 'internal_ip';
  startIndex: number;
  endIndex: number;
}

const REDACTION_PATTERNS: { type: RedactionFinding['type']; regex: RegExp; replacement: string }[] = [
  {
    type: 'api_key',
    regex: /(?:bearer\s+[A-Za-z0-9\-._~+/]+=*|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?)/gi,
    replacement: '[REDACTED_SECRET]',
  },
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_SSN]',
  },
  {
    type: 'credit_card',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: '[REDACTED_CREDIT_CARD]',
  },
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    type: 'phone',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    type: 'internal_ip',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[REDACTED_INTERNAL_IP]',
  },
];

export async function POST(req: NextRequest) {
  if (!getSessionFromRequest(req)) return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof body.text !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'text is required and must be a string' },
        { status: 400 }
      );
    }

    const originalText: string = body.text;
    if (originalText.length > 100_000) return NextResponse.json({ ok: false, error: 'Text exceeds the 100 KB limit.' }, { status: 413 });
    let redactedText = originalText;
    const findings: RedactionFinding[] = [];

    for (const rule of REDACTION_PATTERNS) {
      let match: RegExpExecArray | null;
      // Reset regex state
      rule.regex.lastIndex = 0;
      while ((match = rule.regex.exec(originalText)) !== null) {
        findings.push({
          type: rule.type,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
      redactedText = redactedText.replace(rule.regex, rule.replacement);
    }

    return NextResponse.json({
      ok: true,
      originalLength: originalText.length,
      redactedLength: redactedText.length,
      redactionsCount: findings.length,
      findings,
      redactedText,
    });
  } catch (err: unknown) {
    console.error('Privacy redaction API error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error performing privacy redaction' },
      { status: 500 }
    );
  }
}
