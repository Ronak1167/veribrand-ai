// VeriBrand AI - Durable Relational SQLite Database Layer
// Uses the Node.js built-in node:sqlite DatabaseSync with WAL mode and transactional writes.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  User,
  ReviewSubmission,
  AppealDecision,
  ReviewComment,
  AuditTrailEntry,
  ChannelType,
  AuditResult,
  EvidenceProvenance,
  VerifiedMetric,
  BrandRule,
  FindingCategory,
  Organization,
  OrganizationMembership,
  OrganizationInvitation,
  OrganizationRole,
  BrandRuleVersion,
  EvidenceCandidateFact,
  BrandAsset,
  OrganizationAnalytics,
  ProvenanceState,
} from '../../types/index.ts';

interface SubmissionRow {
  id: string;
  organization_id?: string | null;
  title: string;
  channel: string;
  creator_id?: string | null;
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
  organization_id?: string | null;
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
  organization_id?: string | null;
  metric_id: string;
  document_name: string;
  section_citation: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_checksum: string;
  status: string;
  uploaded_by: string;
  uploaded_at: string;
  storage_path?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  submission_id?: string | null;
  revision_id?: string | null;
  approved_value?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  provenance_state?: string | null;
  source_url?: string | null;
  source_publisher?: string | null;
  verification_method?: string | null;
}

function resolveDefaultDbPath(): string {
  if (process.env.VERIBRAND_DB_PATH) {
    return path.resolve(process.env.VERIBRAND_DB_PATH);
  }
  const cwd = process.cwd();
  if (cwd.includes(path.join('.next', 'standalone')) || cwd.endsWith('standalone')) {
    const projectRoot = path.resolve(cwd, '..', '..');
    return path.join(projectRoot, 'data', 'veribrand.db');
  }
  return path.resolve(cwd, 'data', 'veribrand.db');
}

const DB_PATH = resolveDefaultDbPath();
const DB_DIR = path.dirname(DB_PATH);

export function getEvidenceStorageDirectory(orgId?: string): string {
  const directory = path.join(DB_DIR, 'evidence', orgId || 'ORG-DEFAULT');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

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
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Core Users and Sessions
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
      active_organization_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      brand_name TEXT DEFAULT 'Inkloom AI & VeriBrand AI',
      settings_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'reviewer', 'creator', 'readonly')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS organization_invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'reviewer', 'creator', 'readonly')),
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES organizations(id),
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
      organization_id TEXT REFERENCES organizations(id),
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
      organization_id TEXT REFERENCES organizations(id),
      metric_id TEXT NOT NULL,
      document_name TEXT NOT NULL,
      section_citation TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_checksum TEXT NOT NULL,
      status TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      storage_path TEXT,
      reviewed_by TEXT,
      review_notes TEXT,
      reviewed_at TEXT,
      submission_id TEXT,
      revision_id TEXT,
      approved_value TEXT,
      valid_from TEXT,
      valid_until TEXT,
      provenance_state TEXT DEFAULT 'uploaded',
      source_url TEXT,
      source_publisher TEXT,
      verification_method TEXT DEFAULT 'manual_inspection'
    );

    CREATE TABLE IF NOT EXISTS brand_rules (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES organizations(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      authority_level INTEGER NOT NULL,
      severity TEXT NOT NULL,
      forbidden_patterns_json TEXT NOT NULL,
      approved_alternative TEXT NOT NULL,
      citation TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'inactive', 'archived')),
      effective_from TEXT,
      effective_until TEXT
    );

    CREATE TABLE IF NOT EXISTS brand_rule_versions (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL REFERENCES brand_rules(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      authority_level INTEGER NOT NULL,
      severity TEXT NOT NULL,
      forbidden_patterns_json TEXT NOT NULL,
      approved_alternative TEXT NOT NULL,
      citation TEXT NOT NULL,
      status TEXT NOT NULL,
      change_rationale TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evidence_candidate_facts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
      metric_id TEXT,
      claim_type TEXT NOT NULL,
      extracted_claim TEXT NOT NULL,
      extracted_value TEXT NOT NULL,
      unit TEXT,
      page_number INTEGER,
      text_excerpt TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      extraction_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified', 'approved', 'rejected')),
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      review_notes TEXT,
      valid_from TEXT,
      valid_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brand_assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('logo_primary', 'logo_secondary', 'logo_monochrome', 'logo_icon', 'palette_swatch', 'marketing_image', 'font')),
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_checksum TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      aspect_ratio TEXT,
      metadata_json TEXT DEFAULT '{}',
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);

  // Safe migrations / column additions for existing installations
  try { db.exec('ALTER TABLE sessions ADD COLUMN active_organization_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE submissions ADD COLUMN organization_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN storage_path TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN reviewed_by TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN review_notes TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN reviewed_at TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN submission_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN revision_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN approved_value TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN valid_from TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN valid_until TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN organization_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN provenance_state TEXT DEFAULT "uploaded";'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN source_url TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN source_publisher TEXT;'); } catch {}
  try { db.exec('ALTER TABLE evidence_documents ADD COLUMN verification_method TEXT DEFAULT "manual_inspection";'); } catch {}
  try { db.exec('ALTER TABLE brand_rules ADD COLUMN organization_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE brand_rules ADD COLUMN version INTEGER DEFAULT 1;'); } catch {}
  try { db.exec('ALTER TABLE brand_rules ADD COLUMN status TEXT DEFAULT "active";'); } catch {}
  try { db.exec('ALTER TABLE brand_rules ADD COLUMN effective_from TEXT;'); } catch {}
  try { db.exec('ALTER TABLE brand_rules ADD COLUMN effective_until TEXT;'); } catch {}
  try { db.exec('ALTER TABLE audit_trail ADD COLUMN organization_id TEXT;'); } catch {}

  // Indexes
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS appeal_decisions_revision_finding_unique ON appeal_decisions(submission_id, revision_id, finding_id);');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive ON users(lower(email));');
  db.exec('CREATE INDEX IF NOT EXISTS evidence_owner_idx ON evidence_documents(uploaded_by, uploaded_at);');
  db.exec('CREATE INDEX IF NOT EXISTS evidence_metric_status_idx ON evidence_documents(metric_id, status, valid_until);');
  db.exec('CREATE INDEX IF NOT EXISTS submissions_org_idx ON submissions(organization_id, created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS evidence_org_idx ON evidence_documents(organization_id, status);');
  db.exec('CREATE INDEX IF NOT EXISTS brand_rules_org_idx ON brand_rules(organization_id, active);');
  db.exec('CREATE INDEX IF NOT EXISTS audit_trail_org_idx ON audit_trail(organization_id, timestamp);');

  // Multi-tenant initial data migration & default organization seeding
  const defaultOrg = db.prepare("SELECT id FROM organizations WHERE id = 'ORG-DEFAULT';").get() as { id: string } | undefined;
  if (!defaultOrg) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO organizations (id, name, slug, brand_name, created_at, updated_at)
      VALUES ('ORG-DEFAULT', 'Primary Organization', 'primary-org', 'Inkloom AI & VeriBrand AI', ?, ?);
    `).run(now, now);
  }

  // Backfill legacy records to default organization
  db.exec("UPDATE submissions SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;");
  db.exec("UPDATE evidence_documents SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;");
  db.exec("UPDATE brand_rules SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;");
  db.exec("UPDATE audit_trail SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;");
  db.exec("UPDATE sessions SET active_organization_id = 'ORG-DEFAULT' WHERE active_organization_id IS NULL;");

  // Migrate existing users to default organization memberships
  const users = db.prepare('SELECT id, role, created_at FROM users;').all() as Array<{ id: string; role: string; created_at: string }>;
  for (const u of users) {
    const orgRole: OrganizationRole = u.role === 'admin' ? 'owner' : (u.role === 'reviewer' ? 'reviewer' : 'creator');
    const memId = `MEM-DEFAULT-${u.id}`;
    db.prepare(`
      INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
      VALUES (?, 'ORG-DEFAULT', ?, ?, ?, ?);
    `).run(memId, u.id, orgRole, u.created_at, u.created_at);
  }

  dbInstance = db;
  return db;
}

// ----------------------------------------------------------------------------
// User & Authentication Helpers
// ----------------------------------------------------------------------------
export function hasUsers(): boolean {
  const row = getDatabase().prepare('SELECT count(*) as count FROM users;').get() as { count: number };
  return row.count > 0;
}

export function createUser(params: {
  email: string;
  name: string;
  role: 'creator' | 'reviewer' | 'admin';
  password: string;
  organizationId?: string;
}): User {
  const db = getDatabase();
  const id = `USR-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);')
    .run(id, params.email.trim().toLowerCase(), params.name.trim(), params.role, hashPassword(params.password), now);

  const orgId = params.organizationId || 'ORG-DEFAULT';
  const orgRole: OrganizationRole = params.role === 'admin' ? 'owner' : (params.role === 'reviewer' ? 'reviewer' : 'creator');
  const memId = `MEM-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);')
      .run(memId, orgId, id, orgRole, now, now);
  } catch {}

  return { id, email: params.email.trim().toLowerCase(), name: params.name.trim(), role: params.role, createdAt: now };
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

export function createSession(userId: string, orgId?: string): {
  token: string;
  user: User;
  expiresAt: string;
  activeOrganizationId: string;
  activeRole: OrganizationRole;
  organizations: Array<{ id: string; name: string; slug: string; role: OrganizationRole }>;
} {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Determine active organization: passed orgId, or user's first membership, or ORG-DEFAULT
  let activeOrgId = orgId;
  if (!activeOrgId) {
    const firstMem = db.prepare('SELECT organization_id FROM organization_memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1;').get(userId) as { organization_id: string } | undefined;
    activeOrgId = firstMem?.organization_id || 'ORG-DEFAULT';
  }

  db.prepare('INSERT INTO sessions (token, user_id, active_organization_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?);').run(
    tokenHash,
    user.id,
    activeOrgId,
    expiresAt,
    now
  );

  const orgRows = db.prepare(`
    SELECT m.organization_id as id, m.role, o.name, o.slug
    FROM organization_memberships m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.user_id = ?
    ORDER BY m.created_at ASC;
  `).all(userId) as Array<{ id: string; role: OrganizationRole; name: string; slug: string }>;

  const matched = orgRows.find(o => o.id === activeOrgId);
  const activeRole: OrganizationRole = matched ? matched.role : (user.role === 'admin' ? 'owner' : 'creator');

  return { token, user, expiresAt, activeOrganizationId: activeOrgId, activeRole, organizations: orgRows };
}

export function getSession(token: string): {
  token: string;
  user: User;
  expiresAt: string;
  activeOrganizationId: string;
  activeRole: OrganizationRole;
  organizations: Array<{ id: string; name: string; slug: string; role: OrganizationRole }>;
} | null {
  const db = getDatabase();
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const row = db.prepare(`
    SELECT s.token, s.active_organization_id, s.expires_at, u.id, u.email, u.name, u.role, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?;
  `).get(tokenHash) as {
    token: string;
    active_organization_id: string | null;
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

  // Fetch all organizations the user is a member of
  const orgRows = db.prepare(`
    SELECT m.organization_id as id, m.role, o.name, o.slug
    FROM organization_memberships m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.user_id = ?
    ORDER BY m.created_at ASC;
  `).all(row.id) as Array<{ id: string; role: OrganizationRole; name: string; slug: string }>;

  let activeOrgId = row.active_organization_id || orgRows[0]?.id || 'ORG-DEFAULT';
  let activeRole: OrganizationRole = 'readonly';
  const matched = orgRows.find(o => o.id === activeOrgId);
  if (matched) {
    activeRole = matched.role;
  } else if (orgRows.length > 0) {
    activeOrgId = orgRows[0].id;
    activeRole = orgRows[0].role;
  } else if (row.role === 'admin') {
    activeRole = 'owner';
  } else if (row.role === 'reviewer') {
    activeRole = 'reviewer';
  } else {
    activeRole = 'creator';
  }

  return {
    token,
    expiresAt: row.expires_at,
    activeOrganizationId: activeOrgId,
    activeRole,
    organizations: orgRows,
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

export function updateSessionActiveOrganization(token: string, userId: string, orgId: string): boolean {
  const db = getDatabase();
  // Verify membership
  const membership = db.prepare('SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?;').get(orgId, userId) as { role: string } | undefined;
  if (!membership) return false;

  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const res = db.prepare('UPDATE sessions SET active_organization_id = ? WHERE token = ?;').run(orgId, tokenHash);
  return res.changes > 0;
}

// ----------------------------------------------------------------------------
// Multi-Tenancy Organization CRUD & Memberships
// ----------------------------------------------------------------------------
export function createOrganization(params: {
  id?: string;
  name: string;
  slug: string;
  userId: string;
  brandName?: string;
  settings?: Record<string, unknown>;
}): Organization {
  const db = getDatabase();
  const id = params.id || `ORG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const slug = params.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const brandName = params.brandName?.trim() || `${params.name.trim()} Brand`;
  const settingsJson = JSON.stringify(params.settings || {});

  db.prepare(`
    INSERT INTO organizations (id, name, slug, brand_name, settings_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `).run(id, params.name.trim(), slug, brandName, settingsJson, now, now);

  // Add creator as owner
  const memId = `MEM-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
    VALUES (?, ?, ?, 'owner', ?, ?);
  `).run(memId, id, params.userId, now, now);

  logAuditEvent('ORGANIZATION_CREATED', params.userId, 'owner', null, null, { orgId: id, name: params.name, slug });

  return {
    id,
    name: params.name.trim(),
    slug,
    brandName,
    settings: params.settings || {},
    createdAt: now,
    updatedAt: now,
  };
}

export function getOrganizationById(orgId: string): Organization | null {
  const row = getDatabase().prepare('SELECT * FROM organizations WHERE id = ?;').get(orgId) as {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_name: string | null;
    settings_json: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url || undefined,
    brandName: row.brand_name || undefined,
    settings: row.settings_json ? JSON.parse(row.settings_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateOrganization(params: {
  id: string;
  name?: string;
  brandName?: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
  actorId: string;
}): Organization | null {
  const db = getDatabase();
  const current = getOrganizationById(params.id);
  if (!current) return null;

  const name = params.name ?? current.name;
  const brandName = params.brandName ?? current.brandName ?? `${name} Brand`;
  const logoUrl = params.logoUrl !== undefined ? params.logoUrl : (current.logoUrl || null);
  const settingsJson = params.settings
    ? JSON.stringify({ ...(current.settings || {}), ...params.settings })
    : JSON.stringify(current.settings || {});
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE organizations
    SET name = ?, brand_name = ?, logo_url = ?, settings_json = ?, updated_at = ?
    WHERE id = ?;
  `).run(name, brandName, logoUrl, settingsJson, now, params.id);

  logAuditEvent('ORGANIZATION_UPDATED', params.actorId, 'admin', null, null, {
    orgId: params.id,
    updates: { name, brandName, logoUrl },
  });

  return getOrganizationById(params.id);
}

export function getOrganizationBySlug(slug: string): Organization | null {
  const row = getDatabase().prepare('SELECT * FROM organizations WHERE slug = ?;').get(slug.trim().toLowerCase()) as {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_name: string | null;
    settings_json: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url || undefined,
    brandName: row.brand_name || undefined,
    settings: row.settings_json ? JSON.parse(row.settings_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getOrganizationsForUser(userId: string): Array<Organization & { role: OrganizationRole }> {
  const rows = getDatabase().prepare(`
    SELECT o.id, o.name, o.slug, o.logo_url, o.brand_name, o.settings_json, o.created_at, o.updated_at, m.role
    FROM organization_memberships m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.user_id = ?
    ORDER BY o.created_at ASC;
  `).all(userId) as Array<{
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_name: string | null;
    settings_json: string | null;
    created_at: string;
    updated_at: string;
    role: OrganizationRole;
  }>;

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    logoUrl: r.logo_url || undefined,
    brandName: r.brand_name || undefined,
    settings: r.settings_json ? JSON.parse(r.settings_json) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    role: r.role,
  }));
}

export function getUserMembership(orgId: string, userId: string): OrganizationMembership | null {
  const row = getDatabase().prepare(`
    SELECT id, organization_id, user_id, role, created_at, updated_at
    FROM organization_memberships
    WHERE organization_id = ? AND user_id = ?;
  `).get(orgId, userId) as {
    id: string;
    organization_id: string;
    user_id: string;
    role: OrganizationRole;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getOrganizationMembers(orgId: string): Array<{
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  createdAt: string;
}> {
  const rows = getDatabase().prepare(`
    SELECT m.id, m.user_id, u.name, u.email, m.role, m.created_at
    FROM organization_memberships m
    JOIN users u ON m.user_id = u.id
    WHERE m.organization_id = ?
    ORDER BY m.created_at ASC;
  `).all(orgId) as Array<{
    id: string;
    user_id: string;
    name: string;
    email: string;
    role: OrganizationRole;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export function addOrganizationMember(params: {
  orgId: string;
  userId: string;
  role: OrganizationRole;
  actorId?: string;
}): OrganizationMembership {
  const db = getDatabase();
  const id = `MEM-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?);
  `).run(id, params.orgId, params.userId, params.role, now, now);

  logAuditEvent('MEMBER_ADDED', params.actorId || params.userId, 'admin', null, null, {
    orgId: params.orgId,
    targetUserId: params.userId,
    role: params.role,
  });

  return {
    id,
    organizationId: params.orgId,
    userId: params.userId,
    role: params.role,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateOrganizationMemberRole(params: {
  orgId: string;
  targetUserId: string;
  role: OrganizationRole;
  actorId: string;
}): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  const res = db.prepare(`
    UPDATE organization_memberships
    SET role = ?, updated_at = ?
    WHERE organization_id = ? AND user_id = ?;
  `).run(params.role, now, params.orgId, params.targetUserId);

  if (res.changes > 0) {
    logAuditEvent('MEMBER_ROLE_UPDATED', params.actorId, 'owner', null, null, {
      orgId: params.orgId,
      targetUserId: params.targetUserId,
      newRole: params.role,
    });
    return true;
  }
  return false;
}

export function removeOrganizationMember(params: {
  orgId: string;
  targetUserId: string;
  actorId: string;
}): boolean {
  const db = getDatabase();
  // Prevent removing the sole owner
  const owners = db.prepare("SELECT count(*) as count FROM organization_memberships WHERE organization_id = ? AND role = 'owner';").get(params.orgId) as { count: number };
  const target = getUserMembership(params.orgId, params.targetUserId);
  if (target?.role === 'owner' && owners.count <= 1) {
    throw new Error('Cannot remove the only owner of the organization.');
  }

  const res = db.prepare('DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?;').run(params.orgId, params.targetUserId);
  if (res.changes > 0) {
    // If active session belongs to this org, clear or fallback
    db.prepare("UPDATE sessions SET active_organization_id = 'ORG-DEFAULT' WHERE user_id = ? AND active_organization_id = ?;").run(params.targetUserId, params.orgId);
    logAuditEvent('MEMBER_REMOVED', params.actorId, 'admin', null, null, {
      orgId: params.orgId,
      targetUserId: params.targetUserId,
    });
    return true;
  }
  return false;
}

export function createOrganizationInvitation(params: {
  orgId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
}): { id: string; token: string; expiresAt: string } {
  const db = getDatabase();
  const id = `INV-${crypto.randomUUID()}`;
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO organization_invitations (id, organization_id, email, role, token, invited_by, expires_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?);
  `).run(id, params.orgId, params.email.trim().toLowerCase(), params.role, token, params.invitedBy, expiresAt, now);

  logAuditEvent('INVITATION_CREATED', params.invitedBy, 'admin', null, null, {
    orgId: params.orgId,
    email: params.email,
    role: params.role,
  });

  return { id, token, expiresAt };
}

export function getOrganizationInvitationByToken(token: string): OrganizationInvitation | null {
  const row = getDatabase().prepare("SELECT * FROM organization_invitations WHERE token = ? AND status = 'pending';").get(token) as {
    id: string;
    organization_id: string;
    email: string;
    role: OrganizationRole;
    token: string;
    invited_by: string;
    expires_at: string;
    status: 'pending' | 'accepted' | 'revoked';
    created_at: string;
  } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    getDatabase().prepare("UPDATE organization_invitations SET status = 'revoked' WHERE id = ?;").run(row.id);
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    token: row.token,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function getOrganizationInvitations(orgId: string): OrganizationInvitation[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM organization_invitations WHERE organization_id = ? ORDER BY created_at DESC;").all(orgId) as Array<{
    id: string;
    organization_id: string;
    email: string;
    role: OrganizationRole;
    token: string;
    invited_by: string;
    expires_at: string;
    status: 'pending' | 'accepted' | 'revoked';
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    email: r.email,
    role: r.role,
    token: r.token,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export function revokeOrganizationInvitation(params: { token: string; actorId: string }): boolean {
  const db = getDatabase();
  const invite = getOrganizationInvitationByToken(params.token);
  if (!invite) return false;

  const res = db.prepare("UPDATE organization_invitations SET status = 'revoked' WHERE token = ?;").run(params.token);
  if (res.changes > 0) {
    logAuditEvent('INVITATION_REVOKED', params.actorId, 'admin', null, null, {
      orgId: invite.organizationId,
      inviteId: invite.id,
      email: invite.email,
    });
    return true;
  }
  return false;
}

export function acceptOrganizationInvitation(params: { token: string; userId: string; email: string }): boolean {
  const db = getDatabase();
  const invite = getOrganizationInvitationByToken(params.token);
  const user = getUserById(params.userId);
  if (!invite || !user || invite.email.trim().toLowerCase() !== params.email.trim().toLowerCase() || user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) return false;

  const now = new Date().toISOString();
  const memId = `MEM-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const claimed = db.prepare("UPDATE organization_invitations SET status = 'accepted' WHERE id = ? AND status = 'pending' AND expires_at > ?;").run(invite.id, now);
    if (claimed.changes !== 1) {
      db.exec('ROLLBACK;');
      return false;
    }
    const membership = db.prepare(`
      INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run(memId, invite.organizationId, params.userId, invite.role, now, now);
    if (membership.changes !== 1) throw new Error('User is already a member of this organization.');
    logAuditEvent('INVITATION_ACCEPTED', params.userId, invite.role, null, null, { orgId: invite.organizationId, inviteId: invite.id });
    db.exec('COMMIT;');
    return true;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Submissions CRUD (Tenant-Scoped)
// ----------------------------------------------------------------------------
export function getAllSubmissions(orgId?: string, creatorId?: string): ReviewSubmission[] {
  const db = getDatabase();
  const targetOrg = orgId || 'ORG-DEFAULT';
  let query = 'SELECT * FROM submissions WHERE organization_id = ?';
  const queryParams: unknown[] = [targetOrg];
  if (creatorId) {
    query += ' AND creator_id = ?';
    queryParams.push(creatorId);
  }
  query += ' ORDER BY created_at DESC;';

  const rows = db.prepare(query).all(...queryParams) as unknown as SubmissionRow[];
  return rows.map((r) => assembleSubmission(r));
}

export function getSubmissionsForCreator(creatorId: string, orgId?: string): ReviewSubmission[] {
  return getAllSubmissions(orgId, creatorId);
}

export function getSubmissionById(id: string, orgId?: string): ReviewSubmission | null {
  const db = getDatabase();
  let query = 'SELECT * FROM submissions WHERE id = ?';
  const queryParams: unknown[] = [id];
  if (orgId) {
    query += ' AND organization_id = ?';
    queryParams.push(orgId);
  }
  query += ';';

  const row = db.prepare(query).get(...queryParams) as unknown as SubmissionRow | undefined;
  if (!row) return null;
  return assembleSubmission(row);
}

export function getSubmissionOwnerId(submissionId: string, orgId?: string): string | null {
  const db = getDatabase();
  let query = 'SELECT creator_id FROM submissions WHERE id = ?';
  const queryParams: unknown[] = [submissionId];
  if (orgId) {
    query += ' AND organization_id = ?';
    queryParams.push(orgId);
  }
  query += ';';
  const row = db.prepare(query).get(...queryParams) as { creator_id: string } | undefined;
  return row?.creator_id ?? null;
}

function assembleSubmission(r: SubmissionRow): ReviewSubmission {
  const db = getDatabase();
  const revisions = db.prepare('SELECT * FROM submission_revisions WHERE submission_id = ? ORDER BY version ASC;').all(r.id) as unknown as RevisionRow[];
  const appeals = db.prepare('SELECT * FROM appeal_decisions WHERE submission_id = ? ORDER BY decided_at ASC;').all(r.id) as unknown as AppealRow[];
  const comments = db.prepare('SELECT * FROM comments WHERE submission_id = ? ORDER BY created_at ASC;').all(r.id) as unknown as CommentRow[];

  return {
    id: r.id,
    organizationId: r.organization_id || undefined,
    title: r.title,
    channel: r.channel as ChannelType,
    creatorId: r.creator_id || undefined,
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

export function verifySubmissionApprovalIntegrity(submissionId: string, orgId?: string): boolean {
  const sub = getSubmissionById(submissionId, orgId);
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
  organizationId?: string;
  title: string;
  channel: ChannelType;
  creatorId: string;
  creatorName: string;
  text: string;
  auditResult: AuditResult;
}): ReviewSubmission {
  const db = getDatabase();
  const submissionId = params.id || `SUB-${Date.now().toString(36).toUpperCase()}`;
  const orgId = params.organizationId || 'ORG-DEFAULT';
  const revisionId = `${submissionId}-REV-1`;
  const now = new Date().toISOString();
  const sha256 = crypto.createHash('sha256').update(params.text, 'utf8').digest('hex');

  db.prepare(`
    INSERT INTO submissions (
      id, organization_id, title, channel, creator_id, creator_name, current_revision_id,
      status, original_text, current_text, audit_result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    submissionId,
    orgId,
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
    { title: params.title, channel: params.channel, score: params.auditResult.complianceScore, orgId }
  );

  return getSubmissionById(submissionId, orgId)!;
}

export function addSubmissionRevision(
  submissionId: string,
  revisedText: string,
  auditResult: AuditResult,
  submittedBy: string,
  orgId?: string
): { revisionId: string; version: number } {
  const db = getDatabase();
  const sub = getSubmissionById(submissionId, orgId);
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
  approvedAt?: string,
  orgId?: string
): ReviewSubmission {
  const db = getDatabase();
  const sub = getSubmissionById(submissionId, orgId);
  if (!sub) throw new Error('Submission not found');

  const now = approvedAt || new Date().toISOString();

  let updateQuery = `
    UPDATE submissions
    SET status = 'approved', signed_off_at = ?, signed_off_by = ?, approval_mode = ?, sha256_hash = ?, exception_rationale = ?, updated_at = ?
    WHERE id = ? AND current_revision_id = ? AND status = 'pending_review'
  `;
  const params: unknown[] = [
    now,
    reviewerName,
    approvalMode,
    sha256Hash,
    exceptionRationale || null,
    now,
    submissionId,
    expectedRevisionId || sub.currentRevisionId,
  ];

  if (orgId) {
    updateQuery += ' AND organization_id = ?';
    params.push(orgId);
  }
  updateQuery += ';';

  db.prepare(updateQuery).run(...params);
  const updateResult = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (updateResult.changes !== 1) throw new Error('Approval rejected because the current revision or status changed.');

  logAuditEvent(
    approvalMode === 'exception' ? 'EXCEPTION_GRANTED' : 'SUBMISSION_APPROVED',
    reviewerId,
    'reviewer',
    submissionId,
    sub.currentRevisionId || null,
    { reviewerName, approvalMode, sha256Hash, exceptionRationale, orgId: sub.organizationId }
  );

  return getSubmissionById(submissionId, orgId)!;
}

export function requestSubmissionChanges(
  submissionId: string,
  reviewerId: string,
  reviewerName: string,
  commentText: string,
  orgId?: string
): ReviewSubmission {
  const db = getDatabase();
  const sub = getSubmissionById(submissionId, orgId);
  if (!sub) throw new Error('Submission not found');

  const now = new Date().toISOString();

  let updateQuery = `
    UPDATE submissions
    SET status = 'changes_requested', updated_at = ?
    WHERE id = ? AND status = 'pending_review'
  `;
  const params: unknown[] = [now, submissionId];
  if (orgId) {
    updateQuery += ' AND organization_id = ?';
    params.push(orgId);
  }
  updateQuery += ';';

  db.prepare(updateQuery).run(...params);
  const changeResult = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (changeResult.changes !== 1) throw new Error('Change request rejected because the submission state changed.');

  addComment(submissionId, reviewerId, reviewerName, 'Brand Reviewer', commentText);

  logAuditEvent(
    'CHANGES_REQUESTED',
    reviewerId,
    'reviewer',
    submissionId,
    sub.currentRevisionId || null,
    { commentText, orgId: sub.organizationId }
  );

  return getSubmissionById(submissionId, orgId)!;
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
  orgId?: string;
}): AppealDecision {
  const db = getDatabase();
  const id = `APP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  let checkQuery = "SELECT 1 FROM submissions WHERE id = ? AND current_revision_id = ? AND status = 'pending_review'";
  const checkParams: unknown[] = [params.submissionId, params.revisionId];
  if (params.orgId) {
    checkQuery += ' AND organization_id = ?';
    checkParams.push(params.orgId);
  }

  db.prepare(`
    INSERT INTO appeal_decisions (
      id, submission_id, revision_id, finding_id, finding_fingerprint, decision, rationale, reviewer_id, reviewer_name, decided_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (${checkQuery});
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
    ...checkParams
  );
  const insertResult = db.prepare('SELECT changes() AS changes;').get() as { changes: number };
  if (insertResult.changes !== 1) throw new Error('Appeal rejected because the current revision or review state changed.');

  logAuditEvent(
    'APPEAL_DECIDED',
    params.reviewerId,
    'reviewer',
    params.submissionId,
    params.revisionId,
    { findingId: params.findingId, decision: params.decision, rationale: params.rationale, orgId: params.orgId }
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

export function isRevisionForSubmission(submissionId: string, revisionId: string): boolean {
  const row = getDatabase().prepare(
    'SELECT 1 as found FROM submission_revisions WHERE submission_id = ? AND id = ? LIMIT 1;'
  ).get(submissionId, revisionId) as { found: number } | undefined;
  return Boolean(row);
}

// ----------------------------------------------------------------------------
// Audit Trail
// ----------------------------------------------------------------------------
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
    const orgId = typeof details.orgId === 'string' ? details.orgId : null;
    db.prepare(`
      INSERT INTO audit_trail (organization_id, event_type, actor_id, actor_role, submission_id, revision_id, details_json, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      orgId,
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

export function getAuditTrail(limit: number = 100, orgId?: string): AuditTrailEntry[] {
  const db = getDatabase();
  let query = 'SELECT * FROM audit_trail';
  const params: unknown[] = [];
  if (orgId) {
    query += ' WHERE organization_id = ?';
    params.push(orgId);
  }
  query += ' ORDER BY id DESC LIMIT ?;';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as unknown as AuditTrailRow[];

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id || undefined,
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

// ----------------------------------------------------------------------------
// Evidence Documents & Provenance (Tenant-Scoped)
// ----------------------------------------------------------------------------
export function getAllEvidence(orgId?: string, ownerId?: string): Array<EvidenceProvenance & {
  id: string; documentName: string; mimeType: string; fileSizeBytes: number;
  sha256Checksum: string; uploadedBy: string; uploadedAt: string;
  reviewedBy: string | null; reviewNotes: string | null; reviewedAt: string | null;
  submissionId: string | null; revisionId: string | null; hasFile: boolean;
}> {
  const db = getDatabase();
  const targetOrg = orgId || 'ORG-DEFAULT';
  let query = 'SELECT * FROM evidence_documents WHERE organization_id = ?';
  const params: unknown[] = [targetOrg];
  if (ownerId) {
    query += ' AND uploaded_by = ?';
    params.push(ownerId);
  }
  query += ' ORDER BY uploaded_at DESC;';

  const rows = db.prepare(query).all(...params) as unknown as EvidenceRow[];

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id || undefined,
    metricId: r.metric_id,
    metricName: r.document_name,
    documentName: r.document_name,
    approvedValue: r.approved_value || 'Not approved',
    sourceDocument: r.document_name,
    sectionCitation: r.section_citation,
    validityPeriod: r.valid_from ? `${r.valid_from} to ${r.valid_until || 'indefinite'}` : 'Not established',
    lastAuditedDate: r.reviewed_at || r.uploaded_at,
    status: r.status === 'outdated' ? 'outdated' : r.status === 'verified' ? 'active' : (r.status === 'rejected' || r.status === 'unverified') ? 'unverified' : 'pending',
    provenanceState: (r.provenance_state as ProvenanceState) || 'uploaded',
    sourceUrl: r.source_url || undefined,
    sourcePublisher: r.source_publisher || undefined,
    verificationMethod: r.verification_method || undefined,
    mimeType: r.mime_type,
    fileSizeBytes: r.file_size_bytes,
    sha256Checksum: r.sha256_checksum,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    reviewedBy: r.reviewed_by || null,
    reviewNotes: r.review_notes || null,
    reviewedAt: r.reviewed_at || null,
    submissionId: r.submission_id || null,
    revisionId: r.revision_id || null,
    hasFile: Boolean(r.storage_path && fs.existsSync(r.storage_path)),
  }));
}

export function getEvidenceById(id: string, orgId?: string): (EvidenceProvenance & {
  id: string;
  documentName: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  uploadedBy: string;
  uploadedAt: string;
  storagePath: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  submissionId: string | null;
  revisionId: string | null;
  hasFile: boolean;
}) | null {
  const db = getDatabase();
  let query = 'SELECT * FROM evidence_documents WHERE id = ?';
  const params: unknown[] = [id];
  if (orgId) {
    query += ' AND organization_id = ?';
    params.push(orgId);
  }
  query += ';';

  const r = db.prepare(query).get(...params) as EvidenceRow | undefined;
  if (!r) return null;
  return {
    id: r.id,
    organizationId: r.organization_id || undefined,
    metricId: r.metric_id,
    metricName: r.document_name,
    documentName: r.document_name,
    approvedValue: r.approved_value || 'Not approved',
    sourceDocument: r.document_name,
    sectionCitation: r.section_citation,
    validityPeriod: r.valid_from ? `${r.valid_from} to ${r.valid_until || 'indefinite'}` : 'Not established',
    lastAuditedDate: r.reviewed_at || r.uploaded_at,
    mimeType: r.mime_type,
    fileSizeBytes: r.file_size_bytes,
    sha256Checksum: r.sha256_checksum,
    status: r.status === 'outdated' ? 'outdated' : r.status === 'verified' ? 'active' : (r.status === 'rejected' || r.status === 'unverified') ? 'unverified' : 'pending',
    provenanceState: (r.provenance_state as ProvenanceState) || 'uploaded',
    sourceUrl: r.source_url || undefined,
    sourcePublisher: r.source_publisher || undefined,
    verificationMethod: r.verification_method || undefined,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    storagePath: r.storage_path || null,
    reviewedBy: r.reviewed_by || null,
    reviewNotes: r.review_notes || null,
    reviewedAt: r.reviewed_at || null,
    submissionId: r.submission_id || null,
    revisionId: r.revision_id || null,
    hasFile: Boolean(r.storage_path && fs.existsSync(r.storage_path)),
  };
}

export function addEvidenceDocument(params: {
  organizationId?: string;
  metricId: string;
  documentName: string;
  sectionCitation: string;
  mimeType?: string;
  fileSizeBytes?: number;
  sha256Checksum?: string;
  status?: string;
  approvedValue?: string;
  validFrom?: string;
  validUntil?: string;
  uploadedBy: string;
  storagePath?: string;
  submissionId?: string;
  revisionId?: string;
  provenanceState?: ProvenanceState;
  sourceUrl?: string;
  sourcePublisher?: string;
  verificationMethod?: string;
}): EvidenceProvenance & { id: string; sha256Checksum: string; fileSizeBytes: number; mimeType: string } {
  const db = getDatabase();
  const id = `EVID-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const orgId = params.organizationId || 'ORG-DEFAULT';
  const now = new Date().toISOString();
  const mime = params.mimeType || 'application/octet-stream';
  const size = params.fileSizeBytes ?? 0;
  const hash = params.sha256Checksum || '';
  const status = params.status || 'pending';
  const storagePath = params.storagePath || null;
  const provenanceState = params.provenanceState || 'uploaded';

  db.prepare(`
    INSERT INTO evidence_documents (
      id, organization_id, metric_id, document_name, section_citation, mime_type, file_size_bytes, sha256_checksum,
      status, uploaded_by, uploaded_at, storage_path, submission_id, revision_id, approved_value, valid_from, valid_until,
      provenance_state, source_url, source_publisher, verification_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    id,
    orgId,
    params.metricId,
    params.documentName,
    params.sectionCitation,
    mime,
    size,
    hash,
    status,
    params.uploadedBy,
    now,
    storagePath,
    params.submissionId || null,
    params.revisionId || null,
    params.approvedValue || null,
    params.validFrom || null,
    params.validUntil || null,
    provenanceState,
    params.sourceUrl || null,
    params.sourcePublisher || null,
    params.verificationMethod || 'manual_inspection'
  );

  logAuditEvent(
    'EVIDENCE_ADDED',
    params.uploadedBy,
    'compliance',
    null,
    null,
    { documentId: id, orgId, metricId: params.metricId, documentName: params.documentName, sha256Checksum: hash }
  );

  return {
    id,
    organizationId: orgId,
    metricId: params.metricId,
    metricName: params.documentName,
    approvedValue: params.approvedValue || 'Not approved',
    sourceDocument: params.documentName,
    sectionCitation: params.sectionCitation,
    validityPeriod: params.validFrom ? `${params.validFrom} to ${params.validUntil || 'indefinite'}` : 'Not established',
    lastAuditedDate: now,
    status: status === 'outdated' ? 'outdated' : status === 'verified' ? 'active' : 'pending',
    provenanceState,
    sourceUrl: params.sourceUrl,
    sourcePublisher: params.sourcePublisher,
    verificationMethod: params.verificationMethod,
    sha256Checksum: hash,
    fileSizeBytes: size,
    mimeType: mime,
  };
}

export function updateEvidenceStatus(params: {
  id: string;
  status: 'verified' | 'rejected';
  reviewerId: string;
  notes?: string;
  approvedValue?: string;
  validFrom?: string;
  validUntil?: string;
  orgId?: string;
}): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  let query = `
    UPDATE evidence_documents
    SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = ?,
        approved_value = ?, valid_from = ?, valid_until = ?,
        provenance_state = ?
    WHERE id = ?
  `;
  const provenanceState = params.status === 'verified' ? 'verified' : 'rejected';
  const queryParams: unknown[] = [
    params.status,
    params.reviewerId,
    params.notes || null,
    now,
    params.status === 'verified' ? (params.approvedValue?.trim() || null) : null,
    params.status === 'verified' ? (params.validFrom || null) : null,
    params.status === 'verified' ? (params.validUntil || null) : null,
    provenanceState,
    params.id,
  ];

  if (params.orgId) {
    query += ' AND organization_id = ?';
    queryParams.push(params.orgId);
  }
  query += ';';

  const result = db.prepare(query).run(...queryParams);

  if (result.changes > 0) {
    logAuditEvent(
      'EVIDENCE_STATUS_UPDATED',
      params.reviewerId,
      'reviewer',
      null,
      null,
      { evidenceId: params.id, newStatus: params.status, notes: params.notes, orgId: params.orgId }
    );
    return true;
  }
  return false;
}

export function updateEvidenceProvenanceState(id: string, state: ProvenanceState): boolean {
  const db = getDatabase();
  const res = db.prepare('UPDATE evidence_documents SET provenance_state = ? WHERE id = ?;').run(state, id);
  return res.changes > 0;
}

export function getApprovedEvidenceMetrics(orgId?: string): VerifiedMetric[] {
  const today = new Date().toISOString().slice(0, 10);
  const targetOrg = orgId || 'ORG-DEFAULT';
  const rows = getDatabase().prepare(`
    SELECT e.metric_id, e.approved_value, e.document_name, e.section_citation,
           e.valid_from, e.valid_until, e.uploaded_at, e.storage_path, e.sha256_checksum
    FROM evidence_documents e
    WHERE e.organization_id = ? AND e.status = 'verified' AND e.storage_path IS NOT NULL
      AND e.sha256_checksum <> '' AND e.approved_value IS NOT NULL AND trim(e.approved_value) <> ''
      AND (e.valid_from IS NULL OR e.valid_from <= ?)
      AND (e.valid_until IS NULL OR e.valid_until >= ?)
    ORDER BY e.reviewed_at DESC, e.uploaded_at DESC;
  `).all(targetOrg, today, today) as Array<{
    metric_id: string;
    approved_value: string;
    document_name: string;
    section_citation: string;
    valid_from: string | null;
    valid_until: string | null;
    uploaded_at: string;
    storage_path: string;
    sha256_checksum: string;
  }>;

  const unique = new Map<string, VerifiedMetric>();
  for (const row of rows) {
    if (!row.storage_path || !fs.existsSync(row.storage_path)) continue;
    const actualChecksum = crypto.createHash('sha256').update(fs.readFileSync(row.storage_path)).digest('hex');
    if (actualChecksum !== row.sha256_checksum || unique.has(row.metric_id)) continue;
    unique.set(row.metric_id, {
      id: row.metric_id,
      metricName: row.metric_id,
      approvedValue: row.approved_value,
      validFrom: row.valid_from || '1970-01-01',
      validUntil: row.valid_until,
      sourceDoc: row.document_name,
      section: row.section_citation,
      status: 'active',
      toleranceNotes: 'Extracted and verified by a human reviewer from attached source. Traceable to original document.',
    });
  }
  return [...unique.values()];
}

// ----------------------------------------------------------------------------
// Candidate Facts (Automated Document Extraction)
// ----------------------------------------------------------------------------
export function getEvidenceCandidateFacts(evidenceId: string, orgId?: string): EvidenceCandidateFact[] {
  const db = getDatabase();
  let query = 'SELECT * FROM evidence_candidate_facts WHERE evidence_id = ?';
  const params: unknown[] = [evidenceId];
  if (orgId) {
    query += ' AND organization_id = ?';
    params.push(orgId);
  }
  query += ' ORDER BY page_number ASC, created_at ASC;';

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    organization_id: string;
    evidence_id: string;
    metric_id: string | null;
    claim_type: string;
    extracted_claim: string;
    extracted_value: string;
    unit: string | null;
    page_number: number | null;
    text_excerpt: string;
    confidence: number;
    extraction_method: 'pdf_text' | 'ocr_image' | 'manual' | 'heuristic';
    status: 'unverified' | 'approved' | 'rejected';
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    organizationId: r.organization_id,
    evidenceId: r.evidence_id,
    metricId: r.metric_id || undefined,
    claimType: r.claim_type,
    extractedClaim: r.extracted_claim,
    extractedValue: r.extracted_value,
    unit: r.unit || undefined,
    pageNumber: r.page_number || undefined,
    textExcerpt: r.text_excerpt,
    confidence: r.confidence,
    extractionMethod: r.extraction_method,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNotes: r.review_notes,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }));
}

export function addEvidenceCandidateFact(params: {
  organizationId: string;
  evidenceId: string;
  metricId?: string;
  claimType: string;
  extractedClaim: string;
  extractedValue: string;
  unit?: string;
  pageNumber?: number;
  textExcerpt: string;
  confidence?: number;
  extractionMethod: 'pdf_text' | 'ocr_image' | 'manual' | 'heuristic';
  status?: 'unverified' | 'approved' | 'rejected';
}): EvidenceCandidateFact {
  const db = getDatabase();
  const id = `FACT-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const status = params.status || 'unverified';
  const confidence = params.confidence ?? 1.0;

  db.prepare(`
    INSERT INTO evidence_candidate_facts (
      id, organization_id, evidence_id, metric_id, claim_type, extracted_claim, extracted_value,
      unit, page_number, text_excerpt, confidence, extraction_method, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    id,
    params.organizationId,
    params.evidenceId,
    params.metricId || null,
    params.claimType,
    params.extractedClaim,
    params.extractedValue,
    params.unit || null,
    params.pageNumber || null,
    params.textExcerpt,
    confidence,
    params.extractionMethod,
    status,
    now
  );

  return {
    id,
    organizationId: params.organizationId,
    evidenceId: params.evidenceId,
    metricId: params.metricId,
    claimType: params.claimType,
    extractedClaim: params.extractedClaim,
    extractedValue: params.extractedValue,
    unit: params.unit,
    pageNumber: params.pageNumber,
    textExcerpt: params.textExcerpt,
    confidence,
    extractionMethod: params.extractionMethod,
    status,
    createdAt: now,
  };
}

export function reviewEvidenceCandidateFact(params: {
  factId: string;
  orgId: string;
  reviewerId: string;
  status: 'approved' | 'rejected';
  reviewNotes?: string;
  approvedValue?: string;
  validFrom?: string;
  validUntil?: string;
}): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();

  // 1. Fetch fact
  const fact = db.prepare('SELECT * FROM evidence_candidate_facts WHERE id = ? AND organization_id = ?;').get(params.factId, params.orgId) as {
    id: string;
    evidence_id: string;
    metric_id: string | null;
    extracted_value: string;
    claim_type: string;
  } | undefined;

  if (!fact) return false;

  const effectiveValue = params.approvedValue?.trim() || fact.extracted_value;

  // 2. Update candidate fact status
  const updateRes = db.prepare(`
    UPDATE evidence_candidate_facts
    SET status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?,
        extracted_value = ?, valid_from = ?, valid_until = ?
    WHERE id = ? AND organization_id = ?;
  `).run(
    params.status,
    params.reviewerId,
    now,
    params.reviewNotes || null,
    effectiveValue,
    params.validFrom || null,
    params.validUntil || null,
    params.factId,
    params.orgId
  );

  if (updateRes.changes === 0) return false;

  // 3. If approved, also update the parent evidence document so it enters the verified metrics pool
  if (params.status === 'approved') {
    db.prepare(`
      UPDATE evidence_documents
      SET status = 'verified', reviewed_by = ?, reviewed_at = ?, approved_value = ?,
          valid_from = ?, valid_until = ?, provenance_state = 'verified',
          review_notes = ?
      WHERE id = ? AND organization_id = ?;
    `).run(
      params.reviewerId,
      now,
      effectiveValue,
      params.validFrom || null,
      params.validUntil || null,
      params.reviewNotes || 'Approved via candidate fact verification',
      fact.evidence_id,
      params.orgId
    );
  }

  logAuditEvent('CANDIDATE_FACT_REVIEWED', params.reviewerId, 'reviewer', null, null, {
    factId: params.factId,
    evidenceId: fact.evidence_id,
    newStatus: params.status,
    approvedValue: effectiveValue,
    orgId: params.orgId,
  });

  return true;
}

// ----------------------------------------------------------------------------
// Brand Vault Management & Rule Lifecycle
// ----------------------------------------------------------------------------
export function getCustomBrandRules(orgId?: string, includeHistorical?: boolean): BrandRule[] {
  const targetOrg = orgId || 'ORG-DEFAULT';
  let query = 'SELECT * FROM brand_rules WHERE organization_id = ?';
  if (!includeHistorical) {
    query += " AND active = 1 AND status = 'active'";
  }
  query += ' ORDER BY created_at DESC;';

  const rows = getDatabase().prepare(query).all(targetOrg) as Array<{
    id: string;
    organization_id: string;
    category: BrandRule['category'];
    title: string;
    description: string;
    authority_level: number;
    severity: BrandRule['severity'];
    forbidden_patterns_json: string;
    approved_alternative: string;
    citation: string;
    version: number;
    status: BrandRule['status'];
    effective_from: string | null;
    effective_until: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    category: row.category,
    title: row.title,
    description: row.description,
    authorityLevel: Math.min(3, Math.max(1, row.authority_level)) as 1 | 2 | 3,
    severity: row.severity,
    forbiddenPatterns: JSON.parse(row.forbidden_patterns_json) as string[],
    approvedAlternative: row.approved_alternative,
    citation: row.citation,
    version: row.version,
    status: row.status,
    effectiveFrom: row.effective_from || undefined,
    effectiveUntil: row.effective_until || undefined,
  }));
}

export function getBrandRuleById(id: string, orgId?: string): BrandRule | null {
  let query = 'SELECT * FROM brand_rules WHERE id = ?';
  const params: unknown[] = [id];
  if (orgId) {
    query += ' AND organization_id = ?';
    params.push(orgId);
  }
  query += ';';

  const row = getDatabase().prepare(query).get(...params) as {
    id: string;
    organization_id: string;
    category: BrandRule['category'];
    title: string;
    description: string;
    authority_level: number;
    severity: BrandRule['severity'];
    forbidden_patterns_json: string;
    approved_alternative: string;
    citation: string;
    version: number;
    status: BrandRule['status'];
    effective_from: string | null;
    effective_until: string | null;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category,
    title: row.title,
    description: row.description,
    authorityLevel: Math.min(3, Math.max(1, row.authority_level)) as 1 | 2 | 3,
    severity: row.severity,
    forbiddenPatterns: JSON.parse(row.forbidden_patterns_json) as string[],
    approvedAlternative: row.approved_alternative,
    citation: row.citation,
    version: row.version,
    status: row.status,
    effectiveFrom: row.effective_from || undefined,
    effectiveUntil: row.effective_until || undefined,
  };
}

export function createCustomBrandRule(params: {
  category: BrandRule['category'];
  title: string;
  description: string;
  authorityLevel: 1 | 2 | 3;
  severity: BrandRule['severity'];
  forbiddenPatterns: string[];
  approvedAlternative: string;
  citation: string;
  createdBy: string;
  organizationId?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  status?: 'draft' | 'active' | 'inactive' | 'archived';
}): BrandRule {
  const db = getDatabase();
  const id = `RULE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const orgId = params.organizationId || 'ORG-DEFAULT';
  const now = new Date().toISOString();
  const status = params.status || 'active';
  const version = 1;
  const patternsJson = JSON.stringify(params.forbiddenPatterns);

  db.prepare(`
    INSERT INTO brand_rules (
      id, organization_id, category, title, description, authority_level, severity,
      forbidden_patterns_json, approved_alternative, citation, created_by, created_at,
      active, version, status, effective_from, effective_until
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?);
  `).run(
    id,
    orgId,
    params.category,
    params.title,
    params.description,
    params.authorityLevel,
    params.severity,
    patternsJson,
    params.approvedAlternative,
    params.citation,
    params.createdBy,
    now,
    version,
    status,
    params.effectiveFrom || null,
    params.effectiveUntil || null
  );

  // Write initial version history
  const versionId = `VER-${id}-1`;
  db.prepare(`
    INSERT INTO brand_rule_versions (
      id, rule_id, organization_id, version, category, title, description, authority_level,
      severity, forbidden_patterns_json, approved_alternative, citation, status,
      change_rationale, created_by, created_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Initial rule creation', ?, ?);
  `).run(
    versionId,
    id,
    orgId,
    params.category,
    params.title,
    params.description,
    params.authorityLevel,
    params.severity,
    patternsJson,
    params.approvedAlternative,
    params.citation,
    status,
    params.createdBy,
    now
  );

  logAuditEvent('BRAND_RULE_CREATED', params.createdBy, 'admin', null, null, { ruleId: id, title: params.title, orgId });

  return {
    id,
    organizationId: orgId,
    category: params.category,
    title: params.title,
    description: params.description,
    authorityLevel: params.authorityLevel,
    severity: params.severity,
    forbiddenPatterns: params.forbiddenPatterns,
    approvedAlternative: params.approvedAlternative,
    citation: params.citation,
    version,
    status,
    effectiveFrom: params.effectiveFrom,
    effectiveUntil: params.effectiveUntil,
  };
}

export function updateCustomBrandRule(params: {
  id: string;
  organizationId?: string;
  category?: BrandRule['category'];
  title?: string;
  description?: string;
  authorityLevel?: 1 | 2 | 3;
  severity?: BrandRule['severity'];
  forbiddenPatterns?: string[];
  approvedAlternative?: string;
  citation?: string;
  status?: 'draft' | 'active' | 'inactive' | 'archived';
  changeRationale?: string;
  updatedBy: string;
}): BrandRule {
  const db = getDatabase();
  const existing = getBrandRuleById(params.id, params.organizationId);
  if (!existing) throw new Error('Brand rule not found');

  const newVersion = (existing.version || 1) + 1;
  const now = new Date().toISOString();
  const category = params.category || existing.category;
  const title = params.title || existing.title;
  const description = params.description || existing.description;
  const authorityLevel = params.authorityLevel || existing.authorityLevel;
  const severity = params.severity || existing.severity;
  const patterns = params.forbiddenPatterns || existing.forbiddenPatterns;
  const approvedAlternative = params.approvedAlternative || existing.approvedAlternative;
  const citation = params.citation || existing.citation;
  const status = params.status || existing.status || 'active';
  const patternsJson = JSON.stringify(patterns);

  // Update rule
  db.prepare(`
    UPDATE brand_rules
    SET category = ?, title = ?, description = ?, authority_level = ?, severity = ?,
        forbidden_patterns_json = ?, approved_alternative = ?, citation = ?,
        version = ?, status = ?
    WHERE id = ? AND organization_id = ?;
  `).run(
    category,
    title,
    description,
    authorityLevel,
    severity,
    patternsJson,
    approvedAlternative,
    citation,
    newVersion,
    status,
    params.id,
    existing.organizationId || 'ORG-DEFAULT'
  );

  // Append to version history
  const versionId = `VER-${params.id}-${newVersion}`;
  db.prepare(`
    INSERT INTO brand_rule_versions (
      id, rule_id, organization_id, version, category, title, description, authority_level,
      severity, forbidden_patterns_json, approved_alternative, citation, status,
      change_rationale, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    versionId,
    params.id,
    existing.organizationId || 'ORG-DEFAULT',
    newVersion,
    category,
    title,
    description,
    authorityLevel,
    severity,
    patternsJson,
    approvedAlternative,
    citation,
    status,
    params.changeRationale || 'Rule content revision',
    params.updatedBy,
    now
  );

  logAuditEvent('BRAND_RULE_UPDATED', params.updatedBy, 'admin', null, null, {
    ruleId: params.id,
    version: newVersion,
    rationale: params.changeRationale,
    orgId: existing.organizationId,
  });

  return {
    id: params.id,
    organizationId: existing.organizationId,
    category,
    title,
    description,
    authorityLevel,
    severity,
    forbiddenPatterns: patterns,
    approvedAlternative,
    citation,
    version: newVersion,
    status,
  };
}

export function archiveBrandRule(id: string, orgId?: string, updatedBy?: string): boolean {
  const db = getDatabase();
  const existing = getBrandRuleById(id, orgId);
  if (!existing) return false;

  const res = db.prepare(`
    UPDATE brand_rules
    SET active = 0, status = 'archived'
    WHERE id = ? AND organization_id = ?;
  `).run(id, existing.organizationId || 'ORG-DEFAULT');

  if (res.changes > 0) {
    logAuditEvent('BRAND_RULE_ARCHIVED', updatedBy || 'admin', 'admin', null, null, { ruleId: id, orgId: existing.organizationId });
    return true;
  }
  return false;
}

export function getBrandRuleVersions(ruleId: string, orgId?: string): BrandRuleVersion[] {
  const db = getDatabase();
  let query = 'SELECT * FROM brand_rule_versions WHERE rule_id = ?';
  const params: unknown[] = [ruleId];
  if (orgId) {
    query += ' AND organization_id = ?';
    params.push(orgId);
  }
  query += ' ORDER BY version DESC;';

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    rule_id: string;
    organization_id: string;
    version: number;
    category: FindingCategory;
    title: string;
    description: string;
    authority_level: number;
    severity: BrandRule['severity'];
    forbidden_patterns_json: string;
    approved_alternative: string;
    citation: string;
    status: 'draft' | 'active' | 'inactive' | 'archived';
    change_rationale: string | null;
    created_by: string;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    ruleId: r.rule_id,
    organizationId: r.organization_id,
    version: r.version,
    category: r.category,
    title: r.title,
    description: r.description,
    authorityLevel: Math.min(3, Math.max(1, r.authority_level)) as 1 | 2 | 3,
    severity: r.severity,
    forbiddenPatterns: JSON.parse(r.forbidden_patterns_json) as string[],
    approvedAlternative: r.approved_alternative,
    citation: r.citation,
    status: r.status,
    changeRationale: r.change_rationale || undefined,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

// ----------------------------------------------------------------------------
// Visual Brand Assets (Priority 6)
// ----------------------------------------------------------------------------
export function getBrandAssets(orgId?: string, assetType?: BrandAsset['assetType']): BrandAsset[] {
  const targetOrg = orgId || 'ORG-DEFAULT';
  let query = 'SELECT * FROM brand_assets WHERE organization_id = ?';
  const params: unknown[] = [targetOrg];
  if (assetType) {
    query += ' AND asset_type = ?';
    params.push(assetType);
  }
  query += ' ORDER BY created_at DESC;';
  const rows = getDatabase().prepare(query).all(...params) as Array<{
    id: string;
    organization_id: string;
    name: string;
    asset_type: BrandAsset['assetType'];
    storage_path: string;
    mime_type: string;
    file_size_bytes: number;
    sha256_checksum: string;
    width: number | null;
    height: number | null;
    aspect_ratio: string | null;
    metadata_json: string | null;
    uploaded_by: string;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    assetType: r.asset_type,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    fileSizeBytes: r.file_size_bytes,
    sha256Checksum: r.sha256_checksum,
    width: r.width || undefined,
    height: r.height || undefined,
    aspectRatio: r.aspect_ratio || undefined,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  }));
}

export function addBrandAsset(params: {
  organizationId: string;
  name: string;
  assetType: BrandAsset['assetType'];
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  metadata?: Record<string, unknown>;
  uploadedBy: string;
}): BrandAsset {
  const db = getDatabase();
  const id = `ASSET-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO brand_assets (
      id, organization_id, name, asset_type, storage_path, mime_type, file_size_bytes,
      sha256_checksum, width, height, aspect_ratio, metadata_json, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    id,
    params.organizationId,
    params.name,
    params.assetType,
    params.storagePath,
    params.mimeType,
    params.fileSizeBytes,
    params.sha256Checksum,
    params.width || null,
    params.height || null,
    params.aspectRatio || null,
    JSON.stringify(params.metadata || {}),
    params.uploadedBy,
    now
  );

  logAuditEvent('BRAND_ASSET_ADDED', params.uploadedBy, 'admin', null, null, {
    assetId: id,
    name: params.name,
    assetType: params.assetType,
    orgId: params.organizationId,
  });

  return {
    id,
    organizationId: params.organizationId,
    name: params.name,
    assetType: params.assetType,
    storagePath: params.storagePath,
    mimeType: params.mimeType,
    fileSizeBytes: params.fileSizeBytes,
    sha256Checksum: params.sha256Checksum,
    width: params.width,
    height: params.height,
    aspectRatio: params.aspectRatio,
    metadata: params.metadata,
    uploadedBy: params.uploadedBy,
    createdAt: now,
  };
}

export function deleteBrandAsset(id: string, orgId?: string): boolean {
  const db = getDatabase();
  let query = 'DELETE FROM brand_assets WHERE id = ?';
  const params: unknown[] = [id];
  if (orgId) {
    query += ' AND organization_id = ?';
    params.push(orgId);
  }
  query += ';';
  const res = db.prepare(query).run(...params);
  return res.changes > 0;
}

// ----------------------------------------------------------------------------
// Real Organization Analytics (Priority 7 - 100% Derived from Persisted Data)
// ----------------------------------------------------------------------------
export function getOrganizationAnalytics(orgId: string): OrganizationAnalytics {
  const db = getDatabase();

  // 1. Total Submissions & Status Breakdown
  const subRows = db.prepare(`
    SELECT status, count(*) as count
    FROM submissions
    WHERE organization_id = ?
    GROUP BY status;
  `).all(orgId) as Array<{ status: 'pending_review' | 'changes_requested' | 'approved'; count: number }>;

  const submissionsByStatus = {
    pending_review: 0,
    changes_requested: 0,
    approved: 0,
  };
  let totalSubmissions = 0;
  for (const r of subRows) {
    if (r.status in submissionsByStatus) {
      submissionsByStatus[r.status] = r.count;
      totalSubmissions += r.count;
    }
  }

  // 2. Audit findings & Claim verdicts from persisted submission audits
  const auditJsons = db.prepare(`
    SELECT audit_result_json, created_at, signed_off_at
    FROM submissions
    WHERE organization_id = ?;
  `).all(orgId) as Array<{ audit_result_json: string; created_at: string; signed_off_at: string | null }>;

  let claimsAuditedCount = 0;
  const claimsByVerdict = {
    VERIFIED: 0,
    CONFLICT: 0,
    UNVERIFIED: 0,
    SUGGESTION: 0,
  };
  const ruleCounts = new Map<string, { title: string; category: string; count: number }>();
  let totalTurnaroundMinutes = 0;
  let turnaroundSamples = 0;

  for (const row of auditJsons) {
    try {
      const audit = JSON.parse(row.audit_result_json) as AuditResult & {
        stats?: {
          totalAuditedClaims?: number;
          verifiedClaims?: number;
          conflictClaims?: number;
          unverifiedClaims?: number;
        };
      };
      claimsAuditedCount += audit.metricsAuditedCount || audit.stats?.totalAuditedClaims || 0;
      claimsByVerdict.VERIFIED += audit.claimsVerifiedCount || audit.stats?.verifiedClaims || 0;
      claimsByVerdict.CONFLICT += audit.claimsConflictedCount || audit.stats?.conflictClaims || 0;
      claimsByVerdict.UNVERIFIED += audit.claimsUnverifiedCount || audit.stats?.unverifiedClaims || 0;

      for (const f of audit.findings || []) {
        if (f.verdict === 'SUGGESTION') claimsByVerdict.SUGGESTION += 1;
        const ruleKey = f.ruleId || f.id || 'RULE-UNKNOWN';
        const curr = ruleCounts.get(ruleKey) || { title: f.guidelineTitle || ruleKey, category: f.category, count: 0 };
        curr.count += 1;
        ruleCounts.set(ruleKey, curr);
      }
    } catch {}

    if (row.signed_off_at) {
      const created = new Date(row.created_at).getTime();
      const approved = new Date(row.signed_off_at).getTime();
      if (approved > created) {
        totalTurnaroundMinutes += (approved - created) / 60000;
        turnaroundSamples += 1;
      }
    }
  }

  // 3. Appeals resolution rate
  const appealTotal = db.prepare(`
    SELECT count(*) as total, sum(CASE WHEN a.decision = 'accepted' THEN 1 ELSE 0 END) as accepted
    FROM appeal_decisions a
    JOIN submissions s ON a.submission_id = s.id
    WHERE s.organization_id = ?;
  `).get(orgId) as { total: number; accepted: number | null };

  const appealResolutionRate = appealTotal.total > 0
    ? Math.round(((appealTotal.accepted || 0) / appealTotal.total) * 100)
    : 0;

  const averageTurnaroundMinutes = turnaroundSamples > 0
    ? Math.round(totalTurnaroundMinutes / turnaroundSamples)
    : 0;

  // 4. Evidence Active vs Expired
  const today = new Date().toISOString().slice(0, 10);
  const evidenceStats = db.prepare(`
    SELECT
      sum(CASE WHEN status = 'verified' AND (valid_until IS NULL OR valid_until >= ?) THEN 1 ELSE 0 END) as active,
      sum(CASE WHEN valid_until IS NOT NULL AND valid_until < ? THEN 1 ELSE 0 END) as expired
    FROM evidence_documents
    WHERE organization_id = ?;
  `).get(today, today, orgId) as { active: number | null; expired: number | null };

  // 5. Rule Violations Ranking (sorted top 5)
  const ruleViolationsRanking = Array.from(ruleCounts.entries())
    .map(([ruleId, val]) => ({ ruleId, title: val.title, category: val.category, count: val.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    organizationId: orgId,
    totalSubmissions,
    submissionsByStatus,
    claimsAuditedCount,
    claimsByVerdict,
    ruleViolationsRanking,
    appealResolutionRate,
    averageTurnaroundMinutes,
    evidenceActiveCount: evidenceStats.active || 0,
    evidenceExpiredCount: evidenceStats.expired || 0,
    period: 'All-time persisted organization records',
  };
}
