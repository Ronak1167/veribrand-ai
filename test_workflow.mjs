import { chromium } from 'playwright';

const baseUrl = process.env.VERIBRAND_UI_URL || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const editor = page.getByRole('textbox', { name: 'Content Draft Editor' });

  // A 90-point draft with a critical suggestion must not be marked publication-ready.
  await editor.fill('We are an industry-leading brand governance platform.');
  await page.getByText('Revisions Recommended', { exact: true }).waitFor();
  if (await page.getByText('Ready for Publication', { exact: true }).count()) {
    throw new Error('Critical unresolved finding incorrectly marked publication-ready');
  }

  // Request changes -> creator revision -> fresh audit -> standard approval.
  await editor.fill('We provide 99.99% uptime.');
  await page.getByRole('button', { name: 'Submit for Human Review' }).click();
  await page.getByRole('button', { name: 'Confirm Submission' }).click();
  await page.getByRole('button', { name: 'Reviewer Queue' }).click();
  await page.getByRole('button', { name: 'Request Changes', exact: true }).click();
  await page.getByPlaceholder(/Please verify the ARR figure/).fill('Please correct the SLA to the approved 99.9% value.');
  await page.getByRole('button', { name: 'Send Revision Request' }).click();
  await page.getByText('Creator Revision & Resubmission', { exact: true }).waitFor();
  const revisionEditor = page.locator('textarea').first();
  await revisionEditor.fill('We provide 99.9% uptime.');
  await page.getByRole('button', { name: 'Resubmit New Revision' }).click();
  await page.getByText('Version 2', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Approve & Sign Off' }).click();
  await page.getByText(/Approved by/).waitFor();

  // Creator appeal -> reviewer decision -> structured exception approval.
  await page.getByRole('button', { name: 'Studio Editor' }).click();
  await editor.fill('We are an industry-leading brand governance platform.');
  await page.getByRole('button', { name: 'Appeal or Override with Rationale' }).first().click();
  await page.getByPlaceholder(/State your business rationale/).fill('The phrase is approved for this specific campaign by the brand director.');
  await page.getByRole('button', { name: 'Submit Exemption' }).click();
  await page.getByRole('button', { name: 'Submit for Human Review' }).click();
  await page.getByRole('button', { name: 'Confirm Submission' }).click();
  await page.getByRole('button', { name: 'Reviewer Queue' }).click();
  await page.getByPlaceholder('Reviewer rationale for appeal decision').fill('Accepted for this campaign because the approval evidence was reviewed.');
  await page.getByRole('button', { name: 'Accept Appeal' }).click();
  await page.getByText(/Appeal accepted by/).waitFor();
  await page.getByRole('button', { name: 'Approve & Sign Off' }).click();
  await page.getByText(/Approved by/).waitFor();

  // A separate unresolved conflict must use the structured exception path.
  await page.getByRole('button', { name: 'Studio Editor' }).click();
  await editor.fill('We provide 99.99% uptime.');
  await page.getByRole('button', { name: 'Submit for Human Review' }).click();
  await page.getByRole('button', { name: 'Confirm Submission' }).click();
  await page.getByRole('button', { name: 'Reviewer Queue' }).click();
  await page.getByRole('button', { name: 'Approve with Exception Override' }).click();
  await page.getByPlaceholder(/Exception authorized by VP Marketing/).fill('Brand director approval recorded for this campaign; exception limited to this draft.');
  await page.getByRole('button', { name: 'Confirm Exception Sign-Off' }).click();
  await page.getByText('Exception approval:', { exact: true }).waitFor();

  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log('PASS: readiness gate, request-changes/resubmit/revision history, standard approval, appeal adjudication, and structured exception approval.');
  console.log('PASS: zero browser console/page errors.');
} finally {
  await browser.close();
}
