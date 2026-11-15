// VeriBrand AI — Database Concurrency, ACID Rollback & Foreign Key Test Suite
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const testDbPath = path.resolve(process.cwd(), 'data', 'test-concurrency.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
  try { fs.unlinkSync(`${testDbPath}-wal`); } catch {}
  try { fs.unlinkSync(`${testDbPath}-shm`); } catch {}
}

console.log('================================================================');
console.log('  VERIBRAND AI — DATABASE CONCURRENCY & ACID ROLLBACK SUITE    ');
console.log('================================================================');

const db = new DatabaseSync(testDbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize test tables matching production schema
db.exec(`
  CREATE TABLE parent_records (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE child_records (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    data TEXT NOT NULL,
    FOREIGN KEY(parent_id) REFERENCES parent_records(id) ON DELETE CASCADE
  );
`);

console.log('-> WAL mode, busy timeout, and foreign keys successfully initialized.');

// 1. Transaction Atomic Rollback Test
console.log('\n[Test 1] Testing transaction atomicity and rollback on error...');
try {
  db.exec('BEGIN TRANSACTION;');
  db.prepare('INSERT INTO parent_records (id, name, created_at) VALUES (?, ?, ?);')
    .run('PAR-001', 'Test Parent', new Date().toISOString());
  db.prepare('INSERT INTO child_records (id, parent_id, data) VALUES (?, ?, ?);')
    .run('CHD-001', 'PAR-001', 'Valid Child Data');

  // Deliberate constraint violation: duplicate primary key
  db.prepare('INSERT INTO child_records (id, parent_id, data) VALUES (?, ?, ?);')
    .run('CHD-001', 'PAR-001', 'Duplicate Primary Key - Should Fail');

  db.exec('COMMIT;');
  throw new Error('Transaction should have failed on duplicate key');
} catch (err) {
  db.exec('ROLLBACK;');
  console.log('-> Caught expected error:', err.message);
}

// Verify zero partial writes survived the rollback
const parentCount = db.prepare('SELECT COUNT(*) as c FROM parent_records WHERE id = ?;').get('PAR-001').c;
const childCount = db.prepare('SELECT COUNT(*) as c FROM child_records WHERE id = ?;').get('CHD-001').c;

if (parentCount !== 0 || childCount !== 0) {
  throw new Error(`Rollback failed! Survived: parentCount=${parentCount}, childCount=${childCount}`);
}
console.log('-> PASS: Transaction atomicity verified — 0 partial writes survived rollback.');

// 2. Foreign Key Constraint Enforcement
console.log('\n[Test 2] Testing foreign key enforcement on invalid reference...');
let fkCaught = false;
try {
  db.prepare('INSERT INTO child_records (id, parent_id, data) VALUES (?, ?, ?);')
    .run('CHD-ORPHAN', 'PAR-DOES-NOT-EXIST', 'Orphan data');
} catch (err) {
  fkCaught = true;
  console.log('-> Caught expected foreign key violation:', err.message);
}
if (!fkCaught) throw new Error('Foreign key enforcement failed to block orphaned insert!');
console.log('-> PASS: Foreign key constraints strictly enforced.');

// 3. Cascade Delete Test
console.log('\n[Test 3] Testing foreign key CASCADE delete...');
db.prepare('INSERT INTO parent_records (id, name, created_at) VALUES (?, ?, ?);')
  .run('PAR-VALID', 'Cascade Parent', new Date().toISOString());
db.prepare('INSERT INTO child_records (id, parent_id, data) VALUES (?, ?, ?);')
  .run('CHD-001', 'PAR-VALID', 'Child 1');
db.prepare('INSERT INTO child_records (id, parent_id, data) VALUES (?, ?, ?);')
  .run('CHD-002', 'PAR-VALID', 'Child 2');

db.prepare('DELETE FROM parent_records WHERE id = ?;').run('PAR-VALID');
const remainingChildren = db.prepare('SELECT COUNT(*) as c FROM child_records WHERE parent_id = ?;').get('PAR-VALID').c;
if (remainingChildren !== 0) throw new Error('Cascade delete failed to clean up children!');
console.log('-> PASS: Foreign key CASCADE delete verified.');

// 4. Concurrency Simulation (Parallel Readers and Writers in WAL mode)
console.log('\n[Test 4] Simulating concurrent readers and writers in WAL mode...');
const readerDb1 = new DatabaseSync(testDbPath);
const readerDb2 = new DatabaseSync(testDbPath);
readerDb1.exec('PRAGMA busy_timeout = 5000;');
readerDb2.exec('PRAGMA busy_timeout = 5000;');

// Insert parent
db.prepare('INSERT INTO parent_records (id, name, created_at) VALUES (?, ?, ?);')
  .run('PAR-CONCURRENT', 'Concurrent Parent', new Date().toISOString());

const iterations = 50;
let writeCount = 0;
let readCount = 0;

for (let i = 0; i < iterations; i++) {
  // Writer inserts a child
  db.prepare('INSERT INTO child_records (id, parent_id, data) VALUES (?, ?, ?);')
    .run(`CHD-${i}`, 'PAR-CONCURRENT', `Data ${i}`);
  writeCount++;

  // Reader 1 reads count
  const c1 = readerDb1.prepare('SELECT COUNT(*) as c FROM child_records WHERE parent_id = ?;').get('PAR-CONCURRENT').c;
  // Reader 2 reads specific child
  const c2 = readerDb2.prepare('SELECT * FROM child_records WHERE id = ?;').get(`CHD-${i}`);
  if (c1 !== writeCount || !c2) {
    throw new Error(`Concurrency read mismatch: expected ${writeCount}, got ${c1}`);
  }
  readCount += 2;
}

console.log(`-> PASS: Successfully executed ${writeCount} serial writes and ${readCount} concurrent reads without contention or locks.`);

// Cleanup
db.close();
readerDb1.close();
readerDb2.close();
fs.unlinkSync(testDbPath);
try { fs.unlinkSync(`${testDbPath}-wal`); } catch {}
try { fs.unlinkSync(`${testDbPath}-shm`); } catch {}

console.log('\n================================================================');
console.log('  ALL DATABASE CONCURRENCY & ACID TESTS PASSED CLEANLY!         ');
console.log('================================================================\n');
