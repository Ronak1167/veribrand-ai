# VeriBrand AI — Testing Strategy & QA Record

## Verification rules

A test result is valid only for the exact source revision, runtime and target that were exercised. Browser and destructive API tests must use an isolated copy of the SQLite database, never the developer's primary data directory. Do not treat a test script's exit code or its own success banner as proof that it targeted the intended server; confirm the printed base URL first.

The active application database is SQLite. PostgreSQL schema/adapter/migration tooling is not used by normal API routes and is not covered as a production runtime database.

## Current independently observed results (15 November 2026)

| Test | Observed result | Target / notes |
| --- | --- | --- |
| ESLint | Pass, zero warnings | Local source tree |
| TypeScript | Pass | Local source tree |
| Next.js production build | Pass | Docker production image; all 37 app routes listed |
| Python compileall | Pass | backend and scripts |
| pytest | 9 passed | Local Python tests |
| Adversarial engine suite | 16/16 passed | Deterministic TypeScript engine harness |
| Cross-engine parity | 13/13 scenarios; exact score/verdict parity | Direct TypeScript/Python engine comparison, not tenant-aware HTTP route |
| API boundary validation | 11/11 passed | Authenticated API against isolated QA app |
| Python engine smoke | 3/3 passed | Backend engine |
| Python API security | All configured probes passed | Backend service API key checks |
| SQLite backup/restore drill | Passed | Synthetic tamper/recovery test plus actual 14-file app backup restored to an isolated directory; integrity ok; 20 orgs, 33 submissions, 8 evidence records |
| End-to-end workflow | Pass, all 8 sections | Isolated QA app at localhost:3002; cloned SQLite database |
| Tenant security matrix | 21/21 passed | Isolated QA app at localhost:3002 |
| Dedicated security suite | All configured probes passed | Isolated QA app at localhost:3002 |
| Browser QA | Pass, zero unexpected console/page errors | Isolated QA app; desktop and 390x844 mobile screenshots |
| Visual metadata rejection | HTTP 415 as expected | Authenticated request; metadata-only JSON is disabled |
| Actual image upload | HTTP 200; Pillow pixel quantization; 800x450 verified | Authenticated multipart upload; compliant remains null and human review required |
| API security smoke | 6/6 passed | Main local app: five protected routes return 401; health returns 200 |
| SQLite integrity | PRAGMA integrity_check = ok | Main local database |
| Docker health | Web and Python services healthy | Normal SQLite deployment; PostgreSQL disabled by default |

The browser run covers sign-in, creator studio, scenario audit, rewrite application, submission, heatmap, reviewer queue, comments, evidence library, brand vault, organization team settings, and desktop/mobile views. Screenshots are stored in docs/screenshots/.

## Commands

### Static checks and build

- npm run lint
- npx tsc --noEmit
- npm run build
- python -m compileall -q backend scripts
- python -m pytest -q
- git diff --check
- node scripts/test-sqlite-backup-restore.mjs

### API and workflow checks

- node scripts/test-api-security-remediations.mjs
- node scripts/test-visual-metadata-rejection.mjs
- node scripts/test-visual-image-upload.mjs path/to/real-test-image.png
- node scripts/e2e-complete-verification.mjs
- node scripts/test-exhaustive-security-audit.mjs
- node scripts/test-comprehensive-security.mjs
- node scripts/e2e-browser-qa.mjs

For tests that call a live server, configure the correct URL explicitly and verify the test's printed target before running. The exhaustive security script accepts TEST_APP_URL, VERIBRAND_BASE_URL, or VERIBRAND_URL. The browser and complete workflow scripts accept VERIBRAND_URL.

### Python engine checks

- python test_adversarial.py
- python test_differential.py
- python test_boundary.py
- python backend/test_engine.py
- python backend/test_api_security.py

### Visual inspection scope

POST /api/vision/inspect requires an authenticated multipart upload containing actual image bytes. Metadata-only JSON returns HTTP 415. The Python service derives raster dimensions, aspect ratio and sampled dominant colors. The result is advisory and requires human review; it does not independently identify logos, verify typography, read text, measure actual text/background contrast, or understand semantic layout. A passing geometry/palette check is not a complete brand-compliance certification.

### Tenant and security scope

The security matrix tests unauthenticated route gates, cross-tenant IDOR attempts, role boundaries and SSRF rejection. These targeted probes do not constitute a professional penetration test or prove that every API route and role combination is vulnerability-free.

### Persistence and recovery scope

SQLite is the active application database. A complete recovery exercise must include both the SQLite database (with WAL consistency) and the evidence directory. PostgreSQL backup/restore scripts cover only the optional PostgreSQL maintenance profile and are not backups of active application data.

## Browser screenshots

The Playwright browser suite stores desktop/mobile captures under docs/screenshots/. It currently checks the primary sign-in button's computed styling but does not calculate contrast ratios for every component or prove WCAG 2.2 AA conformance. Keyboard focus behavior is observed, not exhaustively audited.

## Limitations

- Automated tests do not replace independent security review, accessibility audit, load testing, operational monitoring or a disaster-recovery drill on the production host.
- Local Docker health is not proof of an external deployment.
- Multi-instance/autoscaled operation is not supported by the current SQLite runtime.
