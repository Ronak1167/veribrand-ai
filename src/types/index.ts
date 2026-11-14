// VeriBrand AI — Core Domain Data Types
// CodeNova India Hackathon 2026 • Inkloom AI Track

export type ChannelType =
  | 'enterprise_web'
  | 'linkedin'
  | 'twitter'
  | 'press_release'
  | 'marketing_email';

export type FindingCategory =
  | 'claim_verification'
  | 'tone_drift'
  | 'terminology'
  | 'visual_token'
  | 'legal';

export type ClaimVerdict =
  | 'VERIFIED'
  | 'CONFLICT'
  | 'UNVERIFIED'
  | 'SUGGESTION';

export type ReasonCode =
  | 'OUTDATED'
  | 'MISSING_SOURCE'
  | 'NUMERICAL_MISMATCH'
  | 'FORBIDDEN_TERM'
  | 'HYPERBOLIC_SUPERLATIVE'
  | 'AMBIGUOUS_RULE_CONFLICT';

export type Severity = 'critical' | 'warning' | 'info' | 'success';

export interface EvidenceProvenance {
  metricId: string;
  metricName: string;
  approvedValue: string;
  sourceDocument: string;
  sectionCitation: string;
  validityPeriod: string;
  lastAuditedDate: string;
  status: 'active' | 'outdated';
}

export interface RewriteAlternatives {
  direct: string;
  punchy: string;
  conservative: string;
}

export interface CreatorOverride {
  overridden: boolean;
  rationale: string;
  timestamp: string;
}

export interface LintFinding {
  id: string;
  category: FindingCategory;
  verdict: ClaimVerdict;
  reasonCode?: ReasonCode;
  ruleId?: string;
  matchedText: string;
  startIndex: number;
  endIndex: number;
  severity: Severity;
  explanation: string;
  guidelineTitle: string;
  guidelineCitation: string;
  authorityLevel: 1 | 2 | 3; // 1 = Legal, 2 = Brand Stylebook, 3 = Campaign
  evidence?: EvidenceProvenance;
  rewrites: RewriteAlternatives;
  override?: CreatorOverride;
}

export interface AuditResult {
  documentId: string;
  channel: ChannelType;
  complianceScore: number; // 0 - 100
  tier1LatencyMs: number;
  tier2LatencyMs: number;
  findings: LintFinding[];
  metricsAuditedCount: number;
  claimsVerifiedCount: number;
  claimsConflictedCount: number;
  claimsUnverifiedCount: number;
  timestamp: string;
}

export interface VerifiedMetric {
  id: string;
  metricName: string;
  approvedValue: string;
  rawNumber?: number;
  unit?: string;
  validFrom: string;
  validUntil: string | null;
  sourceDoc: string;
  section: string;
  status: 'active' | 'outdated';
  toleranceNotes: string;
}

export interface BrandRule {
  id: string;
  category: FindingCategory;
  title: string;
  description: string;
  authorityLevel: 1 | 2 | 3;
  severity: Severity;
  forbiddenPatterns: string[];
  approvedAlternative: string;
  citation: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  role: 'Creator' | 'Brand Reviewer' | 'Legal Counsel';
  text: string;
  timestamp: string;
}

export interface SubmissionRevision {
  version: number;
  text: string;
  auditResult: AuditResult;
  submittedAt: string;
  submittedBy: string;
}

export interface AppealDecision {
  findingId: string;
  decision: 'accepted' | 'rejected';
  rationale: string;
  reviewerName: string;
  decidedAt: string;
}

export interface ReviewSubmission {
  id: string;
  title: string;
  channel: ChannelType;
  creatorName: string;
  submittedAt: string;
  status: 'pending_review' | 'changes_requested' | 'approved';
  originalText: string;
  currentText: string;
  auditResult: AuditResult;
  comments: ReviewComment[];
  sha256Hash?: string;
  signedOffAt?: string;
  signedOffBy?: string;
  approvalMode?: 'standard' | 'exception';
  exceptionRationale?: string;
  revisionHistory?: SubmissionRevision[];
  appealDecisions?: AppealDecision[];
}

export interface AmbiguityMetric {
  ruleId: string;
  ruleTitle: string;
  category: FindingCategory;
  totalTriggers: number;
  overrideCount: number;
  overrideRatePct: number;
  confusionScore: number; // 0 - 100
  status: 'clear' | 'monitor' | 'ambiguous';
  recommendedClarification: string;
}
