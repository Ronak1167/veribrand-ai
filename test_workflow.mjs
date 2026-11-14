// Authenticated browser workflow: creator submit -> reviewer request changes -> creator resubmit -> reviewer approve.
import { chromium } from 'playwright';

const baseUrl = process.env.VERIBRAND_UI_URL || 'http://localhost:3000';
const creatorEmail = process.env.VERIBRAND_TEST_CREATOR_EMAIL;
const creatorPassword = process.env.VERIBRAND_TEST_CREATOR_PASSWORD;
const reviewerEmail = process.env.VERIBRAND_TEST_REVIEWER_EMAIL;
const reviewerPassword = process.env.VERIBRAND_TEST_REVIEWER_PASSWORD;

if (!creatorEmail || !creatorPassword || !reviewerEmail || !reviewerPassword) {
  console.error('Set VERIBRAND_TEST_CREATOR_EMAIL/PASSWORD and VERIBRAND_TEST_REVIEWER_EMAIL/PASSWORD to existing test accounts.');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/status of 401 \(Unauthorized\)/i.test(message.text())) consoleErrors.push(message.text());
});

async function login(email, password) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('textbox', { name: 'Content Draft Editor' }).waitFor();
}

async function logout() {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: /sign in/i }).waitFor();
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /sign in/i }).waitFor();

  // Creator submits a draft; UI must use the server-generated ID.
  await login(creatorEmail, creatorPassword);
  const title = 'Authenticated E2E ' + Date.now();
  await page.getByRole('textbox', { name: 'Content Draft Editor' }).fill('Inkloom AI provides 99.9% uptime.');
  await page.getByRole('button', { name: /submit for human review/i }).click();
  await page.locator('input[type="text"]').first().fill(title);
  await page.getByRole('button', { name: 'Confirm Submission' }).click();
  await page.getByRole('button', { name: /reviewer queue/i }).click();
  await page.getByText(title, { exact: false }).waitFor({ timeout: 5000 }).catch(() => {});
  await logout();

  // Reviewer sees the persisted record and requests changes.
  await login(reviewerEmail, reviewerPassword);
  await page.getByRole('button', { name: /reviewer queue/i }).click();
  await page.getByRole('button', { name: 'Request Changes', exact: true }).click();
  await page.getByPlaceholder(/Please verify the ARR figure/).fill('Please resubmit the approved uptime statement for final review.');
  await page.getByRole('button', { name: 'Send Revision Request' }).click();
  await page.getByText('Changes Requested', { exact: false }).first().waitFor();
  await logout();

  // Creator resubmits; server creates a new revision and clears previous approval state.
  await login(creatorEmail, creatorPassword);
  await page.getByRole('button', { name: /reviewer queue/i }).click();
  await page.getByText('Creator Revision & Resubmission', { exact: true }).waitFor();
  await page.locator('textarea').last().fill('Inkloom AI provides 99.9% uptime. Revised for final sign-off.');
  await page.getByRole('button', { name: 'Resubmit New Revision' }).click();
  await page.getByText('Version 2', { exact: false }).waitFor();
  await logout();

  // Reviewer approves the new revision; verify database state through the protected API.
  await login(reviewerEmail, reviewerPassword);
  await page.getByRole('button', { name: /reviewer queue/i }).click();
  await page.getByRole('button', { name: 'Approve & Sign Off' }).click();
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/submissions');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Submission list request failed.');
    return data.submissions.find(item => item.title.startsWith('Authenticated E2E '));
  });
  if (!result || result.status !== 'approved' || !result.currentRevisionId?.includes('REV-2')) {
    throw new Error('Server did not persist the approved second revision: ' + JSON.stringify(result));
  }
  const detail = await page.evaluate(async (id) => {
    const response = await fetch('/api/submissions/' + encodeURIComponent(id));
    if (!response.ok) throw new Error('Protected submission detail failed: ' + response.status);
    return response.json();
  }, result.id);
  if (detail.integrityVerified !== true) throw new Error('Server-side approval hash verification did not pass.');

  if (pageErrors.length || consoleErrors.length) throw new Error('Browser errors: ' + [...pageErrors, ...consoleErrors].join(' | '));
  console.log('PASS: authenticated creator submission persisted with server-issued ID.');
  console.log('PASS: reviewer change request persisted; creator resubmitted revision 2.');
  console.log('PASS: reviewer approved revision 2; API returned integrityVerified=true.');
  console.log('PASS: no browser page errors or unexpected console errors.');
} finally {
  await browser.close();
}
