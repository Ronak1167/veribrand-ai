const base = process.env.VERIBRAND_BASE_URL || 'http://localhost:3000';
const cases = [
  ['GET /api/audit', () => fetch(`${base}/api/audit`)],
  ['POST /api/audit', () => fetch(`${base}/api/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '99.9% uptime', channel: 'linkedin' }) })],
  ['GET /api/audit-trail', () => fetch(`${base}/api/audit-trail`)],
  ['GET /api/analytics/overview', () => fetch(`${base}/api/analytics/overview`)],
  ['GET /api/organizations', () => fetch(`${base}/api/organizations`)],
];
let failures = 0;
for (const [name, request] of cases) {
  const response = await request();
  const pass = response.status === 401;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}`);
  if (!pass) failures++;
}
const health = await fetch(`${base}/api/health`);
const healthPass = health.status === 200;
console.log(`${healthPass ? 'PASS' : 'FAIL'} GET /api/health: HTTP ${health.status}`);
if (!healthPass) failures++;
if (failures) process.exit(1);
console.log(`Security API smoke checks passed: ${cases.length + 1}/${cases.length + 1}`);
