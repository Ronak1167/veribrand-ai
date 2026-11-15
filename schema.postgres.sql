-- ==============================================================================
-- VeriBrand AI — Production PostgreSQL Schema (Migration 001)
-- Multi-Tenant Brand Governance Platform with Evidence Extraction,
-- Provenance Verification, Brand Vault Lifecycle & Visual Compliance
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS TABLE (TENANTS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    logo_url TEXT,
    brand_name VARCHAR(255) DEFAULT 'Inkloom AI & VeriBrand AI',
    settings_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- ------------------------------------------------------------------------------
-- 2. USERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK(role IN ('creator', 'reviewer', 'admin')),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ------------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERSHIPS TABLE (RBAC)
-- Roles: owner, admin, reviewer, creator, readonly
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_memberships (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK(role IN ('owner', 'admin', 'reviewer', 'creator', 'readonly')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uidx_org_user_membership UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON organization_memberships(organization_id);

-- ------------------------------------------------------------------------------
-- 4. ORGANIZATION INVITATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_invitations (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK(role IN ('owner', 'admin', 'reviewer', 'creator', 'readonly')),
    token VARCHAR(128) NOT NULL UNIQUE,
    invited_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitations_org ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON organization_invitations(token);

-- ------------------------------------------------------------------------------
-- 5. SESSIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ------------------------------------------------------------------------------
-- 6. SUBMISSIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    channel VARCHAR(64) NOT NULL,
    creator_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    creator_name VARCHAR(255) NOT NULL,
    current_revision_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK(status IN ('pending_review', 'changes_requested', 'approved')),
    original_text TEXT NOT NULL,
    current_text TEXT NOT NULL,
    audit_result_json JSONB NOT NULL,
    sha256_hash VARCHAR(64),
    signed_off_at TIMESTAMPTZ,
    signed_off_by VARCHAR(255),
    approval_mode VARCHAR(32),
    exception_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_org_id ON submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_submissions_creator_id ON submissions(creator_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);

-- ------------------------------------------------------------------------------
-- 7. SUBMISSION REVISIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_revisions (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    audit_result_json JSONB NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uidx_revisions_sub_version UNIQUE (submission_id, version)
);

CREATE INDEX IF NOT EXISTS idx_revisions_submission_id ON submission_revisions(submission_id);

-- ------------------------------------------------------------------------------
-- 8. APPEAL DECISIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appeal_decisions (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    revision_id VARCHAR(64) NOT NULL,
    finding_id VARCHAR(128) NOT NULL,
    finding_fingerprint VARCHAR(128) NOT NULL,
    decision VARCHAR(32) NOT NULL CHECK(decision IN ('accepted', 'rejected')),
    rationale TEXT NOT NULL,
    reviewer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewer_name VARCHAR(255) NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uidx_appeal_decisions_rev_finding UNIQUE (submission_id, revision_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_appeal_decisions_sub_id ON appeal_decisions(submission_id);

-- ------------------------------------------------------------------------------
-- 9. COMMENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    author_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    author_name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_submission_id ON comments(submission_id);

-- ------------------------------------------------------------------------------
-- 10. AUDIT TRAIL TABLE (IMMUTABLE LOG)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail (
    id BIGSERIAL PRIMARY KEY,
    organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    submission_id VARCHAR(64),
    revision_id VARCHAR(64),
    details_json JSONB NOT NULL,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_actor ON audit_trail(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_sub_id ON audit_trail(submission_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_org_id ON audit_trail(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp DESC);

-- ------------------------------------------------------------------------------
-- 11. EVIDENCE DOCUMENTS TABLE (PROVENANCE & INTEGRITY)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_documents (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
    metric_id VARCHAR(64) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    section_citation VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    uploaded_by VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    storage_path TEXT,
    reviewed_by VARCHAR(64),
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    submission_id VARCHAR(64) REFERENCES submissions(id) ON DELETE SET NULL,
    revision_id VARCHAR(64) REFERENCES submission_revisions(id) ON DELETE SET NULL,
    approved_value TEXT,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    provenance_state VARCHAR(32) DEFAULT 'uploaded',
    source_url TEXT,
    source_publisher VARCHAR(255),
    verification_method VARCHAR(64) DEFAULT 'manual_inspection'
);

CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_evidence_metric_id ON evidence_documents(metric_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence_documents(sha256_checksum);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence_documents(status);

-- ------------------------------------------------------------------------------
-- 12. EVIDENCE CANDIDATE FACTS TABLE (EXTRACTION & REVIEW GATE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_candidate_facts (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    evidence_id VARCHAR(64) NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
    metric_id VARCHAR(64),
    claim_type VARCHAR(64) NOT NULL,
    extracted_claim TEXT NOT NULL,
    extracted_value TEXT NOT NULL,
    unit VARCHAR(64),
    page_number INTEGER,
    text_excerpt TEXT NOT NULL,
    confidence NUMERIC(4, 3) DEFAULT 1.0,
    extraction_method VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified', 'approved', 'rejected')),
    reviewed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_candidate_facts_evidence ON evidence_candidate_facts(evidence_id);
CREATE INDEX IF NOT EXISTS idx_candidate_facts_org ON evidence_candidate_facts(organization_id);
CREATE INDEX IF NOT EXISTS idx_candidate_facts_status ON evidence_candidate_facts(status);

-- ------------------------------------------------------------------------------
-- 13. BRAND RULES TABLE (CUSTOM VAULT RULES)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_rules (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    authority_level INTEGER NOT NULL DEFAULT 2,
    severity VARCHAR(32) NOT NULL CHECK(severity IN ('error', 'warning', 'info')),
    forbidden_patterns_json JSONB NOT NULL,
    approved_alternative TEXT NOT NULL,
    citation TEXT NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'inactive', 'archived')),
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brand_rules_org ON brand_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_brand_rules_status ON brand_rules(status);

-- ------------------------------------------------------------------------------
-- 14. BRAND RULE VERSIONS TABLE (AUDIT HISTORY & ROLLBACK)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_rule_versions (
    id VARCHAR(64) PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL REFERENCES brand_rules(id) ON DELETE CASCADE,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    authority_level INTEGER NOT NULL,
    severity VARCHAR(32) NOT NULL,
    forbidden_patterns_json JSONB NOT NULL,
    approved_alternative TEXT NOT NULL,
    citation TEXT NOT NULL,
    status VARCHAR(32) NOT NULL,
    change_rationale TEXT,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON brand_rule_versions(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_versions_org ON brand_rule_versions(organization_id);

-- ------------------------------------------------------------------------------
-- 15. BRAND ASSETS TABLE (VISUAL BRAND COMPLIANCE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_assets (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(64) NOT NULL CHECK(asset_type IN ('logo_primary', 'logo_secondary', 'logo_monochrome', 'logo_icon', 'palette_swatch', 'marketing_image', 'font')),
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    width INTEGER,
    height INTEGER,
    aspect_ratio VARCHAR(32),
    metadata_json JSONB DEFAULT '{}',
    uploaded_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brand_assets_org ON brand_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_brand_assets_type ON brand_assets(asset_type);
