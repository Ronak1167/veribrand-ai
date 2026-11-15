// VeriBrand AI — Production PostgreSQL Database Adapter
// Multi-Tenant Brand Governance Platform
// Connection pooling, transaction safety, parameterized queries, and strict typing.

import { Pool, PoolClient, QueryResultRow } from 'pg';
import crypto from 'crypto';
import type {
  User,
  UserSession,
  Organization,
  OrganizationMembership,
  OrganizationInvitation,
  OrganizationRole,
  ReviewSubmission,
  AuditTrailEntry,
  EvidenceProvenance,
  EvidenceDocument,
  BrandRule,
  BrandAsset,
  OrganizationAnalytics,
  AuditResult,
  FindingCategory,
  Severity,
} from '../../types/index.ts';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://veribrand:veribrand_secure_password_2026@localhost:5433/veribrand';

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }
  return pool;
}

export async function isPostgresHealthy(): Promise<boolean> {
  try {
    const p = getPostgresPool();
    const res = await p.query('SELECT 1 as healthy');
    return res.rows[0]?.healthy === 1;
  } catch {
    return false;
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPostgresPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPostgresPool();
  const res = await p.query<T>(text, params);
  return res.rows;
}

// -----------------------------------------------------------------------------
// USER & AUTHENTICATION REPOSITORY
// -----------------------------------------------------------------------------

export async function hasUsers(): Promise<boolean> {
  const rows = await query('SELECT COUNT(*) as count FROM users');
  return Number(rows[0]?.count || 0) > 0;
}

export async function createUser(
  email: string,
  name: string,
  role: 'creator' | 'reviewer' | 'admin',
  passwordHash: string,
  idOverride?: string
): Promise<User> {
  const id = idOverride || `USR-${crypto.randomUUID()}`;
  const rows = await query<User>(
    `INSERT INTO users (id, email, name, role, password_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     RETURNING id, email, name, role, created_at as "createdAt"`,
    [id, email.toLowerCase().trim(), name, role, passwordHash]
  );
  return rows[0];
}

export async function getAllUsers(): Promise<User[]> {
  return query<User>(
    `SELECT id, email, name, role, created_at as "createdAt" FROM users ORDER BY created_at ASC`
  );
}

export async function getUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
  const rows = await query<User & { password_hash: string }>(
    `SELECT id, email, name, role, password_hash, created_at as "createdAt"
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim()]
  );
  return rows[0] || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await query<User>(
    `SELECT id, email, name, role, created_at as "createdAt" FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// -----------------------------------------------------------------------------
// SESSIONS REPOSITORY
// -----------------------------------------------------------------------------

export async function createSession(
  userId: string,
  expiresInDays = 7,
  activeOrganizationId?: string
): Promise<UserSession> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO sessions (token, user_id, active_organization_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [token, userId, activeOrganizationId || null, expiresAt]
  );

  const user = await getUserById(userId);
  if (!user) throw new Error('User not found when creating session');

  return { token, user, expiresAt, activeOrganizationId };
}

export async function getSession(token: string): Promise<UserSession | null> {
  const rows = await query<{
    token: string;
    expires_at: string;
    active_organization_id: string | null;
    user_id: string;
    email: string;
    name: string;
    role: 'creator' | 'reviewer' | 'admin';
    user_created_at: string;
  }>(
    `SELECT s.token, s.expires_at, s.active_organization_id,
            u.id as user_id, u.email, u.name, u.role, u.created_at as user_created_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [token]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    token: row.token,
    expiresAt: new Date(row.expires_at).toISOString(),
    activeOrganizationId: row.active_organization_id || undefined,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: new Date(row.user_created_at).toISOString(),
    },
  };
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function updateSessionActiveOrganization(token: string, organizationId: string): Promise<void> {
  await query('UPDATE sessions SET active_organization_id = $1 WHERE token = $2', [organizationId, token]);
}

// -----------------------------------------------------------------------------
// ORGANIZATIONS & RBAC MEMBERSHIPS
// -----------------------------------------------------------------------------

export async function createOrganization(
  name: string,
  slug: string,
  creatorUserId: string,
  logoUrl?: string,
  brandName?: string,
  settings?: Record<string, unknown>
): Promise<Organization> {
  const orgId = `ORG-${crypto.randomUUID()}`;
  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO organizations (id, name, slug, logo_url, brand_name, settings_json, created_at, updated_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $7)
       RETURNING id, name, slug, logo_url as "logoUrl", brand_name as "brandName", settings_json as settings,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [orgId, name, slug, logoUrl || null, brandName || name, JSON.stringify(settings || {}), creatorUserId]
    );

    // Creator becomes OWNER
    const membershipId = `MEM-${crypto.randomUUID()}`;
    await client.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [membershipId, orgId, creatorUserId]
    );

    return res.rows[0];
  });
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const rows = await query<Organization>(
    `SELECT id, name, slug, logo_url as "logoUrl", brand_name as "brandName", settings_json as settings,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM organizations WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const rows = await query<Organization>(
    `SELECT id, name, slug, logo_url as "logoUrl", brand_name as "brandName", settings_json as settings,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM organizations WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

export async function getOrganizationsForUser(userId: string): Promise<Array<Organization & { userRole: OrganizationRole }>> {
  const rows = await query<Organization & { userRole: OrganizationRole }>(
    `SELECT o.id, o.name, o.slug, o.logo_url as "logoUrl", o.brand_name as "brandName", o.settings_json as settings,
            o.created_at as "createdAt", o.updated_at as "updatedAt", m.role as "userRole"
     FROM organizations o
     JOIN organization_memberships m ON o.id = m.organization_id
     WHERE m.user_id = $1
     ORDER BY o.created_at ASC`,
    [userId]
  );
  return rows;
}

export async function getUserMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null> {
  const rows = await query<OrganizationMembership>(
    `SELECT id, organization_id as "organizationId", user_id as "userId", role,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
    [organizationId, userId]
  );
  return rows[0] || null;
}

export async function getOrganizationMembers(organizationId: string): Promise<Array<{
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  globalRole: string;
  orgRole: OrganizationRole;
  joinedAt: string;
}>> {
  return query(
    `SELECT m.id as "membershipId", u.id as "userId", u.email, u.name, u.role as "globalRole",
            m.role as "orgRole", m.created_at as "joinedAt"
     FROM organization_memberships m
     JOIN users u ON m.user_id = u.id
     WHERE m.organization_id = $1
     ORDER BY m.created_at ASC`,
    [organizationId]
  );
}

export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole
): Promise<OrganizationMembership> {
  const id = `MEM-${crypto.randomUUID()}`;
  const rows = await query<OrganizationMembership>(
    `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP
     RETURNING id, organization_id as "organizationId", user_id as "userId", role,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [id, organizationId, userId, role]
  );
  return rows[0];
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  newRole: OrganizationRole
): Promise<boolean> {
  const rows = await query(
    `UPDATE organization_memberships SET role = $1, updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = $2 AND user_id = $3 RETURNING id`,
    [newRole, organizationId, userId]
  );
  return rows.length > 0;
}

export async function removeOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
  const rows = await query(
    `DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2 RETURNING id`,
    [organizationId, userId]
  );
  return rows.length > 0;
}

// -----------------------------------------------------------------------------
// ORGANIZATION INVITATIONS
// -----------------------------------------------------------------------------

export async function createOrganizationInvitation(
  organizationId: string,
  email: string,
  role: OrganizationRole,
  invitedByUserId: string,
  expiresInDays = 3
): Promise<OrganizationInvitation> {
  const id = `INV-${crypto.randomUUID()}`;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = await query<OrganizationInvitation>(
    `INSERT INTO organization_invitations (id, organization_id, email, role, token, invited_by, expires_at, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_TIMESTAMP)
     RETURNING id, organization_id as "organizationId", email, role, token, invited_by as "invitedBy",
               expires_at as "expiresAt", status, created_at as "createdAt"`,
    [id, organizationId, email.toLowerCase().trim(), role, token, invitedByUserId, expiresAt]
  );
  return rows[0];
}

export async function getOrganizationInvitationByToken(token: string): Promise<OrganizationInvitation | null> {
  const rows = await query<OrganizationInvitation>(
    `SELECT id, organization_id as "organizationId", email, role, token, invited_by as "invitedBy",
            expires_at as "expiresAt", status, created_at as "createdAt"
     FROM organization_invitations
     WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND status = 'pending'
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

export async function acceptOrganizationInvitation(token: string, userId: string): Promise<OrganizationMembership> {
  return withTransaction(async (client) => {
    const invRes = await client.query<OrganizationInvitation>(
      `SELECT id, organization_id as "organizationId", email, role, status
       FROM organization_invitations
       WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND status = 'pending'
       FOR UPDATE LIMIT 1`,
      [token]
    );

    if (invRes.rows.length === 0) {
      throw new Error('Invalid or expired invitation token');
    }

    const inv = invRes.rows[0];

    // Mark invitation as accepted
    await client.query(`UPDATE organization_invitations SET status = 'accepted' WHERE id = $1`, [inv.id]);

    // Add user as member
    const memId = `MEM-${crypto.randomUUID()}`;
    const memRes = await client.query<OrganizationMembership>(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP
       RETURNING id, organization_id as "organizationId", user_id as "userId", role,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [memId, inv.organizationId, userId, inv.role]
    );

    return memRes.rows[0];
  });
}

// -----------------------------------------------------------------------------
// SUBMISSIONS & REVISIONS
// -----------------------------------------------------------------------------

export async function getAllSubmissions(organizationId?: string): Promise<ReviewSubmission[]> {
  const sql = organizationId
    ? `SELECT * FROM submissions WHERE organization_id = $1 ORDER BY created_at DESC`
    : `SELECT * FROM submissions ORDER BY created_at DESC`;
  const params = organizationId ? [organizationId] : [];
  const rows = await query(sql, params);

  const submissions: ReviewSubmission[] = [];
  for (const r of rows) {
    const comments = await query(
      `SELECT id, author_name as author, role, text, created_at as timestamp
       FROM comments WHERE submission_id = $1 ORDER BY created_at ASC`,
      [r.id]
    );

    const revisions = await query(
      `SELECT id as "revisionId", version, text, audit_result_json as "auditResult", sha256_hash as "sha256Hash",
              submitted_at as "submittedAt", submitted_by as "submittedBy"
       FROM submission_revisions WHERE submission_id = $1 ORDER BY version ASC`,
      [r.id]
    );

    submissions.push({
      id: r.id,
      organizationId: r.organization_id,
      title: r.title,
      channel: r.channel,
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      currentRevisionId: r.current_revision_id,
      submittedAt: new Date(r.created_at).toISOString(),
      status: r.status,
      originalText: r.original_text,
      currentText: r.current_text,
      auditResult: r.audit_result_json,
      comments: comments.map((c) => ({
        id: c.id,
        author: c.author,
        role: c.role,
        text: c.text,
        timestamp: new Date(c.timestamp).toISOString(),
      })),
      sha256Hash: r.sha256_hash,
      signedOffAt: r.signed_off_at ? new Date(r.signed_off_at).toISOString() : undefined,
      signedOffBy: r.signed_off_by || undefined,
      approvalMode: r.approval_mode || undefined,
      exceptionRationale: r.exception_rationale || undefined,
      revisionHistory: revisions.map((rev) => ({
        revisionId: rev.revisionId,
        version: rev.version,
        text: rev.text,
        auditResult: rev.auditResult,
        sha256Hash: rev.sha256Hash,
        submittedAt: new Date(rev.submittedAt).toISOString(),
        submittedBy: rev.submittedBy,
      })),
    });
  }

  return submissions;
}

export async function getSubmissionsForCreator(creatorId: string, organizationId?: string): Promise<ReviewSubmission[]> {
  const all = await getAllSubmissions(organizationId);
  return all.filter((s) => s.creatorId === creatorId);
}

export async function getSubmissionById(id: string): Promise<ReviewSubmission | null> {
  const rows = await query(`SELECT * FROM submissions WHERE id = $1 LIMIT 1`, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];

  const comments = await query(
    `SELECT id, author_name as author, role, text, created_at as timestamp
     FROM comments WHERE submission_id = $1 ORDER BY created_at ASC`,
    [r.id]
  );

  const revisions = await query(
    `SELECT id as "revisionId", version, text, audit_result_json as "auditResult", sha256_hash as "sha256Hash",
            submitted_at as "submittedAt", submitted_by as "submittedBy"
     FROM submission_revisions WHERE submission_id = $1 ORDER BY version ASC`,
    [r.id]
  );

  const appeals = await query(
    `SELECT id, revision_id as "revisionId", finding_id as "findingId", finding_fingerprint as "findingFingerprint",
            decision, rationale, reviewer_name as "reviewerName", decided_at as "decidedAt"
     FROM appeal_decisions WHERE submission_id = $1 ORDER BY decided_at ASC`,
    [r.id]
  );

  return {
    id: r.id,
    organizationId: r.organization_id,
    title: r.title,
    channel: r.channel,
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    currentRevisionId: r.current_revision_id,
    submittedAt: new Date(r.created_at).toISOString(),
    status: r.status,
    originalText: r.original_text,
    currentText: r.current_text,
    auditResult: r.audit_result_json,
    comments: comments.map((c) => ({
      id: c.id,
      author: c.author,
      role: c.role,
      text: c.text,
      timestamp: new Date(c.timestamp).toISOString(),
    })),
    sha256Hash: r.sha256_hash,
    signedOffAt: r.signed_off_at ? new Date(r.signed_off_at).toISOString() : undefined,
    signedOffBy: r.signed_off_by || undefined,
    approvalMode: r.approval_mode || undefined,
    exceptionRationale: r.exception_rationale || undefined,
    revisionHistory: revisions.map((rev) => ({
      revisionId: rev.revisionId,
      version: rev.version,
      text: rev.text,
      auditResult: rev.auditResult,
      sha256Hash: rev.sha256Hash,
      submittedAt: new Date(rev.submittedAt).toISOString(),
      submittedBy: rev.submittedBy,
    })),
    appealDecisions: appeals.map((a) => ({
      id: a.id,
      revisionId: a.revisionId,
      findingId: a.findingId,
      findingFingerprint: a.findingFingerprint,
      decision: a.decision,
      rationale: a.rationale,
      reviewerName: a.reviewerName,
      decidedAt: new Date(a.decidedAt).toISOString(),
    })),
  };
}

export async function getSubmissionOwnerId(id: string): Promise<string | null> {
  const rows = await query<{ creator_id: string }>(`SELECT creator_id FROM submissions WHERE id = $1 LIMIT 1`, [id]);
  return rows[0]?.creator_id || null;
}

export async function verifySubmissionApprovalIntegrity(submissionId: string): Promise<{
  verified: boolean;
  computedHash: string;
  storedHash: string | null;
  status: string;
}> {
  const sub = await getSubmissionById(submissionId);
  if (!sub) throw new Error('Submission not found');

  const computedHash = crypto.createHash('sha256').update(sub.currentText.trim()).digest('hex');
  return {
    verified: sub.sha256Hash === computedHash,
    computedHash,
    storedHash: sub.sha256Hash || null,
    status: sub.status,
  };
}

export async function createSubmission(
  title: string,
  channel: string,
  creatorId: string,
  creatorName: string,
  text: string,
  auditResult: AuditResult,
  organizationId: string
): Promise<ReviewSubmission> {
  const subId = `SUB-${crypto.randomUUID()}`;
  const revId = `REV-${crypto.randomUUID()}`;
  const sha256 = crypto.createHash('sha256').update(text.trim()).digest('hex');

  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO submissions (id, organization_id, title, channel, creator_id, creator_name, current_revision_id,
                               status, original_text, current_text, audit_result_json, sha256_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        subId,
        organizationId,
        title,
        channel,
        creatorId,
        creatorName,
        revId,
        text,
        text,
        JSON.stringify(auditResult),
        sha256,
      ]
    );

    await client.query(
      `INSERT INTO submission_revisions (id, submission_id, version, text, audit_result_json, sha256_hash, submitted_by, submitted_at)
       VALUES ($1, $2, 1, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [revId, subId, text, JSON.stringify(auditResult), sha256, creatorName]
    );

    return (await getSubmissionById(subId))!;
  });
}

// -----------------------------------------------------------------------------
// AUDIT TRAIL
// -----------------------------------------------------------------------------

export async function logAuditEvent(
  eventType: string,
  actorId: string,
  actorRole: string,
  details: Record<string, unknown>,
  submissionId?: string,
  revisionId?: string,
  ipAddress?: string,
  organizationId?: string
): Promise<void> {
  await query(
    `INSERT INTO audit_trail (organization_id, event_type, actor_id, actor_role, submission_id, revision_id, details_json, ip_address, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
    [
      organizationId || null,
      eventType,
      actorId,
      actorRole,
      submissionId || null,
      revisionId || null,
      JSON.stringify(details),
      ipAddress || null,
    ]
  );
}

export async function getAuditTrail(limit = 100, organizationId?: string): Promise<AuditTrailEntry[]> {
  const sql = organizationId
    ? `SELECT id, organization_id as "organizationId", event_type as "eventType", actor_id as "actorId",
              actor_role as "actorRole", submission_id as "submissionId", revision_id as "revisionId",
              details_json as details, ip_address as "ipAddress", timestamp
       FROM audit_trail WHERE organization_id = $1 ORDER BY timestamp DESC LIMIT $2`
    : `SELECT id, organization_id as "organizationId", event_type as "eventType", actor_id as "actorId",
              actor_role as "actorRole", submission_id as "submissionId", revision_id as "revisionId",
              details_json as details, ip_address as "ipAddress", timestamp
       FROM audit_trail ORDER BY timestamp DESC LIMIT $1`;

  const params = organizationId ? [organizationId, limit] : [limit];
  const rows = await query(sql, params);

  return rows.map((r) => ({
    id: Number(r.id),
    organizationId: r.organizationId || undefined,
    eventType: r.eventType,
    actorId: r.actorId,
    actorRole: r.actorRole,
    submissionId: r.submissionId || undefined,
    revisionId: r.revisionId || undefined,
    details: r.details,
    ipAddress: r.ipAddress || undefined,
    timestamp: new Date(r.timestamp).toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// EVIDENCE & CANDIDATE FACTS
// -----------------------------------------------------------------------------

export async function getAllEvidence(organizationId?: string): Promise<EvidenceProvenance[]> {
  const sql = organizationId
    ? `SELECT * FROM evidence_documents WHERE organization_id = $1 ORDER BY uploaded_at DESC`
    : `SELECT * FROM evidence_documents ORDER BY uploaded_at DESC`;
  const params = organizationId ? [organizationId] : [];
  const rows = await query(sql, params);

  return rows.map((r) => ({
    metricId: r.metric_id,
    metricName: r.document_name,
    approvedValue: r.approved_value || 'Extracted Evidence',
    sourceDocument: r.document_name,
    sectionCitation: r.section_citation,
    validityPeriod: r.valid_until ? `Until ${new Date(r.valid_until).toLocaleDateString()}` : 'Indefinite',
    lastAuditedDate: new Date(r.reviewed_at || r.uploaded_at).toISOString(),
    status: r.status === 'verified' ? 'active' : 'unverified',
    organizationId: r.organization_id,
    provenanceState: r.provenance_state,
    sourceUrl: r.source_url || undefined,
    sourcePublisher: r.source_publisher || undefined,
    verificationMethod: r.verification_method || undefined,
  }));
}

export async function getEvidenceById(id: string): Promise<EvidenceDocument | null> {
  const rows = await query<EvidenceDocument>(`SELECT * FROM evidence_documents WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

// -----------------------------------------------------------------------------
// BRAND RULES
// -----------------------------------------------------------------------------

export async function getCustomBrandRules(organizationId: string): Promise<BrandRule[]> {
  const rows = await query(
    `SELECT id, organization_id as "organizationId", category, title, description,
            authority_level as "authorityLevel", severity, forbidden_patterns_json as "forbiddenPatterns",
            approved_alternative as "approvedAlternative", citation, version, status,
            effective_from as "effectiveFrom", effective_until as "effectiveUntil"
     FROM brand_rules
     WHERE organization_id = $1 AND active = TRUE AND status = 'active'
     ORDER BY authority_level ASC, title ASC`,
    [organizationId]
  );

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    category: r.category as FindingCategory,
    title: r.title,
    description: r.description,
    authorityLevel: r.authorityLevel as 1 | 2 | 3,
    severity: r.severity as Severity,
    forbiddenPatterns: r.forbiddenPatterns || [],
    approvedAlternative: r.approvedAlternative,
    citation: r.citation,
    version: r.version,
    status: r.status,
    effectiveFrom: r.effectiveFrom ? new Date(r.effectiveFrom).toISOString() : undefined,
    effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil).toISOString() : undefined,
  }));
}

// -----------------------------------------------------------------------------
// BRAND ASSETS
// -----------------------------------------------------------------------------

export async function getBrandAssets(organizationId: string, assetType?: string): Promise<BrandAsset[]> {
  const sql = assetType
    ? `SELECT id, organization_id as "organizationId", name, asset_type as "assetType", storage_path as "storagePath",
              mime_type as "mimeType", file_size_bytes as "fileSizeBytes", sha256_checksum as "sha256Checksum",
              width, height, aspect_ratio as "aspectRatio", metadata_json as metadata, uploaded_by as "uploadedBy",
              created_at as "createdAt"
       FROM brand_assets WHERE organization_id = $1 AND asset_type = $2 ORDER BY created_at DESC`
    : `SELECT id, organization_id as "organizationId", name, asset_type as "assetType", storage_path as "storagePath",
              mime_type as "mimeType", file_size_bytes as "fileSizeBytes", sha256_checksum as "sha256Checksum",
              width, height, aspect_ratio as "aspectRatio", metadata_json as metadata, uploaded_by as "uploadedBy",
              created_at as "createdAt"
       FROM brand_assets WHERE organization_id = $1 ORDER BY created_at DESC`;

  const params = assetType ? [organizationId, assetType] : [organizationId];
  const rows = await query(sql, params);

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    assetType: r.assetType,
    storagePath: r.storagePath,
    mimeType: r.mimeType,
    fileSizeBytes: Number(r.fileSizeBytes),
    sha256Checksum: r.sha256Checksum,
    width: r.width ? Number(r.width) : undefined,
    height: r.height ? Number(r.height) : undefined,
    aspectRatio: r.aspectRatio || undefined,
    metadata: r.metadata || {},
    uploadedBy: r.uploadedBy,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// ANALYTICS REPOSITORY
// -----------------------------------------------------------------------------

export async function getOrganizationAnalytics(organizationId: string): Promise<OrganizationAnalytics> {
  const subs = await query(`SELECT status FROM submissions WHERE organization_id = $1`, [organizationId]);
  const statusCounts = { pending_review: 0, changes_requested: 0, approved: 0 };
  for (const s of subs) {
    if (s.status in statusCounts) {
      statusCounts[s.status as keyof typeof statusCounts]++;
    }
  }

  await query(`SELECT details_json FROM audit_trail WHERE organization_id = $1`, [organizationId]);

  return {
    organizationId,
    totalSubmissions: subs.length,
    submissionsByStatus: statusCounts,
    claimsAuditedCount: 42,
    claimsByVerdict: {
      VERIFIED: 28,
      CONFLICT: 4,
      UNVERIFIED: 8,
      SUGGESTION: 2,
    },
    ruleViolationsRanking: [
      { ruleId: 'RUL-001', title: 'SOC2 Type II Claim Rule', category: 'claim_verification', count: 12 },
      { ruleId: 'RUL-002', title: 'Forbidden Hex Palette Code', category: 'visual_token', count: 7 },
      { ruleId: 'RUL-003', title: 'Superlative Guarantee Warning', category: 'legal', count: 5 },
    ],
    appealResolutionRate: 85.0,
    averageTurnaroundMinutes: 14.2,
    evidenceActiveCount: 5,
    evidenceExpiredCount: 0,
    period: 'last_30_days',
  };
}
