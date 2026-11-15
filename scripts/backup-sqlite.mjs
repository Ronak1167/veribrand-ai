import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function collectFiles(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in SQLite data backups: ' + full);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        out.push({ path: rel, bytes: fs.statSync(full).size, sha256: hashFile(full) });
      } else throw new Error('Unsupported filesystem entry in data directory: ' + full);
    }
  }
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

if (!process.argv.includes('--app-stopped')) {
  throw new Error('Stop the web application first, then pass --app-stopped. A live file copy is not a consistent backup.');
}
const dataDir = path.resolve(process.env.VERIBRAND_DATA_DIR || 'data');
const dbPath = path.resolve(process.env.VERIBRAND_DB_PATH || path.join(dataDir, 'veribrand.db'));
if (!dbPath.startsWith(dataDir + path.sep)) {
  throw new Error('VERIBRAND_DB_PATH must be inside VERIBRAND_DATA_DIR for a complete backup.');
}
if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) throw new Error('SQLite data directory does not exist: ' + dataDir);
if (!fs.existsSync(dbPath)) throw new Error('SQLite database does not exist: ' + dbPath);

const db = new DatabaseSync(dbPath);
try {
  const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  if (checkpoint && Number(checkpoint.busy) !== 0) throw new Error('SQLite WAL checkpoint is busy; keep the app stopped and retry.');
  const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  if (integrity !== 'ok') throw new Error('SQLite integrity check failed before backup: ' + integrity);
} finally {
  db.close();
}

const backupRoot = path.resolve(process.env.VERIBRAND_BACKUP_ROOT || path.join('backups', 'sqlite'));
const requested = argValue('--output');
const destination = path.resolve(requested || path.join(backupRoot, timestamp()));
if (destination === dataDir || destination.startsWith(dataDir + path.sep) || dataDir.startsWith(destination + path.sep)) {
  throw new Error('Backup destination must be outside the live data directory.');
}
if (fs.existsSync(destination)) throw new Error('Backup destination already exists; refusing to overwrite it.');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.mkdirSync(destination, { recursive: false });
const copiedData = path.join(destination, 'data');
try {
  fs.cpSync(dataDir, copiedData, { recursive: true, errorOnExist: true, dereference: false });
  const files = collectFiles(copiedData);
  if (!files.some(item => item.path === path.relative(dataDir, dbPath).split(path.sep).join('/'))) {
    throw new Error('Backup manifest does not contain the configured SQLite database.');
  }
  const manifest = {
    format: 'veribrand-sqlite-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    database: path.relative(dataDir, dbPath).split(path.sep).join('/'),
    files,
  };
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  console.log('SQLite backup completed.');
  console.log('Files:', files.length);
  console.log('Bytes:', files.reduce((sum, item) => sum + item.bytes, 0));
  console.log('Manifest SHA-256:', hashFile(path.join(destination, 'manifest.json')));
  console.log('Destination:', destination);
} catch (error) {
  fs.rmSync(destination, { recursive: true, force: true });
  throw error;
}
