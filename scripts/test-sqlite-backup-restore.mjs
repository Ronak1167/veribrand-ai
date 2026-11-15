import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veribrand-sqlite-drill-'));
const dataDir = path.join(root, 'data');
const backupRoot = path.join(root, 'backups');
const backupDir = path.join(backupRoot, 'known-good');
const dbPath = path.join(dataDir, 'veribrand.db');
const evidenceDir = path.join(dataDir, 'evidence', 'org-test');
const backupScript = path.resolve('scripts/backup-sqlite.mjs');
const restoreScript = path.resolve('scripts/restore-sqlite.mjs');
const env = { ...process.env, VERIBRAND_DATA_DIR: dataDir, VERIBRAND_DB_PATH: dbPath, VERIBRAND_BACKUP_ROOT: backupRoot };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readValue() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare('SELECT value FROM drill_state WHERE id=1').get()?.value; }
  finally { db.close(); }
}

let failure = null;
try {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE drill_state (id INTEGER PRIMARY KEY, value TEXT NOT NULL);');
  db.prepare('INSERT INTO drill_state VALUES (1, ?)').run('before-backup');
  db.close();
  fs.writeFileSync(path.join(evidenceDir, 'evidence.txt'), 'evidence-before-backup', 'utf8');

  execFileSync(process.execPath, [backupScript, '--app-stopped', '--output', backupDir], { env, stdio: 'inherit' });
  assert(fs.existsSync(path.join(backupDir, 'manifest.json')), 'Backup manifest missing.');
  assert(fs.existsSync(path.join(backupDir, 'data', 'evidence', 'org-test', 'evidence.txt')), 'Evidence file missing from backup.');

  const mutated = new DatabaseSync(dbPath);
  mutated.prepare('UPDATE drill_state SET value=? WHERE id=1').run('after-backup');
  mutated.close();
  fs.writeFileSync(path.join(evidenceDir, 'evidence.txt'), 'evidence-after-backup', 'utf8');
  assert(readValue() === 'after-backup', 'Test mutation did not apply.');

  const corruptBackup = path.join(root, 'corrupt-backup');
  fs.cpSync(backupDir, corruptBackup, { recursive: true });
  fs.writeFileSync(path.join(corruptBackup, 'data', 'evidence', 'org-test', 'evidence.txt'), 'tampered', 'utf8');
  const rejected = spawnSync(process.execPath, [restoreScript, corruptBackup, '--app-stopped', '--confirm'], { env, encoding: 'utf8' });
  assert(rejected.status !== 0, 'Tampered backup should be rejected.');
  assert(readValue() === 'after-backup', 'Rejected restore modified the live target.');

  execFileSync(process.execPath, [restoreScript, backupDir, '--app-stopped', '--confirm'], { env, stdio: 'inherit' });
  assert(readValue() === 'before-backup', 'Database content was not restored.');
  assert(fs.readFileSync(path.join(evidenceDir, 'evidence.txt'), 'utf8') === 'evidence-before-backup', 'Evidence content was not restored.');
  const safetyCopies = fs.readdirSync(backupRoot).filter(name => name.startsWith('pre-restore-'));
  assert(safetyCopies.length === 1, 'Pre-restore safety copy was not retained.');
  console.log('PASS: SQLite backup checks WAL integrity and hashes the full data directory.');
  console.log('PASS: Restore rejects a tampered backup without changing the live target.');
  console.log('PASS: Restore recovers database and evidence files and retains a pre-restore safety copy.');
} catch (error) {
  failure = error;
  console.error('SQLite backup/restore drill failed:', error);
} finally {
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
  catch (error) { console.warn('Temporary drill directory could not be removed automatically:', root, error); }
}
if (failure) process.exitCode = 1;
