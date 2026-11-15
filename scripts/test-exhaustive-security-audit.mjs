#!/usr/bin/env node
// VeriBrand AI — Exhaustive Enterprise Security & Multi-Tenant Authorization Audit Matrix
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const baseUrl = process.env.TEST_APP_URL || process.env.VERIBRAND_BASE_URL || process.env.VERIBRAND_URL || 'http://localhost:3000';

console.log('='.repeat(80));
console.log('  VERIBRAND AI — EXHAUSTIVE TENANT SECURITY & AUTHORIZATION AUDIT MATRIX');
console.log('='.repeat(80));
console.log(`Target: ${baseUrl}`);

// Load test credentials from .env.test.local
function loadEnvCredentials() {
  const envPath = path.resolve(process.cwd(), '.env.test.local');
  const creds = {
    adminEmail: 'admin.local@veribrand.test',
    adminPass: 'Vb!71c18b763c20360bae264d1f9#X',
    creatorEmail: 'creator.test@veribrand.test',
    creatorPass: 'Vb!5fef6fbc7519b8fbc37b7b279#X',
    reviewerEmail: 'reviewer.test@veribrand.test',
    reviewerPass: 'Vb!ca78501dc31e5893e83057489#X',
  };

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]+)"|'([^']+)'|([^\s#]+))/);
      if (match) {
        const key = match[1];
        const val = match[2] || match[3] || match[4];
        if (key === 'VERIBRAND_TEST_ADMIN_EMAIL') creds.adminEmail = val;
        if (key === 'VERIBRAND_TEST_ADMIN_PASSWORD') creds.adminPass = val;
        if (key === 'VERIBRAND_TEST_CREATOR_EMAIL') creds.creatorEmail = val;
        if (key === 'VERIBRAND_TEST_CREATOR_PASSWORD') creds.creatorPass = val;
        if (key === 'VERIBRAND_TEST_REVIEWER_EMAIL') creds.reviewerEmail = val;
        if (key === 'VERIBRAND_TEST_REVIEWER_PASSWORD') creds.reviewerPass = val;
      }
    }
  }
  return creds;
}

const creds = loadEnvCredentials();

// Log in via HTTP to obtain authenticated session cookies and Bearer tokens
async function httpLogin(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  const rawCookie = res.headers.get('set-cookie') || '';
  const match = rawCookie.match(/veribrand_session=([^;]+)/);
  const token = match ? match[1] : '';
  const cookie = match ? `veribrand_session=${match[1]}` : '';
  return { status: res.status, ok: res.ok, token, cookie, user: data.user, data };
}

async function api(pathUrl, session, method = 'GET', body = null, headers = {}) {
  const h = { ...headers };
  const token = typeof session === 'string' ? session : session?.token;
  const cookie = typeof session === 'object' && session?.cookie ? session.cookie : (token ? `veribrand_session=${token}` : null);

  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }
  if (cookie) {
    h['Cookie'] = cookie;
  }
  if (body && typeof body === 'object') {
    h['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function runAudit() {
  const salt = crypto.randomUUID().slice(0, 6);
  console.log(`\nInitializing Security Audit Personas (salt: ${salt})...`);

  // 1. Log in baseline personas
  const sAdmin = await httpLogin(creds.adminEmail, creds.adminPass);
  const sCreator = await httpLogin(creds.creatorEmail, creds.creatorPass);
  const sReviewer = await httpLogin(creds.reviewerEmail, creds.reviewerPass);

  if (!sAdmin.ok || !sCreator.ok || !sReviewer.ok) {
    console.error('Fatal: Failed to authenticate baseline personas.');
    process.exit(1);
  }
  console.log(`  ✓ Authenticated Admin (${creds.adminEmail})`);
  console.log(`  ✓ Authenticated Creator (${creds.creatorEmail})`);
  console.log(`  ✓ Authenticated Reviewer (${creds.reviewerEmail})`);

  // 2. Create isolated Attacker Persona via Admin API
  const attackerEmail = `attacker-${salt}@beta.test`;
  const attackerPass = 'AttackerPass2026!#$';
  const createAttackerRes = await api('/api/auth/users', sAdmin, 'POST', {
    email: attackerEmail,
    name: 'External Attacker',
    role: 'creator',
    password: attackerPass,
  });

  if (!createAttackerRes.ok) {
    console.error('Failed to provision attacker user:', createAttackerRes.json);
    process.exit(1);
  }
  const sAttacker = await httpLogin(attackerEmail, attackerPass);
  console.log(`  ✓ Provisioned & Authenticated Attacker (${attackerEmail})`);

  // 3. Create Target Tenant (Alpha) and Attacker Tenant (Beta)
  const orgAlphaRes = await api('/api/organizations', sAdmin, 'POST', {
    name: `Enterprise Alpha ${salt}`,
    slug: `alpha-${salt}`,
    brandName: `Alpha Brand ${salt}`,
  });
  const orgAlpha = orgAlphaRes.json.organization;

  const orgBetaRes = await api('/api/organizations', sAttacker, 'POST', {
    name: `Attacker Beta ${salt}`,
    slug: `beta-${salt}`,
    brandName: `Beta Brand ${salt}`,
  });
  const orgBeta = orgBetaRes.json.organization;

  // Switch attacker context to their own tenant (Beta)
  await api('/api/organizations/switch', sAttacker, 'POST', {
    organizationId: orgBeta.id,
  });

  // Switch admin context to Target Tenant (Alpha)
  await api('/api/organizations/switch', sAdmin, 'POST', {
    organizationId: orgAlpha.id,
  });

  // Add Creator and Reviewer to Org Alpha
  await api(`/api/organizations/${orgAlpha.id}/members`, sAdmin, 'POST', {
    email: creds.creatorEmail,
    role: 'creator',
  });
  await api(`/api/organizations/${orgAlpha.id}/members`, sAdmin, 'POST', {
    email: creds.reviewerEmail,
    role: 'reviewer',
  });

  // Switch Creator and Reviewer sessions to Org Alpha
  await api('/api/organizations/switch', sCreator, 'POST', { organizationId: orgAlpha.id });
  await api('/api/organizations/switch', sReviewer, 'POST', { organizationId: orgAlpha.id });

  // 4. Create protected resources in Org Alpha
  const subAlphaRes = await api('/api/submissions', sCreator, 'POST', {
    title: 'Alpha Secret Security Release Notes',
    channel: 'enterprise_web',
    text: 'Confidential enterprise verification content for Alpha.',
    auditResult: {
      documentId: `doc-${salt}`,
      channel: 'enterprise_web',
      complianceScore: 92,
      tier1LatencyMs: 4,
      tier2LatencyMs: 12,
      findings: [],
      metricsAuditedCount: 1,
      claimsVerifiedCount: 1,
      claimsConflictedCount: 0,
      claimsUnverifiedCount: 0,
      timestamp: new Date().toISOString(),
    },
  });
  const subAlpha = subAlphaRes.json.submission || subAlphaRes.json;

  const ruleAlphaRes = await api('/api/vault', sAdmin, 'POST', {
    category: 'terminology',
    title: 'Alpha Secret Codename',
    description: 'Alpha proprietary identifier rule',
    authorityLevel: 1,
    severity: 'critical',
    forbiddenPatterns: ['secret_codename_alpha'],
    approvedAlternative: 'Public Alpha Release',
    citation: 'Alpha Security Standard §1',
  });
  const ruleAlpha = ruleAlphaRes.json.rule || ruleAlphaRes.json;

  const results = [];
  function record(route, persona, expectedStatus, actualStatus, pass, attackType) {
    results.push({ route, persona, expectedStatus, actualStatus, pass, attackType });
    const sym = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${sym} [${persona.padEnd(14)}] ${route.padEnd(42)} Expected: ${expectedStatus} | Actual: ${actualStatus}`);
  }

  console.log('\n--- SECTION 1: UNAUTHENTICATED ACCESS ENFORCEMENT ---');
  const protectedRoutes = [
    ['/api/auth/me', 'GET'],
    ['/api/audit', 'GET'],
    ['/api/audit-trail', 'GET'],
    ['/api/analytics/overview', 'GET'],
    ['/api/submissions', 'GET'],
    ['/api/evidence', 'GET'],
    ['/api/vault', 'GET'],
    ['/api/organizations', 'GET'],
    [`/api/organizations/${orgAlpha.id}`, 'GET'],
  ];

  for (const [route, method] of protectedRoutes) {
    const res = await api(route, null, method);
    const pass = res.status === 401;
    record(route, 'Unauthenticated', 401, res.status, pass, 'Missing Auth Header');
  }

  console.log('\n--- SECTION 2: CROSS-TENANT IDOR ISOLATION ---');
  // Attacker from Org Beta tries to fetch Org Alpha's submission
  const idorSub = await api(`/api/submissions/${subAlpha.id}`, sAttacker);
  const passIdorSub = idorSub.status === 403 || idorSub.status === 404;
  record(`/api/submissions/[id]`, 'Cross-Tenant', '403/404', idorSub.status, passIdorSub, 'IDOR Submission Read');

  // Attacker from Org Beta tries to fetch Org Alpha's custom brand rule
  const idorRule = await api(`/api/vault/rules/${ruleAlpha.id}`, sAttacker);
  const passIdorRule = idorRule.status === 403 || idorRule.status === 404;
  record(`/api/vault/rules/[id]`, 'Cross-Tenant', '403/404', idorRule.status, passIdorRule, 'IDOR Rule Read');

  // Attacker from Org Beta tries to access Org Alpha's member directory
  const idorMembers = await api(`/api/organizations/${orgAlpha.id}/members`, sAttacker);
  const passIdorMem = idorMembers.status === 403;
  record(`/api/organizations/[id]/members`, 'Cross-Tenant', 403, idorMembers.status, passIdorMem, 'Tenant Directory Disclosure');

  console.log('\n--- SECTION 3: ROLE-BASED ACCESS CONTROL (RBAC) GATES ---');
  // Creator tries to review/approve a submission (Must be 403)
  const creatorReview = await api(`/api/submissions/${subAlpha.id}/review`, sCreator, 'POST', {
    status: 'approved',
    reviewNotes: 'Creator self-approval attempt',
  });
  const passCreatorReview = creatorReview.status === 403;
  record(`/api/submissions/[id]/review`, 'Creator', 403, creatorReview.status, passCreatorReview, 'Reviewer Privilege Bypass');

  // Reviewer approves submission (Must be 200)
  const reviewerReview = await api(`/api/submissions/${subAlpha.id}/review`, sReviewer, 'POST', {
    action: 'approve',
    reviewNotes: 'Legitimate reviewer sign-off',
    approvalMode: 'standard',
  });
  const passReviewerReview = reviewerReview.status === 200;
  record(`/api/submissions/[id]/review`, 'Reviewer', 200, reviewerReview.status, passReviewerReview, 'Legitimate Review Gate');

  // Creator tries to delete/manage an organization member (Must be 403)
  const creatorManage = await api(`/api/organizations/${orgAlpha.id}/members`, sCreator, 'POST', {
    email: 'newuser@alpha.test',
    role: 'creator',
  });
  const passCreatorManage = creatorManage.status === 403;
  record(`/api/organizations/[id]/members`, 'Creator', 403, creatorManage.status, passCreatorManage, 'Member Management Bypass');

  // Non-owner attempts to demote/modify owner role (Must be 403)
  const attackerDemote = await api(
    `/api/organizations/${orgAlpha.id}/members/${sAdmin.user.id}`,
    sAttacker,
    'PATCH',
    { role: 'creator' }
  );
  const passAttackerDemote = attackerDemote.status === 403;
  record(`/api/organizations/[id]/members/[memberId]`, 'Cross-Tenant', 403, attackerDemote.status, passAttackerDemote, 'Owner Escalation/Demotion');

  console.log('\n--- SECTION 4: SERVER-SIDE REQUEST FORGERY (SSRF) BLOCKING ---');
  // Register an evidence document in Org Alpha to test URL reachability probing
  const evidenceRes = await api('/api/evidence', sReviewer, 'POST', {
    metricId: 'ALPHA_SECURITY_AUDIT',
    documentName: 'Alpha_Security_Report.pdf',
    sectionCitation: 'Section 9.1',
    sourceUrl: 'https://example.com/alpha-audit',
  });
  const evidenceAlpha = evidenceRes.json.evidence || evidenceRes.json;

  const ssrfTargets = [
    'http://127.0.0.1:80/secret',
    'http://localhost:8080/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/internal-api',
    'http://192.168.1.1/router',
  ];

  for (const ssrfUrl of ssrfTargets) {
    const ssrfRes = await api(`/api/evidence/${evidenceAlpha.id}/provenance`, sReviewer, 'POST', {
      url: ssrfUrl,
    });
    // Should be blocked with 400 and security explanation
    const passSsrf = ssrfRes.status === 400 && /blocked|security|loopback|private|invalid|reserved/i.test(JSON.stringify(ssrfRes.json));
    record(`/api/evidence/[id]/provenance`, 'Reviewer', 400, ssrfRes.status, passSsrf, `SSRF Probe: ${ssrfUrl}`);
  }

  console.log('\n' + '='.repeat(80));
  const failed = results.filter((r) => !r.pass);
  console.log(`  AUDIT COMPLETED: ${results.length - failed.length}/${results.length} PASSED`);
  if (failed.length > 0) {
    console.error(`  FAILURES DETECTED: ${failed.length}`);
    process.exitCode = 1;
  } else {
    console.log('  ✓ ALL ROUTE-BY-ROUTE SECURITY PROBES AND MATRICES VERIFIED ZERO VULNERABILITIES!');
  }
  console.log('='.repeat(80));
}

runAudit().catch((err) => {
  console.error('Unhandled Audit Exception:', err);
  process.exit(1);
});
