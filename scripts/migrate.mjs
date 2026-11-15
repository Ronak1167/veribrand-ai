#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://veribrand:veribrand_secure_password_2026@localhost:5433/veribrand';

const pool = new Pool({
  connectionString: databaseUrl,
});

function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

async function ensureMigrationTable(client) {
  const sql = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_migrations_name ON _migrations(name);
  `;
  await client.query(sql);
}

function getMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({
      name: file,
      fullPath: path.join(migrationsDir, file),
      content: fs.readFileSync(path.join(migrationsDir, file), 'utf8'),
    }));
}

async function run() {
  const isStatus = process.argv.includes('--status');
  const migrationsDir = path.join(root, 'migrations');

  console.log('VeriBrand AI Migration Runner');
  console.log(`Target: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Directory: ${migrationsDir}`);

  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);

    const result = await client.query('SELECT id, name, applied_at, checksum FROM _migrations ORDER BY id ASC');
    const appliedMap = new Map();
    for (const row of result.rows) {
      appliedMap.set(row.name, row);
    }

    const files = getMigrationFiles(migrationsDir);

    if (isStatus) {
      console.log('\nMigration Status:');
      for (const f of files) {
        const checksum = calculateChecksum(f.content);
        const applied = appliedMap.get(f.name);
        console.log(
          `  [${applied ? 'APPLIED' : 'PENDING'}] ${f.name} ${
            applied ? `(${new Date(applied.applied_at).toISOString()})` : ''
          } (sha256: ${checksum.substring(0, 8)}...)`
        );
      }
      return;
    }

    console.log('\nApplying migrations...');
    const applied = [];
    const skipped = [];

    for (const file of files) {
      const checksum = calculateChecksum(file.content);
      const existing = appliedMap.get(file.name);

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for "${file.name}"! Recorded: ${existing.checksum}, Current: ${checksum}. Tampering detected.`
          );
        }
        skipped.push(file.name);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(file.content);
        await client.query(
          'INSERT INTO _migrations (name, checksum, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [file.name, checksum]
        );
        await client.query('COMMIT');
        applied.push(file.name);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Failed to apply migration "${file.name}": ${err.message}`);
      }
    }

    console.log(`Applied (${applied.length}): ${applied.join(', ') || 'None'}`);
    console.log(`Skipped (${skipped.length}): ${skipped.join(', ') || 'None'}`);
    console.log('\nMigration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
