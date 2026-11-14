// VeriBrand AI — Unauthenticated first-visit and responsive login smoke test.
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext();
const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const unexpectedConsoleErrors = [];
const expectedUnauthorized = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') {
    const text = message.text();
    if (/status of 401 \(Unauthorized\)/i.test(text)) expectedUnauthorized.push(text);
    else unexpectedConsoleErrors.push(text);
  }
});

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /initial administrator setup|sign in/i }).waitFor();
  if (await page.getByRole('textbox', { name: 'Content Draft Editor' }).count()) {
    throw new Error('Unauthenticated visitor can see the private editor.');
  }
  if (!(await page.getByLabel(/bootstrap token/i).isVisible().catch(() => false)) &&
      !(await page.getByLabel(/email/i).isVisible().catch(() => false))) {
    throw new Error('Expected authentication form is not visible.');
  }

  // Browser-local fake submissions must never restore authoritative server records.
  await page.evaluate(() => {
    localStorage.setItem('veribrand_submissions_v2', JSON.stringify([{ id: 'FAKE-LOCAL', title: 'Injected local record' }]));
    localStorage.setItem('veribrand_editor_content_v2', 'Untrusted local draft');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /initial administrator setup|sign in/i }).waitFor();
  if (await page.getByText('Injected local record').count()) throw new Error('Local storage data leaked into the authoritative submission list.');

  const protectedStatus = await page.evaluate(async () => (await fetch('/api/submissions')).status);
  if (protectedStatus !== 401) throw new Error('Unauthenticated submissions endpoint returned ' + protectedStatus + ', expected 401.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: /initial administrator setup|sign in/i }).waitFor();
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (layout.scrollWidth > layout.width + 2) throw new Error('Login layout overflows mobile viewport: ' + JSON.stringify(layout));

  if (pageErrors.length || unexpectedConsoleErrors.length) {
    throw new Error('Page errors: ' + pageErrors.join(' | ') + '; console errors: ' + unexpectedConsoleErrors.join(' | '));
  }
  console.log('PASS: unauthenticated visitor sees setup/login only; protected submissions return 401.');
  console.log('PASS: localStorage cannot inject authoritative submissions.');
  console.log('PASS: 390x844 login layout has no horizontal overflow.');
  console.log('PASS: zero page errors or unexpected console errors. Expected 401 responses: ' + expectedUnauthorized.length);
} finally {
  await browser.close();
}
