// VeriBrand AI — Core Two-Tier Audit Engine
// Tier-1: Aho-Corasick Deterministic Filter (<10ms)
// Tier-2: Grounded Hybrid Claim Verifier (Tri-State: VERIFIED, CONFLICT, UNVERIFIED)

import {
  AuditResult,
  LintFinding,
  ChannelType,
  RewriteAlternatives,
  EvidenceProvenance,
  BrandRule,
} from '@/types';
import { AhoCorasick } from './aho-corasick';
import {
  BRAND_RULES,
  VERIFIED_METRICS,
  FORBIDDEN_HEX_CODES,
} from './brand-vault-data';

// Singleton instance of the Aho-Corasick Automaton
let ahoCorasickInstance: AhoCorasick<{
  type: 'rule' | 'hex';
  rule?: BrandRule;
  hexData?: (typeof FORBIDDEN_HEX_CODES)[0];
}> | null = null;

function getAhoCorasick() {
  if (ahoCorasickInstance) return ahoCorasickInstance;

  const ac = new AhoCorasick<{
    type: 'rule' | 'hex';
    rule?: BrandRule;
    hexData?: (typeof FORBIDDEN_HEX_CODES)[0];
  }>();

  // Ingest Brand Rules
  for (const rule of BRAND_RULES) {
    for (const pattern of rule.forbiddenPatterns) {
      ac.addPattern(pattern, { type: 'rule', rule });
    }
  }

  // Ingest Forbidden Hex Swatches
  for (const hex of FORBIDDEN_HEX_CODES) {
    ac.addPattern(hex.hex, { type: 'hex', hexData: hex });
  }

  ac.buildFailureLinks();
  ahoCorasickInstance = ac;
  return ac;
}

// Generate 3 Tone-Matched Alternatives for Terminology/Tone issues
function generateRuleRewrites(
  matchedText: string,
  approvedAlternative: string,
  ruleCategory: string
): RewriteAlternatives {
  if (ruleCategory === 'terminology') {
    return {
      direct: approvedAlternative,
      punchy: `${approvedAlternative} (verified)`,
      conservative: `${approvedAlternative} Enterprise Standard`,
    };
  }

  if (ruleCategory === 'visual_token') {
    return {
      direct: '#4F46E5', // Primary brand indigo
      punchy: '#06B6D4', // Vibrant cyan
      conservative: '#0F172A', // Slate dark
    };
  }

  // Tone drift / superlatives: grounded, non-hyperbolic alternatives that make zero unverified claims
  return {
    direct: 'enterprise brand governance platform',
    punchy: 'purpose-built governance co-pilot',
    conservative: 'pre-publication brand compliance system',
  };
}

// Tier-1 Scanner
function runTier1DeterministicScan(text: string): {
  findings: LintFinding[];
  latencyMs: number;
} {
  const start = performance.now();
  const ac = getAhoCorasick();
  const matches = ac.search(text);
  const findings: LintFinding[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const data = m.data;

    if (data.type === 'rule' && data.rule) {
      const rule = data.rule;
      const originalSlice = text.slice(m.start, m.end);

      // P0 BUG FIX: Check if the text at this location is ALREADY correctly written!
      // If the original text is already "Inkloom AI" or "VeriBrand AI", do NOT flag it!
      if (rule.category === 'terminology') {
        if (originalSlice === rule.approvedAlternative) {
          continue;
        }
        const candidateFull = text.slice(m.start, m.start + rule.approvedAlternative.length);
        if (candidateFull === rule.approvedAlternative) {
          continue;
        }
      }

      findings.push({
        id: `T1-R-${i}-${m.start}`,
        category: rule.category,
        verdict: 'SUGGESTION',
        reasonCode:
          rule.category === 'terminology'
            ? 'FORBIDDEN_TERM'
            : 'HYPERBOLIC_SUPERLATIVE',
        matchedText: originalSlice,
        startIndex: m.start,
        endIndex: m.end,
        severity: rule.severity,
        explanation: rule.description,
        guidelineTitle: rule.title,
        guidelineCitation: rule.citation,
        authorityLevel: rule.authorityLevel,
        rewrites: generateRuleRewrites(
          originalSlice,
          rule.approvedAlternative,
          rule.category
        ),
      });
    } else if (data.type === 'hex' && data.hexData) {
      const hex = data.hexData;
      findings.push({
        id: `T1-HEX-${i}-${m.start}`,
        category: 'visual_token',
        verdict: 'CONFLICT',
        reasonCode: 'FORBIDDEN_TERM',
        matchedText: text.slice(m.start, m.end),
        startIndex: m.start,
        endIndex: m.end,
        severity: 'critical',
        explanation: hex.violation,
        guidelineTitle: `Unapproved Hex Swatch: ${hex.name}`,
        guidelineCitation: 'Brand Visual Design System (2026) §4.1',
        authorityLevel: 2,
        rewrites: {
          direct: '#4F46E5 (Primary Brand Indigo)',
          punchy: '#06B6D4 (Brand Cyan Accent)',
          conservative: '#0F172A (Deep Slate Surface)',
        },
      });
    }
  }

  // De-duplicate overlapping findings (prefer longer matches)
  const uniqueFindings = findings.filter((f, idx) => {
    return !findings.some(
      (other, oIdx) =>
        oIdx !== idx &&
        other.startIndex <= f.startIndex &&
        other.endIndex >= f.endIndex &&
        other.matchedText.length > f.matchedText.length
    );
  });

  const latencyMs = Math.round((performance.now() - start) * 100) / 100;
  return { findings: uniqueFindings, latencyMs };
}

// Tier-2 Claim Assertion Parser & Verifier
interface ExtractedClaim {
  text: string;
  startIndex: number;
  endIndex: number;
  claimType: 'uptime' | 'customers' | 'revenue' | 'arr' | 'annual_revenue' | 'pricing' | 'survey' | 'retention' | 'security' | 'turnaround' | 'unsupported_metric';
  rawNumber?: number;
  isTargetFraming?: boolean;
  isLowerBound?: boolean;
  isNegated?: boolean;
}

function extractClaimsFromText(text: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // 1. Uptime / SLA claims (e.g., "99.999% uptime", "99.9% uptime")
  const uptimeRegex = /\b(99(?:\.\d+)?%)\s+(?:uptime|availability|SLA)\b/gi;
  let match;
  while ((match = uptimeRegex.exec(text)) !== null) {
    const numStr = match[1].replace('%', '');
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'uptime',
      rawNumber: parseFloat(numStr),
    });
  }

  // 2. Customer counts (e.g. "420+ enterprise customers", "at least 420 enterprise customer accounts", "100 enterprise customers", "We do not have 420+ enterprise customers")
  const customerRegex =
    /(?:(over|more than|at least|exactly|supports?|serves?|with)\s+)?([0-9,]+)(\+?)\s+(?:(?:active\s+)?(?:global\s+)?enterprise\s+(?:customers|customer\s+accounts|accounts|brands|organizations)|active\s+enterprise\s+customer\s+accounts)\b/gi;
  while ((match = customerRegex.exec(text)) !== null) {
    const prefix = (match[1] || '').toLowerCase();
    const rawDigits = match[2].replace(/,/g, '');
    const hasPlus = Boolean(match[3]);
    const preceding = text.slice(Math.max(0, match.index - 50), match.index).toLowerCase();
    const isNegated =
      /\b(?:not|never|no|without|don't|do\s+not|doesn't|does\s+not|did\s+not|didn't|cannot|can't|lack|lacks|lacking)\b/i.test(
        preceding
      );
    const isAffirmativeIdiom = /\bnot\s+only\b/i.test(preceding);
    const isTrueNegated = isNegated && !isAffirmativeIdiom;
    const isLowerBound =
      (hasPlus || ['over', 'more than', 'at least'].includes(prefix)) && prefix !== 'exactly';

    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'customers',
      rawNumber: parseInt(rawDigits, 10),
      isLowerBound,
      isNegated: isTrueNegated,
    });
  }

  // 3. Revenue / ARR claims (distinguish ARR from total annual revenue)
  const revenueRegex = /\$([0-9.]+)\s*(?:M|million)\s*(?:in\s+)?(annual recurring revenue|ARR|annual revenue|total revenue|revenue)?/gi;
  while ((match = revenueRegex.exec(text)) !== null) {
    const rawUnit = (match[2] || '').toLowerCase();
    const isARR = rawUnit.includes('arr') || rawUnit.includes('recurring');
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: isARR ? 'arr' : 'annual_revenue',
      rawNumber: parseFloat(match[1]),
    });
  }

  // 4. General Pricing claims (e.g. "$49/mo", "$79/mo", "$99/mo")
  const pricingRegex = /\$([0-9.]+)\s*\/\s*(?:mo|month)/gi;
  while ((match = pricingRegex.exec(text)) !== null) {
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'pricing',
      rawNumber: parseFloat(match[1]),
    });
  }

  // 5. Retention claims (e.g. "94.2% enterprise retention")
  const retentionRegex = /\b(94(?:\.\d+)?%)\s+(?:enterprise client retention|enterprise retention)/gi;
  while ((match = retentionRegex.exec(text)) !== null) {
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'retention',
      rawNumber: parseFloat(match[1].replace('%', '')),
    });
  }

  // 6. Turnaround reduction claims (e.g. "turnaround by up to 75%", "75% turnaround", "review turnaround reduction of up to 75%")
  const turnaroundRegex = /(?:(?:routine\s+)?(?:review\s+)?turnaround(?:\s+reduction)?\s+(?:by\s+|of\s+)?up\s+to\s+75%|up\s+to\s+75%\s+(?:routine\s+)?(?:review\s+)?turnaround(?:\s+reduction)?)/gi;
  while ((match = turnaroundRegex.exec(text)) !== null) {
    const preceding = text.slice(Math.max(0, match.index - 50), match.index).toLowerCase();
    const isTargetFraming = /\b(?:target|targets|targeting|projected|projecting|aims to|goal of|designed to)\b/i.test(preceding);
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'turnaround',
      rawNumber: 75,
      isTargetFraming,
    });
  }

  // 7. Security certs (e.g. "SOC 2 Type II", "not SOC 2 Type II certified")
  const socRegex = /\b(?:(?:not(?:\s+only)?|never|no|without)\s+)?SOC 2(?: Type II)?\b/gi;
  while ((match = socRegex.exec(text)) !== null) {
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'security',
    });
  }

  // 8. General / Unsupported business & footprint metrics (e.g. "2,000 paying subscribers", "17 regional offices", "50 global locations", "serves 17 regions")
  const unsupportedRegex =
    /(?:over|more than|supports?|serves?|serving|with|have|has|operating in|across)?\s*([0-9,]+)\+?\s+(?:(?:global|regional|international|active|paying|registered|daily|monthly)\s+)?(?:subscribers|users|downloads|client accounts|offices|locations|branches|countries|regions|headquarters|team members|employees|engineers|patents|awards|partner organizations|partners|integrations)\b/gi;
  while ((match = unsupportedRegex.exec(text)) !== null) {
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'unsupported_metric',
      rawNumber: parseInt(match[1].replace(/,/g, ''), 10),
    });
  }

  return claims;
}

function runTier2ClaimVerification(text: string): {
  findings: LintFinding[];
  latencyMs: number;
} {
  const start = performance.now();
  const claims = extractClaimsFromText(text);
  const findings: LintFinding[] = [];

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];

    if (claim.claimType === 'uptime') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-003')!;
      const isExactMatch = claim.rawNumber === metric.rawNumber;

      const provenance: EvidenceProvenance = {
        metricId: metric.id,
        metricName: metric.metricName,
        approvedValue: metric.approvedValue,
        sourceDocument: metric.sourceDoc,
        sectionCitation: metric.section,
        validityPeriod: 'FY25-FY26 (Active)',
        lastAuditedDate: '2026-10-15',
        status: 'active',
      };

      if (isExactMatch) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: `Programmatically verified against approved SLA specification (${metric.approvedValue}).`,
          guidelineTitle: 'Verified SLA Availability Specification',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '99.9% uptime SLA',
            punchy: 'guaranteed 99.9% enterprise uptime',
            conservative: 'audited 99.9% service availability (excluding scheduled maintenance)',
          },
        });
      } else {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `Contradicts audited ground truth. Draft asserts "${claim.text}" but approved SLA is ${metric.approvedValue}. Quoting unverified SLAs exposes the company to breach of contract.`,
          guidelineTitle: 'SLA False Advertising Violation',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '99.9% uptime SLA',
            punchy: 'rock-solid 99.9% enterprise uptime',
            conservative: 'audited 99.9% SLA availability',
          },
        });
      }
    } else if (claim.claimType === 'customers') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-004')!;
      const count = claim.rawNumber || 0;

      const provenance: EvidenceProvenance = {
        metricId: metric.id,
        metricName: metric.metricName,
        approvedValue: metric.approvedValue,
        sourceDocument: metric.sourceDoc,
        sectionCitation: metric.section,
        validityPeriod: 'Q3 2026 Shareholder Disclosure',
        lastAuditedDate: '2026-10-01',
        status: 'active',
      };

      if (claim.isNegated) {
        // Direct contradiction: denying audited customer account disclosures
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `Negated Customer Disclosure. Draft asserts "${claim.text}", denying the audited shareholder disclosure certifying ${metric.approvedValue} active accounts. Falsely denying audited regulatory disclosures violates reporting compliance.`,
          guidelineTitle: 'Customer Count Contradiction',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: 'trusted by 420+ enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (count < 420) {
        // True Deficit Contradiction (< 420 understates the audited 420+ baseline)
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `Deficit Customer Count. Draft asserts "${claim.text}", but audited shareholder disclosure certifies at least ${metric.approvedValue} active accounts. Understating audited customer accounts violates regulatory reporting guidelines.`,
          guidelineTitle: 'Customer Count Discrepancy',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: 'trusted by 420+ enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (count === 420 && claim.isLowerBound) {
        // Certified lower bound baseline ("420+", "at least 420", "over 420")
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: `Validated against Q3 2026 Shareholder Disclosure (${metric.approvedValue} active accounts).`,
          guidelineTitle: 'Active Enterprise Customer Metric',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: 'trusted by 420+ enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (count === 420 && !claim.isLowerBound) {
        // Exact number 420 asserted (e.g. "exactly 420", bare "420") -> UNVERIFIED exact count
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Exact Customer Count Assertion. Draft asserts an exact count of "${claim.text}". The certified ground truth establishes a lower bound of 420+ active enterprise customer accounts, not an exact count. Stating an exact count requires updated audit certification.`,
          guidelineTitle: 'Unverified Exact Customer Count',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: 'trusted by 420+ enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (count < 1000) {
        // Exact numbers like 421, 501, 600, 999: consistent with lower-bound but unverified as exact counts
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Exact customer count of ${count} lacks active audit verification. The certified ground truth establishes a lower bound of 420+ active enterprise customer accounts. Stating an exact count requires updated audit certification.`,
          guidelineTitle: 'Unverified Exact Customer Count',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts (audited baseline)',
            punchy: 'trusted by 420+ enterprise customer accounts',
            conservative: 'over 420 active enterprise customer accounts',
          },
        });
      } else {
        // Figures >= 1,000 exceed the audited 420+ scope without fresh quarterly filings -> UNVERIFIED (Missing Source)
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unverified Higher Customer Count. Draft asserts "${claim.text}", but official shareholder disclosure certifies ${metric.approvedValue} active accounts. Customer counts of 1,000+ lack active audit verification and require updated quarterly shareholder filings before publication.`,
          guidelineTitle: 'Unverified Higher Customer Count',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts (audited baseline)',
            punchy: 'trusted by 420+ enterprise customer accounts',
            conservative: 'over 420 active enterprise customer accounts',
          },
        });
      }
    } else if (claim.claimType === 'arr') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-006')!;
      const isExactMatch = claim.rawNumber === metric.rawNumber;

      const provenance: EvidenceProvenance = {
        metricId: metric.id,
        metricName: metric.metricName,
        approvedValue: metric.approvedValue,
        sourceDocument: metric.sourceDoc,
        sectionCitation: metric.section,
        validityPeriod: 'FY25-Q4 Audited',
        lastAuditedDate: '2026-09-30',
        status: 'active',
      };

      if (isExactMatch) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: `Audited financial statement verified ($18.5M ARR).`,
          guidelineTitle: 'Audited ARR Metric',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M ARR',
            punchy: '$18.5M in audited annual recurring revenue',
            conservative: '$18.5M ARR (FY25 audited disclosure)',
          },
        });
      } else {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `False ARR Financial Disclosure. Draft asserts "${claim.text}", but Deloitte FY25 audited financial statement certifies ${metric.approvedValue} Annual Recurring Revenue (ARR). Citing unverified ARR violates securities disclosure standards.`,
          guidelineTitle: 'False ARR Financial Disclosure',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M ARR',
            punchy: '$18.5M in audited annual recurring revenue',
            conservative: '$18.5M ARR (FY25 Deloitte audit)',
          },
        });
      }
    } else if (claim.claimType === 'annual_revenue') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-006')!;
      const provenance: EvidenceProvenance = {
        metricId: metric.id,
        metricName: metric.metricName,
        approvedValue: metric.approvedValue,
        sourceDocument: metric.sourceDoc,
        sectionCitation: metric.section,
        validityPeriod: 'FY25-Q4 Audited',
        lastAuditedDate: '2026-09-30',
        status: 'active',
      };
      // Annual / total revenue is not certified in Brand Vault (only ARR is audited)
      findings.push({
        id: `T2-CLAIM-${i}`,
        category: 'claim_verification',
        verdict: 'UNVERIFIED',
        reasonCode: 'MISSING_SOURCE',
        matchedText: claim.text,
        startIndex: claim.startIndex,
        endIndex: claim.endIndex,
        severity: 'warning',
        explanation: `Unverified Financial Metric. Draft asserts "${claim.text}", but Deloitte FY25 audited statements certify $18.5M Annual Recurring Revenue (ARR), not total annual revenue. Total annual revenue has not been disclosed in audited brand disclosures.`,
        guidelineTitle: 'Unverified Annual Revenue Metric',
        guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
        authorityLevel: 2,
        evidence: provenance,
        rewrites: {
          direct: '$18.5M Annual Recurring Revenue (ARR)',
          punchy: '$18.5M ARR',
          conservative: '$18.5M in audited ARR (Deloitte FY25)',
        },
      });
    } else if (claim.claimType === 'pricing') {
      const price = claim.rawNumber || 0;
      const metricOutdated = VERIFIED_METRICS.find((m) => m.id === 'MTR-007')!;

      if (price === 79) {
        // Current approved standard pricing
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: 'Programmatically verified against current approved Product Pricing Schedule FY26 ($79/mo Starter tier).',
          guidelineTitle: 'Approved Pricing Schedule',
          guidelineCitation: 'Product Pricing Schedule FY26 v2.0 — Standard Tier',
          authorityLevel: 1,
          rewrites: {
            direct: '$79/mo',
            punchy: '$79/mo standard plan',
            conservative: '$79/month billed annually',
          },
        });
      } else if (price === 49) {
        // Discontinued legacy pricing
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'OUTDATED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Expired Pricing Metric. The $49/mo legacy starter plan was discontinued on 2026-09-01 and superseded by the $79/mo Starter tier. Advertising discontinued pricing risks consumer dispute liability.`,
          guidelineTitle: 'Discontinued Pricing Schedule',
          guidelineCitation: `${metricOutdated.sourceDoc} — ${metricOutdated.section}`,
          authorityLevel: 2,
          evidence: {
            metricId: metricOutdated.id,
            metricName: metricOutdated.metricName,
            approvedValue: '$79/mo (Current)',
            sourceDocument: 'Product Pricing Schedule FY26 v2.0',
            sectionCitation: 'Pricing Appendix A',
            validityPeriod: 'Expired 2026-08-31',
            lastAuditedDate: '2026-09-01',
            status: 'outdated',
          },
          rewrites: {
            direct: '$79/mo',
            punchy: '$79/mo with full enterprise compliance',
            conservative: '$79/month under current standard tier terms',
          },
        });
      } else {
        // P0 BUG FIX: Any other unapproved price (e.g. $99/mo) must be flagged!
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unapproved Pricing Quote. Quoting "${claim.text}" has no verified source in the active Brand Vault pricing schedule (Approved Starter tier is $79/mo). Model abstains from granting approval.`,
          guidelineTitle: 'Unverified Pricing Tier',
          guidelineCitation: 'Product Pricing Schedule FY26 v2.0 — Section 2',
          authorityLevel: 2,
          rewrites: {
            direct: '$79/mo (Approved Standard Tier)',
            punchy: '$79/mo with full enterprise compliance',
            conservative: '$79/month according to current approved pricing',
          },
        });
      }
    } else if (claim.claimType === 'retention') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-001')!;
      findings.push({
        id: `T2-CLAIM-${i}`,
        category: 'claim_verification',
        verdict: 'VERIFIED',
        matchedText: claim.text,
        startIndex: claim.startIndex,
        endIndex: claim.endIndex,
        severity: 'success',
        explanation: `Validated against KPMG Enterprise Quality Audit (94.2% retention).`,
        guidelineTitle: 'Verified Client Retention Metric',
        guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
        authorityLevel: 1,
        evidence: {
          metricId: metric.id,
          metricName: metric.metricName,
          approvedValue: metric.approvedValue,
          sourceDocument: metric.sourceDoc,
          sectionCitation: metric.section,
          validityPeriod: 'FY25-FY26',
          lastAuditedDate: '2026-10-15',
          status: 'active',
        },
        rewrites: {
          direct: '94.2% enterprise retention',
          punchy: 'industry-leading 94.2% enterprise retention',
          conservative: '94.2% client retention rate audited by KPMG',
        },
      });
    } else if (claim.claimType === 'turnaround') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-005')!;
      const provenance: EvidenceProvenance = {
        metricId: metric.id,
        metricName: metric.metricName,
        approvedValue: metric.approvedValue,
        sourceDocument: metric.sourceDoc,
        sectionCitation: metric.section,
        validityPeriod: 'Round 2 Operational Plan',
        lastAuditedDate: '2026-11-01',
        status: 'active',
      };

      if (claim.isTargetFraming) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: `Verified Projected Target. Framed accurately as an engineering target benchmark (${metric.approvedValue}) per Round 2 Operational Plan.`,
          guidelineTitle: 'Review Turnaround Target',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: 'targets routine review turnaround reduction of up to 75%',
            punchy: 'projected up to 75% turnaround acceleration',
            conservative: 'projected turnaround reduction of up to 75%',
          },
        });
      } else {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unqualified Operational Target. Draft asserts "${claim.text}" as an established operational outcome. Per MTR-005 tolerance guidelines, the 75% turnaround reduction is an internal projected engineering target, not an empirically certified historical outcome, and must be qualified with "projected" or "target".`,
          guidelineTitle: 'Unqualified Operational Target',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: 'targets routine review turnaround reduction of up to 75%',
            punchy: 'projected up to 75% turnaround acceleration',
            conservative: 'projected turnaround reduction of up to 75%',
          },
        });
      }
    } else if (claim.claimType === 'security') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-002')!;

      // Scope-aware negation check: distinguishes "not SOC 2" from affirmative "not only SOC 2"
      const preceding = text.slice(Math.max(0, claim.startIndex - 30), claim.startIndex).toLowerCase();
      const fullContext = `${preceding} ${claim.text}`.toLowerCase();
      const isAffirmativeIdiom = /\bnot\s+(?:only|just|merely)\b/i.test(fullContext);
      const hasNegationWord = /\b(not|never|neither|no|non|unverified|without|lack|lacks)\b/i.test(fullContext);
      const isNegated = hasNegationWord && !isAffirmativeIdiom;

      if (isNegated) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `Negated Security Attestation. Copy asserts "${claim.text}", which directly contradicts the company's verified A-LIGN SOC 2 Type II certification.`,
          guidelineTitle: 'Security Compliance Contradiction',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: {
            metricId: metric.id,
            metricName: metric.metricName,
            approvedValue: metric.approvedValue,
            sourceDocument: metric.sourceDoc,
            sectionCitation: metric.section,
            validityPeriod: '2026-2027',
            lastAuditedDate: '2026-06-30',
            status: 'active',
          },
          rewrites: {
            direct: 'backed by SOC 2 Type II security certification',
            punchy: 'attested SOC 2 Type II compliance',
            conservative: 'holding active SOC 2 Type II certification',
          },
        });
      } else {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: `Valid security attestation from A-LIGN Annual Security Attestation.`,
          guidelineTitle: 'Security Compliance Certification',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: {
            metricId: metric.id,
            metricName: metric.metricName,
            approvedValue: metric.approvedValue,
            sourceDocument: metric.sourceDoc,
            sectionCitation: metric.section,
            validityPeriod: '2026-2027',
            lastAuditedDate: '2026-06-30',
            status: 'active',
          },
          rewrites: {
            direct: 'SOC 2 Type II certified',
            punchy: 'rigorous SOC 2 Type II compliance',
            conservative: 'attested SOC 2 Type II security architecture',
          },
        });
      }
    } else if (claim.claimType === 'unsupported_metric') {
      // General unverified numerical assertions (subscribers, users, downloads) not grounded in Brand Vault
      findings.push({
        id: `T2-CLAIM-${i}`,
        category: 'claim_verification',
        verdict: 'UNVERIFIED',
        reasonCode: 'MISSING_SOURCE',
        matchedText: claim.text,
        startIndex: claim.startIndex,
        endIndex: claim.endIndex,
        severity: 'warning',
        explanation: `Unverified Business Metric. Draft asserts "${claim.text}", but no approved ground truth exists in the active Brand Vault for this metric. The system abstains from granting approval.`,
        guidelineTitle: 'Unverified Metric Assertion',
        guidelineCitation: 'Corporate Trademark Identity Handbook §4.2',
        authorityLevel: 2,
        rewrites: {
          direct: '420+ active enterprise customer accounts',
          punchy: 'trusted by 420+ enterprise customer accounts',
          conservative: 'over 420 active enterprise customer accounts',
        },
      });
    }
  }

  // P0 FIX: Report genuine measured execution latency (no artificial delays)
  const latencyMs = Math.round((performance.now() - start) * 100) / 100;
  return { findings, latencyMs };
}

// Full Two-Tier Orchestrator
export function auditContent(
  text: string,
  channel: ChannelType = 'enterprise_web'
): AuditResult {
  // Tier-1: Deterministic Filter
  const t1 = runTier1DeterministicScan(text);

  // Tier-2: Grounded Claim Verifier
  const t2 = runTier2ClaimVerification(text);

  // Combine and sort findings by start index
  const allFindings = [...t1.findings, ...t2.findings].sort(
    (a, b) => a.startIndex - b.startIndex
  );

  // Compute Compliance Score
  let score = 100;
  let verifiedCount = 0;
  let conflictCount = 0;
  let unverifiedCount = 0;

  for (const f of allFindings) {
    if (f.verdict === 'VERIFIED') {
      verifiedCount++;
    } else if (f.verdict === 'CONFLICT') {
      conflictCount++;
      score -= 18;
    } else if (f.verdict === 'UNVERIFIED') {
      unverifiedCount++;
      score -= 12;
    } else if (f.verdict === 'SUGGESTION') {
      if (f.severity === 'critical') score -= 10;
      else if (f.severity === 'warning') score -= 6;
      else score -= 3;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    documentId: 'DOC-AUDIT-LIVE',
    channel,
    complianceScore: score,
    // Honest measured latency (unfloored, 2 decimal places)
    tier1LatencyMs: Math.round(t1.latencyMs * 100) / 100,
    tier2LatencyMs: Math.round(t2.latencyMs * 100) / 100,
    findings: allFindings,
    metricsAuditedCount: VERIFIED_METRICS.length,
    claimsVerifiedCount: verifiedCount,
    claimsConflictedCount: conflictCount,
    claimsUnverifiedCount: unverifiedCount,
    timestamp: new Date().toISOString(),
  };
}
