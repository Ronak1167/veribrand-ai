import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function collectFiles(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in SQLite data backups.');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        out.push({
          path: path.relative(root, full).split(path.sep).join('/'),
          bytes: fs.statSync(full).size,
          sha256: hashFile(full),
        });
      } else throw new Error('Unsupported filesystem entry in backup.');
    }
  }
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
function verifyBackup(backupDir) {
  const manifestPath = path.join(backupDir, 'manifest.json');
  const dataRoot = path.join(backupDir, 'data');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(dataRoot)) throw new Error('Backup must contain manifest.json and data/.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'veribrand-sqlite-backup' || manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.database) {
    throw new Error('Unsupported or invalid SQLite backup manifest.');
  }
  const expected = new Map();
  for (const item of manifest.files) {
    if (!item || typeof item.path !== 'string' || item.path.startsWith('/') || item.path.includes('\\') ||
        item.path.split('/').some(part => !part || part === '.' || part === '..') ||
        !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
        expected.has(item.path)) {
      throw new Error('Invalid file entry in backup manifest.');
    }
    expected.set(item.path, item);
  }
  if (!expected.has(manifest.database)) throw new Error('Backup manifest does not list its SQLite database.');
  const actual = collectFiles(dataRoot);
  if (actual.length !== expected.size) throw new Error('Backup file count does not match its manifest.');
  for (const file of actual) {
    const wanted = expected.get(file.path);
    if (!wanted || wanted.bytes !== file.bytes || wanted.sha256 !== file.sha256) {
      throw new Error('Backup checksum/size verification failed: ' + file.path);
    }
  }
  return { manifest, dataRoot };
}
function verifyDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error('Restored SQLite database is missing.');
  const db = new DatabaseSync(dbPath);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
    if (integrity !== 'ok') throw new Error('SQLite integrity check failed: ' + integrity);
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length) throw new Error('SQLite foreign-key check found ' + foreignKeys.length + ' violation(s).');
    const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (checkpoint && Number(checkpoint.busy) !== 0) throw new Error('Restored SQLite WAL checkpoint is busy.');
  } finally {
    db.close();
  }
}
function writeManifest(root, databaseRelative) {
  const manifest = {
    format: 'veribrand-sqlite-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    database: databaseRelative,
    files: collectFiles(root),
  };
  fs.writeFileSync(path.join(path.dirname(root), 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
}

if (!process.argv.includes('--app-stopped') || !process.argv.includes('--confirm')) {
  throw new Error('Restore requires both --app-stopped and --confirm. Stop the web app and verify the target before proceeding.');
}
const backupArg = process.argv.find(arg => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
if (!backupArg) throw new Error('Usage: node scripts/restore-sqlite.mjs <backup-directory> --app-stopped --confirm');
const backupDir = path.resolve(backupArg);
const { manifest, dataRoot } = verifyBackup(backupDir);

const dataDir = path.resolve(process.env.VERIBRAND_DATA_DIR || 'data');
const dbPath = path.resolve(process.env.VERIBRAND_DB_PATH || path.join(dataDir, 'veribrand.db'));
if (!dbPath.startsWith(dataDir + path.sep)) throw new Error('VERIBRAND_DB_PATH must be inside VERIBRAND_DATA_DIR.');
if (backupDir === dataDir || backupDir.startsWith(dataDir + path.sep) || dataDir.startsWith(backupDir + path.sep)) {
  throw new Error('Backup directory must be separate from the live data directory.');
}
const databasePath = path.resolve(dataRoot, ...manifest.database.split('/'));
if (!databasePath.startsWith(dataRoot + path.sep)) throw new Error('Database path escapes backup directory.');
verifyDatabase(databasePath);

const parent = path.dirname(dataDir);
fs.mkdirSync(parent, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const staging = dataDir + '.restore-' + stamp;
const displaced = dataDir + '.displaced-' + stamp;
const safetyDir = path.resolve(process.env.VERIBRAND_BACKUP_ROOT || path.join('backups', 'sqlite'), 'pre-restore-' + stamp);
if (fs.existsSync(staging) || fs.existsSync(displaced) || fs.existsSync(safetyDir)) throw new Error('Restore staging/safety path already exists.');

const hasExistingData = fs.existsSync(dataDir) && fs.readdirSync(dataDir).length > 0;
if (hasExistingData) {
  fs.mkdirSync(path.dirname(safetyDir), { recursive: true });
  fs.mkdirSync(safetyDir, { recursive: false });
  const safetyData = path.join(safetyDir, 'data');
  try {
    fs.cpSync(dataDir, safetyData, { recursive: true, errorOnExist: true, dereference: false });
    const relativeDb = path.relative(dataDir, dbPath).split(path.sep).join('/');
    writeManifest(safetyData, relativeDb);
  } catch (error) {
    fs.rmSync(safetyDir, { recursive: true, force: true });
    throw new Error('Could not create pre-restore safety copy; restore aborted: ' + (error instanceof Error ? error.message : String(error)));
  }
}

try {
  fs.cpSync(dataRoot, staging, { recursive: true, errorOnExist: true, dereference: false });
  const stagedDb = path.join(staging, ...manifest.database.split('/'));
  verifyDatabase(stagedDb);
  if (fs.existsSync(dataDir)) fs.renameSync(dataDir, displaced);
  try {
    fs.renameSync(staging, dataDir);
  } catch (error) {
    if (fs.existsSync(displaced) && !fs.existsSync(dataDir)) fs.renameSync(displaced, dataDir);
    throw error;
  }
  if (fs.existsSync(displaced)) fs.rmSync(displaced, { recursive: true, force: true });
  console.log('SQLite restore completed and verified.');
  console.log('Restored files:', manifest.files.length);
  console.log('Pre-restore safety copy:', fs.existsSync(safetyDir) ? safetyDir : 'not needed (target was empty)');
  console.log('Restored data directory:', dataDir);
} catch (error) {
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  throw error;
}
