#!/usr/bin/env node
// VeriBrand AI — Disaster Recovery & Backup/Restore Automated Verification Drill
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { backupPostgres } from './backup-postgres.mjs';
import { restorePostgres } from './restore-postgres.mjs';

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://veribrand:veribrand_secure_password_2026@localhost:5433/veribrand';

const TABLES = [
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

async function runDrill() {
  console.log('='.repeat(75));
  console.log('  VERIBRAND AI — ENTERPRISE DISASTER RECOVERY DRILL');
  console.log('='.repeat(75));

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // 1. Capture Pre-Drill Table Counts
    console.log('\n[Phase 1] Auditing Baseline PostgreSQL State...');
    const baselineCounts = {};
    for (const table of TABLES) {
      const res = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      baselineCounts[table] = parseInt(res.rows[0].count, 10);
      console.log(`  Baseline ${table.padEnd(28)}: ${baselineCounts[table]}`);
    }

    // 2. Execute Automated Backup
    console.log('\n[Phase 2] Triggering Hot Database Backup...');
    const backupDir = path.resolve(process.cwd(), 'backups');
    const backupResult = await backupPostgres(backupDir);

    assert.ok(backupResult.success, 'Backup execution must succeed');
    assert.ok(backupResult.backupFilePath, 'Backup file path must exist');
    assert.ok(backupResult.checksum, 'Backup SHA-256 checksum must exist');

    // 3. Execute Automated Restore Drill in Dedicated Isolated Target Database
    console.log('\n[Phase 3] Setting Up Fresh Isolated Target Database for Restore Drill...');
    const drillDbName = 'veribrand_drill_restore';
    const parsedUrl = new URL(databaseUrl);
    parsedUrl.pathname = '/postgres';
    const adminPool = new Pool({ connectionString: parsedUrl.toString() });
    await adminPool.query(`DROP DATABASE IF EXISTS ${drillDbName};`);
    await adminPool.query(`CREATE DATABASE ${drillDbName};`);
    await adminPool.end();

    const drillDbUrl = new URL(databaseUrl);
    drillDbUrl.pathname = `/${drillDbName}`;
    const drillPool = new Pool({ connectionString: drillDbUrl.toString() });
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'schema.postgres.sql'), 'utf8');
    await drillPool.query(schemaSql);

    console.log('\nExecuting Automated Restore into Isolated Drill Database...');
    const restoreResult = await restorePostgres(backupResult.backupFilePath, drillDbUrl.toString());
    assert.ok(restoreResult.success, 'Restore execution must succeed');

    // 4. Verify Post-Restore Table Parity
    console.log('\n[Phase 4] Verifying 100% Record Count Parity in Restored Target...');
    let allMatched = true;

    for (const table of TABLES) {
      const res = await drillPool.query(`SELECT COUNT(*) as count FROM ${table}`);
      const restoredCount = parseInt(res.rows[0].count, 10);
      const expectedCount = baselineCounts[table];

      const match = restoredCount === expectedCount;
      if (!match) allMatched = false;

      const sym = match ? '✓ PASS' : '✗ FAIL';
      console.log(`  ${sym} ${table.padEnd(28)} Expected: ${expectedCount.toString().padStart(5)} | Actual: ${restoredCount.toString().padStart(5)}`);
    }

    await drillPool.end();

    // Clean up isolated test database after successful parity verification
    const cleanupPool = new Pool({ connectionString: parsedUrl.toString() });
    await cleanupPool.query(`DROP DATABASE IF EXISTS ${drillDbName};`);
    await cleanupPool.end();

    console.log('\n' + '='.repeat(75));
    if (allMatched) {
      console.log('  ✓ DISASTER RECOVERY DRILL COMPLETED WITH 100% DATA PARITY!');
    } else {
      console.error('  ✗ DISASTER RECOVERY DRILL FAILED PARITY CHECK!');
      process.exitCode = 1;
    }
    console.log('='.repeat(75));
  } finally {
    client.release();
    await pool.end();
  }
}

runDrill().catch((err) => {
  console.error('Drill failed with error:', err);
  process.exit(1);
});
