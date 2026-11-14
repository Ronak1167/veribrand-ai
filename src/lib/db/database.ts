// VeriBrand AI - Durable Relational SQLite Database Layer
// Uses the Node.js built-in node:sqlite DatabaseSync with WAL mode and transactional writes.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  User,
  ReviewSubmission,
  AppealDecision,
  ReviewComment,
  AuditTrailEntry,
  ChannelType,
  AuditResult,
  EvidenceProvenance,
} from '@/types';


interface SubmissionRow {
  id: string;
  title: string;
  channel: string;
  creator_name: string;
  current_revision_id: string;
  status: 'pending_review' | 'changes_requested' | 'approved';
  original_text: string;
  current_text: string;
  audit_result_json: string;
  sha256_hash: string | null;
  signed_off_at: string | null;
  signed_off_by: string | null;
  approval_mode: string | null;
  exception_rationale: string | null;
  created_at: string;
  updated_at: string;
}

interface RevisionRow {
  id: string;
  submission_id: string;
  version: number;
  text: string;
  audit_result_json: string;
  sha256_hash: string;
  submitted_by: string;
  submitted_at: string;
}

interface AppealRow {
  id: string;
  submission_id: string;
  revision_id: string;
  finding_id: string;
  finding_fingerprint: string;
  decision: 'accepted' | 'rejected';
  rationale: string;
  reviewer_id: string;
  reviewer_name: string;
  decided_at: string;
}

interface CommentRow {
  id: string;
  submission_id: string;
  author_id: string;
  author_name: string;
  role: string;
  text: string;
  created_at: string;
}

interface AuditTrailRow {
  id: number;
  event_type: string;
  actor_id: string;
  actor_role: string;
  submission_id: string | null;
  revision_id: string | null;
  details_json: string;
  ip_address: string | null;
  timestamp: string;
}

interface EvidenceRow {
  id: string;
  metric_id: string;
  document_name: string;
  section_citation: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_checksum: string;
  status: string;
  uploaded_by: string;
  uploaded_at: string;
}

const DEFAULT_DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(/*turbopackIgnore: true*/ process.env.VERIBRAND_DB_PATH || path.join(DEFAULT_DB_DIR, 'veribrand.db'));
const DB_DIR = path.dirname(DB_PATH);
let dbInstance: DatabaseSync | null = null;

// Per-account random salt; only the derived scrypt hash is persisted.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) return false;
  const derived = crypto.scryptSync(password, parts[1], 64);
  return crypto.timingSafeEqual(derived, Buffer.from(parts[2], 'hex'));
}

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Initialize Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('creator', 'reviewer', 'admin')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      channel TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      current_revision_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending_review', 'changes_requested', 'approved')),
      original_text TEXT NOT NULL,
      current_text TEXT NOT NULL,
      audit_result_json TEXT NOT NULL,
      sha256_hash TEXT,
      signed_off_at TEXT,
      signed_off_by TEXT,
      approval_mode TEXT,
      exception_rationale TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submission_revisions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      text TEXT NOT NULL,
      audit_result_json TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appeal_decisions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      finding_fingerprint TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('accepted', 'rejected')),
      rationale TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      submission_id TEXT,
      revision_id TEXT,
      details_json TEXT NOT NULL,
      ip_address TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evidence_documents (
      id TEXT PRIMARY KEY,
      metric_id TEXT NOT NULL,
      document_name TEXT NOT NULL,
      section_citation TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_checksum TEXT NOT NULL,
      status TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appeal_decisions_revision_finding_unique
      ON appeal_decisions(submission_id, revision_id, finding_id);
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive
      ON users(lower(email));
  `);

  // No demo users or fabricated evidence are seeded. Accounts must be explicitly bootstrapped.
  dbInstance = db;
  return db;
}

// User & Authentication Helpers
export function hasUsers(): boolean {
  const row = getDatabase().prepare('SELECT count(*) as count FROM users;').get() as { count: number };
  return row.count > 0;
}

export function createUser(params: { email: string; name: string; role: 'creator' | 'reviewer' | 'admin'; password: string }): User {
  const db = getDatabase();
  const id = `USR-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);')
    .run(id, params.email.trim().toLowerCase(), params.name.trim(), params.role, hashPassword(params.password), now);
  return { id, email: params.email.trim().toLowerCase(), name: params.name.trim(), role: params.role, createdAt: now };
}

export function getSubmissionOwnerId(submissionId: string): string | null {
  const row = getDatabase().prepare('SELECT creator_id FROM submissions WHERE id = ?;').get(submissionId) as { creator_id: string } | undefined;
  return row?.creator_id ?? null;
}

export function getAllUsers(): User[] {
  const rows = getDatabase().prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC;').all() as Array<{ id: string; email: string; name: string; role: User['role']; created_at: string }>;
  return rows.map(row => ({ id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at }));
}

export function getUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const db = getDatabase();
  const row = db.prepare('SELECT id, email, name, role, password_hash, created_at FROM users WHERE lower(email) = lower(?);').get(email) as {
    id: string;
    email: string;
    name: string;
    role: 'creator' | 'reviewer' | 'admin';
    password_hash: string;
    created_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export function getUserById(id: string): User | null {
  const db = getDatabase();
  const row = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?;').get(id) as {
    id: string;
    email: string;
    name: string;
    role: 'creator' | 'reviewer' | 'admin';
    created_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function createSession(userId: string): { token: string; user: User; expiresAt: string } {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?);').run(
    tokenHash,
    user.id,
    expiresAt,
    now
  );

  return { token, user, expiresAt };
}

export function getSession(token: string): { token: string; user: User; expiresAt: string } | null {
  const db = getDatabase();
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.email, u.name, u.role, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?;
  `).get(tokenHash) as {
    token: string;
    expires_at: string;
    id: string;
    email: string;
    name: string;
    role: 'creator' | 'reviewer' | 'admin';
    created_at: string;
  } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?;').run(tokenHash);
    return null;
  }

  return {
    token,
    expiresAt: row.expires_at,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: row.created_at,
    },
  };
}

export function deleteSession(token: string): boolean {
  const db = getDatabase();
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const res = db.prepare('DELETE FROM sessions WHERE token = ?;').run(tokenHash);
  return res.changes > 0;
}

// Submissions CRUD
export function getAllSubmissions(): ReviewSubmission[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM submissions ORDER BY created_at DESC;').all() as unknown as SubmissionRow[];
  return rows.map((r) => assembleSubmission(r));
}

export function getSubmissionsForCreator(creatorId: string): ReviewSubmission[] {
  const rows = getDatabase().prepare('SELECT * FROM submissions WHERE creator_id = ? ORDER BY created_at DESC;').all(creatorId) as unknown as SubmissionRow[];
  return rows.map((r) => assembleSubmission(r));
}

export function getSubmissionById(id: string): ReviewSubmission | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?;').get(id) as unknown as SubmissionRow | undefined;
  if (!row) return null;
  return assembleSubmission(row);
}

function assembleSubmission(r: SubmissionRow): ReviewSubmission {
  const db = getDatabase();
  const revisions = db.prepare('SELECT * FROM submission_revisions WHERE submission_id = ? ORDER BY version ASC;').all(r.id) as unknown as RevisionRow[];
  const appeals = db.prepare('SELECT * FROM appeal_decisions WHERE submission_id = ? ORDER BY decided_at ASC;').all(r.id) as unknown as AppealRow[];
  const comments = db.prepare('SELECT * FROM comments WHERE submission_id = ? ORDER BY created_at ASC;').all(r.id) as unknown as CommentRow[];

  return {
    id: r.id,
    title: r.title,
    channel: r.channel as ChannelType,
    creatorName: r.creator_name,
    currentRevisionId: r.current_revision_id,
    submittedAt: r.created_at,
    status: r.status,
    originalText: r.original_text,
    currentText: r.current_text,
    auditResult: JSON.parse(r.audit_result_json) as AuditResult,
    sha256Hash: r.sha256_hash || undefined,
    signedOffAt: r.signed_off_at || undefined,
    signedOffBy: r.signed_off_by || undefined,
    approvalMode: (r.approval_mode as 'standard' | 'exception') || undefined,
    exceptionRationale: r.exception_rationale || undefined,
    revisionHistory: revisions.map((rev) => ({
      revisionId: rev.id,
      version: rev.version,
      text: rev.text,
      auditResult: JSON.parse(rev.audit_result_json) as AuditResult,
      sha256Hash: rev.sha256_hash,
      submittedAt: rev.submitted_at,
      submittedBy: rev.submitted_by,
    })),
    appealDecisions: appeals.map((app) => ({
      id: app.id,
      revisionId: app.revision_id,
      findingId: app.finding_id,
      findingFingerprint: app.finding_fingerprint,
      decision: app.decision,
      rationale: app.rationale,
      reviewerName: app.reviewer_name,
      decidedAt: app.decided_at,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      author: c.author_name,
      role: c.role as 'Brand Reviewer' | 'Creator' | 'Legal Counsel',
      text: c.text,
      timestamp: c.created_at,
    })),
  };
}

export function verifySubmissionApprovalIntegrity(submissionId: string): boolean {
  const sub = getSubmissionById(submissionId);
  if (!sub || sub.status !== 'approved' || !sub.sha256Hash || !/^[a-f0-9]{64}$/i.test(sub.sha256Hash) || !sub.signedOffAt || !sub.signedOffBy || !sub.currentRevisionId) return false;
  const revision = (sub.revisionHistory || []).find(item => item.revisionId === sub.currentRevisionId);
  if (!revision || revision.text !== sub.currentText) return false;
  const revisionHash = crypto.createHash('sha256').update(sub.currentText, 'utf8').digest('hex');
  if (revision.sha256Hash !== revisionHash) return false;
  const canonical = JSON.stringify({ version: 1, submissionId: sub.id, revisionId: sub.currentRevisionId, channel: sub.channel, text: sub.currentText, reviewer: sub.signedOffBy, approvedAt: sub.signedOffAt });
  const expected = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sub.sha256Hash, 'hex'));
}

export function createSubmission(params: {
  id?: string;
  title: string;
  channel: ChannelType;
  creatorId: string;
  creatorName: string;
  text: string;
  auditResult: AuditResult;
}): ReviewSubmission {
  const db = getDatabase();
  const submissionId = params.id || `SUB-${Date.now().toString(36).toUpperCase()}`;
  const revisionId = `${submissionId}-REV-1`;
  const now = new Date().toISOString();
  const sha256 = crypto.createHash('sha256').update(params.text, 'utf8').digest('hex');

  db.prepare(`
    INSERT INTO submissions (
      id, title, channel, creator_id, creator_name, current_revision_id,
      status, original_text, current_text, audit_result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    submissionId,
    params.title,
    params.channel,
    params.creatorId,
    params.creatorName,
    revisionId,
    'pending_review',
    params.text,
    params.text,
    JSON.stringify(params.auditResult),
    now,
    now
  );

  db.prepare(`
    INSERT INTO submission_revisions (
      id, submission_id, version, text, audit_result_json, sha256_hash, submitted_by, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    revisionId,
    submissionId,
    1,
    params.text,
    JSON.stringify(params.auditResult),
    sha256,
    params.creatorName,
    now
  );

  logAuditEvent(
    'SUBMISSION_CREATED',
    params.creatorId,
    'creator',
    submissionId,
    revisionId,
    { title: params.title, channel: params.channel, score: params.auditResult.complianceScore }
  );

  return getSubmissionById(submissionId)!;
}

export function addSubmissionRevision(
  submissionId: string,
  revisedText: string,
  auditResult: AuditResult,
  submittedBy: string
): { revisionId: string; version: number } {
  const db = getDatabase();
  const sub = getSubmissionById(submissionId);
  if (!sub) throw new Error('Submission not found');
  if (sub.status !== 'changes_requested') throw new Error('Only submissions awaiting changes can be revised.');

  const version = (sub.revisionHistory?.length || 1) + 1;
  const revisionId = `${submissionId}-REV-${version}`;
  const now = new Date().toISOString();
  const sha256 = crypto.createHash('sha256').update(revisedText, 'utf8').digest('hex');

  db.prepare(`
    INSERT INTO submission_revisions (
      id, submission_id, version, text, audit_result_json, sha256_hash, submitted_by, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    revisionId,
    submissionId,
    version,
    revisedText,
    JSON.stringify(auditResult),
    sha256,
    submittedBy,
    now
  );

  db.prepare(`
    UPDATE submissions
    SET current_revision_id = ?, current_text = ?, audit_result_json = ?, status = 'pending_review',
        sha256_hash = NULL, signed_off_at = NULL, signed_off_by = NULL, approval_mode = NULL,
        exception_rationale = NULL, updated_at = ?
    WHERE id = ? AND status = 'changes_requested';
  `).run(revisionId, revisedText, JSON.stringify(auditResult), now, submissionId);
  const revisionUpdate = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (revisionUpdate.changes !== 1) {
    db.prepare('DELETE FROM submission_revisions WHERE id = ?;').run(revisionId);
    throw new Error('Resubmission rejected because the submission state changed.');
  }

  logAuditEvent(
    'REVISION_SUBMITTED',
    submittedBy,
    'creator',
    submissionId,
    revisionId,
    { version, score: auditResult.complianceScore }
  );

  return { revisionId, version };
}

export function updateSubmissionApproval(
  submissionId: string,
  reviewerId: string,
  reviewerName: string,
  approvalMode: 'standard' | 'exception',
  sha256Hash: string,
  exceptionRationale?: string,
  expectedRevisionId?: string,
  approvedAt?: string
): ReviewSubmission {
  const db = getDatabase();
  const sub = getSubmissionById(submissionId);
  if (!sub) throw new Error('Submission not found');

  const now = approvedAt || new Date().toISOString();

  db.prepare(`
    UPDATE submissions
    SET status = 'approved', signed_off_at = ?, signed_off_by = ?, approval_mode = ?, sha256_hash = ?, exception_rationale = ?, updated_at = ?
    WHERE id = ? AND current_revision_id = ? AND status = 'pending_review';
  `).run(
    now,
    reviewerName,
    approvalMode,
    sha256Hash,
    exceptionRationale || null,
    now,
    submissionId,
    expectedRevisionId || sub.currentRevisionId
  );
  const updateResult = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (updateResult.changes !== 1) throw new Error('Approval rejected because the current revision or status changed.');

  logAuditEvent(
    approvalMode === 'exception' ? 'EXCEPTION_GRANTED' : 'SUBMISSION_APPROVED',
    reviewerId,
    'reviewer',
    submissionId,
    sub.currentRevisionId || null,
    { reviewerName, approvalMode, sha256Hash, exceptionRationale }
  );

  return getSubmissionById(submissionId)!;
}

export function requestSubmissionChanges(
  submissionId: string,
  reviewerId: string,
  reviewerName: string,
  commentText: string
): ReviewSubmission {
  const db = getDatabase();
  const sub = getSubmissionById(submissionId);
  if (!sub) throw new Error('Submission not found');

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE submissions
    SET status = 'changes_requested', updated_at = ?
    WHERE id = ? AND status = 'pending_review';
  `).run(now, submissionId);
  const changeResult = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (changeResult.changes !== 1) throw new Error('Change request rejected because the submission state changed.');

  addComment(submissionId, reviewerId, reviewerName, 'Brand Reviewer', commentText);

  logAuditEvent(
    'CHANGES_REQUESTED',
    reviewerId,
    'reviewer',
    submissionId,
    sub.currentRevisionId || null,
    { commentText }
  );

  return getSubmissionById(submissionId)!;
}

export function addAppealDecision(params: {
  submissionId: string;
  revisionId: string;
  findingId: string;
  findingFingerprint: string;
  decision: 'accepted' | 'rejected';
  rationale: string;
  reviewerId: string;
  reviewerName: string;
}): AppealDecision {
  const db = getDatabase();
  const id = `APP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO appeal_decisions (
      id, submission_id, revision_id, finding_id, finding_fingerprint, decision, rationale, reviewer_id, reviewer_name, decided_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND current_revision_id = ? AND status = 'pending_review');
  `).run(
    id,
    params.submissionId,
    params.revisionId,
    params.findingId,
    params.findingFingerprint,
    params.decision,
    params.rationale,
    params.reviewerId,
    params.reviewerName,
    now,
    params.submissionId,
    params.revisionId
  );
  const insertResult = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (insertResult.changes !== 1) throw new Error('Appeal rejected because the current revision or review state changed.');

  logAuditEvent(
    'APPEAL_DECIDED',
    params.reviewerId,
    'reviewer',
    params.submissionId,
    params.revisionId,
    { findingId: params.findingId, decision: params.decision, rationale: params.rationale }
  );

  return {
    id,
    revisionId: params.revisionId,
    findingId: params.findingId,
    findingFingerprint: params.findingFingerprint,
    decision: params.decision,
    rationale: params.rationale,
    reviewerName: params.reviewerName,
    decidedAt: now,
  };
}

export function addComment(
  submissionId: string,
  authorId: string,
  authorName: string,
  role: string,
  text: string
): ReviewComment {
  const db = getDatabase();
  const id = `C-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO comments (id, submission_id, author_id, author_name, role, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `).run(id, submissionId, authorId, authorName, role, text, now);

  logAuditEvent('COMMENT_ADDED', authorId, role, submissionId, null, { text });

  return {
    id,
    author: authorName,
    role: role as 'Brand Reviewer' | 'Creator' | 'Legal Counsel',
    text,
    timestamp: now,
  };
}

export function logAuditEvent(
  eventType: string,
  actorId: string,
  actorRole: string,
  submissionId: string | null,
  revisionId: string | null,
  details: Record<string, unknown>,
  ipAddress: string = '127.0.0.1'
): void {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO audit_trail (event_type, actor_id, actor_role, submission_id, revision_id, details_json, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      eventType,
      actorId,
      actorRole,
      submissionId,
      revisionId,
      JSON.stringify(details),
      ipAddress,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Failed to write audit trail event:', err);
  }
}

export function getAuditTrail(limit: number = 100): AuditTrailEntry[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?;').all(limit) as unknown as AuditTrailRow[];

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    submissionId: r.submission_id || undefined,
    revisionId: r.revision_id || undefined,
    details: JSON.parse(r.details_json || '{}'),
    ipAddress: r.ip_address || undefined,
    timestamp: r.timestamp,
  }));
}

export function getAllEvidence(): EvidenceProvenance[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM evidence_documents ORDER BY uploaded_at DESC;').all() as unknown as EvidenceRow[];

  return rows.map((r) => ({
    metricId: r.metric_id,
    metricName: r.document_name,
    approvedValue: 'Not specified',
    sourceDocument: r.document_name,
    sectionCitation: r.section_citation,
    validityPeriod: 'Not specified',
    lastAuditedDate: 'Not audited',
    status: r.status === 'outdated' ? 'outdated' : r.status === 'verified' ? 'active' : 'pending',
  }));
}

export function addEvidenceDocument(params: {
  metricId: string;
  documentName: string;
  sectionCitation: string;
  mimeType?: string;
  fileSizeBytes?: number;
  sha256Checksum?: string;
  status?: string;
  uploadedBy: string;
}): EvidenceProvenance {
  const db = getDatabase();
  const id = `EVID-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const mime = params.mimeType || 'application/octet-stream';
  const size = params.fileSizeBytes ?? 0;
  const hash = params.sha256Checksum || '';
  const status = params.status || 'pending';

  db.prepare(`
    INSERT INTO evidence_documents (
      id, metric_id, document_name, section_citation, mime_type, file_size_bytes, sha256_checksum, status, uploaded_by, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    id,
    params.metricId,
    params.documentName,
    params.sectionCitation,
    mime,
    size,
    hash,
    status,
    params.uploadedBy,
    now
  );

  logAuditEvent(
    'EVIDENCE_ADDED',
    params.uploadedBy,
    'compliance',
    null,
    null,
    { documentId: id, metricId: params.metricId, documentName: params.documentName }
  );

  return {
    metricId: params.metricId,
    metricName: params.documentName,
    approvedValue: 'Not specified',
    sourceDocument: params.documentName,
    sectionCitation: params.sectionCitation,
    validityPeriod: 'Not specified',
    lastAuditedDate: 'Not audited',
    status: status === 'outdated' ? 'outdated' : status === 'verified' ? 'active' : 'pending',
  };
}
