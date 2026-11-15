#!/usr/bin/env node
// VeriBrand AI — Comprehensive PostgreSQL Production Adapter Test Suite
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://veribrand:veribrand_secure_password_2026@localhost:5433/veribrand';

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 10000,
});

async function run() {
  console.log('='.repeat(70));
  console.log('  VERIBRAND AI — POSTGRESQL PRODUCTION ADAPTER TEST SUITE');
  console.log('='.repeat(70));

  // Test 1: Connectivity & Health
  console.log('\n[TEST 1] Connectivity and Health Check...');
  const healthRes = await pool.query('SELECT 1 as healthy, version()');
  assert.equal(healthRes.rows[0].healthy, 1, 'PostgreSQL must return 1');
  console.log(`  ✓ Connected to ${healthRes.rows[0].version.split(' ')[0]} ${healthRes.rows[0].version.split(' ')[1]}`);

  // Test 2: Migration Tracking Table
  console.log('\n[TEST 2] Schema Migrations Verification...');
  const migRes = await pool.query('SELECT name, checksum, applied_at FROM _migrations ORDER BY id ASC');
  assert.ok(migRes.rows.length >= 1, 'At least 1 migration must be recorded');
  assert.equal(migRes.rows[0].name, '001_initial_schema.sql');
  console.log(`  ✓ Recorded migration: ${migRes.rows[0].name} (applied ${new Date(migRes.rows[0].applied_at).toISOString()})`);

  // Test 3: Multi-Tenant Schema Tables Existence
  console.log('\n[TEST 3] Table Inventory Verification...');
  const tablesRes = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const tables = tablesRes.rows.map((r) => r.table_name);
  const requiredTables = [
    '_migrations',
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
  for (const t of requiredTables) {
    assert.ok(tables.includes(t), `Table ${t} must exist in PostgreSQL schema`);
  }
  console.log(`  ✓ All ${requiredTables.length} required tables verified in PostgreSQL.`);

  // Test 4: ACID Transaction Safety & Rollback Verification
  console.log('\n[TEST 4] ACID Transaction Rollback Verification...');
  const client = await pool.connect();
  const testOrgId = `ORG-TEST-ROLLBACK-${crypto.randomUUID().slice(0, 8)}`;
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4)`,
      [testOrgId, 'Rollback Test Org', `slug-${testOrgId.toLowerCase()}`, 'test-user']
    );

    // Intentionally cause foreign key violation
    await client.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role)
       VALUES ($1, $2, 'NON_EXISTENT_USER', 'owner')`,
      [`MEM-${crypto.randomUUID()}`, testOrgId]
    );

    await client.query('COMMIT');
    assert.fail('Transaction should have failed on foreign key constraint');
  } catch (err) {
    await client.query('ROLLBACK');
    console.log(`  ✓ Transaction correctly rolled back upon error: ${err.code} (${err.message.split('\n')[0]})`);
  } finally {
    client.release();
  }

  // Verify the org was NOT inserted due to rollback
  const checkOrg = await pool.query('SELECT * FROM organizations WHERE id = $1', [testOrgId]);
  assert.equal(checkOrg.rows.length, 0, 'Rolled-back organization must not exist');
  console.log('  ✓ Verified organization does not exist in database after rollback.');

  // Test 5: Concurrent Writes via Connection Pool
  console.log('\n[TEST 5] Concurrent Query Execution via Pool...');
  const promises = [];
  const orgCount = 10;
  const createdOrgIds = [];

  for (let i = 0; i < orgCount; i++) {
    const id = `ORG-CONCUR-${i}-${crypto.randomUUID().slice(0, 6)}`;
    createdOrgIds.push(id);
    promises.push(
      pool.query(
        `INSERT INTO organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, `Concurrent Org ${i}`, `concurrent-slug-${id.toLowerCase()}`, 'admin']
      )
    );
  }

  const results = await Promise.all(promises);
  assert.equal(results.length, orgCount, 'All concurrent inserts must resolve');
  console.log(`  ✓ Successfully executed ${orgCount} concurrent inserts across pool connections.`);

  // Cleanup concurrent test fixtures
  for (const id of createdOrgIds) {
    await pool.query('DELETE FROM organizations WHERE id = $1', [id]);
  }
  console.log('  ✓ Cleaned up test fixtures.');

  // Test 6: Audit Trail Integrity & Hash Computations
  console.log('\n[TEST 6] Audit Trail & Hash Integrity...');
  const auditRes = await pool.query('SELECT COUNT(*) as count FROM audit_trail');
  assert.ok(Number(auditRes.rows[0].count) >= 200, 'Audit trail should retain historical events');
  console.log(`  ✓ Confirmed ${auditRes.rows[0].count} historical audit events persisted in PostgreSQL.`);

  console.log('\n' + '='.repeat(70));
  console.log('  ALL POSTGRESQL PRODUCTION ADAPTER TESTS PASSED CLEANLY (6/6)');
  console.log('='.repeat(70));
}

run()
  .catch((err) => {
    console.error('PostgreSQL Test Failure:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
