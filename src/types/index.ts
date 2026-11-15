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
  | 'SUGGESTION'
  | 'REVIEW_REQUIRED'
  | 'NOT_APPLICABLE';

export type ClaimType =
  | 'numerical'
  | 'percentages'
  | 'financial'
  | 'growth'
  | 'comparative'
  | 'performance'
  | 'product_capability'
  | 'time_bound'
  | 'geographic'
  | 'superlatives'
  | 'guarantees'
  | 'legal_disclaimers';

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
  status: 'active' | 'outdated' | 'pending' | 'unverified';
  organizationId?: string;
  provenanceState?: ProvenanceState;
  sourceUrl?: string;
  sourcePublisher?: string;
  verificationMethod?: string;
}

export interface EvidenceDocument {
  id: string;
  documentName: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  status: string;
  createdAt: string;
  organizationId?: string;
  sourceUrl?: string;
  sourcePublisher?: string;
  verificationMethod?: string;
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
  claimType?: ClaimType;
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
  verificationStatus?: 'BLOCKED' | 'REVIEW_REQUIRED' | 'NO_DETECTED_ISSUES';
  verificationScope?: string;
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
  organizationId?: string;
  version?: number;
  status?: 'draft' | 'active' | 'inactive' | 'archived';
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export type UserRole = 'creator' | 'reviewer' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface UserSession {
  token: string;
  user: User;
  expiresAt: string;
  activeOrganizationId?: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  role: 'Creator' | 'Brand Reviewer' | 'Legal Counsel';
  text: string;
  timestamp: string;
}

export interface SubmissionRevision {
  revisionId?: string;
  version: number;
  text: string;
  auditResult: AuditResult;
  sha256Hash?: string;
  submittedAt: string;
  submittedBy: string;
}

export interface AppealDecision {
  id?: string;
  revisionId?: string;
  findingId: string;
  findingFingerprint?: string;
  decision: 'accepted' | 'rejected';
  rationale: string;
  reviewerName: string;
  decidedAt: string;
}

export interface ReviewSubmission {
  id: string;
  organizationId?: string;
  title: string;
  channel: ChannelType;
  creatorId?: string;
  creatorName: string;
  currentRevisionId?: string;
  submittedAt: string;
  status: 'pending_review' | 'changes_requested' | 'approved';
  originalText: string;
  currentText: string;
  auditResult: AuditResult;
  comments: ReviewComment[];
  sha256Hash?: string;
  integrityVerified?: boolean | null;
  signedOffAt?: string;
  signedOffBy?: string;
  approvalMode?: 'standard' | 'exception';
  exceptionRationale?: string;
  revisionHistory?: SubmissionRevision[];
  appealDecisions?: AppealDecision[];
}

export interface AuditTrailEntry {
  id: number;
  organizationId?: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  submissionId?: string;
  revisionId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
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

// Multi-Tenancy Domain Types
export type OrganizationRole = 'owner' | 'admin' | 'reviewer' | 'creator' | 'readonly';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  brandName?: string;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  token: string;
  invitedBy: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
}

export type ProvenanceState =
  | 'uploaded'
  | 'extracted'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'superseded'
  | 'expired';

export interface EvidenceCandidateFact {
  id: string;
  organizationId: string;
  evidenceId: string;
  metricId?: string;
  claimType: string;
  extractedClaim: string;
  extractedValue: string;
  unit?: string;
  pageNumber?: number;
  textExcerpt: string;
  confidence: number;
  extractionMethod: 'pdf_text' | 'pdf_ocr' | 'image_ocr' | 'ocr_image' | 'manual' | 'heuristic';
  status: 'unverified' | 'approved' | 'rejected';
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  createdAt: string;
}

export interface BrandRuleVersion {
  id: string;
  ruleId: string;
  organizationId: string;
  version: number;
  category: FindingCategory;
  title: string;
  description: string;
  authorityLevel: 1 | 2 | 3;
  severity: Severity;
  forbiddenPatterns: string[];
  approvedAlternative: string;
  citation: string;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  changeRationale?: string;
  createdBy: string;
  createdAt: string;
}

export interface BrandAsset {
  id: string;
  organizationId: string;
  name: string;
  assetType: 'logo_primary' | 'logo_secondary' | 'logo_monochrome' | 'logo_icon' | 'palette_swatch' | 'marketing_image' | 'font';
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  metadata?: Record<string, unknown>;
  uploadedBy: string;
  createdAt: string;
}

export interface OrganizationAnalytics {
  organizationId: string;
  totalSubmissions: number;
  submissionsByStatus: {
    pending_review: number;
    changes_requested: number;
    approved: number;
  };
  claimsAuditedCount: number;
  claimsByVerdict: {
    VERIFIED: number;
    CONFLICT: number;
    UNVERIFIED: number;
    SUGGESTION: number;
  };
  ruleViolationsRanking: Array<{
    ruleId: string;
    title: string;
    category: string;
    count: number;
  }>;
  appealResolutionRate: number;
  averageTurnaroundMinutes: number;
  evidenceActiveCount: number;
  evidenceExpiredCount: number;
  period: string;
}
