// scripts/test-multi-tenant-security.mjs
// VeriBrand AI — Multi-Tenant Security & Enterprise Regression Test Suite
import assert from 'node:assert/strict';
import {
  getDatabase,
  getOrganizationById,
  getOrganizationsForUser,
  createSession,
  getSession,
  createSubmission,
  getSubmissionById,
  getAllSubmissions,
  addEvidenceDocument,
  getEvidenceById,
  getAllEvidence,
  addEvidenceCandidateFact,
  getEvidenceCandidateFacts,
  reviewEvidenceCandidateFact,
  createCustomBrandRule,
  updateCustomBrandRule,
  archiveBrandRule,
  getBrandRuleById,
  getCustomBrandRules,
  getBrandRuleVersions,
  addBrandAsset,
  getBrandAssets,
  getOrganizationAnalytics,
} from '../src/lib/db/database.ts';

console.log('================================================================');
console.log('VERIBRAND AI — MULTI-TENANT ENTERPRISE SECURITY & ISOLATION TESTS');
console.log('================================================================');

const db = getDatabase();

function runTest(name, fn) {
  try {
    process.stdout.write(`Testing: ${name}... `);
    fn();
    console.log('PASS');
    return true;
  } catch (err) {
    console.log('FAIL');
    console.error(err);
    return false;
  }
}

async function runAsyncTest(name, fn) {
  try {
    process.stdout.write(`Testing: ${name}... `);
    await fn();
    console.log('PASS');
    return true;
  } catch (err) {
    console.log('FAIL');
    console.error(err);
    return false;
  }
}

let passed = 0;
let total = 0;

// Setup test tenants and users in the database
const testOrgAId = 'ORG-TEST-ACME';
const testOrgBId = 'ORG-TEST-BETA';

const userAOwner = 'USR-A-OWNER';
const userACreator = 'USR-A-CREATOR';
const userAReviewer = 'USR-A-REVIEWER';

const userBOwner = 'USR-B-OWNER';
const userBCreator = 'USR-B-CREATOR';

// Clean previous test data
db.prepare('DELETE FROM brand_rule_versions WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM brand_rules WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM brand_assets WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM evidence_candidate_facts WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM evidence_documents WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM submission_revisions WHERE submission_id IN (SELECT id FROM submissions WHERE organization_id IN (?, ?));').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM appeal_decisions WHERE submission_id IN (SELECT id FROM submissions WHERE organization_id IN (?, ?));').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM comments WHERE submission_id IN (SELECT id FROM submissions WHERE organization_id IN (?, ?));').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM submissions WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM organization_memberships WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM organization_invitations WHERE organization_id IN (?, ?);').run(testOrgAId, testOrgBId);
db.prepare('DELETE FROM sessions WHERE user_id IN (?, ?, ?, ?, ?);').run(userAOwner, userACreator, userAReviewer, userBOwner, userBCreator);
db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?);').run(userAOwner, userACreator, userAReviewer, userBOwner, userBCreator);
db.prepare('DELETE FROM organizations WHERE id IN (?, ?);').run(testOrgAId, testOrgBId);

// 1. Create Organizations
const now = new Date().toISOString();
db.prepare('INSERT INTO organizations (id, name, slug, brand_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run(testOrgAId, 'Acme Corp', 'acme-corp', 'Acme Brand', now, now);
db.prepare('INSERT INTO organizations (id, name, slug, brand_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run(testOrgBId, 'Beta Labs', 'beta-labs', 'Beta Brand', now, now);

// 2. Create Users
const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';
db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);').run(userAOwner, 'owner@acme.com', 'Alice Owner', 'creator', dummyHash, now);
db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);').run(userACreator, 'creator@acme.com', 'Charlie Creator', 'creator', dummyHash, now);
db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);').run(userAReviewer, 'reviewer@acme.com', 'Rachel Reviewer', 'reviewer', dummyHash, now);

db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);').run(userBOwner, 'owner@beta.com', 'Bob Owner', 'creator', dummyHash, now);
db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?);').run(userBCreator, 'creator@beta.com', 'Brian Creator', 'creator', dummyHash, now);

// 3. Assign Memberships
db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run('MEM-1', testOrgAId, userAOwner, 'owner', now, now);
db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run('MEM-2', testOrgAId, userACreator, 'creator', now, now);
db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run('MEM-3', testOrgAId, userAReviewer, 'reviewer', now, now);

db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run('MEM-4', testOrgBId, userBOwner, 'owner', now, now);
db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);').run('MEM-5', testOrgBId, userBCreator, 'creator', now, now);

// -------------------------------------------------------------
// TEST SUITE
// -------------------------------------------------------------

// TEST 1: Tenant Retrieval & Membership Verification
total++;
if (runTest('1. Tenant lookup and user membership bindings', () => {
  const orgA = getOrganizationById(testOrgAId);
  assert.equal(orgA.name, 'Acme Corp');
  assert.equal(orgA.slug, 'acme-corp');

  const userAOrgs = getOrganizationsForUser(userACreator);
  assert.equal(userAOrgs.length, 1);
  assert.equal(userAOrgs[0].id, testOrgAId);
  assert.equal(userAOrgs[0].role, 'creator');

  const userBOrgs = getOrganizationsForUser(userBCreator);
  assert.equal(userBOrgs.length, 1);
  assert.equal(userBOrgs[0].id, testOrgBId);
  assert.equal(userBOrgs[0].role, 'creator');
})) passed++;

// TEST 2: Submission Isolation across Tenants
let subAId = null;
total++;
if (runTest('2. Cross-tenant submission isolation (Org B cannot view Org A draft)', () => {
  const dummyAudit = {
    score: 95,
    verdict: 'compliant',
    summary: 'Test audit result',
    stats: { totalFindings: 0, criticalCount: 0, warningCount: 0, infoCount: 0, totalAuditedClaims: 1, verifiedClaims: 1, unverifiedClaims: 0, conflictClaims: 0, reviewRequiredClaims: 0 },
    findings: [],
    rulesTriggered: 0,
    timestamp: new Date().toISOString(),
  };

  const subA = createSubmission({
    title: 'Acme Q3 Press Release',
    channel: 'press',
    creatorId: userACreator,
    creatorName: 'Charlie Creator',
    text: 'Acme achieved $10M ARR in 2024.',
    auditResult: dummyAudit,
    organizationId: testOrgAId,
  });
  subAId = subA.id;
  assert.ok(subAId);

  // Fetch with Org A context -> Success
  const fetchedByOrgA = getSubmissionById(subAId, testOrgAId);
  assert.ok(fetchedByOrgA);
  assert.equal(fetchedByOrgA.title, 'Acme Q3 Press Release');

  // Fetch with Org B context -> NULL (Isolation enforced)
  const fetchedByOrgB = getSubmissionById(subAId, testOrgBId);
  assert.equal(fetchedByOrgB, null, 'Tenant B must NOT be able to retrieve Tenant A submission by ID');

  // Query all submissions for Org B -> Must not include subAId
  const allSubmissionsB = getAllSubmissions(testOrgBId);
  const foundInB = allSubmissionsB.some(s => s.id === subAId);
  assert.equal(foundInB, false, 'Tenant B submission list must NOT contain Tenant A submissions');
})) passed++;

// TEST 3: Evidence Document Isolation & Provenance Tracking
let evAId = null;
total++;
if (runTest('3. Evidence isolation & cryptographic provenance states', () => {
  const evA = addEvidenceDocument({
    metricId: 'financial-arr',
    documentName: 'Acme Annual Report 2024.pdf',
    sectionCitation: 'Section 4, Page 12',
    mimeType: 'application/pdf',
    fileSizeBytes: 2048576,
    sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'uploaded',
    provenanceState: 'uploaded',
    storagePath: 'storage/evidence/ORG-TEST-ACME/test.pdf',
    sourceUrl: 'https://investors.acme.com/financials/2024.pdf',
    uploadedBy: 'Charlie Creator',
    organizationId: testOrgAId,
  });
  evAId = evA.id;
  assert.ok(evAId);

  // Tenant A fetch -> Success
  const fetchedEvA = getEvidenceById(evAId, testOrgAId);
  assert.ok(fetchedEvA);
  assert.equal(fetchedEvA.documentName, 'Acme Annual Report 2024.pdf');
  assert.equal(fetchedEvA.provenanceState, 'uploaded');

  // Tenant B fetch -> NULL
  const fetchedByB = getEvidenceById(evAId, testOrgBId);
  assert.equal(fetchedByB, null, 'Tenant B must NOT access Tenant A evidence documents');

  // Tenant B list -> Empty
  const listB = getAllEvidence(testOrgBId);
  assert.equal(listB.some(e => e.id === evAId), false, 'Tenant B evidence list must be isolated');
})) passed++;

// TEST 4: Candidate Facts Extraction & Human Reviewer Gate
let factId = null;
total++;
if (runTest('4. Candidate facts extraction and human reviewer gate', () => {
  const fact = addEvidenceCandidateFact({
    evidenceId: evAId,
    organizationId: testOrgAId,
    extractedClaim: 'Annual recurring revenue reached $10M in FY2024',
    claimType: 'financial_arr',
    extractedValue: '10000000',
    unit: 'USD',
    textExcerpt: '...and our ARR grew to surpass $10M in fiscal year 2024...',
    pageNumber: 12,
    confidence: 0.985,
    extractionMethod: 'pdf_text',
  });
  factId = fact.id;
  assert.ok(factId);
  assert.equal(fact.status, 'unverified', 'Candidate facts must default to unverified');

  // Fetch candidate facts for Org A
  const factsA = getEvidenceCandidateFacts(evAId, testOrgAId);
  assert.equal(factsA.length, 1);
  assert.equal(factsA[0].id, factId);

  // Org B attempt to fetch Org A candidate facts -> Empty
  const factsB = getEvidenceCandidateFacts(evAId, testOrgBId);
  assert.equal(factsB.length, 0, 'Candidate facts must not leak across tenants');

  // Reviewer approves the candidate fact
  const reviewed = reviewEvidenceCandidateFact({
    factId,
    orgId: testOrgAId,
    status: 'approved',
    reviewerId: userAReviewer,
    reviewNotes: 'Audited against 10-K filing',
  });
  assert.equal(reviewed, true);

  // Evidence document should now be verified
  const updatedEv = getEvidenceById(evAId, testOrgAId);
  assert.equal(updatedEv.status, 'active');
  assert.equal(updatedEv.provenanceState, 'verified');
})) passed++;

// TEST 5: Brand Vault Custom Rules & Versioning Isolation
let ruleAId = null;
total++;
if (runTest('5. Custom brand rule versioning, lifecycle, and tenant isolation', () => {
  const createdRule = createCustomBrandRule({
    organizationId: testOrgAId,
    title: 'Acme Proprietary Tone Rule',
    description: 'Never call our product a "tool", always "platform"',
    category: 'terminology',
    severity: 'error',
    forbiddenPatterns: ['simple tool', 'basic utility', 'cheap solution'],
    approvedAlternative: 'enterprise intelligence platform',
    citation: 'Brand Guide Section 2.1',
    authorityLevel: 2,
    createdBy: userAOwner,
  });
  ruleAId = createdRule.id;
  assert.ok(ruleAId);
  assert.equal(createdRule.version, 1);
  assert.equal(createdRule.status, 'active');

  // Fetch in Org A
  const ruleInA = getBrandRuleById(ruleAId, testOrgAId);
  assert.ok(ruleInA);
  assert.equal(ruleInA.title, 'Acme Proprietary Tone Rule');

  // Attempt fetch in Org B -> null
  const ruleInB = getBrandRuleById(ruleAId, testOrgBId);
  assert.equal(ruleInB, null, 'Tenant B must NOT access Tenant A custom brand rules');

  // Org B rules list must not contain Org A rule
  const rulesListB = getCustomBrandRules(testOrgBId);
  assert.equal(rulesListB.some(r => r.id === ruleAId), false);

  // Update rule in Org A -> bumps to version 2
  const updatedRule = updateCustomBrandRule({
    id: ruleAId,
    organizationId: testOrgAId,
    title: 'Acme Proprietary Tone Rule v2',
    forbiddenPatterns: ['simple tool', 'basic utility', 'cheap solution', 'entry level'],
    approvedAlternative: 'enterprise platform',
    updatedBy: userAOwner,
    changeRationale: 'Added "entry level" to forbidden terms',
  });
  assert.equal(updatedRule.version, 2);

  // Check version audit trail in brand_rule_versions (ordered descending)
  const versions = getBrandRuleVersions(ruleAId, testOrgAId);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, 2);
  assert.equal(versions[1].version, 1);

  // Archive rule
  const archived = archiveBrandRule(ruleAId, testOrgAId, userAOwner);
  assert.equal(archived, true);
  const archivedRule = getBrandRuleById(ruleAId, testOrgAId);
  assert.equal(archivedRule.status, 'archived');
})) passed++;

// TEST 6: Visual Brand Compliance Assets Isolation
total++;
if (runTest('6. Visual compliance asset management & tenant isolation', () => {
  const assetA = addBrandAsset({
    organizationId: testOrgAId,
    name: 'Primary Logo Vector',
    assetType: 'logo_primary',
    mimeType: 'image/svg+xml',
    fileSizeBytes: 45200,
    sha256Checksum: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
    storagePath: 'storage/assets/ORG-TEST-ACME/logo.svg',
    width: 800,
    height: 200,
    aspectRatio: '4:1',
    metadata: {
      primaryColorHex: '#4F46E5',
      paletteColors: ['#4F46E5', '#0F172A', '#F8FAFC'],
    },
    uploadedBy: userAOwner,
  });
  assert.ok(assetA.id);

  const assetsA = getBrandAssets(testOrgAId);
  assert.equal(assetsA.length, 1);
  assert.equal(assetsA[0].name, 'Primary Logo Vector');

  // Tenant B assets must be empty
  const assetsB = getBrandAssets(testOrgBId);
  assert.equal(assetsB.length, 0, 'Tenant B must not see Tenant A brand assets');
})) passed++;

// TEST 7: Real Derived Organization Analytics
total++;
if (runTest('7. Real derived analytics computation (Zero synthetic / hardcoded values)', () => {
  const analyticsA = getOrganizationAnalytics(testOrgAId);
  assert.equal(analyticsA.organizationId, testOrgAId);
  assert.equal(analyticsA.totalSubmissions, 1);
  assert.equal(analyticsA.evidenceActiveCount, 1);
  assert.equal(analyticsA.claimsByVerdict.VERIFIED, 1);

  // Org B analytics must be 0
  const analyticsB = getOrganizationAnalytics(testOrgBId);
  assert.equal(analyticsB.organizationId, testOrgBId);
  assert.equal(analyticsB.totalSubmissions, 0);
  assert.equal(analyticsB.evidenceActiveCount, 0);
})) passed++;

// TEST 8: Session & Tenant Switching Context
total++;
if (runTest('8. Session creation with active tenant scoping', () => {
  const session = createSession(userACreator, testOrgAId, 3600);
  assert.ok(session);
  assert.ok(session.token);

  const retrieved = getSession(session.token);
  assert.ok(retrieved);
  assert.equal(retrieved.user.id, userACreator);
  assert.equal(retrieved.activeOrganizationId, testOrgAId);
})) passed++;

// -------------------------------------------------------------
// HTTP API LEVEL TESTS (Against live http://localhost:3000)
// -------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

const testEnvPath = path.resolve(process.cwd(), '.env.test.local');
const envLines = fs.readFileSync(testEnvPath, 'utf-8').split('\n');
const creds = {};
for (const line of envLines) {
  if (line.includes('=') && !line.startsWith('#')) {
    const idx = line.indexOf('=');
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    creds[k] = v;
  }
}

const BASE_URL = process.env.VERIBRAND_URL || 'http://localhost:3000';

async function httpLogin(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const rawCookie = res.headers.get('set-cookie') || '';
  const match = rawCookie.match(/veribrand_session=([^;]+)/);
  const cookie = match ? `veribrand_session=${match[1]}` : '';
  const token = match ? match[1] : '';
  return { status: res.status, data, cookie, token };
}

// Log in via HTTP
const creatorSession = await httpLogin(creds.VERIBRAND_TEST_CREATOR_EMAIL, creds.VERIBRAND_TEST_CREATOR_PASSWORD);
const reviewerSession = await httpLogin(creds.VERIBRAND_TEST_REVIEWER_EMAIL, creds.VERIBRAND_TEST_REVIEWER_PASSWORD);
const adminSession = await httpLogin(creds.VERIBRAND_TEST_ADMIN_EMAIL, creds.VERIBRAND_TEST_ADMIN_PASSWORD);

// TEST 9: Health endpoint
total++;
if (await runAsyncTest('9. HTTP GET /api/health -> 200 ok', async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.database, 'reachable');
})) passed++;

// TEST 10: Authenticated user context & active organization
total++;
if (await runAsyncTest('10. HTTP GET /api/auth/me returns tenant context', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Cookie': creatorSession.cookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.activeRole, 'creator');
  assert.ok(data.activeOrganizationId);
})) passed++;

// Create an HTTP submission as Creator
let httpSubId = null;
total++;
if (await runAsyncTest('11. HTTP Creator draft submission in active tenant', async () => {
  const res = await fetch(`${BASE_URL}/api/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': creatorSession.cookie,
    },
    body: JSON.stringify({
      title: 'HTTP Creator Draft Campaign',
      channel: 'marketing_email',
      text: 'Our platform delivers 99.9% uptime and $5M ARR with industry leading capabilities.',
    }),
  });
  assert.ok(res.status === 200 || res.status === 201, `Expected status 200 or 201, got ${res.status}`);
  const data = await res.json();
  assert.ok(data.submission);
  assert.ok(data.submission.id);
  httpSubId = data.submission.id;
})) passed++;

// TEST 12: Role enforcement: Creator cannot approve their own submission
total++;
if (await runAsyncTest('12. HTTP RBAC submission review gate (Creator cannot review -> 403 Forbidden)', async () => {
  const res = await fetch(`${BASE_URL}/api/submissions/${httpSubId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': creatorSession.cookie,
    },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(res.status, 403, 'Creator reviewing submission MUST be rejected with 403 Forbidden');
})) passed++;

// TEST 13: Reviewer can request changes on submission
total++;
if (await runAsyncTest('13. HTTP Reviewer request changes workflow', async () => {
  const res = await fetch(`${BASE_URL}/api/submissions/${httpSubId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': reviewerSession.cookie,
    },
    body: JSON.stringify({
      action: 'request_changes',
      commentText: 'Please clarify uptime SLAs and provide certified evidence for ARR.',
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.submission.status, 'changes_requested');
})) passed++;

// TEST 14: Cross-tenant isolation via header: creator denied access to non-member org
total++;
if (await runAsyncTest('14. HTTP Tenant isolation: Access denied to foreign organization header', async () => {
  const res = await fetch(`${BASE_URL}/api/submissions`, {
    headers: {
      'Cookie': creatorSession.cookie,
      'x-organization-id': 'ORG-FOREIGN-TEST',
    },
  });
  assert.equal(res.status, 403, 'Foreign organization header MUST return 403 Access Denied');
})) passed++;

// TEST 15: SSRF protection on provenance reachability probe
total++;
if (await runAsyncTest('15. HTTP Provenance URL SSRF protection (Blocks 127.0.0.1, localhost, AWS metadata)', async () => {
  // First, get or create an evidence document in the creator's organization
  const evRes = await fetch(`${BASE_URL}/api/evidence`, {
    headers: { 'Cookie': creatorSession.cookie },
  });
  const evData = await evRes.json();
  const testEvId = evData.evidence?.[0]?.id || evAId;

  const targets = [
    'http://127.0.0.1:8000',
    'http://localhost:3000/api/health',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1/admin',
  ];

  for (const url of targets) {
    const res = await fetch(`${BASE_URL}/api/evidence/${testEvId}/provenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSession.cookie,
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    assert.equal(res.status, 400, `SSRF target ${url} must return 400 Bad Request`);
    assert.equal(data.ok, false);
    assert.match(data.error, /blocked|security|loopback/i);
  }
})) passed++;

// TEST 16: Visual Brand Compliance Inspection API (Multipart Upload & Metadata-Only Rejection)
total++;
if (await runAsyncTest('16. HTTP Visual Brand Compliance Inspection (Aspect ratio, dimensions, contrast)', async () => {
  // A. Metadata-only JSON must be rejected with HTTP 415
  const jsonRejectRes = await fetch(`${BASE_URL}/api/vision/inspect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': creatorSession.cookie,
    },
    body: JSON.stringify({ assetType: 'marketing_image', width: 1200, height: 630 }),
  });
  assert.equal(jsonRejectRes.status, 415, 'Metadata-only JSON must be rejected with 415');

  // B. Real image upload via multipart/form-data must be accepted (200 OK)
  const testImagePath = path.resolve('docs', 'screenshots', '01-login-desktop.png');
  const imageBuffer = fs.existsSync(testImagePath)
    ? fs.readFileSync(testImagePath)
    : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer], { type: 'image/png' }), 'test-banner.png');
  formData.append('assetType', 'marketing_image');

  const res = await fetch(`${BASE_URL}/api/vision/inspect`, {
    method: 'POST',
    headers: {
      'Cookie': creatorSession.cookie,
    },
    body: formData,
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.findings));
  assert.ok(typeof data.width === 'number' && data.width > 0);
  assert.ok(typeof data.height === 'number' && data.height > 0);
  assert.ok(typeof data.computedAspectRatio === 'string');
  assert.equal(data.requiresHumanReview, true);
})) passed++;

// TEST 17: Organization Analytics API
total++;
if (await runAsyncTest('17. HTTP Organization Analytics API returns real derived metrics', async () => {
  const res = await fetch(`${BASE_URL}/api/analytics/overview`, {
    headers: { 'Cookie': creatorSession.cookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.analytics);
  assert.ok(typeof data.analytics.totalSubmissions === 'number');
  assert.ok(typeof data.analytics.appealResolutionRate === 'number');
})) passed++;

console.log('----------------------------------------------------------------');
console.log(`TOTAL TEST SUMMARY: ${passed}/${total} PASSED`);
console.log('----------------------------------------------------------------');

if (passed !== total) {
  process.exit(1);
}
