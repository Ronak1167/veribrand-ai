import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.VERIBRAND_URL || 'http://localhost:3000';
const imagePath = process.argv[2] || process.env.VISUAL_TEST_IMAGE;
if (!imagePath || !fs.existsSync(imagePath)) {
  throw new Error('Pass an existing PNG/JPEG/WebP image path as the first argument or VISUAL_TEST_IMAGE.');
}
const envPath = '.env.test.local';
if (!fs.existsSync(envPath)) throw new Error('Missing .env.test.local test credentials.');
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  .filter(line => line && !line.trim().startsWith('#') && line.includes('='))
  .map(line => {
    const i = line.indexOf('=');
    return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^[\"']|[\"']$/g, '')];
  }));
const email = env.VERIBRAND_TEST_ADMIN_EMAIL;
const password = env.VERIBRAND_TEST_ADMIN_PASSWORD;
if (!email || !password) throw new Error('Admin test credentials are not configured.');

const login = await fetch(new URL('/api/auth/login', baseUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Test admin login failed with HTTP ${login.status}.`);
const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie) throw new Error('Login did not issue the expected session cookie.');

const ext = path.extname(imagePath).toLowerCase();
const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
if (!mime) throw new Error('Image must be PNG, JPEG, or WebP.');
const form = new FormData();
form.append('file', new Blob([fs.readFileSync(imagePath)], { type: mime }), path.basename(imagePath));
form.append('assetType', 'marketing_image');

const response = await fetch(new URL('/api/vision/inspect', baseUrl), {
  method: 'POST',
  headers: { cookie },
  body: form,
});
const body = await response.json().catch(() => ({}));
if (!response.ok || body.ok !== true || !Number.isInteger(body.width) || !Number.isInteger(body.height)) {
  throw new Error(`Actual image upload analysis failed (HTTP ${response.status}): ${body.error || 'invalid response'}`);
}
if (!String(body.analysisMethod || '').includes('pixel') || body.compliant !== null || body.requiresHumanReview !== true) {
  throw new Error('Visual endpoint did not return an actual pixel analysis with a mandatory human-review gate.');
}
console.log(`PASS: ${body.analysisMethod} inspected actual ${body.width}x${body.height} image bytes; human review remains required and compliant is null.`);
