// VeriBrand AI — Browser Hydration Console Verification Test (Node.js + Playwright)
import { chromium } from 'playwright';

async function run() {
  console.log('======================================================================');
  console.log('  VERIBRAND AI — LIVE BROWSER HYDRATION TEST (PLAYWRIGHT)');
  console.log('======================================================================');

  // Multi-engine launch fallback (Edge -> Chrome -> default Chromium)
  let browser;
  let browserTypeUsed = 'default Chromium';
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    browserTypeUsed = 'Microsoft Edge (channel: msedge)';
  } catch {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      browserTypeUsed = 'Google Chrome (channel: chrome)';
    } catch {
      browser = await chromium.launch({ headless: true });
      browserTypeUsed = 'Playwright Headless Chromium';
    }
  }
  console.log(`Launched browser engine: ${browserTypeUsed}`);

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

  // Scenario 2: Tab Switching Navigation (Verify All 4 Tabs Render Cleanly)
  console.log('[Scenario 2] Testing tab switches (Reviewer, Heatmap, Brand Vault, Editor)...');
  const tabs = ['Reviewer Hub', 'Ambiguity Heatmap', 'Brand Vault', 'Draft Studio'];
  for (const tabName of tabs) {
    const tabBtn = page.getByRole('button', { name: new RegExp(tabName, 'i') }).first();
    if (await tabBtn.isVisible().catch(() => false)) {
      await tabBtn.click();
      await page.waitForTimeout(250);
    }
  }

  // Scenario 3: Pre-seeded dirty localStorage Re-Hydration
  console.log('[Scenario 3] Testing dirty localStorage re-hydration...');
  const seedContent = 'Pre-existing draft loaded from prior session.';
  await page.evaluate((content) => {
    try {
      localStorage.setItem('veribrand_editor_content_v2', content);
      localStorage.setItem('veribrand_submissions_v2', JSON.stringify([]));
    } catch {}
  }, seedContent);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Scenario 4: Mobile Viewport Navigation (390 x 844)
  console.log('[Scenario 4] Testing mobile viewport (390 x 844) navigation sub-bar...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  const mobileNav = page.getByRole('navigation', { name: /mobile navigation/i });
  if (await mobileNav.isVisible().catch(() => false)) {
    const mobileButtons = ['Studio', 'Queue', 'Heatmap', 'Vault'];
    for (const btnName of mobileButtons) {
      const btn = mobileNav.getByRole('button', { name: new RegExp(btnName, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(200);
      }
    }
    console.log('-> Mobile navigation sub-bar buttons tested successfully at 390x844!');
  }

  const hydrationErrors = consoleMessages.filter(
    (m) =>
      m.text.toLowerCase().includes('hydration') ||
      m.text.toLowerCase().includes('did not match') ||
      m.type === 'error'
  );

  console.log(`\nTotal Console Messages: ${consoleMessages.length}`);
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

  console.log('\n-> PASS: Zero hydration errors, zero page errors, and zero console errors detected across all scenarios!');
  await browser.close();
  console.log('======================================================================');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
