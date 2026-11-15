-- ==============================================================================
-- VeriBrand AI — Production PostgreSQL Migration & DDL Schema
-- Compatible with PostgreSQL 14+, Amazon RDS/Aurora, Cloud SQL, Supabase, Neon
-- ==============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USERS & ROLES TABLE
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
-- 2. SESSIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ------------------------------------------------------------------------------
-- 3. SUBMISSIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id VARCHAR(64) PRIMARY KEY,
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
    approval_mode VARCHAR(32) CHECK(approval_mode IN ('standard', 'exception')),
    exception_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_creator_id ON submissions(creator_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. SUBMISSION REVISIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_revisions (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    audit_result_json JSONB NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revisions_submission_id ON submission_revisions(submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_revisions_sub_version ON submission_revisions(submission_id, version);

-- ------------------------------------------------------------------------------
-- 5. APPEAL DECISIONS TABLE
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
    decided_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS appeal_decisions_revision_finding_unique 
    ON appeal_decisions(submission_id, revision_id, finding_id);
CREATE INDEX IF NOT EXISTS idx_appeal_decisions_sub_id ON appeal_decisions(submission_id);

-- ------------------------------------------------------------------------------
-- 6. COMMENTS TABLE
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
-- 7. AUDIT TRAIL TABLE (IMMUTABLE RECORD)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail (
    id BIGSERIAL PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp DESC);

-- ------------------------------------------------------------------------------
-- 8. EVIDENCE DOCUMENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_documents (
    id VARCHAR(64) PRIMARY KEY,
    metric_id VARCHAR(64) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    section_citation VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    storage_path TEXT,
    uploaded_by VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(64),
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evidence_metric_id ON evidence_documents(metric_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence_documents(sha256_checksum);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence_documents(status);
