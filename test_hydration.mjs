// VeriBrand AI — Browser Hydration Console Verification Test (Node.js + Playwright)
import { chromium } from 'playwright';

async function run() {
  console.log('======================================================================');
  console.log('  VERIBRAND AI — LIVE BROWSER HYDRATION TEST (PLAYWRIGHT)');
  console.log('======================================================================');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
    });
  });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  // Scenario 1: Clean First Visit (Empty Storage)
  console.log('\n[Scenario 1] Navigating to http://localhost:3000 on fresh first visit...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Scenario 2: Tab Switching Navigation
  console.log('[Scenario 2] Testing tab switches (Reviewer, Heatmap, Brand Vault)...');
  const tabs = ['Reviewer Dashboard', 'Ambiguity Heatmap', 'Brand Vault', 'Draft Editor'];
  for (const tabName of tabs) {
    const tabBtn = page.getByRole('button', { name: tabName }).first();
    if (await tabBtn.isVisible()) {
      await tabBtn.click();
      await page.waitForTimeout(200);
    }
  }

  // Scenario 3: Pre-seeded dirty localStorage
  console.log('[Scenario 3] Testing dirty localStorage re-hydration...');
  const seedContent = 'Pre-existing draft loaded from prior session.';
  await page.evaluate((content) => {
    localStorage.setItem('veribrand_editor_content_v2', content);
    localStorage.setItem('veribrand_submissions_v2', JSON.stringify([]));
  }, seedContent);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const hydrationErrors = consoleMessages.filter(
    (m) =>
      m.text.toLowerCase().includes('hydration') ||
      m.text.toLowerCase().includes('did not match') ||
      m.type === 'error'
  );

  console.log(`Total Console Messages: ${consoleMessages.length}`);
  for (const m of consoleMessages) {
    console.log(`  [${m.type.toUpperCase()}] ${m.text}`);
  }

  if (pageErrors.length > 0 || hydrationErrors.length > 0) {
    console.error(`\nFAILED: Found ${hydrationErrors.length} hydration errors and ${pageErrors.length} page errors.`);
    for (const e of pageErrors) console.error(`  PageError: ${e}`);
    for (const e of hydrationErrors) console.error(`  HydrationError: ${e.text}`);
    await browser.close();
    process.exit(1);
  }

  console.log('\n-> PASS: Zero hydration errors, zero page errors, and zero console errors detected in live Chromium!');
  await browser.close();
  console.log('======================================================================');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
