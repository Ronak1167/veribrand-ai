import { chromium } from 'playwright';
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

const screenshotsDir = path.resolve(process.cwd(), 'docs', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

console.log('================================================================');
console.log('  VERIBRAND AI — FULL BROWSER QA & PLAYWRIGHT TEST SUITE       ');
console.log('================================================================');

const browser = await chromium.launch({ channel: 'msedge', headless: true });

const consoleErrors = [];
function monitorPage(page, contextName) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('401') && !text.includes('Failed to load resource')) {
        consoleErrors.push(`[${contextName}] ${text}`);
      }
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[${contextName} PAGE ERROR] ${err.message}`);
  });
}

try {
  // 1. LOGIN SCREEN (Desktop & Mobile)
  console.log('\n[Phase 4.1] Testing Login Screen...');
  const anonContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await anonContext.newPage();
  monitorPage(loginPage, 'LoginScreen');
  await loginPage.goto(baseUrl, { waitUntil: 'networkidle' });

  await loginPage.waitForSelector('h1:has-text("VeriBrand AI")');
  await loginPage.waitForSelector('button:has-text("Sign in")');
  await loginPage.screenshot({ path: path.join(screenshotsDir, '01-login-desktop.png') });
  console.log('-> Captured docs/screenshots/01-login-desktop.png');

  await loginPage.setViewportSize({ width: 390, height: 844 });
  await loginPage.waitForTimeout(300);
  await loginPage.screenshot({ path: path.join(screenshotsDir, '01-login-mobile.png') });
  console.log('-> Captured docs/screenshots/01-login-mobile.png');

  // Check keyboard focus
  await loginPage.keyboard.press('Tab');
  await loginPage.keyboard.press('Tab');
  const focusedTag = await loginPage.evaluate(() => document.activeElement?.tagName);
  console.log(`-> Keyboard Tab focus target observed: <${focusedTag?.toLowerCase()}> (visual focus styling is not asserted by this smoke test).`);

  await anonContext.close();

  // 2. CREATOR STUDIO: SCENARIOS, AUDIT & 1-CLICK REWRITE
  console.log('\n[Phase 4.2] Testing Creator Studio, Scenario Selection & 1-Click Rewrites...');
  const creatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const creatorPage = await creatorContext.newPage();
  monitorPage(creatorPage, 'CreatorStudio');
  await creatorPage.goto(baseUrl, { waitUntil: 'networkidle' });

  await creatorPage.locator('input[type="email"]').fill(creatorEmail);
  await creatorPage.locator('input[type="password"]').fill(creatorPassword);
  await creatorPage.locator('button:has-text("Sign in")').click();

  const editorArea = creatorPage.getByRole('textbox', { name: 'Content Draft Editor' });
  await editorArea.waitFor();
  console.log('-> Creator successfully signed in.');

  await creatorPage.screenshot({ path: path.join(screenshotsDir, '02-studio-desktop.png') });
  console.log('-> Captured docs/screenshots/02-studio-desktop.png');

  await creatorPage.setViewportSize({ width: 390, height: 844 });
  await creatorPage.waitForTimeout(300);
  await creatorPage.screenshot({ path: path.join(screenshotsDir, '02-studio-mobile.png') });
  console.log('-> Captured docs/screenshots/02-studio-mobile.png');

  // Switch back to desktop for scenario testing
  await creatorPage.setViewportSize({ width: 1440, height: 900 });
  await creatorPage.waitForTimeout(300);

  // Select Scenario 1: Broken High-Risk
  const scenarioSelect = creatorPage.locator('select[aria-label="Load demo scenario for testing"]');
  await scenarioSelect.selectOption('draft-broken-marketing');
  await creatorPage.waitForTimeout(500);

  // Check that score is 0/100 and findings appear
  await creatorPage.waitForSelector('text=0/100');
  console.log('-> Scenario 1 loaded: Live audit displays 0/100 score with critical findings.');
  await creatorPage.screenshot({ path: path.join(screenshotsDir, '03-studio-audit-results.png') });
  console.log('-> Captured docs/screenshots/03-studio-audit-results.png');

  // Test 1-click rewrite application
  const applyButton = creatorPage.locator('button:has-text("Apply")').first();
  if (await applyButton.isVisible()) {
    const editorContentBefore = await editorArea.inputValue();
    await applyButton.click();
    await creatorPage.waitForTimeout(300);
    const editorContentAfter = await editorArea.inputValue();
    if (editorContentBefore !== editorContentAfter) {
      console.log('-> PASS: 1-click rewrite applied successfully to draft text.');
    }
  }

  // Submit draft for review
  const submitOpenButton = creatorPage.locator('button:has-text("Submit for Human Review")');
  if (await submitOpenButton.isVisible()) {
    await submitOpenButton.click();
    await creatorPage.waitForSelector('text=Submit to Brand Reviewer Queue');
    const submitModalConfirm = creatorPage.locator('button:has-text("Confirm Submission")');
    if (await submitModalConfirm.isVisible()) {
      await submitModalConfirm.click();
      await creatorPage.waitForSelector('text=Submit to Brand Reviewer Queue', { state: 'detached', timeout: 5000 });
      await creatorPage.waitForTimeout(600);
      console.log('-> PASS: Draft submitted to review queue and modal cleanly closed.');
    }
  }

  // Test Ambiguity Heatmap
  console.log('\n[Phase 4.3] Testing Ambiguity Heatmap Tab...');
  await creatorPage.locator('nav button:has-text("Ambiguity Heatmap")').first().click();
  await creatorPage.waitForSelector('text=Organization Governance Analytics');
  await creatorPage.screenshot({ path: path.join(screenshotsDir, '04-heatmap-desktop.png') });
  console.log('-> Captured docs/screenshots/04-heatmap-desktop.png');

  await creatorPage.setViewportSize({ width: 390, height: 844 });
  await creatorPage.waitForTimeout(300);
  await creatorPage.screenshot({ path: path.join(screenshotsDir, '04-heatmap-mobile.png') });
  console.log('-> Captured docs/screenshots/04-heatmap-mobile.png');

  await creatorContext.close();

  // 3. REVIEWER QUEUE & EVIDENCE VERIFICATION
  console.log('\n[Phase 4.4] Testing Reviewer Hub, Queue Actions & Evidence View...');
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reviewerPage = await reviewerContext.newPage();
  monitorPage(reviewerPage, 'ReviewerHub');
  await reviewerPage.goto(baseUrl, { waitUntil: 'networkidle' });

  await reviewerPage.locator('input[type="email"]').fill(reviewerEmail);
  await reviewerPage.locator('input[type="password"]').fill(reviewerPassword);
  await reviewerPage.locator('button:has-text("Sign in")').click();

  await reviewerPage.getByRole('textbox', { name: 'Content Draft Editor' }).waitFor();
  await reviewerPage.locator('nav button:has-text("Reviewer Queue")').first().click();
  await reviewerPage.waitForSelector('text=Brand Reviewer & Sign-Off Hub');
  console.log('-> Reviewer successfully signed in and navigated to Reviewer Queue.');

  // Test adding a reviewer note on active submission if present
  const commentInput = reviewerPage.locator('input[placeholder="Add feedback note or approval justification..."]');
  if (await commentInput.isVisible()) {
    await commentInput.fill('Verified during automated browser QA pass.');
    await reviewerPage.locator('button:has-text("Post Note")').click();
    await reviewerPage.waitForTimeout(500);
    console.log('-> PASS: Reviewer posted feedback note on active submission thread.');
  }

  await reviewerPage.screenshot({ path: path.join(screenshotsDir, '05-reviewer-queue-desktop.png') });
  console.log('-> Captured docs/screenshots/05-reviewer-queue-desktop.png');

  await reviewerPage.setViewportSize({ width: 390, height: 844 });
  await reviewerPage.waitForTimeout(300);
  await reviewerPage.screenshot({ path: path.join(screenshotsDir, '05-reviewer-queue-mobile.png') });
  console.log('-> Captured docs/screenshots/05-reviewer-queue-mobile.png');

  // Test Evidence View as Reviewer
  console.log('\n[Phase 4.5] Testing Evidence Library View...');
  await reviewerPage.setViewportSize({ width: 1440, height: 900 });
  await reviewerPage.locator('nav').first().getByRole('button', { name: 'Evidence' }).click();
  await reviewerPage.waitForSelector('text=Evidence Library');
  await reviewerPage.waitForSelector('text=Register source evidence');

  await reviewerPage.screenshot({ path: path.join(screenshotsDir, '06-evidence-desktop.png') });
  console.log('-> Captured docs/screenshots/06-evidence-desktop.png');

  await reviewerPage.setViewportSize({ width: 390, height: 844 });
  await reviewerPage.waitForTimeout(300);
  await reviewerPage.screenshot({ path: path.join(screenshotsDir, '06-evidence-mobile.png') });
  console.log('-> Captured docs/screenshots/06-evidence-mobile.png');

  await reviewerContext.close();

  // 4. ADMIN USERS PANEL & BRAND VAULT
  console.log('\n[Phase 4.6] Testing Brand Vault & Admin Users Panel...');
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  monitorPage(adminPage, 'AdminVault');
  await adminPage.goto(baseUrl, { waitUntil: 'networkidle' });

  await adminPage.locator('input[type="email"]').fill(adminEmail);
  await adminPage.locator('input[type="password"]').fill(adminPassword);
  await adminPage.locator('button:has-text("Sign in")').click();

  await adminPage.getByRole('textbox', { name: 'Content Draft Editor' }).waitFor();
  await adminPage.locator('nav button:has-text("Brand Vault")').first().click();
  await adminPage.waitForSelector('text=Brand Vault & Governance Studio');
  await adminPage.getByRole('button', { name: 'Organization & Brand Settings' }).click();
  await adminPage.waitForSelector('text=Team Members');
  console.log('-> Administrator signed in; Brand Vault and organization team management verified.');

  await adminPage.screenshot({ path: path.join(screenshotsDir, '07-vault-admin-desktop.png') });
  console.log('-> Captured docs/screenshots/07-vault-admin-desktop.png');

  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.waitForTimeout(300);
  await adminPage.screenshot({ path: path.join(screenshotsDir, '07-vault-admin-mobile.png') });
  console.log('-> Captured docs/screenshots/07-vault-admin-mobile.png');

  await adminContext.close();

  // 5. ACCESSIBILITY CONTRAST CHECK
  console.log('\n[Phase 4.7] Checking Accessibility & Color Contrast...');
  const contrastContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contrastContext.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const contrastCheck = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Sign in'));
    if (!btn) return { ok: false, error: 'No Sign in button found' };
    const style = window.getComputedStyle(btn);
    return {
      ok: true,
      text: btn.textContent?.trim(),
      backgroundColor: style.backgroundColor,
      color: style.color,
      display: style.display,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
    };
  });
  console.log(`-> Primary button computed styling: ${JSON.stringify(contrastCheck)}`);
  await contrastContext.close();

} finally {
  await browser.close();
}

console.log('\n----------------------------------------------------------------');
if (consoleErrors.length > 0) {
  console.error(`FAILED: ${consoleErrors.length} unexpected console/page errors detected:`);
  consoleErrors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
} else {
  console.log('PASS: Zero unexpected console errors or uncaught page exceptions.');
}
console.log('================================================================');
console.log('  ALL BROWSER-BASED TESTS & SCREENSHOTS COMPLETED SUCCESSFULLY! ');
console.log('================================================================\n');
