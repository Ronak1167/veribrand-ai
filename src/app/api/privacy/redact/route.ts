// VeriBrand AI — Enhanced PII & Secret Redaction Governance API
// Redacts emails, international & Indian phones, Aadhaar, PAN, SSNs, credit cards, credentials, and internal IPs.
// Never exposes raw sensitive match snippets in responses or logs.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export type RedactionType =
  | 'email'
  | 'phone'
  | 'pan'
  | 'aadhaar'
  | 'ssn'
  | 'credit_card'
  | 'api_key'
  | 'internal_ip';

interface RedactionFinding {
  type: RedactionType;
  startIndex: number;
  endIndex: number;
}

interface RedactionRule {
  type: RedactionType;
  regex: RegExp;
  replacement: string;
  validate?: (match: string) => boolean;
}

const REDACTION_RULES: RedactionRule[] = [
  // 1. Secrets & Credentials
  {
    type: 'api_key',
    regex: /(?:bearer\s+[A-Za-z0-9\-._~+/]+=*|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?)/gi,
    replacement: '[REDACTED_SECRET]',
  },
  // 2. US Social Security Number (SSN)
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_SSN]',
    validate: (m) => !m.startsWith('000') && !m.startsWith('666'),
  },
  // 3. Indian Permanent Account Number (PAN) - 5 uppercase letters, 4 digits, 1 uppercase letter
  {
    type: 'pan',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    replacement: '[REDACTED_PAN]',
    validate: (m) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(m),
  },
  // 4. Indian Aadhaar Number - 12 digits (starting with 2-9), optionally grouped in 4s
  {
    type: 'aadhaar',
    regex: /\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
    replacement: '[REDACTED_AADHAAR]',
    validate: (m) => {
      const digits = m.replace(/[\s\-]/g, '');
      // Aadhaar cannot be repeating identical digits like 111111111111
      if (/^(\d)\1{11}$/.test(digits)) return false;
      return digits.length === 12;
    },
  },
  // 5. Payment Cards
  {
    type: 'credit_card',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: '[REDACTED_CREDIT_CARD]',
  },
  // 6. Email Addresses
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  // 7. Phones: US and Indian Formats (+91, 0, or bare 10-digit starting with 6-9)
  {
    type: 'phone',
    regex: /\b(?:\+91[\-\s]?|91[\-\s]?|0)?[6-9]\d{9}\b|\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
    validate: (m) => {
      // Avoid false positive matching dates like 2026-11-15
      if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return false;
      return true;
    },
  },
  // 8. RFC 1918 Private Internal IPs
  {
    type: 'internal_ip',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[REDACTED_INTERNAL_IP]',
  },
];

export async function POST(req: NextRequest) {
  if (!getSessionFromRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof body.text !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'text is required and must be a string' },
        { status: 400 }
      );
    }

    const originalText: string = body.text;
    if (originalText.length > 100_000) {
      return NextResponse.json({ ok: false, error: 'Text exceeds the 100 KB limit.' }, { status: 413 });
    }

    let redactedText = originalText;
    const findings: RedactionFinding[] = [];

    for (const rule of REDACTION_RULES) {
      rule.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.regex.exec(originalText)) !== null) {
        if (!rule.validate || rule.validate(match[0])) {
          findings.push({
            type: rule.type,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
        }
      }

      // Perform replacement with optional validator
      if (rule.validate) {
        redactedText = redactedText.replace(rule.regex, (m) =>
          rule.validate!(m) ? rule.replacement : m
        );
      } else {
        redactedText = redactedText.replace(rule.regex, rule.replacement);
      }
    }

    // Sort findings by position
    findings.sort((a, b) => a.startIndex - b.startIndex);

    return NextResponse.json({
      ok: true,
      originalLength: originalText.length,
      redactedLength: redactedText.length,
      redactionsCount: findings.length,
      // Findings expose only type and index boundaries — NO raw sensitive match content
      findings,
      redactedText,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error performing privacy redaction.' },
      { status: 500 }
    );
  }
}
