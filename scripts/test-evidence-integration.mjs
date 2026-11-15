import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.test.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const base = process.env.VERIBRAND_URL || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let evidenceId = null;
let evidenceFilePath = null;
const evidenceDir = path.join(root, 'data', 'evidence');
const existingEvidenceFiles = new Set(fs.readdirSync(evidenceDir));
let passed = false;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(env.VERIBRAND_TEST_REVIEWER_EMAIL);
  await page.getByLabel(/password/i).fill(env.VERIBRAND_TEST_REVIEWER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('textbox', { name: 'Content Draft Editor' }).waitFor();

  const initial = await page.evaluate(async () => {
    const [e, s] = await Promise.all([fetch('/api/evidence'), fetch('/api/submissions')]);
    return { evidence: await e.json(), submissions: await s.json(), evidenceStatus: e.status, submissionsStatus: s.status };
  });
  if (initial.evidenceStatus !== 200 || initial.submissionsStatus !== 200) throw new Error('Authenticated list endpoints failed.');
  if (initial.evidence.evidence.some((item) => !item.id || Object.hasOwn(item, 'storagePath'))) throw new Error('Evidence list omitted ID or exposed a filesystem path.');
  const submission = initial.submissions.submissions.find((item) => item.currentRevisionId);
  if (!submission) throw new Error('No revisioned submission available to test evidence association.');

  const result = await page.evaluate(async ({ submissionId, revisionId }) => {
    const body = new FormData();
    body.set('file', new File(['VeriBrand temporary integration fixture; not genuine compliance evidence.'], 'integration-fixture.txt', { type: 'text/plain' }));
    body.set('metricId', 'MTR-001');
    body.set('sectionCitation', 'Automated integration test fixture');
    body.set('submissionId', submissionId);
    body.set('revisionId', revisionId);
    const upload = await fetch('/api/evidence', { method: 'POST', body });
    const uploaded = await upload.json();
    if (!upload.ok) throw new Error('Upload failed: ' + upload.status + ' ' + uploaded.error);
    const id = uploaded.evidence.id;
    const detailResponse = await fetch('/api/evidence/' + encodeURIComponent(id));
    const detail = await detailResponse.json();
    if (!detailResponse.ok || Object.hasOwn(detail.evidence, 'storagePath')) throw new Error('Evidence detail endpoint leaked storage path or failed.');
    if (detail.evidence.submissionId !== submissionId || detail.evidence.revisionId !== revisionId) throw new Error('Evidence was not linked to selected submission revision.');
    const download = await fetch('/api/evidence/' + encodeURIComponent(id) + '?download=1');
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (!download.ok) throw new Error('Download failed: ' + download.status);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (digest !== detail.evidence.sha256Checksum) throw new Error('Downloaded bytes did not match stored SHA-256 checksum.');
    const review = await fetch('/api/evidence/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'verified', approvedValue: '42%', notes: 'Temporary automated integration test only; cleanup follows.' }) });
    if (!review.ok) throw new Error('Reviewer status update failed: ' + review.status);
    const verifiedAudit = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '42% enterprise retention', channel: 'enterprise_web' }) });
    const verifiedResult = await verifiedAudit.json();
    if (!verifiedAudit.ok || !verifiedResult.findings.some((finding) => finding.category === 'claim_verification' && finding.verdict === 'VERIFIED' && finding.evidence?.approvedValue === '42%')) throw new Error('Reviewer-approved evidence did not produce a VERIFIED claim.');
    const mismatchAudit = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '43% enterprise retention', channel: 'enterprise_web' }) });
    const mismatchResult = await mismatchAudit.json();
    if (!mismatchAudit.ok || !mismatchResult.findings.some((finding) => finding.category === 'claim_verification' && finding.verdict === 'CONFLICT')) throw new Error('Mismatched claim was not classified as CONFLICT.');
    return { id, checksum: digest, linked: detail.evidence.submissionId === submissionId, downloadedBytes: bytes.length, evidenceGrounding: true, mismatchBlocked: true };
  }, { submissionId: submission.id, revisionId: submission.currentRevisionId });

  evidenceId = result.id;
  evidenceFilePath = fs.readdirSync(evidenceDir).filter((name) => !existingEvidenceFiles.has(name)).map((name) => path.join(evidenceDir, name))[0] || null;
  console.log('PASS: authenticated evidence upload, stable ID, submission/revision association, path-redacted metadata, checksum-verified download, reviewer status update.');
  console.log('Evidence integration details:', JSON.stringify({ linked: result.linked, downloadedBytes: result.downloadedBytes, checksumLength: result.checksum.length }));
  passed = true;
  await context.close();
} finally {
  await browser.close();
  if (evidenceFilePath && fs.existsSync(evidenceFilePath)) fs.unlinkSync(evidenceFilePath);
  if (evidenceId) {
    const db = new DatabaseSync(path.join(root, 'data', 'veribrand.db'));
    const row = db.prepare('SELECT storage_path FROM evidence_documents WHERE id = ?').get(evidenceId);
    const storedPath = row?.storage_path?.startsWith('/app/data/') ? path.join(root, 'data', row.storage_path.slice('/app/data/'.length).replaceAll('/', path.sep)) : row?.storage_path;
    if (storedPath && fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    db.prepare('DELETE FROM evidence_documents WHERE id = ?').run(evidenceId);
    db.prepare("DELETE FROM audit_trail WHERE details_json LIKE ?").run('%' + evidenceId + '%');
    db.close();
    console.log('PASS: temporary evidence fixture and its audit rows cleaned from local test database.');
  }
}
if (!passed) process.exitCode = 1;
