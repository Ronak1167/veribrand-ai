#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(root, 'data', 'veribrand.db');
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://veribrand:veribrand_secure_password_2026@localhost:5433/veribrand';

console.log('='.repeat(70));
console.log('  VERIBRAND AI — SQLITE TO POSTGRESQL DATA MIGRATION ENGINE');
console.log('='.repeat(70));
console.log(`Source SQLite:     ${sqliteDbPath}`);
console.log(`Target PostgreSQL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

const sqlite = new DatabaseSync(sqliteDbPath);
const pool = new Pool({ connectionString: databaseUrl });

// Helper to safely format JSON string for PostgreSQL JSONB columns
function parseJsonSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'string') {
    try {
      JSON.parse(val);
      return val;
    } catch {
      return JSON.stringify([val]);
    }
  }
  return JSON.stringify(val);
}

// Helper to parse dates
function parseDateSafe(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. ORGANIZATIONS
    console.log('\n[1/15] Migrating organizations...');
    const orgs = sqlite.prepare('SELECT * FROM organizations').all();
    for (const org of orgs) {
      await client.query(
        `INSERT INTO organizations (id, name, slug, logo_url, brand_name, settings_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           logo_url = EXCLUDED.logo_url,
           brand_name = EXCLUDED.brand_name,
           settings_json = EXCLUDED.settings_json,
           updated_at = EXCLUDED.updated_at`,
        [
          org.id,
          org.name,
          org.slug,
          org.logo_url || null,
          org.brand_name || null,
          parseJsonSafe(org.settings_json),
          parseDateSafe(org.created_at) || new Date().toISOString(),
          parseDateSafe(org.updated_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${orgs.length} organizations.`);

    // 2. USERS
    console.log('\n[2/15] Migrating users...');
    const users = sqlite.prepare('SELECT * FROM users').all();
    for (const user of users) {
      await client.query(
        `INSERT INTO users (id, email, name, role, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           password_hash = EXCLUDED.password_hash`,
        [
          user.id,
          user.email,
          user.name,
          user.role,
          user.password_hash,
          parseDateSafe(user.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${users.length} users.`);

    // 3. ORGANIZATION MEMBERSHIPS
    console.log('\n[3/15] Migrating organization_memberships...');
    const memberships = sqlite.prepare('SELECT * FROM organization_memberships').all();
    for (const m of memberships) {
      await client.query(
        `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           role = EXCLUDED.role,
           updated_at = EXCLUDED.updated_at`,
        [
          m.id,
          m.organization_id,
          m.user_id,
          m.role,
          parseDateSafe(m.created_at) || new Date().toISOString(),
          parseDateSafe(m.updated_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${memberships.length} memberships.`);

    // 4. ORGANIZATION INVITATIONS
    console.log('\n[4/15] Migrating organization_invitations...');
    const invites = sqlite.prepare('SELECT * FROM organization_invitations').all();
    for (const inv of invites) {
      await client.query(
        `INSERT INTO organization_invitations (id, organization_id, email, role, token, invited_by, expires_at, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status`,
        [
          inv.id,
          inv.organization_id,
          inv.email,
          inv.role,
          inv.token,
          inv.invited_by,
          parseDateSafe(inv.expires_at),
          inv.status,
          parseDateSafe(inv.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${invites.length} invitations.`);

    // 5. SESSIONS
    console.log('\n[5/15] Migrating sessions...');
    const sessions = sqlite.prepare('SELECT * FROM sessions').all();
    for (const s of sessions) {
      await client.query(
        `INSERT INTO sessions (token, user_id, active_organization_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (token) DO UPDATE SET
           active_organization_id = EXCLUDED.active_organization_id,
           expires_at = EXCLUDED.expires_at`,
        [
          s.token,
          s.user_id,
          s.active_organization_id || null,
          parseDateSafe(s.expires_at),
          parseDateSafe(s.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${sessions.length} sessions.`);

    // 6. SUBMISSIONS
    console.log('\n[6/15] Migrating submissions...');
    const subs = sqlite.prepare('SELECT * FROM submissions').all();
    for (const sub of subs) {
      await client.query(
        `INSERT INTO submissions (id, organization_id, title, channel, creator_id, creator_name, current_revision_id,
                                 status, original_text, current_text, audit_result_json, sha256_hash, signed_off_at,
                                 signed_off_by, approval_mode, exception_rationale, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           current_revision_id = EXCLUDED.current_revision_id,
           current_text = EXCLUDED.current_text,
           audit_result_json = EXCLUDED.audit_result_json,
           sha256_hash = EXCLUDED.sha256_hash,
           signed_off_at = EXCLUDED.signed_off_at,
           signed_off_by = EXCLUDED.signed_off_by,
           approval_mode = EXCLUDED.approval_mode,
           exception_rationale = EXCLUDED.exception_rationale,
           updated_at = EXCLUDED.updated_at`,
        [
          sub.id,
          sub.organization_id,
          sub.title,
          sub.channel,
          sub.creator_id,
          sub.creator_name,
          sub.current_revision_id,
          sub.status,
          sub.original_text,
          sub.current_text,
          parseJsonSafe(sub.audit_result_json),
          sub.sha256_hash || null,
          parseDateSafe(sub.signed_off_at),
          sub.signed_off_by || null,
          sub.approval_mode || null,
          sub.exception_rationale || null,
          parseDateSafe(sub.created_at) || new Date().toISOString(),
          parseDateSafe(sub.updated_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${subs.length} submissions.`);

    // 7. SUBMISSION REVISIONS
    console.log('\n[7/15] Migrating submission_revisions...');
    const revs = sqlite.prepare('SELECT * FROM submission_revisions').all();
    for (const r of revs) {
      await client.query(
        `INSERT INTO submission_revisions (id, submission_id, version, text, audit_result_json, sha256_hash, submitted_by, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           text = EXCLUDED.text,
           audit_result_json = EXCLUDED.audit_result_json,
           sha256_hash = EXCLUDED.sha256_hash`,
        [
          r.id,
          r.submission_id,
          r.version,
          r.text,
          parseJsonSafe(r.audit_result_json),
          r.sha256_hash,
          r.submitted_by,
          parseDateSafe(r.submitted_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${revs.length} revisions.`);

    // 8. APPEAL DECISIONS
    console.log('\n[8/15] Migrating appeal_decisions...');
    const appeals = sqlite.prepare('SELECT * FROM appeal_decisions').all();
    for (const a of appeals) {
      await client.query(
        `INSERT INTO appeal_decisions (id, submission_id, revision_id, finding_id, finding_fingerprint, decision, rationale, reviewer_id, reviewer_name, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           decision = EXCLUDED.decision,
           rationale = EXCLUDED.rationale`,
        [
          a.id,
          a.submission_id,
          a.revision_id,
          a.finding_id,
          a.finding_fingerprint,
          a.decision,
          a.rationale,
          a.reviewer_id,
          a.reviewer_name,
          parseDateSafe(a.decided_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${appeals.length} appeals.`);

    // 9. COMMENTS
    console.log('\n[9/15] Migrating comments...');
    const comments = sqlite.prepare('SELECT * FROM comments').all();
    for (const c of comments) {
      await client.query(
        `INSERT INTO comments (id, submission_id, author_id, author_name, role, text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           text = EXCLUDED.text`,
        [
          c.id,
          c.submission_id,
          c.author_id,
          c.author_name,
          c.role,
          c.text,
          parseDateSafe(c.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${comments.length} comments.`);

    // 10. AUDIT TRAIL
    console.log('\n[10/15] Migrating audit_trail...');
    const audits = sqlite.prepare('SELECT * FROM audit_trail').all();
    for (const aud of audits) {
      await client.query(
        `INSERT INTO audit_trail (event_type, actor_id, actor_role, submission_id, revision_id, organization_id, details_json, ip_address, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          aud.event_type,
          aud.actor_id,
          aud.actor_role,
          aud.submission_id || null,
          aud.revision_id || null,
          aud.organization_id || null,
          parseJsonSafe(aud.details_json),
          aud.ip_address || null,
          parseDateSafe(aud.timestamp) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${audits.length} audit records.`);

    // 11. EVIDENCE DOCUMENTS
    console.log('\n[11/15] Migrating evidence_documents...');
    const evidence = sqlite.prepare('SELECT * FROM evidence_documents').all();
    for (const e of evidence) {
      await client.query(
        `INSERT INTO evidence_documents (id, organization_id, metric_id, submission_id, revision_id, document_name,
                                         section_citation, mime_type, file_size_bytes, sha256_checksum, status,
                                         provenance_state, storage_path, source_url, source_publisher, verification_method,
                                         approved_value, valid_from, valid_until, uploaded_by, uploaded_at, reviewed_by,
                                         review_notes, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           provenance_state = EXCLUDED.provenance_state,
           approved_value = EXCLUDED.approved_value,
           reviewed_by = EXCLUDED.reviewed_by,
           review_notes = EXCLUDED.review_notes,
           reviewed_at = EXCLUDED.reviewed_at`,
        [
          e.id,
          e.organization_id,
          e.metric_id,
          e.submission_id || null,
          e.revision_id || null,
          e.document_name,
          e.section_citation,
          e.mime_type,
          e.file_size_bytes,
          e.sha256_checksum,
          e.status,
          e.provenance_state || 'uploaded',
          e.storage_path || null,
          e.source_url || null,
          e.source_publisher || null,
          e.verification_method || null,
          e.approved_value || null,
          parseDateSafe(e.valid_from),
          parseDateSafe(e.valid_until),
          e.uploaded_by,
          parseDateSafe(e.uploaded_at) || new Date().toISOString(),
          e.reviewed_by || null,
          e.review_notes || null,
          parseDateSafe(e.reviewed_at),
        ]
      );
    }
    console.log(`  -> Migrated ${evidence.length} evidence documents.`);

    // 12. EVIDENCE CANDIDATE FACTS
    console.log('\n[12/15] Migrating evidence_candidate_facts...');
    const facts = sqlite.prepare('SELECT * FROM evidence_candidate_facts').all();
    for (const f of facts) {
      await client.query(
        `INSERT INTO evidence_candidate_facts (id, organization_id, evidence_id, metric_id, claim_type, extracted_claim,
                                              extracted_value, unit, page_number, text_excerpt, confidence, extraction_method,
                                              status, reviewed_by, reviewed_at, review_notes, valid_from, valid_until, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = EXCLUDED.reviewed_at,
           review_notes = EXCLUDED.review_notes`,
        [
          f.id,
          f.organization_id,
          f.evidence_id,
          f.metric_id || null,
          f.claim_type || null,
          f.extracted_claim,
          f.extracted_value || null,
          f.unit || null,
          f.page_number || null,
          f.text_excerpt || null,
          f.confidence,
          f.extraction_method || null,
          f.status || 'pending',
          f.reviewed_by || null,
          parseDateSafe(f.reviewed_at),
          f.review_notes || null,
          parseDateSafe(f.valid_from),
          parseDateSafe(f.valid_until),
          parseDateSafe(f.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${facts.length} candidate facts.`);

    // 13. BRAND RULES
    console.log('\n[13/15] Migrating brand_rules...');
    const rules = sqlite.prepare('SELECT * FROM brand_rules').all();
    for (const r of rules) {
      await client.query(
        `INSERT INTO brand_rules (id, organization_id, category, title, description, authority_level, severity,
                                  forbidden_patterns_json, approved_alternative, citation, active, version,
                                  status, effective_from, effective_until, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           severity = EXCLUDED.severity,
           forbidden_patterns_json = EXCLUDED.forbidden_patterns_json,
           approved_alternative = EXCLUDED.approved_alternative,
           citation = EXCLUDED.citation,
           active = EXCLUDED.active,
           version = EXCLUDED.version,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          r.id,
          r.organization_id,
          r.category,
          r.title,
          r.description,
          r.authority_level || 2,
          r.severity,
          parseJsonSafe(r.forbidden_patterns_json),
          r.approved_alternative || null,
          r.citation || null,
          Boolean(r.active),
          r.version || 1,
          r.status || 'active',
          parseDateSafe(r.effective_from),
          parseDateSafe(r.effective_until),
          r.created_by,
          parseDateSafe(r.created_at) || new Date().toISOString(),
          parseDateSafe(r.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${rules.length} brand rules.`);

    // 14. BRAND RULE VERSIONS
    console.log('\n[14/15] Migrating brand_rule_versions...');
    const ruleVers = sqlite.prepare('SELECT * FROM brand_rule_versions').all();
    for (const rv of ruleVers) {
      await client.query(
        `INSERT INTO brand_rule_versions (id, rule_id, organization_id, version, category, title, description,
                                          authority_level, severity, forbidden_patterns_json, approved_alternative,
                                          citation, status, change_rationale, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING`,
        [
          rv.id,
          rv.rule_id,
          rv.organization_id,
          rv.version,
          rv.category,
          rv.title,
          rv.description,
          rv.authority_level,
          rv.severity,
          parseJsonSafe(rv.forbidden_patterns_json),
          rv.approved_alternative || null,
          rv.citation || null,
          rv.status,
          rv.change_rationale || null,
          rv.created_by,
          parseDateSafe(rv.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${ruleVers.length} brand rule versions.`);

    // 15. BRAND ASSETS
    console.log('\n[15/15] Migrating brand_assets...');
    const assets = sqlite.prepare('SELECT * FROM brand_assets').all();
    for (const a of assets) {
      await client.query(
        `INSERT INTO brand_assets (id, organization_id, name, asset_type, storage_path, mime_type,
                                   file_size_bytes, sha256_checksum, width, height, aspect_ratio,
                                   metadata_json, uploaded_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           width = EXCLUDED.width,
           height = EXCLUDED.height,
           aspect_ratio = EXCLUDED.aspect_ratio,
           metadata_json = EXCLUDED.metadata_json`,
        [
          a.id,
          a.organization_id,
          a.name,
          a.asset_type,
          a.storage_path,
          a.mime_type,
          a.file_size_bytes,
          a.sha256_checksum,
          a.width || null,
          a.height || null,
          a.aspect_ratio || null,
          parseJsonSafe(a.metadata_json),
          a.uploaded_by,
          parseDateSafe(a.created_at) || new Date().toISOString(),
        ]
      );
    }
    console.log(`  -> Migrated ${assets.length} brand assets.`);

    await client.query('COMMIT');
    console.log('\nTransaction committed successfully.');

    // -------------------------------------------------------------------------
    // VERIFICATION AND PARITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n' + '='.repeat(70));
    console.log('  RECORD COUNT PARITY VERIFICATION');
    console.log('='.repeat(70));

    const tables = [
      'organizations',
      'users',
      'organization_memberships',
      'organization_invitations',
      'sessions',
      'submissions',
      'submission_revisions',
      'appeal_decisions',
      'comments',
      'audit_trail',
      'evidence_documents',
      'evidence_candidate_facts',
      'brand_rules',
      'brand_rule_versions',
      'brand_assets',
    ];

    let allParityMatched = true;

    for (const table of tables) {
      const sqliteCount = Number(
        sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count
      );
      const pgRes = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      const pgCount = Number(pgRes.rows[0].count);

      const match = sqliteCount === pgCount;
      if (!match) allParityMatched = false;

      const symbol = match ? '✓ PASS' : '✗ MISMATCH';
      console.log(
        `  ${symbol.padEnd(8)} ${table.padEnd(28)} SQLite: ${String(sqliteCount).padStart(5)} | Postgres: ${String(pgCount).padStart(5)}`
      );
    }

    if (!allParityMatched) {
      throw new Error('Parity mismatch detected between SQLite and PostgreSQL!');
    }

    console.log('\n✓ ALL 15 TABLES VERIFIED WITH 100% COUNT PARITY!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Migration failed, transaction rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
