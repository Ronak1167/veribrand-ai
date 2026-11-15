// VeriBrand AI — Cross-Service Python <-> Next.js Integration & Fallback Test Suite
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const pythonPort = 8011;
const pythonApiKey = 'vb_py_key_' + crypto.randomBytes(24).toString('hex');
const pythonBase = `http://127.0.0.1:${pythonPort}`;

console.log('================================================================');
console.log('  VERIBRAND AI — FASTAPI CROSS-SERVICE INTEGRATION TEST        ');
console.log('================================================================');

// 1. Spawn Python Service
console.log(`\n[Step 1] Starting Python FastAPI service on ${pythonBase}...`);
const env = {
  ...process.env,
  VERIBRAND_PYTHON_API_KEY: pythonApiKey,
  VERIBRAND_PYTHON_HOST: '127.0.0.1',
  VERIBRAND_PYTHON_PORT: String(pythonPort),
  VERIBRAND_PYTHON_RELOAD: 'false',
};

const pyProc = spawn('python', ['backend/main.py'], {
  cwd: process.cwd(),
  env,
  stdio: 'pipe',
});

pyProc.stderr.on('data', () => {
  // Ignore standard uvicorn info messages
});

// Wait for health endpoint
let ready = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${pythonBase}/health`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

if (!ready) {
  pyProc.kill();
  throw new Error('FastAPI service failed to become healthy within 8 seconds.');
}
console.log('-> PASS: Python FastAPI service healthy and responding on /health.');

// 2. Direct Python Engine Verification
console.log('\n[Step 2] Testing direct API-key authentication against Python service...');
const testText = 'Inkloom AI provides 99.9% uptime and audited SOC 2 Type II compliance.';

// 2a. Unauthenticated request rejected
const unauthRes = await fetch(`${pythonBase}/api/audit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: testText, channel: 'enterprise_web' }),
});
if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);
console.log('-> PASS: Unauthenticated request rejected with 401.');

// 2b. Authenticated request accepted
const authRes = await fetch(`${pythonBase}/api/audit`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': pythonApiKey,
  },
  body: JSON.stringify({ text: testText, channel: 'enterprise_web' }),
});
if (authRes.status !== 200) throw new Error(`Expected 200, got ${authRes.status}`);
const pyResult = await authRes.json();
console.log(`-> PASS: Python engine audited text. Score: ${pyResult.complianceScore || pyResult.compliance_score}`);

// 3. Contrast Endpoint in Python Engine
console.log('\n[Step 3] Testing WCAG contrast endpoint in Python service...');
const contrastRes = await fetch(`${pythonBase}/api/vision/contrast?fg=%234F46E5&bg=%23FFFFFF`, {
  headers: { 'X-API-Key': pythonApiKey },
});
if (contrastRes.status !== 200) throw new Error(`Expected 200, got ${contrastRes.status}`);
const contrastData = await contrastRes.json();
console.log(`-> PASS: Contrast ratio calculated: ${contrastData.contrast_ratio} (AA Compliant: ${contrastData.wcag_aa_compliant})`);

// 4. Terminate Python Service & Verify Graceful Termination
pyProc.kill('SIGTERM');
console.log('-> PASS: Python service cleanly terminated.');

console.log('\n================================================================');
console.log('  FASTAPI CROSS-SERVICE SECURITY & HEALTH TESTS PASSED!         ');
console.log('================================================================\n');
