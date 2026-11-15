#!/usr/bin/env node
// VeriBrand AI — Automated PostgreSQL Backup Script
// Exports all multi-tenant tables, metadata, and cryptographic integrity checksums.
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

export async function backupPostgres(outputDir = path.resolve(process.cwd(), 'backups')) {
  console.log('='.repeat(70));
  console.log('  VERIBRAND AI — POSTGRESQL AUTOMATED BACKUP ENGINE');
  console.log('='.repeat(70));
  console.log(`Database URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Output Directory: ${outputDir}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `veribrand_backup_${timestamp}.json`;
  const backupFilePath = path.join(outputDir, backupFileName);
  const checksumFilePath = path.join(outputDir, `${backupFileName}.sha256`);

  try {
    const backupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'veribrand',
      tableCounts: {},
      tables: {},
    };

    let totalRows = 0;

    for (const table of TABLES) {
      const res = await client.query(`SELECT * FROM ${table}`);
      backupData.tables[table] = res.rows;
      backupData.tableCounts[table] = res.rows.length;
      totalRows += res.rows.length;
      console.log(`  ✓ Dumped ${table.padEnd(28)}: ${res.rows.length.toString().padStart(5)} rows`);
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const checksum = crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');

    fs.writeFileSync(backupFilePath, jsonString, 'utf8');
    fs.writeFileSync(checksumFilePath, `${checksum}  ${backupFileName}\n`, 'utf8');

    console.log('='.repeat(70));
    console.log(`  ✓ BACKUP COMPLETED SUCCESSFULLY`);
    console.log(`  Total Tables:    ${TABLES.length}`);
    console.log(`  Total Records:   ${totalRows}`);
    console.log(`  Backup File:     ${backupFilePath}`);
    console.log(`  SHA-256 Digest:  ${checksum}`);
    console.log('='.repeat(70));

    return {
      success: true,
      backupFilePath,
      checksumFilePath,
      checksum,
      tableCounts: backupData.tableCounts,
      totalRows,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

// Direct execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  backupPostgres().catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
  });
}
