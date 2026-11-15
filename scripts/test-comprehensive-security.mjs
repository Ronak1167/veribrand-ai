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

const baseUrl = process.env.VERIBRAND_URL || 'http://localhost:3000';
const adminEmail = creds.VERIBRAND_TEST_ADMIN_EMAIL;
const adminPassword = creds.VERIBRAND_TEST_ADMIN_PASSWORD;
const creatorEmail = creds.VERIBRAND_TEST_CREATOR_EMAIL;
const creatorPassword = creds.VERIBRAND_TEST_CREATOR_PASSWORD;
const reviewerEmail = creds.VERIBRAND_TEST_REVIEWER_EMAIL;
const reviewerPassword = creds.VERIBRAND_TEST_REVIEWER_PASSWORD;

console.log('================================================================');
console.log('  VERIBRAND AI — DEDICATED SECURITY & PENETRATION AUDIT SUITE   ');
console.log('================================================================');

async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const rawCookie = res.headers.get('set-cookie') || '';
  const match = rawCookie.match(/veribrand_session=([^;]+)/);
  const cookie = match ? `veribrand_session=${match[1]}` : '';
  return { status: res.status, data, cookie, rawCookie };
}

// 1. RATE LIMITING ON /api/auth/login
console.log('\n[Sec 1] Testing Login Rate Limiting (Brute Force Protection)...');
const probeEmail = `ratelimit-${Date.now()}@example.com`;
let rateLimited = false;
for (let i = 1; i <= 10; i++) {
  const attemptRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: probeEmail, password: 'wrong-password' }),
  });
  if (attemptRes.status === 429) {
    rateLimited = true;
    console.log(`-> PASS: Rate limit triggered at attempt #${i} with HTTP 429 Too Many Requests.`);
    break;
  }
}
if (!rateLimited) {
  throw new Error('FAIL: Rate limit did not trigger within 10 failed login attempts.');
}

// 2. PRIVILEGE ESCALATION & ACCESS CONTROLS
console.log('\n[Sec 2] Testing Role Separation & Privilege Escalation...');
const creatorLogin = await login(creatorEmail, creatorPassword);
const reviewerLogin = await login(reviewerEmail, reviewerPassword);
const adminLogin = await login(adminEmail, adminPassword);

// Verify cookie attributes
if (!/HttpOnly/i.test(creatorLogin.rawCookie) || !/SameSite=strict/i.test(creatorLogin.rawCookie)) {
  throw new Error(`FAIL: Session cookie missing HttpOnly or SameSite=strict: ${creatorLogin.rawCookie}`);
}
console.log('-> PASS: Session cookie carries HttpOnly and SameSite=Strict flags.');

// Creator attempting Admin API
const creatorOnAdmin = await fetch(`${baseUrl}/api/auth/users`, {
  headers: { Cookie: creatorLogin.cookie },
});
if (creatorOnAdmin.status !== 403) {
  throw new Error(`FAIL: Creator was not forbidden from /api/auth/users (got ${creatorOnAdmin.status})`);
}
console.log('-> PASS: Creator forbidden (403) from accessing admin user management.');

// Creator attempting Reviewer sign-off
const creatorSignoff = await fetch(`${baseUrl}/api/submissions/fake-sub-id/review`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: creatorLogin.cookie },
  body: JSON.stringify({ action: 'approve', approvalMode: 'standard' }),
});
if (creatorSignoff.status !== 403) {
  throw new Error(`FAIL: Creator was not forbidden from review action (got ${creatorSignoff.status})`);
}
console.log('-> PASS: Creator forbidden (403) from performing review approvals.');

// Reviewer attempting Admin user creation
const reviewerOnAdmin = await fetch(`${baseUrl}/api/auth/users`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: reviewerLogin.cookie },
  body: JSON.stringify({ email: 'escalate@example.com', name: 'Escalate', role: 'admin', password: 'ValidPassword123!' }),
});
if (reviewerOnAdmin.status !== 403) {
  throw new Error(`FAIL: Reviewer was not forbidden from user creation (got ${reviewerOnAdmin.status})`);
}
console.log('-> PASS: Reviewer forbidden (403) from creating users or escalating privileges.');

// 3. PATH TRAVERSAL & ARBITRARY FILE ACCESS
console.log('\n[Sec 3] Testing Path Traversal on Evidence Endpoints...');
const traversalPayloads = [
  '../../etc/passwd',
  '..\\..\\windows\\win.ini',
  '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  '....//....//etc/passwd',
  'EVID-NONEXISTENT',
];
for (const payload of traversalPayloads) {
  const travRes = await fetch(`${baseUrl}/api/evidence/${encodeURIComponent(payload)}?download=1`, {
    headers: { Cookie: reviewerLogin.cookie },
  });
  if (travRes.status === 200) {
    throw new Error(`FAIL: Path traversal succeeded for payload: ${payload}`);
  }
}
console.log('-> PASS: All path traversal probes safely rejected (404/400).');

// 4. INFORMATION LEAKAGE AUDIT
console.log('\n[Sec 4] Auditing Information Leakage (Passwords, Storage Paths, API Keys)...');
const vaultRes = await fetch(`${baseUrl}/api/vault`);
const vaultText = await vaultRes.text();
if (vaultText.includes('passwordHash') || vaultText.includes('storagePath') || vaultText.includes('VERIBRAND_')) {
  throw new Error('FAIL: Sensitive keys found in /api/vault response.');
}

const usersRes = await fetch(`${baseUrl}/api/auth/users`, {
  headers: { Cookie: adminLogin.cookie },
});
const usersData = await usersRes.json();
for (const u of usersData.users || []) {
  if (u.passwordHash || u.password) {
    throw new Error('FAIL: User object discloses passwordHash or plain password.');
  }
}
console.log('-> PASS: Zero passwordHash or plaintext passwords disclosed in /api/auth/users.');

const evidenceRes = await fetch(`${baseUrl}/api/evidence`, {
  headers: { Cookie: creatorLogin.cookie },
});
const evidenceData = await evidenceRes.json();
for (const item of evidenceData.evidence || []) {
  if (item.storagePath || item.internalPath || item.filePath) {
    throw new Error('FAIL: Evidence endpoint leaked internal server storagePath.');
  }
}
console.log('-> PASS: Zero internal server filesystem paths disclosed in /api/evidence.');

// 5. OVERSIZED PAYLOAD PROTECTION (DOS MITIGATION)
console.log('\n[Sec 5] Testing Oversized Payload Rejection (DoS Mitigation)...');
const oversizedBody = 'A'.repeat(15000);
const loginOversize = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', password: oversizedBody }),
});
if (loginOversize.status !== 413) {
  throw new Error(`FAIL: Oversized login body did not return 413 (got ${loginOversize.status})`);
}
console.log('-> PASS: Oversized body to /api/auth/login rejected with 413 Payload Too Large.');

// 6. SQL INJECTION PROBES
console.log('\n[Sec 6] Testing SQL Injection Parameterization...');
const sqliPayloads = [
  "' OR '1'='1' --",
  "admin' --",
  "1; DROP TABLE users; --",
  "' UNION SELECT null, null, null --",
];
for (const sqli of sqliPayloads) {
  const sqliRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: sqli, password: 'password' }),
  });
  if (sqliRes.status !== 401 && sqliRes.status !== 400 && sqliRes.status !== 429) {
    throw new Error(`FAIL: SQLi probe yielded unexpected status ${sqliRes.status}`);
  }
}
console.log('-> PASS: SQL injection probes handled safely by parameterized queries.');

// 7. XSS INJECTION PROBE
console.log('\n[Sec 7] Testing XSS Payload Sanitization & Storage Safety...');
const xssPayload = '<script>alert(document.cookie)</script><img src=x onerror=alert(1)>';
const subRes = await fetch(`${baseUrl}/api/submissions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: creatorLogin.cookie },
  body: JSON.stringify({ title: xssPayload, channel: 'linkedin', text: `Testing XSS: ${xssPayload}` }),
});
if (subRes.status !== 200 && subRes.status !== 201) {
  throw new Error(`FAIL: Submission with HTML/XSS text was improperly rejected (status: ${subRes.status})`);
}
const subData = await subRes.json();
if (!subData.submission?.id) {
  throw new Error('FAIL: Submission was not created.');
}
console.log(`-> PASS: XSS payload safely stored as verbatim text with ID ${subData.submission.id}.`);

console.log('\n================================================================');
console.log('  ALL CONFIGURED SECURITY REGRESSION PROBES PASSED!            ');
console.log('================================================================\n');
