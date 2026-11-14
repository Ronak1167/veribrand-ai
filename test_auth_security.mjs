// Unauthenticated API security regression. Protected routes must reject anonymous callers.
const base = process.env.VERIBRAND_URL || 'http://localhost:3000';
const checks = [
  ['GET', '/api/submissions', 401],
  ['POST', '/api/submissions', 401, { title: 'anonymous', channel: 'press_release', text: 'Attempt' }],
  ['GET', '/api/evidence', 401],
  ['POST', '/api/evidence', 401, { metricId: 'M1', documentName: 'fake.pdf', sectionCitation: 'p.1' }],
  ['GET', '/api/audit-trail', 401],
  ['GET', '/api/auth/users', 401],
  ['POST', '/api/auth/users', 401, { email: 'unauthorized@example.test', name: 'Unauthorized', role: 'admin', password: 'not-a-real-test-password' }],
  ['GET', '/api/submissions/unknown-id', 401],
  ['POST', '/api/submissions/unknown-id/review', 401, { action: 'approve', approvalMode: 'exception', exceptionRationale: 'Anonymous approval must never be possible.' }],
  ['POST', '/api/submissions/unknown-id/appeal', 401, { findingId: 'F1', revisionId: 'R1', decision: 'accepted', rationale: 'Anonymous appeal must never be possible.' }],
  ['POST', '/api/submissions/unknown-id/resubmit', 401, { revisedText: 'Anonymous revision must never be possible.' }],
  ['POST', '/api/privacy/redact', 401, { text: 'person@example.com' }],
  ['POST', '/api/vision/palette', 401, { colors: ['#ffffff'] }],
];

for (const [method, route, expected, body] of checks) {
  const response = await fetch(base + route, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status !== expected) {
    throw new Error(method + ' ' + route + ' returned ' + response.status + '; expected ' + expected + '.');
  }
  console.log('PASS: anonymous ' + method + ' ' + route + ' -> ' + expected);
}

const setup = await fetch(base + '/api/auth/bootstrap');
if (!setup.ok) throw new Error('Bootstrap setup-state endpoint failed.');
const setupState = await setup.json();
if (typeof setupState.setupRequired !== 'boolean') throw new Error('Bootstrap setup-state response is malformed.');
console.log('PASS: bootstrap status endpoint exposes only setupRequired boolean.');
if (setupState.setupRequired) {
  const denied = await fetch(base + '/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'incorrect-token', email: 'invalid@example.test', name: 'Invalid Setup', password: 'This-is-not-a-real-password-123!' }) });
  if (denied.status !== 403) throw new Error('Invalid bootstrap token returned ' + denied.status + ', expected 403.');
  console.log('PASS: invalid bootstrap token is rejected before creating an account.');
}
console.log('ALL AUTHORIZATION REGRESSION CHECKS PASSED (' + checks.length + '/' + checks.length + ').');
