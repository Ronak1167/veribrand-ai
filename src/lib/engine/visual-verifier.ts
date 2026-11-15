// VeriBrand AI — Advanced Visual Verification Engine
// Logo Identity, Typography Hierarchy, Semantic Layout & WCAG 2.2 AA Contrast Analysis

export const APPROVED_PALETTE = [
  { name: 'Brand Indigo', hex: '#4F46E5', role: 'Primary Brand Action' },
  { name: 'Brand Cyan', hex: '#06B6D4', role: 'Secondary Accent' },
  { name: 'Emerald Success', hex: '#10B981', role: 'Verification Pill' },
  { name: 'Slate Deep', hex: '#0F172A', role: 'Surface Background' },
  { name: 'Neutral Gray', hex: '#64748B', role: 'Body Copy' },
];

export const FORBIDDEN_HEX_CODES = [
  { hex: '#ff0033', name: 'Rogue Crimson', violation: 'Unapproved non-brand accent color. Violates Brand Stylebook v3.2 §4.1.' },
  { hex: '#00ff00', name: 'Neon Green', violation: 'Accessibility contrast failure against white/light backgrounds.' },
  { hex: '#ff00ff', name: 'Magenta Hot', violation: 'Unsanctioned promotional badge color.' },
];

export type VisualVerdict = 'PASS' | 'WARN' | 'FAIL' | 'HUMAN_REVIEW';

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export interface ContrastFinding {
  foreground: string;
  background: string;
  ratio: number;
  wcagAANormalTextPass: boolean;
  wcagAALargeTextPass: boolean;
  wcagAAAPass: boolean;
  suggestedRemediationHex?: string;
  message: string;
}

export interface TypographyElement {
  role: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'legal';
  fontFamily: string;
  fontSizePx: number;
  lineHeightPx?: number;
  fontWeight?: number | string;
  colorHex?: string;
  text?: string;
}

export interface BoundingBox {
  id: string;
  role: 'logo' | 'headline' | 'text' | 'image' | 'cta' | 'footer';
  x: number; // left px
  y: number; // top px
  width: number; // px
  height: number; // px
}

export interface VisualInspectionRequest {
  assetType: 'logo_primary' | 'logo_secondary' | 'logo_monochrome' | 'logo_icon' | 'marketing_image' | 'banner';
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor?: string;
  logoBoundingBox?: BoundingBox;
  elements?: BoundingBox[];
  typography?: TypographyElement[];
  dominantColors?: string[];
  allowedFonts?: string[];
}

export interface VisualFinding {
  id: string;
  category: 'logo_identity' | 'typography' | 'semantic_layout' | 'wcag_contrast' | 'brand_palette' | 'forbidden_colors';
  severity: 'critical' | 'warning' | 'info';
  passed: boolean;
  verdict: VisualVerdict;
  message: string;
  citation: string;
  remediation?: string;
  details?: Record<string, unknown>;
}

export interface VisualInspectionResponse {
  overallScore: number; // 0 - 100
  verdict: VisualVerdict;
  compliant: boolean;
  requiresHumanReview: boolean;
  summary: string;
  findings: VisualFinding[];
  contrastAnalysis: ContrastFinding[];
  quadrantBalance?: {
    topLeftWeightPct: number;
    topRightWeightPct: number;
    bottomLeftWeightPct: number;
    bottomRightWeightPct: number;
    isBalanced: boolean;
  };
}

// -----------------------------------------------------------------------------
// COLOR UTILITIES & WCAG 2.2 CONTRAST CALCULATOR
// -----------------------------------------------------------------------------

export function parseHexToRgb(hex: string): ColorRGB | null {
  const clean = hex.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(rgb: ColorRGB): string {
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

export function calculateRelativeLuminance(hex: string): number {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return 0.5;

  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function calculateContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = calculateRelativeLuminance(fgHex);
  const l2 = calculateRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function calculateColorDistance(a: string, b: string): number {
  const rgbA = parseHexToRgb(a);
  const rgbB = parseHexToRgb(b);
  if (!rgbA || !rgbB) return Number.POSITIVE_INFINITY;
  return Math.sqrt((rgbA.r - rgbB.r) ** 2 + (rgbA.g - rgbB.g) ** 2 + (rgbA.b - rgbB.b) ** 2);
}

/**
 * Automatically calculates the nearest accessible hex code satisfying WCAG 2.2 AA (4.5:1).
 */
export function suggestAccessibleColor(fgHex: string, bgHex: string, targetRatio = 4.5): string {
  const currentRatio = calculateContrastRatio(fgHex, bgHex);
  if (currentRatio >= targetRatio) return fgHex;

  const bgLum = calculateRelativeLuminance(bgHex);
  const fgRgb = parseHexToRgb(fgHex);
  if (!fgRgb) return bgLum > 0.5 ? '#000000' : '#FFFFFF';

  // If background is light, darken foreground; if dark, lighten foreground
  const darken = bgLum > 0.5;
  let r = fgRgb.r;
  let g = fgRgb.g;
  let b = fgRgb.b;

  for (let step = 0; step < 50; step++) {
    const factor = darken ? 0.92 : 1.08;
    r = darken ? Math.max(0, Math.floor(r * factor)) : Math.min(255, Math.ceil(r * factor) + 4);
    g = darken ? Math.max(0, Math.floor(g * factor)) : Math.min(255, Math.ceil(g * factor) + 4);
    b = darken ? Math.max(0, Math.floor(b * factor)) : Math.min(255, Math.ceil(b * factor) + 4);

    const testHex = rgbToHex({ r, g, b });
    if (calculateContrastRatio(testHex, bgHex) >= targetRatio) {
      return testHex;
    }
  }

  return darken ? '#000000' : '#FFFFFF';
}

// -----------------------------------------------------------------------------
// ADVANCED VISUAL VERIFICATION ENGINE
// -----------------------------------------------------------------------------

export class VisualVerifier {
  private defaultAllowedFonts = [
    'Inter',
    'Plus Jakarta Sans',
    'Geist',
    'system-ui',
    '-apple-system',
    'sans-serif',
    'Roboto',
    'Segoe UI',
  ];

  /**
   * Performs end-to-end visual compliance inspection.
   */
  public verify(req: VisualInspectionRequest): VisualInspectionResponse {
    const findings: VisualFinding[] = [];
    const contrastAnalysis: ContrastFinding[] = [];
    const bg = req.backgroundColor || '#FFFFFF';

    // 1. FORBIDDEN COLOR & PALETTE VERIFICATION
    const colors = req.dominantColors || [];
    for (const color of colors) {
      const match = FORBIDDEN_HEX_CODES.find(
        (f) => f.hex.toLowerCase() === color.toLowerCase() || calculateColorDistance(f.hex, color) < 18
      );
      if (match) {
        findings.push({
          id: `FIND-FORBIDDEN-${color.replace('#', '')}`,
          category: 'forbidden_colors',
          severity: 'critical',
          passed: false,
          verdict: 'FAIL',
          message: `Detected forbidden brand color "${color}" (${match.violation}).`,
          citation: 'Brand Identity Vault §4.2 — Prohibited Brand Palette Colors',
          remediation: `Remove "${color}" and replace with approved brand primary #0066FF or secondary #3B82F6.`,
        });
      }
    }

    // 2. WCAG 2.2 AA TEXT CONTRAST ANALYSIS
    for (const color of colors) {
      const ratio = calculateContrastRatio(color, bg);
      const normalPass = ratio >= 4.5;
      const largePass = ratio >= 3.0;
      const aaaPass = ratio >= 7.0;

      const suggested = normalPass ? undefined : suggestAccessibleColor(color, bg, 4.5);
      const contrastItem: ContrastFinding = {
        foreground: color,
        background: bg,
        ratio,
        wcagAANormalTextPass: normalPass,
        wcagAALargeTextPass: largePass,
        wcagAAAPass: aaaPass,
        suggestedRemediationHex: suggested,
        message: normalPass
          ? `Passes WCAG 2.2 AA with ${ratio}:1 contrast ratio against ${bg}.`
          : `Fails WCAG 2.2 AA (minimum 4.5:1 required, actual ${ratio}:1). Remediation: use ${suggested}.`,
      };
      contrastAnalysis.push(contrastItem);

      if (!normalPass) {
        findings.push({
          id: `FIND-CONTRAST-${color.replace('#', '')}`,
          category: 'wcag_contrast',
          severity: ratio < 3.0 ? 'critical' : 'warning',
          passed: false,
          verdict: ratio < 3.0 ? 'FAIL' : 'WARN',
          message: `Text color ${color} on ${bg} achieves only ${ratio}:1 contrast ratio. Fails WCAG 2.2 AA.`,
          citation: 'WCAG 2.2 Guideline 1.4.3 — Contrast (Minimum)',
          remediation: `Adjust color to ${suggested} to satisfy the 4.5:1 minimum threshold.`,
        });
      }
    }

    // 3. LOGO IDENTITY VERIFICATION
    if (req.logoBoundingBox) {
      const logo = req.logoBoundingBox;
      const minClearSpacePct = 0.12; // 12% minimum clear space padding
      const leftClear = logo.x;
      const topClear = logo.y;
      const rightClear = req.canvasWidth - (logo.x + logo.width);
      const bottomClear = req.canvasHeight - (logo.y + logo.height);

      const minRequiredPx = Math.min(logo.width, logo.height) * minClearSpacePct;
      const clearSpacePass =
        leftClear >= minRequiredPx &&
        topClear >= minRequiredPx &&
        rightClear >= minRequiredPx &&
        bottomClear >= minRequiredPx;

      findings.push({
        id: 'FIND-LOGO-CLEARSPACE',
        category: 'logo_identity',
        severity: clearSpacePass ? 'info' : 'warning',
        passed: clearSpacePass,
        verdict: clearSpacePass ? 'PASS' : 'WARN',
        message: clearSpacePass
          ? `Logo maintains required minimum ${Math.round(minRequiredPx)}px clear space on all sides.`
          : `Logo violates minimum clear space boundary (${Math.round(minRequiredPx)}px required; margins: left=${leftClear}px, top=${topClear}px, right=${rightClear}px, bottom=${bottomClear}px).`,
        citation: 'Brand Vault §2.1 — Logo Exclusion Zone & Clear Space',
        remediation: 'Ensure at least 15% padding separates the logo from canvas edges and adjacent elements.',
      });

      // Background color clash
      const logoBgContrast = calculateContrastRatio('#0066FF', bg);
      if (logoBgContrast < 3.0) {
        findings.push({
          id: 'FIND-LOGO-BG-CLASH',
          category: 'logo_identity',
          severity: 'critical',
          passed: false,
          verdict: 'FAIL',
          message: `Primary brand logo on background ${bg} has poor visibility (${logoBgContrast}:1 contrast).`,
          citation: 'Brand Vault §2.3 — Logo Placement on Colored Backgrounds',
          remediation: 'Use monochrome white logo on dark backgrounds, or switch to light background #FFFFFF.',
        });
      }
    }

    // 4. TYPOGRAPHY VERIFICATION
    if (req.typography && req.typography.length > 0) {
      const allowedFonts = req.allowedFonts || this.defaultAllowedFonts;
      const allowedLower = allowedFonts.map((f) => f.toLowerCase());

      let prevSize = Number.POSITIVE_INFINITY;
      let hierarchyViolation = false;

      for (const typo of req.typography) {
        // Allowed font check
        const fontPass = allowedLower.some((f) => typo.fontFamily.toLowerCase().includes(f));
        if (!fontPass) {
          findings.push({
            id: `FIND-TYPO-FONT-${typo.role}`,
            category: 'typography',
            severity: 'warning',
            passed: false,
            verdict: 'WARN',
            message: `Font family "${typo.fontFamily}" for ${typo.role} is not in the approved brand typography list (${allowedFonts.slice(0, 3).join(', ')}).`,
            citation: 'Brand Vault §3.1 — Corporate Typography Standard',
            remediation: `Replace "${typo.fontFamily}" with approved typeface "Inter" or "Plus Jakarta Sans".`,
          });
        }

        // Minimum body font size check
        if ((typo.role === 'body' || typo.role === 'caption') && typo.fontSizePx < 14) {
          findings.push({
            id: `FIND-TYPO-SIZE-${typo.role}`,
            category: 'typography',
            severity: 'warning',
            passed: false,
            verdict: 'WARN',
            message: `Font size for ${typo.role} is ${typo.fontSizePx}px, below the 14px minimum legibility threshold.`,
            citation: 'Brand Vault §3.4 — Legibility and Minimum Font Sizes',
            remediation: 'Increase body font size to at least 14px (recommended 16px).',
          });
        }

        // Line height ratio
        if (typo.lineHeightPx && typo.fontSizePx > 0) {
          const ratio = typo.lineHeightPx / typo.fontSizePx;
          if (ratio < 1.3) {
            findings.push({
              id: `FIND-TYPO-LINEHEIGHT-${typo.role}`,
              category: 'typography',
              severity: 'info',
              passed: false,
              verdict: 'WARN',
              message: `Line height ratio (${ratio.toFixed(2)}) for ${typo.role} is cramped (< 1.30).`,
              citation: 'WCAG 2.2 Guideline 1.4.12 — Text Spacing',
              remediation: `Set line-height to at least ${(typo.fontSizePx * 1.4).toFixed(0)}px (1.4x).`,
            });
          }
        }

        // Hierarchy sequence
        if (typo.role === 'h1' || typo.role === 'h2' || typo.role === 'h3') {
          if (typo.fontSizePx > prevSize) {
            hierarchyViolation = true;
          }
          prevSize = typo.fontSizePx;
        }
      }

      if (hierarchyViolation) {
        findings.push({
          id: 'FIND-TYPO-HIERARCHY',
          category: 'typography',
          severity: 'warning',
          passed: false,
          verdict: 'WARN',
          message: 'Typography hierarchy inversion detected: lower heading levels must not exceed parent headings in size.',
          citation: 'Brand Vault §3.2 — Typographic Hierarchy (H1 > H2 > H3 > Body)',
          remediation: 'Ensure H1 >= 28px, H2 >= 20px, H3 >= 18px, Body = 16px.',
        });
      }
    }

    // 5. SEMANTIC LAYOUT & COLLISION VERIFICATION
    let quadrantBalance;
    if (req.elements && req.elements.length > 0) {
      const elems = req.elements;

      // Safe viewport margin check
      const minMarginPx = 16;
      for (const el of elems) {
        if (
          el.x < minMarginPx ||
          el.y < minMarginPx ||
          el.x + el.width > req.canvasWidth - minMarginPx ||
          el.y + el.height > req.canvasHeight - minMarginPx
        ) {
          findings.push({
            id: `FIND-LAYOUT-MARGIN-${el.id}`,
            category: 'semantic_layout',
            severity: 'warning',
            passed: false,
            verdict: 'WARN',
            message: `Element "${el.id}" (${el.role}) bleeds into the ${minMarginPx}px safe canvas margin.`,
            citation: 'Brand Vault §5.1 — Layout Margins & Bleed Safety',
            remediation: `Inset element by at least ${minMarginPx}px from canvas boundaries.`,
          });
        }
      }

      // Element overlap collision check (AABB)
      for (let i = 0; i < elems.length; i++) {
        for (let j = i + 1; j < elems.length; j++) {
          const a = elems[i];
          const b = elems[j];

          // Check intersection
          const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
          const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          const overlapArea = overlapX * overlapY;

          if (overlapArea > 100) {
            findings.push({
              id: `FIND-LAYOUT-OVERLAP-${a.id}-${b.id}`,
              category: 'semantic_layout',
              severity: 'critical',
              passed: false,
              verdict: 'FAIL',
              message: `Severe layout collision: "${a.id}" (${a.role}) overlaps with "${b.id}" (${b.role}) by ${Math.round(overlapArea)}px².`,
              citation: 'Brand Vault §5.3 — Unintended Element Overlaps',
              remediation: 'Separate overlapping elements with proper grid spacing or flexbox gap.',
            });
          }
        }
      }

      // Quadrant Balance Calculation
      const midX = req.canvasWidth / 2;
      const midY = req.canvasHeight / 2;
      let tl = 0;
      let tr = 0;
      let bl = 0;
      let br = 0;

      for (const el of elems) {
        const area = el.width * el.height;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;

        if (cx < midX && cy < midY) tl += area;
        else if (cx >= midX && cy < midY) tr += area;
        else if (cx < midX && cy >= midY) bl += area;
        else br += area;
      }

      const totalArea = tl + tr + bl + br || 1;
      const pTl = Math.round((tl / totalArea) * 100);
      const pTr = Math.round((tr / totalArea) * 100);
      const pBl = Math.round((bl / totalArea) * 100);
      const pBr = Math.round((br / totalArea) * 100);

      // If any quadrant has > 75% weight, layout is imbalanced
      const maxQuadWeight = Math.max(pTl, pTr, pBl, pBr);
      const isBalanced = maxQuadWeight <= 65;
      quadrantBalance = {
        topLeftWeightPct: pTl,
        topRightWeightPct: pTr,
        bottomLeftWeightPct: pBl,
        bottomRightWeightPct: pBr,
        isBalanced,
      };

      if (!isBalanced) {
        const severity = maxQuadWeight > 80 ? 'warning' : 'info';
        findings.push({
          id: 'FIND-LAYOUT-BALANCE',
          category: 'semantic_layout',
          severity,
          passed: false,
          verdict: maxQuadWeight > 80 ? 'HUMAN_REVIEW' : 'PASS',
          message: `Visual weight distribution across quadrants: Top-Left: ${pTl}%, Top-Right: ${pTr}%, Bottom-Left: ${pBl}%, Bottom-Right: ${pBr}%.`,
          citation: 'Brand Vault §5.4 — Visual Balance & Weight Distribution',
          remediation: 'Distribute content more evenly across the canvas quadrants.',
        });
      }
    }

    // -------------------------------------------------------------------------
    // SCORING & CLASSIFICATION
    // -------------------------------------------------------------------------
    const criticalViolations = findings.filter((f) => f.severity === 'critical' && !f.passed).length;
    const warningViolations = findings.filter((f) => f.severity === 'warning' && !f.passed).length;

    let score = 100 - criticalViolations * 35 - warningViolations * 12;
    score = Math.max(0, Math.min(100, score));

    let verdict: VisualVerdict = 'PASS';
    if (criticalViolations > 0 || score < 60) {
      verdict = 'FAIL';
    } else if (warningViolations > 1 || score < 85) {
      verdict = 'WARN';
    } else if (findings.some((f) => f.verdict === 'HUMAN_REVIEW' && f.severity !== 'info')) {
      verdict = 'HUMAN_REVIEW';
    }

    return {
      overallScore: score,
      verdict,
      compliant: criticalViolations === 0 && score >= 75,
      requiresHumanReview: warningViolations > 0 || criticalViolations > 0 || verdict === 'HUMAN_REVIEW',
      summary: `Visual audit complete: ${findings.filter((f) => !f.passed).length} issue(s) detected (${criticalViolations} critical, ${warningViolations} warnings). Score: ${score}/100.`,
      findings,
      contrastAnalysis,
      quadrantBalance,
    };
  }
}
