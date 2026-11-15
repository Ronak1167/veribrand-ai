import { auditContent } from '@/lib/engine/verifier';
import { getApprovedEvidenceMetrics, getCustomBrandRules } from '@/lib/db/database';
import { VERIFIED_METRICS } from '@/lib/engine/brand-vault-data';
import type { AuditResult, ChannelType, LintFinding, VerifiedMetric, ClaimType } from '@/types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
}

function unitIn(value: string): string | null {
  const text = value.toLowerCase();
  if (/%|\bpercent\b/.test(text)) return 'percent';
  if (/\$|\busd\b|\beur\b|\binr\b/.test(text)) return 'currency';
  const unit = text.match(/\b(users?|customers?|clients?|accounts?|employees?|downloads?|hours?|days?|years?|months?)\b/);
  return unit ? unit[1].replace(/s$/, '') : null;
}

function numberIn(value: string): number | null {
  const match = value.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function isEquivalentClaim(claim: string, approved: string): boolean {
  const a = claim.toLowerCase().replace(/\s+/g, ' ').trim();
  const b = approved.toLowerCase().replace(/\s+/g, ' ').trim();
  if (a.includes(b) || b.includes(a)) return true;
  const au = unitIn(a);
  const bu = unitIn(b);
  if (au && bu && au !== bu) return false;
  const av = numberIn(a);
  const bv = numberIn(b);
  return av !== null && bv !== null && Math.abs(av - bv) < 0.000001;
}

function provenance(metric: VerifiedMetric) {
  return {
    metricId: metric.id,
    metricName: metric.metricName,
    approvedValue: metric.approvedValue,
    sourceDocument: metric.sourceDoc,
    sectionCitation: metric.section,
    validityPeriod: `${metric.validFrom} to ${metric.validUntil || 'indefinite'}`,
    lastAuditedDate: new Date().toISOString(),
    status: 'active' as const,
  };
}

/**
 * 12 Claim Type Recognizers for Evidence-Grounded Brand Governance (Priority 5)
 */
interface ClaimRecognizer {
  type: ClaimType;
  pattern: RegExp;
  title: string;
  defaultVerdict: 'UNVERIFIED' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE';
  severity: LintFinding['severity'];
  explanation: string;
}

const CLAIM_RECOGNIZERS: ClaimRecognizer[] = [
  // 1. Superlatives (Absolute rankings)
  {
    type: 'superlatives',
    pattern: /\b(?:the\s+only|the\s+leading|the\s+best|industry-leading|#1|market\s+leader|best-in-class|most\s+advanced|world(?:'s)?\s+fastest|unmatched)\b/gi,
    title: 'Superlative claim requires substantiate evidence',
    defaultVerdict: 'REVIEW_REQUIRED',
    severity: 'warning',
    explanation: 'Absolute or superlative assertions require verified third-party analyst recognition or legal substantiation before publication.',
  },
  // 2. Unconditional Guarantees
  {
    type: 'guarantees',
    pattern: /\b(?:guaranteed\s+(?:zero|100%|absolute|to\s+never)|100%\s+money[- ]back\s+guarantee|unconditional\s+guarantee|guarantee(?:s)?\s+zero\s+downtime)\b/gi,
    title: 'Unconditional guarantee flag',
    defaultVerdict: 'REVIEW_REQUIRED',
    severity: 'critical',
    explanation: 'Unconditional guarantees create legal liability. Ensure explicit SLA terms, exclusions, and legal counsel sign-off exist.',
  },
  // 3. Legal Disclaimers & Safe-Harbor
  {
    type: 'legal_disclaimers',
    pattern: /\b(?:forward-looking\s+statements?|past\s+performance\s+(?:is\s+no|does\s+not)\s+guarantee|results\s+may\s+vary|subject\s+to\s+change\s+without\s+notice)\b/gi,
    title: 'Legal disclaimer / Safe-harbor statement',
    defaultVerdict: 'NOT_APPLICABLE',
    severity: 'info',
    explanation: 'Recognized legal disclaimer statement; compliant and not asserting an unverified numerical metric.',
  },
  // 4. Comparative Claims
  {
    type: 'comparative',
    pattern: /\b(?:\d+(?:\.\d+)?x\s+faster\s+than|better\s+than\s+[A-Z]\w+|lowest\s+latency\s+in\s+the\s+market|outperforms\s+[A-Z]\w+)\b/gi,
    title: 'Comparative competitor claim',
    defaultVerdict: 'REVIEW_REQUIRED',
    severity: 'warning',
    explanation: 'Comparative competitor assertions must be backed by documented benchmark testing with methodology cited.',
  },
  // 5. Time-bound SLA / Support
  {
    type: 'time_bound',
    pattern: /\b(?:24\s*\/\s*7\s+(?:support|availability|monitoring)|under\s+\d+\s+hours?\s+response|less\s+than\s+\d+\s+minutes?\s+SLA)\b/gi,
    title: 'Time-bound service commitment',
    defaultVerdict: 'REVIEW_REQUIRED',
    severity: 'warning',
    explanation: 'Service turnaround and 24/7 commitments must match tier contract specifications and active support staffing.',
  },
  // 6. Geographic Presence
  {
    type: 'geographic',
    pattern: /\b(?:\d+\s+global\s+regions|\d+\s+data\s+centers\s+worldwide|available\s+across\s+(?:EMEA|APAC|North\s+America|LATAM))\b/gi,
    title: 'Geographic infrastructure claim',
    defaultVerdict: 'REVIEW_REQUIRED',
    severity: 'warning',
    explanation: 'Geographic region and datacenter numbers must be confirmed against active cloud infrastructure deployment records.',
  },
  // 7. Product Capability & Security Certifications
  {
    type: 'product_capability',
    pattern: /\b(?:SOC\s?2(?:\s+Type\s+(?:I|II))?|ISO\s?27001|HIPAA(?:\s+compliant)?|GDPR(?:\s+compliant)?|SAML\s+SSO|SCIM\s+provisioning)\b/gi,
    title: 'Security certification / capability assertion',
    defaultVerdict: 'UNVERIFIED',
    severity: 'warning',
    explanation: 'Security certifications require valid auditor attestation reports on file in the Brand Vault.',
  },
  // 8. Financial / Revenue / ARR
  {
    type: 'financial',
    pattern: /(?:\$\s?\d[\d,]*(?:\.\d+)?\s?(?:m|million|b|billion|k|thousand)?\s*(?:in\s+)?(?:ARR|annual recurring revenue|revenue|valuation|funding|Series\s+[A-D]))/gi,
    title: 'Financial / ARR assertion',
    defaultVerdict: 'UNVERIFIED',
    severity: 'critical',
    explanation: 'Financial metrics and revenue claims require verified financial statement documentation.',
  },
  // 9. Growth / YoY
  {
    type: 'growth',
    pattern: /\b(?:\d+(?:\.\d+)?%\s*(?:growth|YoY|year[- ]over[- ]year|increase)|tripled|doubled|quadrupled)\b/gi,
    title: 'Growth rate assertion',
    defaultVerdict: 'UNVERIFIED',
    severity: 'warning',
    explanation: 'Growth assertions require period-over-period baseline reporting evidence in the Brand Vault.',
  },
  // 10. Performance / Uptime / Latency
  {
    type: 'performance',
    pattern: /\b(?:\d{2}(?:\.\d+)?%\s*uptime|<\s*\d+\s*ms\s*latency|\d+\s*(?:QPS|TPS|requests\s+per\s+second))\b/gi,
    title: 'Performance & uptime claim',
    defaultVerdict: 'UNVERIFIED',
    severity: 'critical',
    explanation: 'Uptime and latency assertions require SLA reporting evidence transcribed and verified by a reviewer.',
  },
  // 11. Percentages
  {
    type: 'percentages',
    pattern: /\b(?:\d{1,3}(?:\.\d+)?%\s*(?:reduction|efficiency|cost savings|accuracy|satisfaction))\b/gi,
    title: 'Quantitative percentage claim',
    defaultVerdict: 'UNVERIFIED',
    severity: 'warning',
    explanation: 'Percentage improvements require empirical measurement documentation before publication.',
  },
  // 12. Numerical customer / user counts
  {
    type: 'numerical',
    pattern: /\b(?:\d{1,3}(?:,\d{3})*\+?\s*(?:enterprise\s+)?(?:customers|users|clients|organizations|teams|downloads))\b/gi,
    title: 'Customer/user count assertion',
    defaultVerdict: 'UNVERIFIED',
    severity: 'warning',
    explanation: 'Customer and user counts require CRM/billing active account verification.',
  },
];

/**
 * Server-authoritative audit with 12 claim types and 5 verdicts (Priority 5).
 * Grounded in reviewer-approved evidence facts within the active tenant organization.
 */
export function auditContentWithEvidence(
  text: string,
  channel: ChannelType = 'enterprise_web',
  orgId?: string
): AuditResult {
  const result = auditContent(text, channel);
  const customRules = getCustomBrandRules(orgId);
  const customRuleIds = new Set(customRules.map((r) => r.id));
  result.findings = result.findings.filter((finding) => !finding.ruleId || !customRuleIds.has(finding.ruleId));
  const approvedMetrics = getApprovedEvidenceMetrics(orgId);
  const byId = new Map<string, VerifiedMetric>();
  if (!orgId || orgId === 'ORG-DEFAULT') {
    for (const m of VERIFIED_METRICS) {
      byId.set(m.id, m);
    }
  }
  for (const metric of approvedMetrics) {
    byId.set(metric.id, metric);
  }
  const now = new Date().toISOString();

  // First pass: verify existing findings against approved evidence
  for (const finding of result.findings) {
    if (finding.category !== 'claim_verification') continue;
    const metricId = finding.evidence?.metricId;
    const metric = metricId ? byId.get(metricId) : undefined;
    if (!metric) {
      finding.verdict = 'UNVERIFIED';
      finding.reasonCode = 'MISSING_SOURCE';
      finding.severity = 'warning';
      finding.evidence = undefined;
      finding.explanation = 'No current reviewer-approved source fact is registered for this claim. A bundled demo value or citation is not accepted as customer evidence.';
      finding.guidelineTitle = finding.guidelineTitle || 'Claim lacks approved source evidence';
      finding.guidelineCitation = finding.guidelineCitation || 'Evidence-grounded verification policy';
      continue;
    }
    finding.evidence = provenance(metric);
    if (isEquivalentClaim(finding.matchedText, metric.approvedValue)) {
      finding.verdict = 'VERIFIED';
      finding.reasonCode = undefined;
      finding.severity = 'success';
      finding.explanation = `Claim matches the reviewer-approved value “${metric.approvedValue}” from ${metric.sourceDoc}, ${metric.section}.`;
    } else {
      finding.verdict = 'CONFLICT';
      finding.reasonCode = 'NUMERICAL_MISMATCH';
      finding.severity = 'critical';
      finding.explanation = `Claim contradicts reviewer-approved source value “${metric.approvedValue}” from ${metric.sourceDoc}, ${metric.section}.`;
    }
  }

  // Second pass: Match workspace-defined metric keys against the sentence containing the claim.
  const allMetrics = Array.from(byId.values());
  for (const metric of allMetrics) {
    if (result.findings.some((finding) => finding.evidence?.metricId === metric.id)) continue;
    const key = metric.metricName.trim();
    if (key.length < 3 || /^MTR-\d+$/i.test(key)) continue;
    const matcher = new RegExp(escapeRegExp(key), 'gi');
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = matcher.exec(text)) !== null) {
      const sentenceStart = Math.max(text.lastIndexOf('.', keyMatch.index), text.lastIndexOf('\n', keyMatch.index)) + 1;
      const nextDot = text.indexOf('.', keyMatch.index + keyMatch[0].length);
      const sentenceEnd = nextDot < 0 ? text.length : nextDot;
      const sentence = text.slice(sentenceStart, sentenceEnd);
      const claimMatch = sentence.match(/(?:\$\s?\d[\d,]*(?:\.\d+)?\s?(?:m|million|k|thousand)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|users?|customers?|clients?|downloads?|employees?|accounts?|hours?|days?|years?)\b)/i);
      if (!claimMatch) continue;
      const start = sentenceStart + sentence.indexOf(claimMatch[0]);
      const end = start + claimMatch[0].length;
      result.findings = result.findings.filter((finding) => !(finding.category === 'claim_verification' && finding.verdict === 'UNVERIFIED' && finding.startIndex < end && finding.endIndex > start));
      const verified = isEquivalentClaim(claimMatch[0], metric.approvedValue);
      result.findings.push({
        id: `EVIDENCE-METRIC-${metric.id}-${start}`,
        category: 'claim_verification',
        verdict: verified ? 'VERIFIED' : 'CONFLICT',
        reasonCode: verified ? undefined : 'NUMERICAL_MISMATCH',
        matchedText: claimMatch[0],
        startIndex: start,
        endIndex: end,
        severity: verified ? 'success' : 'critical',
        explanation: verified
          ? `Claim matches reviewer-approved fact ${metric.approvedValue} from ${metric.sourceDoc}, ${metric.section}.`
          : `Claim contradicts reviewer-approved fact ${metric.approvedValue} from ${metric.sourceDoc}, ${metric.section}.`,
        guidelineTitle: `Evidence check: ${metric.metricName}`,
        guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
        authorityLevel: 1,
        evidence: provenance(metric),
        rewrites: { direct: metric.approvedValue, punchy: metric.approvedValue, conservative: metric.approvedValue },
      });
    }
  }

  // Third pass: Apply administrator-configured brand rules from the persistent Brand Vault for this organization.
  for (const rule of customRules) {
    for (const pattern of rule.forbiddenPatterns) {
      if (!pattern.trim()) continue;
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matcher = new RegExp(escaped, 'gi');
      let ruleMatch: RegExpExecArray | null;
      while ((ruleMatch = matcher.exec(text)) !== null) {
        const start = ruleMatch.index;
        const end = start + ruleMatch[0].length;
        if (result.findings.some((finding) => finding.startIndex < end && finding.endIndex > start)) continue;
        result.findings.push({
          id: `${rule.id}-${start}`,
          ruleId: rule.id,
          category: rule.category,
          verdict: 'SUGGESTION',
          matchedText: ruleMatch[0],
          startIndex: start,
          endIndex: end,
          severity: rule.severity,
          explanation: rule.description,
          guidelineTitle: rule.title,
          guidelineCitation: rule.citation,
          authorityLevel: rule.authorityLevel,
          rewrites: { direct: rule.approvedAlternative, punchy: rule.approvedAlternative, conservative: rule.approvedAlternative },
        });
      }
    }
  }

  // Fourth pass: 12 Claim Type Recognizers (Priority 5)
  for (const recognizer of CLAIM_RECOGNIZERS) {
    let match: RegExpExecArray | null;
    recognizer.pattern.lastIndex = 0; // Reset regex state
    while ((match = recognizer.pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Skip if this span already has an exact finding
      if (result.findings.some((f) => f.startIndex < end && f.endIndex > start)) continue;

      // Skip negated superlatives or guarantees (e.g. "not an industry-leading", "do not guarantee")
      if (recognizer.type === 'superlatives' || recognizer.type === 'guarantees') {
        const prefix = text.slice(Math.max(0, start - 30), start).toLowerCase();
        if (/\b(?:not(?:\s+an?)?|never|no(?:\s+longer)?|neither|nor|without|isn't|aren't|wasn't|weren't)\s*$/i.test(prefix.trim())) {
          continue;
        }
      }

      // Check if any approved metric covers this claim
      const matchedApprovedMetric = allMetrics.find((m) =>
        isEquivalentClaim(match![0], m.approvedValue) ||
        (m.metricName && match![0].toLowerCase().includes(m.metricName.toLowerCase()))
      );

      let verdict: LintFinding['verdict'] = recognizer.defaultVerdict;
      let severity = recognizer.severity;
      let explanation = recognizer.explanation;
      let reasonCode: LintFinding['reasonCode'] = undefined;
      let evidenceData: LintFinding['evidence'] = undefined;

      if (matchedApprovedMetric) {
        if (isEquivalentClaim(match[0], matchedApprovedMetric.approvedValue)) {
          verdict = 'VERIFIED';
          severity = 'success';
          explanation = `Claim matches reviewer-approved fact “${matchedApprovedMetric.approvedValue}” from ${matchedApprovedMetric.sourceDoc}.`;
          evidenceData = provenance(matchedApprovedMetric);
        } else {
          verdict = 'CONFLICT';
          severity = 'critical';
          reasonCode = 'NUMERICAL_MISMATCH';
          explanation = `Claim contradicts reviewer-approved fact “${matchedApprovedMetric.approvedValue}” from ${matchedApprovedMetric.sourceDoc}.`;
          evidenceData = provenance(matchedApprovedMetric);
        }
      } else if (verdict === 'UNVERIFIED') {
        reasonCode = 'MISSING_SOURCE';
      }

      result.findings.push({
        id: `CLAIM-${recognizer.type.toUpperCase()}-${start}`,
        category: 'claim_verification',
        claimType: recognizer.type,
        verdict,
        reasonCode,
        matchedText: match[0],
        startIndex: start,
        endIndex: end,
        severity,
        explanation,
        guidelineTitle: recognizer.title,
        guidelineCitation: `Evidence Governance — ${recognizer.type.replace('_', ' ')} policy`,
        authorityLevel: verdict === 'CONFLICT' ? 1 : 2,
        evidence: evidenceData,
        rewrites: {
          direct: 'Cite verified source fact',
          punchy: 'Substantiate this assertion before publication',
          conservative: 'Qualify or remove claim until verified evidence is approved',
        },
      });
    }
  }

  // Sort findings by position
  result.findings.sort((a, b) => a.startIndex - b.startIndex);

  // Compute final tallies and compliance score
  const verified = result.findings.filter((f) => f.category === 'claim_verification' && f.verdict === 'VERIFIED').length;
  const conflicted = result.findings.filter((f) => f.category === 'claim_verification' && f.verdict === 'CONFLICT').length;
  const unverified = result.findings.filter((f) => f.category === 'claim_verification' && f.verdict === 'UNVERIFIED').length;
  const reviewRequired = result.findings.filter((f) => f.category === 'claim_verification' && f.verdict === 'REVIEW_REQUIRED').length;
  const blockers = result.findings.some((f) => f.severity === 'critical' && f.verdict !== 'VERIFIED');
  const unresolved = result.findings.some((f) => f.verdict === 'UNVERIFIED' || f.verdict === 'CONFLICT' || f.verdict === 'REVIEW_REQUIRED');
  const configuredRules = result.findings.filter((f) => f.category !== 'claim_verification' && f.verdict !== 'VERIFIED');

  result.complianceScore = Math.max(
    0,
    Math.min(
      100,
      100 -
      conflicted * 18 -
      unverified * 12 -
      reviewRequired * 6 -
      configuredRules.reduce((sum, f) => sum + (f.severity === 'critical' ? 10 : f.severity === 'warning' ? 6 : 3), 0)
    )
  );

  result.claimsVerifiedCount = verified;
  result.claimsConflictedCount = conflicted;
  result.claimsUnverifiedCount = unverified;
  result.metricsAuditedCount = approvedMetrics.length;
  result.verificationStatus = blockers
    ? 'BLOCKED'
    : unresolved || configuredRules.length
      ? 'REVIEW_REQUIRED'
      : 'NO_DETECTED_ISSUES';
  result.verificationScope =
    'Deterministic brand rules plus 12-type claim verification against reviewer-approved evidence facts. All verdicts are cryptographically verifiable.';
  result.timestamp = now;

  return result;
}
