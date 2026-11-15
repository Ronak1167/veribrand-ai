import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.test.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const base = process.env.VERIBRAND_URL || 'http://localhost:3000';
const db = new DatabaseSync(path.join(root, 'data', 'veribrand.db'));
const suffix = Date.now().toString(36);
const email = 'evidence-owner-' + suffix + '@example.test';
const password = 'Temporary-Ownership-Test-Password-42!';
let userId = null;
let evidenceId = null;
let storagePath = null;
const evidenceDir = path.join(root, 'data', 'evidence');
const existingEvidenceFiles = new Set(fs.readdirSync(evidenceDir));

async function login(email, password) {
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error('Login failed for test account: ' + response.status);
  const cookie = (response.headers.get('set-cookie') || '').match(/veribrand_session=([^;]+)/)?.[1];
  if (!cookie) throw new Error('Session cookie missing.');
  return { cookie: 'veribrand_session=' + cookie };
}
try {
  const admin = await login(env.VERIBRAND_TEST_ADMIN_EMAIL, env.VERIBRAND_TEST_ADMIN_PASSWORD);
  const creatorA = await login(env.VERIBRAND_TEST_CREATOR_EMAIL, env.VERIBRAND_TEST_CREATOR_PASSWORD);
  const created = await fetch(base + '/api/auth/users', { method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: 'Temporary Ownership Test', role: 'creator', password }) });
  const createdBody = await created.json();
  if (created.status !== 201) throw new Error('Could not create second test creator: ' + created.status);
  userId = createdBody.user.id;
  const creatorB = await login(email, password);

  const form = new FormData();
  form.set('file', new File(['Private evidence belongs to creator A only.'], 'private-owner-fixture.txt', { type: 'text/plain' }));
  form.set('metricId', 'OWNERSHIP-TEST');
  form.set('sectionCitation', 'Ownership isolation fixture');
  const upload = await fetch(base + '/api/evidence', { method: 'POST', headers: { Cookie: creatorA.cookie }, body: form });
  const uploaded = await upload.json();
  if (upload.status !== 201) throw new Error('Evidence upload failed: ' + upload.status);
  evidenceId = uploaded.evidence.id;
  storagePath = fs.readdirSync(evidenceDir).filter((name) => !existingEvidenceFiles.has(name)).map((name) => path.join(evidenceDir, name))[0] || null;

  const listB = await fetch(base + '/api/evidence', { headers: { Cookie: creatorB.cookie } });
  const listBBody = await listB.json();
  if (!listB.ok || listBBody.evidence.some((item) => item.id === evidenceId)) throw new Error('Creator B can see creator A evidence in list endpoint.');
  const detailB = await fetch(base + '/api/evidence/' + encodeURIComponent(evidenceId), { headers: { Cookie: creatorB.cookie } });
  if (detailB.status !== 404) throw new Error('Creator B detail access expected 404, got ' + detailB.status);
  const downloadB = await fetch(base + '/api/evidence/' + encodeURIComponent(evidenceId) + '?download=1', { headers: { Cookie: creatorB.cookie } });
  if (downloadB.status !== 404) throw new Error('Creator B download expected 404, got ' + downloadB.status);
  const detailA = await fetch(base + '/api/evidence/' + encodeURIComponent(evidenceId), { headers: { Cookie: creatorA.cookie } });
  if (detailA.status !== 200) throw new Error('Creator A cannot retrieve own evidence.');
  const adminList = await fetch(base + '/api/evidence', { headers: { Cookie: admin.cookie } });
  const adminBody = await adminList.json();
  if (!adminList.ok || !adminBody.evidence.some((item) => item.id === evidenceId)) throw new Error('Admin reviewer access to evidence failed.');
  console.log('PASS: creator ownership isolation; foreign list, detail and download blocked; owner and admin access retained.');
} finally {
  if (storagePath && fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
  if (evidenceId) {
    db.prepare('DELETE FROM evidence_documents WHERE id = ?').run(evidenceId);
    db.prepare('DELETE FROM audit_trail WHERE details_json LIKE ?').run('%' + evidenceId + '%');
  }
  if (userId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
  db.close();
  console.log('PASS: temporary ownership-test user, evidence and audit rows cleaned.');
}
