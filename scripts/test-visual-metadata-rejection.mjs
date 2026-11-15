import fs from 'node:fs';

const baseUrl = process.env.VERIBRAND_URL || 'http://localhost:3000';
const envPath = '.env.test.local';
if (!fs.existsSync(envPath)) throw new Error('Missing .env.test.local test credentials.');
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(line => line && !line.trim().startsWith('#') && line.includes('=')).map(line => {
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

const response = await fetch(new URL('/api/vision/inspect', baseUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({
    assetType: 'marketing_image',
    width: 2400,
    height: 1350,
    colors: ['#FFFFFF'],
    logoBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
  }),
});
const body = await response.json().catch(() => ({}));
if (response.status !== 415 || body.ok !== false || !String(body.error || '').includes('actual image')) {
  throw new Error(`Metadata-only visual inspection was not rejected as expected (HTTP ${response.status}).`);
}
console.log('PASS: authenticated metadata-only visual inspection rejected with HTTP 415.');
