import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: Date;
  checksum: string;
}

export interface MigrationStatus {
  name: string;
  applied: boolean;
  appliedAt?: Date;
  checksum: string;
}

/**
 * Ensures the `_migrations` table exists for tracking schema versioning.
 */
export async function ensureMigrationTable(client: PoolClient | Pool): Promise<void> {
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

/**
 * Calculates SHA-256 checksum for migration content.
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Retrieves the list of migration files in sorted order.
 */
export function getMigrationFiles(migrationsDir?: string): { name: string; fullPath: string; content: string }[] {
  const targetDir = migrationsDir || path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const files = fs
    .readdirSync(targetDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  return files.map((file) => ({
    name: file,
    fullPath: path.join(targetDir, file),
    content: fs.readFileSync(path.join(targetDir, file), 'utf8'),
  }));
}

/**
 * Checks the status of all available migrations.
 */
export async function getMigrationStatus(pool: Pool, migrationsDir?: string): Promise<MigrationStatus[]> {
  await ensureMigrationTable(pool);
  const result = await pool.query<MigrationRecord>('SELECT id, name, applied_at, checksum FROM _migrations ORDER BY id ASC');
  const appliedMap = new Map<string, MigrationRecord>();
  for (const row of result.rows) {
    appliedMap.set(row.name, row);
  }

  const files = getMigrationFiles(migrationsDir);
  return files.map((f) => {
    const checksum = calculateChecksum(f.content);
    const applied = appliedMap.get(f.name);
    return {
      name: f.name,
      applied: !!applied,
      appliedAt: applied ? applied.applied_at : undefined,
      checksum,
    };
  });
}

/**
 * Runs pending migrations within transactions with rollback safety.
 * Validates checksum of previously applied migrations.
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir?: string
): Promise<{ applied: string[]; skipped: string[] }> {
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await ensureMigrationTable(client);

    const result = await client.query<MigrationRecord>(
      'SELECT id, name, applied_at, checksum FROM _migrations ORDER BY id ASC'
    );
    const appliedMap = new Map<string, MigrationRecord>();
    for (const row of result.rows) {
      appliedMap.set(row.name, row);
    }

    const files = getMigrationFiles(migrationsDir);

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

      // Execute migration in atomic transaction
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
        throw new Error(`Failed to apply migration "${file.name}": ${(err as Error).message}`);
      }
    }

    return { applied, skipped };
  } finally {
    client.release();
  }
}
