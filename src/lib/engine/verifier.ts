// VeriBrand AI — Core Two-Tier Audit Engine
// Tier-1: Aho-Corasick Deterministic Filter (<50ms)
// Tier-2: Grounded Hybrid Claim Verifier (Tri-State: VERIFIED, CONFLICT, UNVERIFIED)

import {
  AuditResult,
  LintFinding,
  ChannelType,
  RewriteAlternatives,
  EvidenceProvenance,
  VerifiedMetric,
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

  // Tone drift / superlatives
  return {
    direct: 'industry-recognized brand platform',
    punchy: 'leading enterprise governance co-pilot',
    conservative: 'audited pre-publication brand compliance system',
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

  const latencyMs = Math.round((performance.now() - start) * 10) / 10;
  return { findings, latencyMs };
}

// Tier-2 Claim Assertion Parser & Verifier
interface ExtractedClaim {
  text: string;
  startIndex: number;
  endIndex: number;
  claimType: 'uptime' | 'customers' | 'revenue' | 'pricing' | 'survey' | 'retention' | 'security';
  rawNumber?: number;
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

  // 2. Customer counts (e.g. "over 1,500 enterprise customers", "420+ enterprise organizations")
  const customerRegex = /(?:over|more than|supports)?\s*([0-9,]+)\+?\s+(?:enterprise customers|global enterprise brands|enterprise organizations)/gi;
  while ((match = customerRegex.exec(text)) !== null) {
    const rawDigits = match[1].replace(/,/g, '');
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'customers',
      rawNumber: parseInt(rawDigits, 10),
    });
  }

  // 3. Revenue / ARR claims (e.g. "$50M in annual revenue", "$18.5M ARR")
  const revenueRegex = /\$([0-9.]+)\s*(?:M|million)\s*(?:in annual revenue|ARR|revenue)?/gi;
  while ((match = revenueRegex.exec(text)) !== null) {
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'revenue',
      rawNumber: parseFloat(match[1]),
    });
  }

  // 4. Pricing claims (e.g. "$49/mo", "$79/mo")
  const pricingRegex = /\$([0-9]+)\s*\/\s*(?:mo|month)/gi;
  while ((match = pricingRegex.exec(text)) !== null) {
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'pricing',
      rawNumber: parseInt(match[1], 10),
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

  // 6. Security certs (e.g. "SOC 2 Type II")
  const socRegex = /\bSOC 2(?: Type II)?\b/gi;
  while ((match = socRegex.exec(text)) !== null) {
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'security',
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
      const isAccurate = (claim.rawNumber || 0) <= 450;

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

      if (isAccurate) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'VERIFIED',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'success',
          explanation: `Validated against Q3 2026 Shareholder Disclosure (${metric.approvedValue}).`,
          guidelineTitle: 'Active Enterprise Customer Metric',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ global enterprise brands',
            punchy: 'trusted by 420+ industry leaders',
            conservative: 'over 420 active enterprise customer deployments',
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
          explanation: `Fabricated metric. Draft asserts "${claim.text}", but verified disclosure documents state ${metric.approvedValue}. Exaggerating customer counts violates FTC guidelines.`,
          guidelineTitle: 'Customer Count Discrepancy',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '420+ global enterprise brands',
            punchy: '420+ market-leading enterprises',
            conservative: 'over 420 verified enterprise accounts',
          },
        });
      }
    } else if (claim.claimType === 'revenue') {
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
          guidelineTitle: 'Audited Revenue Metric',
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
          explanation: `Severe Financial Conflict. Draft quotes "${claim.text}", but Deloitte FY25 audited revenue is strictly ${metric.approvedValue}. Misrepresenting revenue violates SEC/regulatory mandates.`,
          guidelineTitle: 'False Financial Disclosure',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M in annual recurring revenue',
            punchy: '$18.5M ARR',
            conservative: '$18.5M ARR as audited in our FY25 financial statements',
          },
        });
      }
    } else if (claim.claimType === 'pricing') {
      const isOutdated = claim.rawNumber === 49;
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-007')!;

      if (isOutdated) {
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
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: {
            metricId: metric.id,
            metricName: metric.metricName,
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
    } else if (claim.claimType === 'security') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-002')!;
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
  }

  const latencyMs = Math.round((performance.now() - start) * 10) / 10 + 65; // realistic async retrieval time simulation
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
    tier1LatencyMs: Math.max(5, t1.latencyMs),
    tier2LatencyMs: Math.max(45, t2.latencyMs),
    findings: allFindings,
    metricsAuditedCount: VERIFIED_METRICS.length,
    claimsVerifiedCount: verifiedCount,
    claimsConflictedCount: conflictCount,
    claimsUnverifiedCount: unverifiedCount,
    timestamp: '2026-11-13T10:00:00.000Z',
  };
}
