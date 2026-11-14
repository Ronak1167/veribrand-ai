// VeriBrand AI — Multi-Modal Vision & Palette Governance API
// Validates visual branding, hex colors, and WCAG 2.1 AA/AAA contrast ratios.

import { NextRequest, NextResponse } from 'next/server';

function getLuminance(hexStr: string): number {
  const hex = hexStr.replace(/^#/, '');
  if (hex.length !== 6 && hex.length !== 3) return 0;
  
  const fullHex = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex;

  const r = parseInt(fullHex.slice(0, 2), 16) / 255;
  const g = parseInt(fullHex.slice(2, 4), 16) / 255;
  const b = parseInt(fullHex.slice(4, 6), 16) / 255;

  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
}

export function calculateWcagContrast(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Math.round(((brightest + 0.05) / (darkest + 0.05)) * 100) / 100;
}

const APPROVED_BRAND_COLORS = [
  { name: 'Brand Indigo Primary', hex: '#4F46E5', role: 'primary' },
  { name: 'Brand Indigo Dark', hex: '#4338CA', role: 'primary_dark' },
  { name: 'Slate Neutral Dark', hex: '#0F172A', role: 'text_primary' },
  { name: 'Slate Neutral Muted', hex: '#64748B', role: 'text_muted' },
  { name: 'Background Pure White', hex: '#FFFFFF', role: 'surface' },
  { name: 'Background Light Slate', hex: '#F8FAFC', role: 'background' },
  { name: 'Success Emerald', hex: '#10B981', role: 'status_success' },
  { name: 'Warning Amber', hex: '#F59E0B', role: 'status_warning' },
  { name: 'Danger Crimson', hex: '#EF4444', role: 'status_danger' },
];

const FORBIDDEN_OFF_BRAND_COLORS = [
  { hex: '#FF0033', label: 'Uncalibrated Neon Red', reason: 'Fails brand palette guidelines; use #EF4444 instead' },
  { hex: '#00FF00', label: 'Raw Neon Green', reason: 'High visual strain, non-accessible; use #10B981 instead' },
  { hex: '#FF00FF', label: 'Magenta Neon', reason: 'Unapproved brand tone violation' },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { colors, background = '#FFFFFF' } = body as { colors?: string[]; background?: string };

    if (!Array.isArray(colors) || colors.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'colors must be a non-empty array of hex color strings (e.g. ["#4F46E5", "#0F172A"])' },
        { status: 400 }
      );
    }

    const results = colors.map((rawColor) => {
      const hex = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
      const contrastAgainstBg = calculateWcagContrast(hex, background);
      const contrastAgainstWhite = calculateWcagContrast(hex, '#FFFFFF');
      const contrastAgainstDark = calculateWcagContrast(hex, '#0F172A');

      const passesWcagAA = contrastAgainstBg >= 4.5;
      const passesWcagAALarge = contrastAgainstBg >= 3.0;
      const passesWcagAAA = contrastAgainstBg >= 7.0;

      const forbiddenMatch = FORBIDDEN_OFF_BRAND_COLORS.find(
        (f) => f.hex.toLowerCase() === hex.toLowerCase()
      );

      const approvedMatch = APPROVED_BRAND_COLORS.find(
        (a) => a.hex.toLowerCase() === hex.toLowerCase()
      );

      return {
        color: hex,
        contrastRatioAgainstSelectedBg: contrastAgainstBg,
        contrastRatioAgainstWhite: contrastAgainstWhite,
        contrastRatioAgainstDark: contrastAgainstDark,
        wcagCompliance: {
          aaNormalText: passesWcagAA,
          aaLargeTextAndUI: passesWcagAALarge,
          aaaNormalText: passesWcagAAA,
        },
        brandStatus: forbiddenMatch
          ? 'forbidden'
          : approvedMatch
          ? 'approved'
          : 'custom',
        notes: forbiddenMatch?.reason || (approvedMatch ? `Official ${approvedMatch.name}` : 'Custom palette color'),
      };
    });

    const hasForbiddenColors = results.some((r) => r.brandStatus === 'forbidden');
    const hasAAViolations = results.some((r) => !r.wcagCompliance.aaLargeTextAndUI);

    return NextResponse.json({
      ok: true,
      background,
      compliant: !hasForbiddenColors && !hasAAViolations,
      paletteSummary: {
        totalEvaluated: results.length,
        approvedCount: results.filter((r) => r.brandStatus === 'approved').length,
        forbiddenCount: results.filter((r) => r.brandStatus === 'forbidden').length,
        wcagAAPassingCount: results.filter((r) => r.wcagCompliance.aaNormalText).length,
      },
      results,
    });
  } catch (err: unknown) {
    console.error('Palette API error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error analyzing color palette' },
      { status: 500 }
    );
  }
}
