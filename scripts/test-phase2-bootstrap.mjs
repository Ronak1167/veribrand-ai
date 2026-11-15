import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.VERIBRAND_URL || 'http://localhost:3000';
const bootstrapToken = process.env.VERIBRAND_BOOTSTRAP_TOKEN;

if (!bootstrapToken || bootstrapToken.length < 32) {
  console.error('FATAL: VERIBRAND_BOOTSTRAP_TOKEN of at least 32 characters is required.');
  process.exit(1);
}

function generateSecurePassword() {
  return 'Vb!' + crypto.randomBytes(12).toString('hex') + '9#X';
}

const adminEmail = 'admin.local@veribrand.test';
const adminName = 'System Administrator';
const adminPassword = generateSecurePassword();

const creatorEmail = 'creator.test@veribrand.test';
const creatorName = 'Content Creator Test';
const creatorPassword = generateSecurePassword();

const reviewerEmail = 'reviewer.test@veribrand.test';
const reviewerName = 'Brand Reviewer Test';
const reviewerPassword = generateSecurePassword();

console.log('======================================================');
console.log('  VERIBRAND AI — PHASE 2: BOOTSTRAP & ACCOUNT SETUP   ');
console.log('======================================================');

// Step 1: Negative Bootstrap API Tests
console.log('\n[Step 1] Verifying negative bootstrap API edge cases...');

// 1a. Missing token
const missingRes = await fetch(baseUrl + '/api/auth/bootstrap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: adminEmail, name: adminName, password: adminPassword })
});
if (missingRes.status !== 400) throw new Error(`Missing token returned ${missingRes.status}, expected 400`);
console.log('-> PASS: Missing bootstrap token rejected (400 Bad Request)');

// 1b. Incorrect token
const wrongRes = await fetch(baseUrl + '/api/auth/bootstrap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'wrong-bootstrap-token-12345678901234567890', email: adminEmail, name: adminName, password: adminPassword })
});
if (wrongRes.status !== 403) throw new Error(`Wrong token returned ${wrongRes.status}, expected 403`);
console.log('-> PASS: Incorrect bootstrap token rejected (403 Forbidden)');

// 1c. Short password (< 14 chars)
const shortRes = await fetch(baseUrl + '/api/auth/bootstrap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: bootstrapToken, email: adminEmail, name: adminName, password: 'Short1!' })
});
if (shortRes.status !== 400) throw new Error(`Short password returned ${shortRes.status}, expected 400`);
console.log('-> PASS: Weak password (< 14 chars) rejected (400 Bad Request)');

// 1d. Invalid email
const emailRes = await fetch(baseUrl + '/api/auth/bootstrap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: bootstrapToken, email: 'not-an-email', name: adminName, password: adminPassword })
});
if (emailRes.status !== 400) throw new Error(`Invalid email returned ${emailRes.status}, expected 400`);
console.log('-> PASS: Malformed email rejected (400 Bad Request)');

// Step 2: Browser Bootstrap Automation
console.log('\n[Step 2] Launching browser for First-Administrator Bootstrap UI...');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', err => pageErrors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error' && !/status of 401/i.test(msg.text())) {
    consoleErrors.push(msg.text());
  }
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /initial administrator setup/i }).waitFor();
  console.log('-> PASS: Initial administrator setup screen rendered successfully.');

  // Fill bootstrap form in UI
  await page.getByLabel(/bootstrap token/i).fill(bootstrapToken);
  await page.getByLabel(/full name/i).fill(adminName);
  await page.getByLabel(/email/i).fill(adminEmail);
  await page.getByLabel(/password/i).fill(adminPassword);

  await page.getByRole('button', { name: /create administrator/i }).click();

  // Verify success notice in UI
  await page.getByText(/administrator created\. sign in with the new credentials/i).waitFor({ timeout: 10000 });
  console.log('-> PASS: Administrator created via UI form.');

  // Step 3: Verify Bootstrap is Permanently Closed
  console.log('\n[Step 3] Verifying bootstrap is permanently closed...');
  const setupStatusRes = await fetch(baseUrl + '/api/auth/bootstrap');
  const setupStatus = await setupStatusRes.json();
  if (setupStatus.setupRequired !== false) {
    throw new Error(`Expected setupRequired to be false, got: ${JSON.stringify(setupStatus)}`);
  }
  console.log('-> PASS: GET /api/auth/bootstrap returns { setupRequired: false }');

  // Verify re-bootstrap is rejected with 409
  const rebootstrapRes = await fetch(baseUrl + '/api/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: bootstrapToken, email: 'another@admin.test', name: 'Another Admin', password: generateSecurePassword() })
  });
  if (rebootstrapRes.status !== 409) {
    throw new Error(`Re-bootstrap attempt returned ${rebootstrapRes.status}, expected 409`);
  }
  console.log('-> PASS: Re-bootstrap attempt permanently rejected (409 Conflict)');

  // Step 4: Login as Administrator in UI
  console.log('\n[Step 4] Logging into UI as Administrator...');
  await page.getByLabel(/email/i).fill(adminEmail);
  await page.getByLabel(/password/i).fill(adminPassword);
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.getByRole('textbox', { name: /content draft editor/i }).waitFor({ timeout: 10000 });
  console.log('-> PASS: Administrator successfully logged in; Editor displayed.');

  // Step 5: Navigate to User & Role Management Panel
  console.log('\n[Step 5] Navigating to Admin User Management Panel...');
  await page.getByRole('button', { name: /brand vault/i }).click();
  await page.getByRole('heading', { name: /user & role management/i }).waitFor({ timeout: 10000 });
  console.log('-> PASS: User & role management panel opened.');

  // Step 6: Create Creator Test Account via Admin UI
  console.log('\n[Step 6] Creating dedicated Creator test account in UI...');
  await page.locator('form input').nth(0).fill(creatorName);
  await page.locator('form input[type="email"]').fill(creatorEmail);
  await page.locator('form select').selectOption('creator');
  await page.locator('form input[type="password"]').fill(creatorPassword);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.getByText(/account created successfully/i).waitFor({ timeout: 10000 });
  console.log('-> PASS: Creator test account created.');

  // Step 7: Create Reviewer Test Account via Admin UI
  console.log('\n[Step 7] Creating dedicated Reviewer test account in UI...');
  await page.locator('form input').nth(0).fill(reviewerName);
  await page.locator('form input[type="email"]').fill(reviewerEmail);
  await page.locator('form select').selectOption('reviewer');
  await page.locator('form input[type="password"]').fill(reviewerPassword);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.getByText(/account created successfully/i).waitFor({ timeout: 10000 });
  console.log('-> PASS: Reviewer test account created.');

  // Step 8: Verify Accounts in List
  console.log('\n[Step 8] Verifying accounts list in UI...');
  await page.getByText(adminEmail, { exact: false }).waitFor();
  await page.getByText(creatorEmail, { exact: false }).waitFor();
  await page.getByText(reviewerEmail, { exact: false }).waitFor();
  console.log('-> PASS: All 3 roles (Admin, Creator, Reviewer) visible in account list.');

  // Step 9: Save test credentials locally to .env.test.local (git-ignored) for Phase 3 E2E tests
  const testEnvContent = `# Local test credentials for authenticated E2E verification
VERIBRAND_TEST_ADMIN_EMAIL="${adminEmail}"
VERIBRAND_TEST_ADMIN_PASSWORD="${adminPassword}"
VERIBRAND_TEST_CREATOR_EMAIL="${creatorEmail}"
VERIBRAND_TEST_CREATOR_PASSWORD="${creatorPassword}"
VERIBRAND_TEST_REVIEWER_EMAIL="${reviewerEmail}"
VERIBRAND_TEST_REVIEWER_PASSWORD="${reviewerPassword}"
`;
  fs.writeFileSync(path.resolve(process.cwd(), '.env.test.local'), testEnvContent, { mode: 0o600 });
  console.log('-> PASS: Saved local test credentials to git-ignored .env.test.local');

  if (pageErrors.length > 0) throw new Error('Page errors during test: ' + pageErrors.join('; '));
  if (consoleErrors.length > 0) throw new Error('Console errors during test: ' + consoleErrors.join('; '));

  console.log('\n======================================================');
  console.log('  PHASE 2 COMPLETED SUCCESSFULLY WITH ZERO DEFECTS!   ');
  console.log('======================================================\n');
} finally {
  await browser.close();
}
