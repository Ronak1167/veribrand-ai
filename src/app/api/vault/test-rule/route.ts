import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'A valid JSON body is required.' }, { status: 400 });
  }

  const sampleText = typeof body.sampleText === 'string' ? body.sampleText : '';
  const patterns: string[] = Array.isArray(body.forbiddenPatterns)
    ? body.forbiddenPatterns.filter((p: unknown): p is string => typeof p === 'string').map((p: string) => p.trim()).filter(Boolean)
    : [];
  const approvedAlternative = typeof body.approvedAlternative === 'string' ? body.approvedAlternative.trim() : '';
  const caseSensitive = Boolean(body.caseSensitive);

  if (!sampleText.trim()) {
    return NextResponse.json({ ok: false, error: 'sampleText is required.' }, { status: 400 });
  }

  if (patterns.length === 0) {
    return NextResponse.json({ ok: false, error: 'At least one forbidden pattern is required.' }, { status: 400 });
  }

  const matches: Array<{
    pattern: string;
    offset: number;
    matchText: string;
    excerpt: string;
  }> = [];

  let rewrittenText = sampleText;

  for (const pattern of patterns) {
    const flags = caseSensitive ? 'g' : 'gi';
    // Escape special regex characters except when intentionally matching word boundaries
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedPattern}\\b`, flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(sampleText)) !== null) {
      const offset = match.index;
      const matchText = match[0];
      const start = Math.max(0, offset - 30);
      const end = Math.min(sampleText.length, offset + matchText.length + 30);
      const excerpt = (start > 0 ? '...' : '') + sampleText.slice(start, end) + (end < sampleText.length ? '...' : '');

      matches.push({
        pattern,
        offset,
        matchText,
        excerpt,
      });
    }

    if (approvedAlternative) {
      rewrittenText = rewrittenText.replace(regex, approvedAlternative);
    }
  }

  // Sort matches by offset
  matches.sort((a, b) => a.offset - b.offset);

  return NextResponse.json({
    ok: true,
    matched: matches.length > 0,
    matchCount: matches.length,
    matches,
    suggestedRewrite: matches.length > 0 && approvedAlternative ? rewrittenText : undefined,
  });
}
