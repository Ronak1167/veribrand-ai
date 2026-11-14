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
    const lower = matchedText.toLowerCase();
    if (lower.includes('inkloom') || lower.includes('ink loom')) {
      return {
        direct: 'Inkloom AI',
        punchy: 'Inkloom AI',
        conservative: 'Inkloom AI',
      };
    }
    if (lower.includes('veribrand') || lower.includes('verybrand')) {
      return {
        direct: 'VeriBrand AI',
        punchy: 'VeriBrand AI',
        conservative: 'VeriBrand AI',
      };
    }
    if (lower.includes('wizard') || lower.includes('magic') || lower.includes('algorithm') || lower.includes('sauce')) {
      return {
        direct: 'explainable compliance co-pilot',
        punchy: 'governance co-pilot',
        conservative: 'compliance verification engine',
      };
    }
    return {
      direct: approvedAlternative,
      punchy: approvedAlternative,
      conservative: approvedAlternative,
    };
  }

  if (ruleCategory === 'visual_token') {
    return {
      direct: '#4F46E5', // Primary brand indigo
      punchy: '#06B6D4', // Vibrant cyan
      conservative: '#0F172A', // Slate dark
    };
  }

  if (ruleCategory === 'tone_drift') {
    const lower = matchedText.toLowerCase();
    if (lower.includes('replace') || lower.includes('eliminate') || lower.includes('no human')) {
      return {
        direct: 'empowers brand teams with automated pre-screening while maintaining human oversight',
        punchy: 'co-pilots brand reviews alongside human editors',
        conservative: 'augments editorial staff with structured pre-publication compliance checks',
      };
    }
    // Tone drift / superlatives (RULE-TONE-04): grounded, non-hyperbolic alternatives that make zero unverified claims
    return {
      direct: 'enterprise brand governance platform',
      punchy: 'purpose-built governance co-pilot',
      conservative: 'pre-publication brand compliance system',
    };
  }

  return {
    direct: approvedAlternative,
    punchy: approvedAlternative,
    conservative: approvedAlternative,
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

      // Negation check for tone drift rules (e.g. "we are not an industry-leading platform")
      // Explicit negation of hyperbolic claim disclaims the superlative rather than asserting it
      if (rule.category === 'tone_drift') {
        const preceding = text.slice(Math.max(0, m.start - 25), m.start);
        if (/\b(?:not|never|neither|no|isn't|aren't|wasn't|weren't)\s+(?:an?\s+|the\s+)?$/i.test(preceding)) {
          continue;
        }
      }

      findings.push({
        id: `T1-R-${i}-${m.start}`,
        ruleId: rule.id,
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
        ruleId: 'RULE-VIS-01',
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

  // De-duplicate overlapping rule findings:
  // Priority Policy:
  // 1. Highest severity (critical > warning > info)
  // 2. Highest authority level (1 > 2)
  // 3. Longest span length
  // 4. Earlier startIndex
  const getRulePriority = (f: LintFinding): [number, number, number, number] => {
    const sevScore = f.severity === 'critical' ? 3 : f.severity === 'warning' ? 2 : 1;
    const authScore = f.authorityLevel === 1 ? 2 : 1;
    const lenScore = (f.endIndex ?? 0) - (f.startIndex ?? 0);
    const startScore = -(f.startIndex ?? 0);
    return [sevScore, authScore, lenScore, startScore];
  };

  const ruleFindings = findings.filter((f) => !f.id.includes('HEX'));
  const hexFindings = findings.filter((f) => f.id.includes('HEX'));

  const sortedRuleCandidates = [...ruleFindings].sort((a, b) => {
    const pA = getRulePriority(a);
    const pB = getRulePriority(b);
    for (let k = 0; k < 4; k++) {
      if (pA[k] !== pB[k]) return pB[k] - pA[k];
    }
    return 0;
  });

  const selectedRuleFindings: LintFinding[] = [];
  for (const cand of sortedRuleCandidates) {
    const overlaps = selectedRuleFindings.some(
      (accepted) =>
        Math.max(accepted.startIndex, cand.startIndex) <
        Math.min(accepted.endIndex, cand.endIndex)
    );
    if (!overlaps) {
      selectedRuleFindings.push(cand);
    }
  }

  const uniqueFindings = [...selectedRuleFindings, ...hexFindings].sort(
    (a, b) => a.startIndex - b.startIndex
  );

  const latencyMs = Math.round((performance.now() - start) * 100) / 100;
  return { findings: uniqueFindings, latencyMs };
}

// Tier-2 Claim Assertion Parser & Verifier
interface ExtractedClaim {
  text: string;
  startIndex: number;
  endIndex: number;
  claimType: 'uptime' | 'customers' | 'revenue' | 'arr' | 'annual_revenue' | 'pricing' | 'survey' | 'retention' | 'security' | 'turnaround' | 'unsupported_metric' | 'unverified_entity';
  rawNumber?: number;
  isTargetFraming?: boolean;
  isLowerBound?: boolean;
  isNegated?: boolean;
  isUncertain?: boolean;
  isQuestion?: boolean;
  isCompetitorAttribution?: boolean;
  isDisclaimerOrUnqualified?: boolean;
  isExpiredOrLapsed?: boolean;
}

/**
 * Sentence-aware polarity and assertion analyzer.
 * Identifies sentence and clause boundaries (excluding decimal points in numbers),
 * and checks for questions, competitor attributions, disclaimers, unrenewed certifications,
 * affirmative idioms, negations (contractions, denial verbs, phrasal negations),
 * and hedging/uncertainty within the governing clause.
 */
function analyzeSentencePolarity(
  text: string,
  startIndex: number,
  endIndex: number
): {
  isNegated: boolean;
  isUncertain: boolean;
  isAffirmativeIdiom: boolean;
  isQuestion: boolean;
  isCompetitorAttribution: boolean;
  isDisclaimerOrUnqualified: boolean;
  isExpiredOrLapsed: boolean;
} {
  // 1. Identify sentence boundaries (excluding decimal points like 99.9 or 18.5)
  const leftText = text.slice(0, startIndex);
  const sentenceDelims = Array.from(leftText.matchAll(/(?<!\d)[.!?\n]+(?!\d)/g));
  const sentenceStart = sentenceDelims.length > 0
    ? (sentenceDelims[sentenceDelims.length - 1].index! + sentenceDelims[sentenceDelims.length - 1][0].length)
    : 0;

  const rightText = text.slice(endIndex);
  const mRight = /(?<!\d)[.!?\n]+(?!\d)/.exec(rightText);
  const sentenceEnd = mRight ? endIndex + mRight.index : text.length;

  const fullSentence = text.slice(sentenceStart, sentenceEnd).trim();
  const terminator = mRight ? mRight[0].trim() : '';

  // Question detection: question mark in sentence, or inversion start (e.g. "Do we...", "Are we...")
  const hasQuestionMark = text.slice(startIndex, sentenceEnd + 1).includes('?') || terminator.includes('?');
  const auxStart = /^\s*(?:do|does|did|is|are|was|were|can|could|would|should|will|have|has|had|am)\s+(?:we|i|you|they|our|the|a|any)\b/i.test(fullSentence);
  const isQuestion = hasQuestionMark || auxStart;

  // Clause boundaries within the sentence for assertion polarity
  const leftClauseDelims = Array.from(text.slice(sentenceStart, startIndex).matchAll(/[;.!?\n]|\b(?:but|however|whereas|while)\b/gi));
  const clauseStart = leftClauseDelims.length > 0
    ? (sentenceStart + leftClauseDelims[leftClauseDelims.length - 1].index! + leftClauseDelims[leftClauseDelims.length - 1][0].length)
    : sentenceStart;

  const rightClauseMatch = /[;.!?\n]|\b(?:but|however|whereas|while)\b/gi.exec(text.slice(endIndex, sentenceEnd));
  const clauseEnd = rightClauseMatch ? endIndex + rightClauseMatch.index : sentenceEnd;

  const preceding = text.slice(clauseStart, startIndex).toLowerCase();
  const matched = text.slice(startIndex, endIndex).toLowerCase();
  const subsequent = text.slice(endIndex, clauseEnd).toLowerCase();
  const fullSubsequent = text.slice(endIndex, sentenceEnd).toLowerCase();

  // Competitor attribution
  const competitorPattern = /\b(?:competitors?|rivals?|other\s+vendors?|other\s+platforms?|competing\s+solutions?|alternative\s+products?)\s+(?:claims?|states?|offers?|has|have|reports?|provides?|boasts?|guarantees?|promises?)\b|\bunlike\s+(?:our\s+)?(?:competitors?|rivals?|others?)\b|\bcompetitor\s+[a-z0-9]+\b/i;
  const isCompetitorAttribution = competitorPattern.test(text.slice(sentenceStart, endIndex));

  // Disclaimer detection (e.g. "do not guarantee it", "not guaranteed", "no guarantee", "disclaimed")
  const disclaimerPattern = /\b(?:do\s+not\s+guarantee|does\s+not\s+guarantee|not\s+guaranteed|without\s+guarantee|no\s+guarantee|disclaims?|disclaimed|disclaiming|not\s+(?:an?\s+)?sla|non-binding|subject\s+to\s+change|not\s+binding|uncommitted)\b|\([^)]*(?:not\s+guaranteed|disclaimed|no\s+guarantee)[^)]*\)/i;
  const isDisclaimerOrUnqualified = disclaimerPattern.test(fullSubsequent) || disclaimerPattern.test(preceding);

  // Expired / unrenewed
  const expiredPattern = /\b(?:has\s+not\s+been\s+renewed|not\s+been\s+renewed|not\s+renewed|unrenewed|is\s+expired|has\s+expired|expired|lapsed|has\s+lapsed|cancelled|revoked|voided)\b/i;
  const isExpiredOrLapsed = expiredPattern.test(fullSubsequent) || expiredPattern.test(preceding);

  // Double negation vs affirmative idiom:
  // "not only not" affirms negative (double negation) -> isAffirmativeIdiom = false, isNegated = true
  const hasDoubleNegation = /\bnot\s+(?:only|just|merely)\s+(?:not|no|never|neither|without|lacks?)\b/i.test(preceding + ' ' + matched);
  const isAffirmativeIdiom = !hasDoubleNegation && (
    /\bnot\s+(?:only|just|merely)\s+(?:(?:a|an|the)\s+)?$/i.test(preceding) ||
    /^\s*not\s+(?:only|just|merely)\b/i.test(matched)
  );

  const negationPattern = /\b(?:not|no|never|neither|nor|without|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|won't|wouldn't|couldn't|do\s+not|does\s+not|did\s+not|is\s+not|are\s+not|was\s+not|were\s+not|have\s+not|has\s+not|had\s+not|will\s+not|would\s+not|could\s+not|fails?|failed|failing|disclaims?|disclaimed|disclaiming|denies|denied|deny|denying|lacks?|lacked|lacking|no\s+longer)\b/i;
  const subsequentNegationPattern = /\b(?:is\s+no\s+longer|no\s+longer|is\s+not|are\s+not|was\s+not|were\s+not|isn't(?:\s+active)?|aren't|wasn't|weren't|not\s+active|not\s+guaranteed|revoked|expired|cancelled|void|suspended|dropped|fallen|disclaimed|failed|lacks?|without)\b/i;
  const hasInternalNegation = /\b(?:not|never|no|without|no\s+longer|isn't|aren't|cannot|can't)\b/i.test(matched);

  const isNegated = !isAffirmativeIdiom && (
    hasDoubleNegation ||
    negationPattern.test(preceding) ||
    subsequentNegationPattern.test(subsequent) ||
    hasInternalNegation
  );

  const uncertaintyPattern = /\b(?:might|maybe|possibly|perhaps|unclear|uncertain|alleged|allegedly|rumored|unconfirmed|not\s+sure)\b/i;
  const isUncertain = uncertaintyPattern.test(preceding) ||
    uncertaintyPattern.test(matched) ||
    uncertaintyPattern.test(subsequent);

  return {
    isNegated,
    isUncertain,
    isAffirmativeIdiom,
    isQuestion,
    isCompetitorAttribution,
    isDisclaimerOrUnqualified,
    isExpiredOrLapsed,
  };
}

function extractClaimsFromText(text: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // 1. Uptime SLA claims (e.g., "99.9% uptime", "uptime of 99.999%", "99.999 percent uptime")
  const uptimeRegex =
    /(?:([0-9]{2}(?:\.[0-9]+)?)\s*(?:%|percent)\s+(?:enterprise\s+)?(?:system\s+)?(?:uptime|availability|SLA)|(?:uptime|availability|SLA)\s*(?:of\s+|is\s+|at\s+)?([0-9]{2}(?:\.[0-9]+)?)\s*(?:%|percent))/gi;
  let match;
  while ((match = uptimeRegex.exec(text)) !== null) {
    const numStr = match[1] || match[2];
    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'uptime',
      rawNumber: parseFloat(numStr),
      isNegated: polarity.isNegated,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
      isCompetitorAttribution: polarity.isCompetitorAttribution,
      isDisclaimerOrUnqualified: polarity.isDisclaimerOrUnqualified,
      isExpiredOrLapsed: polarity.isExpiredOrLapsed,
    });
  }

  // Anaphoric continuation: "We provide uptime, but it is not 99.9%."
  const anaphoricUptimeRegex = /\b(?:(?:it|this|that)\s+(?:(?:is|was|remains?)\s+not|isn't|wasn't|no\s+longer)|(?:uptime|availability|sla)\s+(?:(?:is|was|remains?)\s+not|isn't|wasn't|no\s+longer))\s+([0-9]{2}(?:\.[0-9]+)?)\s*(?:%|percent)/gi;
  while ((match = anaphoricUptimeRegex.exec(text)) !== null) {
    const contextStart = Math.max(0, match.index - 100);
    const context = text.slice(contextStart, match.index).toLowerCase();
    if (!/\b(?:uptime|availability|sla)\b/.test(context) && !/^\s*(?:uptime|availability|sla)\b/i.test(match[0])) continue;
    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'uptime',
      rawNumber: parseFloat(match[1]),
      isNegated: true,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
      isCompetitorAttribution: polarity.isCompetitorAttribution,
      isDisclaimerOrUnqualified: polarity.isDisclaimerOrUnqualified,
      isExpiredOrLapsed: polarity.isExpiredOrLapsed,
    });
  }

  // 2. Customer counts vs Brand/Org counts
  const customerRegex =
    /(?:(over|more than|at least|exactly|supports?|serves?|with)\s+)?([0-9,]+)(\+?)\s+(?:(?:active\s+)?(?:global\s+)?enterprise\s+(customers|customer\s+accounts|accounts|brands|organizations)|active\s+enterprise\s+(customer\s+accounts))\b/gi;
  while ((match = customerRegex.exec(text)) !== null) {
    const prefix = (match[1] || '').toLowerCase();
    const rawDigits = match[2].replace(/,/g, '');
    const hasPlus = Boolean(match[3]);
    const rawEntity = (match[4] || match[5] || '').toLowerCase().replace(/\s+/g, ' ');
    const isBrandOrOrg = rawEntity === 'brands' || rawEntity === 'organizations';
    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);
    const isLowerBound =
      (hasPlus || ['over', 'more than', 'at least'].includes(prefix)) && prefix !== 'exactly';

    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: isBrandOrOrg ? 'unverified_entity' : 'customers',
      rawNumber: parseInt(rawDigits, 10),
      isLowerBound,
      isNegated: polarity.isNegated,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
      isCompetitorAttribution: polarity.isCompetitorAttribution,
      isDisclaimerOrUnqualified: polarity.isDisclaimerOrUnqualified,
      isExpiredOrLapsed: polarity.isExpiredOrLapsed,
    });
  }

  // 3. Revenue / ARR claims (distinguish ARR from total annual revenue; ignore non-revenue contexts)
  const revenueRegex =
    /(?:(\$([0-9.]+)\s*(?:M|million|B|billion)\s*(?:in\s+)?(annual\s+recurring\s+revenue|arr|annual\s+revenue|total\s+revenue|revenue))|((?:annual\s+recurring\s+revenue|arr|annual\s+revenue|total\s+revenue|revenue)\s*(?:of|is|was|reached|hit|at|stands\s+at)?\s*\$([0-9.]+)\s*(?:M|million|B|billion)(?:\s+(ARR|annual\s+recurring\s+revenue))?))\b/gi;
  while ((match = revenueRegex.exec(text)) !== null) {
    const rawDigits = match[2] || match[5];
    const rawUnit = (match[6] || match[3] || match[4] || '')
      .toLowerCase()
      .replace(/^(annual\s+recurring\s+revenue|arr|annual\s+revenue|total\s+revenue|revenue).*/i, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);

    // Contextual exclusion: exclude if this dollar amount itself directly describes a funding round or valuation
    const matchLower = match[0].toLowerCase();
    if (/\b(?:funding|seed|series\s+[a-z]|valuation)\b/i.test(matchLower)) {
      continue;
    }

    const isARR = rawUnit === 'arr' || rawUnit === 'annual recurring revenue';
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: isARR ? 'arr' : 'annual_revenue',
      rawNumber: parseFloat(rawDigits),
      isNegated: polarity.isNegated,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
      isCompetitorAttribution: polarity.isCompetitorAttribution,
      isDisclaimerOrUnqualified: polarity.isDisclaimerOrUnqualified,
      isExpiredOrLapsed: polarity.isExpiredOrLapsed,
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

  // 5. Retention claims (e.g. "94.2% enterprise retention", "retention rate is no longer 94.2%", "94.9% client retention")
  const retentionRegex =
    /(?:([0-9]{2}(?:\.[0-9]+)?)\s*(?:%|percent)\s+(?:(?:active\s+)?(?:global\s+)?enterprise\s+)?(?:client\s+)?retention(?:\s+rate)?|(?:(?:active\s+)?(?:global\s+)?enterprise\s+)?(?:client\s+)?retention(?:\s+rate)?\s+(?:(?:is|was|of|at|stands\s+at|remains|dropped\s+to|fell\s+to)\s+)?(?:(?:no\s+longer|not)\s+)?(?:(?:is|at|of)\s+)?([0-9]{2}(?:\.[0-9]+)?)\s*(?:%|percent))/gi;
  while ((match = retentionRegex.exec(text)) !== null) {
    const numStr = match[1] || match[2];
    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'retention',
      rawNumber: parseFloat(numStr),
      isNegated: polarity.isNegated,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
      isCompetitorAttribution: polarity.isCompetitorAttribution,
      isDisclaimerOrUnqualified: polarity.isDisclaimerOrUnqualified,
      isExpiredOrLapsed: polarity.isExpiredOrLapsed,
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
    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);
    claims.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'security',
      isNegated: polarity.isNegated,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
      isCompetitorAttribution: polarity.isCompetitorAttribution,
      isDisclaimerOrUnqualified: polarity.isDisclaimerOrUnqualified,
      isExpiredOrLapsed: polarity.isExpiredOrLapsed,
    });
  }

  // 8. General / Unsupported business & footprint metrics (e.g. "2,000 paying subscribers", "17 regional offices", "50 global locations", "serves 17 regions")
  const unsupportedRegex =
    /(?:over|more than|supports?|serves?|serving|with|have|has|operating in|across)?\s*([0-9,]+)\+?\s+(?:(?:global|regional|international|active|paying|registered|daily|monthly)\s+)?(?:subscribers|users|downloads|client accounts|offices|locations|branches|countries|regions|headquarters|team members|employees|engineers|patents|awards|partner organizations|partners|integrations)\b/gi;
  while ((match = unsupportedRegex.exec(text)) !== null) {
    const polarity = analyzeSentencePolarity(text, match.index, match.index + match[0].length);
    if (polarity.isNegated) {
      // Author denies the metric: e.g. "We do not have 17 regional offices"
      continue;
    }
    claims.push({
      text: match[0].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      claimType: 'unsupported_metric',
      rawNumber: parseInt(match[1].replace(/,/g, ''), 10),
      isNegated: polarity.isNegated,
      isUncertain: polarity.isUncertain,
      isQuestion: polarity.isQuestion,
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

      if (claim.isQuestion) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Interrogative SLA Availability Inquiry. Draft poses an inquiry regarding SLA availability ("${claim.text}"). SLA inquiries cannot be verified as factual commitments.`,
          guidelineTitle: 'Unverified SLA Availability Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: 'backed by a 99.9% enterprise uptime SLA',
            punchy: '99.9% enterprise uptime SLA',
            conservative: 'audited 99.9% service availability SLA',
          },
        });
      } else if (claim.isCompetitorAttribution) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'SUGGESTION',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'info',
          explanation: `Third-Party Competitor SLA Reference ("${claim.text}"). Comparative advertising claims regarding competitor SLAs must be substantiated with verified third-party documentation under FTC comparative advertising guides.`,
          guidelineTitle: 'Competitor Metric Reference',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: 'backed by a 99.9% enterprise uptime SLA',
            punchy: '99.9% enterprise uptime SLA',
            conservative: 'holding audited 99.9% service availability SLA',
          },
        });
      } else if (claim.isDisclaimerOrUnqualified) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Disclaimed SLA Specification. Draft references SLA availability ("${claim.text}") with an explicit disclaimer of guarantee or non-binding qualification. Official SLA commitments must be stated authoritatively according to the approved 99.9% MSA specification.`,
          guidelineTitle: 'Disclaimed SLA Specification',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: 'backed by a 99.9% enterprise uptime SLA',
            punchy: '99.9% enterprise uptime SLA',
            conservative: 'holding audited 99.9% service availability SLA',
          },
        });
      } else if (claim.isNegated) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `SLA Availability Denial. Draft denies or disclaims approved 99.9% enterprise uptime SLA ("${claim.text}"), contradicting verified A-LIGN Annual Security Attestation (§3).`,
          guidelineTitle: 'SLA Availability Contradiction',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: 'backed by a 99.9% enterprise uptime SLA',
            punchy: '99.9% enterprise uptime SLA',
            conservative: 'holding audited 99.9% service availability SLA',
          },
        });
      } else if (claim.isUncertain) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unqualified SLA Availability Assertion. Draft asserts tentative or unconfirmed SLA availability ("${claim.text}"). SLA claims must be stated authoritatively according to the approved 99.9% MSA specification.`,
          guidelineTitle: 'Unverified SLA Availability Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: 'backed by a 99.9% enterprise uptime SLA',
            punchy: '99.9% enterprise uptime SLA',
            conservative: 'audited 99.9% service availability (excluding scheduled maintenance)',
          },
        });
      } else if (isExactMatch) {
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
            punchy: '99.9% enterprise uptime SLA',
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
            punchy: '99.9% enterprise uptime SLA',
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

      if (claim.isQuestion) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Interrogative Customer Count Inquiry. Draft poses an inquiry regarding customer count ("${claim.text}"). Inquiries cannot be verified as factual marketing disclosures.`,
          guidelineTitle: 'Unverified Customer Count Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: '420+ active enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (claim.isCompetitorAttribution) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'SUGGESTION',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'info',
          explanation: `Third-Party Customer Count Reference ("${claim.text}"). Competitor customer claims must be substantiated with verified disclosures.`,
          guidelineTitle: 'Competitor Customer Metric Reference',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: '420+ active enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (claim.isNegated) {
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
            punchy: '420+ active enterprise customer accounts',
            conservative: 'at least 420 active enterprise customer accounts',
          },
        });
      } else if (claim.isUncertain) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unverified Customer Count Assertion. Draft asserts tentative or unconfirmed customer account count ("${claim.text}"). Customer disclosures require definitive audit confirmation.`,
          guidelineTitle: 'Unverified Customer Count Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          evidence: provenance,
          rewrites: {
            direct: '420+ active enterprise customer accounts',
            punchy: '420+ active enterprise customer accounts',
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
            punchy: '420+ active enterprise customer accounts',
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
            punchy: '420+ active enterprise customer accounts',
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
            punchy: '420+ active enterprise customer accounts',
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
            punchy: '420+ active enterprise customer accounts',
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
            punchy: '420+ active enterprise customer accounts',
            conservative: 'over 420 active enterprise customer accounts',
          },
        });
      }
    } else if (claim.claimType === 'unverified_entity') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-004')!;
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

      findings.push({
        id: `T2-CLAIM-${i}`,
        category: 'claim_verification',
        verdict: 'UNVERIFIED',
        reasonCode: 'MISSING_SOURCE',
        matchedText: claim.text,
        startIndex: claim.startIndex,
        endIndex: claim.endIndex,
        severity: 'warning',
        explanation: `Unverified Entity Metric. Draft asserts "${claim.text}". Brand Vault metric MTR-004 certifies "${metric.approvedValue} active enterprise customer accounts", not brands or organizations. The system abstains from transferring customer account verification to distinct corporate entities without separate audit evidence.`,
        guidelineTitle: 'Unverified Entity Metric',
        guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
        authorityLevel: 2,
        evidence: provenance,
        rewrites: {
          direct: '420+ active enterprise customer accounts',
          punchy: '420+ active enterprise customer accounts',
          conservative: 'at least 420 active enterprise customer accounts',
        },
      });
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

      if (claim.isQuestion) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Interrogative Financial Metric Inquiry. Draft poses an inquiry regarding ARR ("${claim.text}"). Inquiries cannot be verified as factual financial disclosures.`,
          guidelineTitle: 'Unverified ARR Metric Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M ARR',
            punchy: '$18.5M in audited annual recurring revenue',
            conservative: '$18.5M ARR (FY25 audited disclosure)',
          },
        });
      } else if (claim.isCompetitorAttribution) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'SUGGESTION',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'info',
          explanation: `Third-Party Financial Metric Reference ("${claim.text}"). Competitor financial claims must cite verified audited statements.`,
          guidelineTitle: 'Competitor Financial Metric Reference',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M ARR',
            punchy: '$18.5M in audited annual recurring revenue',
            conservative: '$18.5M ARR (FY25 Deloitte audit)',
          },
        });
      } else if (claim.isNegated) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `Negated ARR Financial Disclosure. Draft denies audited $18.5M Annual Recurring Revenue (ARR) ("${claim.text}"), contradicting verified Deloitte FY25 statements.`,
          guidelineTitle: 'ARR Financial Disclosure Contradiction',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M ARR',
            punchy: '$18.5M in audited annual recurring revenue',
            conservative: '$18.5M ARR (FY25 Deloitte audit)',
          },
        });
      } else if (claim.isUncertain) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unverified ARR Metric Assertion. Draft asserts tentative or unconfirmed ARR figures ("${claim.text}"). Financial disclosures must cite audited Deloitte FY25 statements.`,
          guidelineTitle: 'Unverified ARR Metric Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '$18.5M ARR',
            punchy: '$18.5M in audited annual recurring revenue',
            conservative: '$18.5M ARR (FY25 audited disclosure)',
          },
        });
      } else if (isExactMatch) {
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
          direct: 'Annual revenue figure pending approved disclosure',
          punchy: 'Contact us for approved financial disclosures',
          conservative: 'Annual revenue not currently disclosed in the approved Brand Vault',
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
            approvedValue: '$49/mo (Discontinued)',
            sourceDocument: metricOutdated.sourceDoc,
            sectionCitation: metricOutdated.section,
            validityPeriod: 'Expired 2026-08-31; superseded by $79/mo Starter tier',
            lastAuditedDate: '2026-09-01',
            status: 'outdated',
          },
          rewrites: {
            direct: '$79/mo',
            punchy: '$79/mo standard plan',
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
          explanation: `Unapproved Pricing Quote. Quoting "${claim.text}" has no verified source in the active Brand Vault pricing schedule (Approved Starter tier is $79/mo). Deterministic verifier withholds approval: pricing tier not recognised in the current Brand Vault.`,
          guidelineTitle: 'Unverified Pricing Tier',
          guidelineCitation: 'Product Pricing Schedule FY26 v2.0 — Section 2',
          authorityLevel: 2,
          rewrites: {
            direct: '$79/mo (Approved Standard Tier)',
            punchy: '$79/mo standard plan',
            conservative: '$79/month according to current approved pricing',
          },
        });
      }
    } else if (claim.claimType === 'retention') {
      const metric = VERIFIED_METRICS.find((m) => m.id === 'MTR-001')!;
      const isExactMatch = claim.rawNumber === metric.rawNumber;

      const provenance: EvidenceProvenance = {
        metricId: metric.id,
        metricName: metric.metricName,
        approvedValue: metric.approvedValue,
        sourceDocument: metric.sourceDoc,
        sectionCitation: metric.section,
        validityPeriod: 'FY25-FY26',
        lastAuditedDate: '2026-10-15',
        status: 'active',
      };

      if (claim.isQuestion) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Interrogative Retention Metric Inquiry. Draft poses an inquiry regarding retention ("${claim.text}"). Inquiries cannot be verified as factual client retention metrics.`,
          guidelineTitle: 'Unverified Retention Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '94.2% enterprise retention',
            punchy: 'audited 94.2% enterprise client retention',
            conservative: '94.2% client retention rate audited by KPMG',
          },
        });
      } else if (claim.isCompetitorAttribution) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'SUGGESTION',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'info',
          explanation: `Third-Party Retention Metric Reference ("${claim.text}"). Competitor retention claims must be substantiated with verified quality audits.`,
          guidelineTitle: 'Competitor Retention Metric Reference',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '94.2% enterprise retention',
            punchy: 'audited 94.2% enterprise client retention',
            conservative: '94.2% client retention rate audited by KPMG',
          },
        });
      } else if (claim.isNegated) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: `Client Retention Denial. Draft denies audited 94.2% enterprise retention ("${claim.text}"), contradicting verified KPMG FY25 Enterprise Quality Audit Report.`,
          guidelineTitle: 'Client Retention Contradiction',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '94.2% enterprise client retention rate',
            punchy: 'audited 94.2% enterprise client retention',
            conservative: 'holding audited 94.2% client retention rate (KPMG FY25)',
          },
        });
      } else if (claim.isUncertain) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unqualified Retention Assertion. Draft asserts unconfirmed retention rate ("${claim.text}"). Must cite verified KPMG 94.2% audit baseline without equivocation.`,
          guidelineTitle: 'Unverified Retention Assertion',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '94.2% enterprise retention',
            punchy: 'audited 94.2% enterprise client retention',
            conservative: '94.2% client retention rate audited by KPMG',
          },
        });
      } else if (isExactMatch) {
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
          evidence: provenance,
          rewrites: {
            direct: '94.2% enterprise retention',
            punchy: 'audited 94.2% enterprise client retention',
            conservative: '94.2% client retention rate audited by KPMG',
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
          explanation: `Client Retention Metric Discrepancy. Draft asserts "${claim.text}", but KPMG FY25 Enterprise Quality Audit Report (Executive Summary p. 4) officially certifies 94.2% enterprise client retention. Citing unverified retention figures violates enterprise marketing compliance standards.`,
          guidelineTitle: 'Client Retention Metric Discrepancy',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 1,
          evidence: provenance,
          rewrites: {
            direct: '94.2% enterprise retention',
            punchy: 'audited 94.2% enterprise client retention',
            conservative: '94.2% client retention rate audited by KPMG',
          },
        });
      }
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

      if (claim.isQuestion) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Interrogative Security Attestation Inquiry. Draft poses an inquiry regarding SOC 2 Type II compliance ("${claim.text}"). Inquiries cannot be verified as factual security attestations.`,
          guidelineTitle: 'Unverified Security Certification',
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
            punchy: 'attested SOC 2 Type II security',
            conservative: 'holding active SOC 2 Type II certification',
          },
        });
      } else if (claim.isCompetitorAttribution) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'SUGGESTION',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'info',
          explanation: `Third-Party Security Reference ("${claim.text}"). Competitor security claims must be substantiated with verified audit disclosures.`,
          guidelineTitle: 'Competitor Security Reference',
          guidelineCitation: `${metric.sourceDoc} — ${metric.section}`,
          authorityLevel: 2,
          rewrites: {
            direct: 'SOC 2 Type II certified',
            punchy: 'attested SOC 2 Type II security',
            conservative: 'holding active SOC 2 Type II certification',
          },
        });
      } else if (claim.isExpiredOrLapsed || claim.isNegated) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'CONFLICT',
          reasonCode: 'NUMERICAL_MISMATCH',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'critical',
          explanation: claim.isExpiredOrLapsed
            ? `Lapsed / Unrenewed Security Attestation. Draft asserts "${claim.text}" as unrenewed or expired, contradicting active A-LIGN SOC 2 Type II certification status (valid 2026-2027).`
            : `Negated Security Attestation. Copy asserts "${claim.text}", which directly contradicts the company's verified A-LIGN SOC 2 Type II certification.`,
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
      } else if (claim.isUncertain) {
        findings.push({
          id: `T2-CLAIM-${i}`,
          category: 'claim_verification',
          verdict: 'UNVERIFIED',
          reasonCode: 'MISSING_SOURCE',
          matchedText: claim.text,
          startIndex: claim.startIndex,
          endIndex: claim.endIndex,
          severity: 'warning',
          explanation: `Unverified Security Certification. Draft expresses uncertainty regarding SOC 2 Type II compliance ("${claim.text}"). Security attestations require active A-LIGN certification confirmation.`,
          guidelineTitle: 'Unverified Security Certification',
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
            punchy: 'attested SOC 2 Type II security',
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
            punchy: 'attested SOC 2 Type II security',
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
          punchy: '420+ active enterprise customer accounts',
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

  // Channel-Specific Governance Constraints:
  if (channel === 'twitter' && text.length > 280) {
    allFindings.push({
      id: 'T1-CHAN-TWITTER-LEN',
      category: 'tone_drift',
      verdict: 'SUGGESTION',
      matchedText: text.slice(280),
      startIndex: 280,
      endIndex: text.length,
      severity: 'warning',
      explanation: `Twitter / X Character Limit Exceeded. Draft is ${text.length} characters (standard platform limit is 280 characters). Long posts may be truncated or require X Premium.`,
      guidelineTitle: 'Platform Character Limit (Twitter / X)',
      guidelineCitation: 'Brand Social Media Stylebook §2.1 (Channel Constraints)',
      authorityLevel: 2,
      rewrites: {
        direct: 'Condense copy to under 280 characters',
        punchy: 'Keep social posts brief and punchy',
        conservative: 'Publish full text on enterprise blog with Twitter summary link',
      },
    });
  }

  if (channel === 'press_release') {
    for (const f of allFindings) {
      if (f.severity === 'warning' || f.category === 'tone_drift') {
        f.severity = 'critical';
        if (!f.explanation.includes('Press Release Policy')) {
          f.explanation += ' [Press Release Policy: heightened regulatory scrutiny under SEC/ASCI disclosures].';
        }
      }
    }
  }

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
