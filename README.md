# VeriBrand AI

Pre-publication brand-governance workspace built with Next.js, TypeScript, a deterministic claim verifier, and SQLite-backed review workflows.

> **Project status:** Hackathon MVP with authenticated local workflows. It is not independently certified for regulated or enterprise production use.

## What is implemented

- Deterministic text scanning and configured-metric claim checks in the TypeScript and Python engines.
- Claim polarity handling for questions, negation, disclaimers, competitor attribution, and financial metric distinctions. The engine is rule-based; it is not an LLM and cannot establish facts beyond configured evidence.
- Revisioned submissions, reviewer comments, appeal decisions, and review status stored in SQLite.
- First-administrator bootstrap, password login, HTTP-only session cookies, and server-side role checks.
- Server-generated revision hashes and approval hashes. Approval hash verification is available from the individual submission API.
- Evidence **metadata** records. The current implementation does not upload, retain, parse, or independently validate source-document files.
- A hex-color palette and contrast calculator. It does not inspect uploaded images or extract image palettes.
- Pattern-based PII redaction. This is a best-effort helper, not comprehensive DLP or a guarantee that all sensitive information is detected.
- A local ambiguity heatmap with seeded benchmark values; it is not a complete multi-tenant analytics service.

## Architecture

- **Web application:** Next.js App Router, React, TypeScript, Tailwind CSS.
- **Primary application engine:** TypeScript deterministic verifier used by the Next.js application.
- **Optional Python service:** FastAPI implementation of the verifier. It is a separate service and is not the authoritative persistence/workflow backend for the Next.js UI.
- **Persistence:** Node built-in `node:sqlite` database at `data/veribrand.db`, using SQLite WAL mode.
- **Authentication:** Server-side SQLite sessions, HttpOnly cookies, per-account random-salt scrypt password hashes, and role checks on protected routes.

The SQLite database and its containing directory must be on persistent writable storage. Do not use ephemeral serverless filesystem storage for a multi-instance deployment.

## Requirements

- Node.js 22.13+ (built-in `node:sqlite` required)
- npm
- Python 3.10+ only for the optional FastAPI service and Python test suite

## Local setup

1. Install dependencies:

```bash
npm ci
```

2. Create a cryptographically random bootstrap token (at least 32 characters) and put it in an untracked `.env.local` file:

```dotenv
VERIBRAND_BOOTSTRAP_TOKEN=your-long-random-one-time-setup-token
```

Do not commit `.env.local` or share the token. The repository's `.env.example` contains a placeholder only.

3. Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

4. On first visit, use the initial-administrator setup form. Enter the bootstrap token from `.env.local`, your name, email, and a strong password (at least 14 characters). The bootstrap endpoint works only while the users table is empty. After the first administrator is created, the bootstrap endpoint is permanently closed for that database.

5. Sign in with the administrator account. Open **Brand Vault** to access the administrator-only User & Role Management panel. Create creator, reviewer, or additional administrator accounts there. The underlying admin-only endpoint is `POST /api/auth/users`.

Example JSON body:

```json
{
  "email": "reviewer@example.com",
  "name": "Brand Reviewer",
  "role": "reviewer",
  "password": "use-a-unique-password-of-at-least-14-characters"
}
```

Roles are `creator`, `reviewer`, and `admin`. A creator can create and revise their own submissions. Reviewers can review, adjudicate appeals, and approve. Administrators have elevated access.

## Useful commands

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run start
```

Optional Python service:

```bash
cd backend
python -m pip install -r requirements.txt
```

Set `VERIBRAND_PYTHON_API_KEY` to a cryptographically random value of at least 32 characters before starting the service. It binds to `127.0.0.1` by default. Set `VERIBRAND_PYTHON_HOST=0.0.0.0` only behind a trusted reverse proxy and configure `VERIBRAND_PYTHON_ALLOWED_ORIGINS` explicitly.

```bash
cd backend
python main.py
```

The Python service is independent of the Next.js SQLite workflow. Its API and data are not automatically synchronized with the web application's database. All non-health Python endpoints require `X-API-Key`; `/health` is public.

## API access model

| Endpoint | Access |
|---|---|
| `GET /api/auth/bootstrap` | Public setup-state check |
| `POST /api/auth/bootstrap` | Public only until the first admin exists; requires bootstrap token |
| `POST /api/auth/login` | Public; rate-limited per process |
| `GET /api/auth/me` | Authenticated |
| `POST /api/auth/logout` | Authenticated session is invalidated |
| `GET /api/auth/users` | Admin only; returns safe account metadata |
| `POST /api/auth/users` | Admin only |
| `GET /api/submissions` | Authenticated; creators see only their own submissions |
| `POST /api/submissions` | Creator/admin |
| `POST /api/submissions/:id/review` | Reviewer/admin |
| `POST /api/submissions/:id/appeal` | Reviewer/admin |
| `POST /api/submissions/:id/resubmit` | Owning creator/admin |
| `POST /api/submissions/:id/comments` | Authenticated; creator ownership is enforced |
| `GET /api/evidence` | Authenticated |
| `POST /api/evidence` | Reviewer/admin; stores metadata only |
| `GET /api/audit-trail` | Reviewer/admin |
| `POST /api/privacy/redact` | Authenticated |
| `POST /api/vision/palette` | Authenticated |
| Python `/health` | Public health check only |
| Python `/api/audit`, `/api/vault`, `/api/vision/contrast` | `X-API-Key` required |

The stateless content audit endpoint and static brand-rule endpoint are public. Do not send confidential drafts to a public deployment unless you intentionally configure and secure that service for your use case.

## Testing

Core tests:

```bash
npm run lint
npx tsc --noEmit
npm run build
python -m pytest -q
python test_claim_regressions.py
python test_assertion_regressions.py
python backend/test_engine.py
python backend/test_api_security.py
python -m compileall -q backend
python -m pip check
npm audit --omit=dev
```

The HTTP-based tests require the Next.js application to be running at `http://localhost:3000`:

```bash
npm run dev
# In another terminal:
node test_auth_security.mjs
node test_hydration.mjs
python test_adversarial.py
python test_boundary.py
python test_differential.py
python test_claim_regressions_api.py
```

Authenticated end-to-end tests require existing test creator and reviewer accounts. Set `VERIBRAND_TEST_CREATOR_EMAIL`, `VERIBRAND_TEST_CREATOR_PASSWORD`, `VERIBRAND_TEST_REVIEWER_EMAIL`, and `VERIBRAND_TEST_REVIEWER_PASSWORD` in your shell, then run `node test_workflow.mjs` and `python test_appeal_revision_security.py`. Do not commit test credentials. The first-visit hydration test treats expected unauthenticated `401` responses as normal.

## Docker

A multi-stage Dockerfile is provided. Build and runtime behavior must be verified on a machine with Docker available:

```bash
docker build -t veribrand-ai .
docker run --rm -p 3000:3000 -e VERIBRAND_BOOTSTRAP_TOKEN="$VERIBRAND_BOOTSTRAP_TOKEN" veribrand-ai
```

Mount `/app/data` to persistent storage before relying on the database. Set a strong bootstrap token as a deployment secret. Do not expose it to the browser or commit it.

## Security and operational limitations

- The current SQLite workflow is intended for a single application instance with persistent local storage. Multi-instance concurrency, horizontal scaling, backups, disaster recovery, and production observability have not been established.
- Login throttling is in-process and resets when the server restarts; use an edge/proxy or shared rate limiter for a public deployment.
- The optional Python service uses a shared API key and has no distributed rate limiter. Keep it on loopback or put it behind a trusted gateway with rate limiting.
- Evidence records are metadata, not document uploads or validated evidence.
- PII detection is pattern-based and can miss sensitive data or produce false positives.
- The editor's local context note is draft-only; it is not a persisted appeal, reviewer decision, or approval override.
- Hashes provide tamper-evidence for the stored revision/approval data; they are not digital signatures, a trusted timestamp, or a WORM audit archive.
- WCAG conformance has not been independently certified. The palette endpoint calculates color contrast for supplied hex values only.
- Docker build and deployment must be run and verified in an environment with Docker and persistent storage available.

## Project team

- CodeNova India 2026 — Inkloom AI track
- Team Deccans
- Project implementation: Ronak Jain
