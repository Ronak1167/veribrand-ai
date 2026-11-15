#!/usr/bin/env node
// VeriBrand AI — Automated PostgreSQL Restore Script
// Validates cryptographic checksums and restores table records.
import { Pool } from 'pg';
import fs from 'fs';
import crypto from 'crypto';

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://veribrand:veribrand_secure_password_2026@localhost:5433/veribrand';

const TABLES_IN_RESTORE_ORDER = [
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

export async function restorePostgres(backupFilePath, targetDatabaseUrl = null) {
  const targetUrl = targetDatabaseUrl || databaseUrl;
  console.log('='.repeat(70));
  console.log('  VERIBRAND AI — POSTGRESQL RESTORE & DISASTER RECOVERY');
  console.log('='.repeat(70));
  console.log(`Source File:  ${backupFilePath}`);
  console.log(`Target Database: ${targetUrl.replace(/:[^:@]+@/, ':****@')}`);

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist: ${backupFilePath}`);
  }

  // 1. Verify Checksum if present
  const checksumFilePath = `${backupFilePath}.sha256`;
  const fileContent = fs.readFileSync(backupFilePath, 'utf8');
  const actualSha = crypto.createHash('sha256').update(fileContent, 'utf8').digest('hex');

  if (!fs.existsSync(checksumFilePath)) {
    throw new Error('Backup checksum file is required. Refusing to restore an unverified backup.');
  }
  const recordedChecksum = fs.readFileSync(checksumFilePath, 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(recordedChecksum) || actualSha !== recordedChecksum) {
    throw new Error(`Checksum verification failed. Computed: ${actualSha}`);
  }
  console.log(`Checksum verified (SHA-256: ${actualSha.slice(0, 16)}...)`);

  const backupData = JSON.parse(fileContent);
  if (!backupData || typeof backupData !== 'object' || !backupData.tables || typeof backupData.tables !== 'object') {
    throw new Error('Invalid backup format: expected a tables object.');
  }
  for (const table of Object.keys(backupData.tables)) {
    if (!TABLES_IN_RESTORE_ORDER.includes(table) || !Array.isArray(backupData.tables[table])) {
      throw new Error(`Invalid or unsupported table in backup: ${table}`);
    }
  }
  const pool = new Pool({ connectionString: targetUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Never overwrite an existing database. Restore only into a fresh, isolated target.
    // This makes an accidental invocation against the live database fail safely.
    for (const table of TABLES_IN_RESTORE_ORDER) {
      const result = await client.query(`SELECT EXISTS (SELECT 1 FROM ${table} LIMIT 1) AS has_rows`);
      if (result.rows[0]?.has_rows) {
        throw new Error(`Restore target is not empty (table: ${table}). Create a separate empty restore database and retry.`);
      }
    }

    // Insert records in dependency order
    console.log('\nRestoring tables in dependency order...');
    let restoredRows = 0;

    for (const table of TABLES_IN_RESTORE_ORDER) {
      const rows = backupData.tables[table] || [];
      if (rows.length === 0) {
        console.log(`  - ${table.padEnd(28)}: 0 rows (empty)`);
        continue;
      }

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row).map(v => {
          if (v !== null && typeof v === 'object') {
            return JSON.stringify(v);
          }
          return v;
        });
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const colList = columns.map(c => `"${c}"`).join(', ');

        await client.query(
          `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
          values
        );
      }

      restoredRows += rows.length;
      console.log(`  ✓ Restored ${table.padEnd(28)}: ${rows.length.toString().padStart(5)} rows`);
    }

    // Keep the serial audit-trail sequence ahead of explicitly restored IDs.
    await client.query(`SELECT setval(
      pg_get_serial_sequence('audit_trail', 'id'),
      COALESCE((SELECT MAX(id) FROM audit_trail), 1),
      EXISTS (SELECT 1 FROM audit_trail)
    )`);

    // Verify restored row counts before committing the transaction.
    for (const table of TABLES_IN_RESTORE_ORDER) {
      const expected = (backupData.tables[table] || []).length;
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      if (result.rows[0]?.count !== expected) {
        throw new Error(`Restore verification failed for ${table}: expected ${expected}, found ${result.rows[0]?.count}`);
      }
    }

    await client.query('COMMIT');

    console.log('='.repeat(70));
    console.log(`  ✓ RESTORE COMPLETED SUCCESSFULLY`);
    console.log(`  Total Restored Records: ${restoredRows}`);
    console.log('='.repeat(70));

    return {
      success: true,
      restoredRows,
      tableCounts: backupData.tableCounts,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Direct execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('Usage: node scripts/restore-postgres.mjs <backup-file.json>');
    process.exit(1);
  }
  restorePostgres(targetFile).catch((err) => {
    console.error('Restore failed:', err);
    process.exit(1);
  });
}
