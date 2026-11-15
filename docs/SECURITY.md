# VeriBrand AI — Security Architecture & Threat Model

## 1. Security Architecture Principles

VeriBrand AI is engineered with defense-in-depth principles appropriate for an enterprise compliance platform handling pre-publication press releases, quarterly disclosures, and sensitive brand assets:

1. **Zero-Trust Multi-Tenancy**: Every database query and API endpoint explicitly verifies organizational membership and role permissions.
2. **Deterministic Cryptographic Verification**: Integrity hashes (SHA-256) safeguard evidence files and approval records against post-hoc tampering.
3. **Strict Input Sanitization & Boundaries**: Strict payload size limits (100 KB max), strong schema validations, and parameterized SQL queries.
4. **Sanitized Observability**: Zero secrets, tokens, or plaintext passwords in application logs or API responses.

---

## 2. Threat Vector Mitigations & Verification

### 2.1 Multi-Tenant Privilege Escalation & Role Separation
- **Threat**: A Creator attempts to approve their own draft or access administrative user management endpoints.
- **Mitigation**: Server-side role checks (`requireTenantRole`) enforce strict boundaries:
  - `POST /api/submissions/:id/review`: Creators attempting review actions receive `HTTP 403 Forbidden`.
  - `POST /api/auth/users`: Non-admin requests receive `HTTP 403 Forbidden`.
  - `GET /api/submissions`: Scoped strictly by tenant. Foreign organization headers (`x-organization-id: ORG-FOREIGN`) return `HTTP 403 Forbidden`.

### 2.2 Server-Side Request Forgery (SSRF) Defense
- **Threat**: An attacker supplies internal loopback (`http://127.0.0.1:8000`) or cloud metadata URLs (`http://169.254.169.254/latest/meta-data`) to the provenance probe.
- **Mitigation**: `POST /api/evidence/:id/provenance` enforces strict IP and hostname validation before initiating requests:
  - Blocks `127.0.0.0/8`, `localhost`, `0.0.0.0`.
  - Blocks AWS/GCP/Azure metadata services (`169.254.169.254`, `metadata.google.internal`).
  - Blocks RFC 1918 private IPv4 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Blocks IPv6 loopback (`::1`) and link-local (`fe80::/10`).
  - Verification: `scripts/test-multi-tenant-security.mjs` probes 4 target types; all return `HTTP 400 Bad Request`.

### 2.3 Path Traversal Prevention
- **Threat**: Uploading filenames like `../../etc/passwd` or `....//windows/system32` to overwrite server files.
- **Mitigation**: Filenames are completely detached from disk storage names. The storage path is generated using timestamp and random cryptographic bytes:
  $$\text{Path} = \text{data/evidence/} + \text{Date.now()} + \text{'-'} + \text{crypto.randomBytes(8).toString('hex')} + \text{'.ext'}$$
  Attempts to pass traversal strings to download endpoints are rejected with `HTTP 400` or `HTTP 404`.

### 2.4 Brute Force Authentication Mitigation
- **Threat**: High-velocity password guessing attacks against `/api/auth/login`.
- **Mitigation**: Server-side sliding-window rate limiting tracks consecutive failed login attempts by IP and email. Exceeding 8 failed attempts triggers an immediate `HTTP 429 Too Many Requests` lockout for 15 minutes.
  - Verification: Probed in `scripts/test-comprehensive-security.mjs`; attempt #9 triggers `HTTP 429`.

### 2.5 Denial of Service (DoS) via Oversized Payloads
- **Threat**: Submitting megabyte-scale payloads to crash the server or exhaust memory.
- **Mitigation**:
  - Auth routes reject payloads exceeding 16 KB with `HTTP 413 Payload Too Large`.
  - Content audit routes enforce a strict 100,000 character limit (100 KB). Payloads exceeding this limit receive `HTTP 413`.

### 2.6 SQL Injection Parameterization
- **Threat**: Injecting SQL fragments (e.g. `' OR '1'='1' --`) via submission titles, review comments, or usernames.
- **Mitigation**: Node.js built-in `DatabaseSync` (`node:sqlite`) and PostgreSQL adapters use 100% parameterized queries (`?` or `$1, $2`). Dynamic SQL string concatenation is strictly prohibited across the codebase.

### 2.7 Cross-Site Scripting (XSS) & PII Sanitization
- **Threat**: Injecting `<script>` or event handlers into submission copy or comments.
- **Mitigation**: Submissions are stored verbatim without server-side corruption, but the React frontend renders content exclusively via JSX text nodes (which auto-escape HTML entities). HTML rendering via `dangerouslySetInnerHTML` is absent.
- **PII Redaction Engine**: `/api/privacy/redact` automatically masks Aadhaar, PAN, SSN, phone numbers, and API tokens before content leaves the local workspace.

### 2.8 Secret Sanitization in Observability
- **Password Hashing**: User passwords are never stored in plaintext. They are hashed using per-account random 16-byte salts with `crypto.scryptSync(password, salt, 64)`.
- **Zero Secret Disclosures**: User retrieval endpoints (`/api/auth/users`, `/api/auth/me`) explicitly exclude `passwordHash` and `salt`.
- **Storage Path Concealment**: Evidence list endpoints return public IDs and metadata; internal filesystem storage paths are never disclosed to the client.

---

## 3. Production Security Headers

The Next.js configuration (`next.config.ts`) injects mandatory enterprise security headers on all responses:

```http
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:8000; frame-ancestors 'none';
```

---

## 4. Exhaustive Multi-Persona Security Audit Matrix (`scripts/test-exhaustive-security-audit.mjs`)

The platform's authorization perimeter is continuously validated by an automated multi-persona security test suite covering 21 attack vectors:
1. **Unauthenticated Access Gate**: Probes 9 sensitive API endpoints (`/api/auth/me`, `/api/audit`, `/api/audit-trail`, `/api/analytics/overview`, `/api/submissions`, `/api/evidence`, `/api/vault`, `/api/organizations`, `/api/organizations/[id]`) without cookies. All return `HTTP 401 Unauthorized`.
2. **Cross-Tenant IDOR Isolation**: An attacker session attempting to read or mutate submissions, vault rules, or organization members belonging to a different tenant receives `HTTP 404` or `HTTP 403`.
3. **Role-Based Access Control (RBAC)**: Enforces that Creators cannot approve submissions (`HTTP 403`), cannot invite members (`HTTP 403`), and cannot alter memberships.
4. **SSRF Blocking**: Validates that loopback (`127.0.0.1`), cloud metadata (`169.254.169.254`), and private subnets (`10.0.0.1`, `192.168.1.1`) are strictly rejected with `HTTP 400 Bad Request`.
5. **Session Invalidation**: Tests that logged-out session cookies are immediately denied (`HTTP 401`).

---

## 5. Sole Owner Demotion Defense

To prevent organization lockout and hostile takeovers:
- When removing a member (`DELETE /api/organizations/[id]/members/[memberId]`) or updating a member's role (`PATCH /api/organizations/[id]/members/[memberId]`), the system counts the remaining members holding the `owner` role.
- If the target user is the sole owner, the operation is blocked with `HTTP 400 Bad Request` ("Cannot remove or demote the sole owner of an organization. Transfer ownership first.").

---

## 6. Cryptographic Approval Integrity & Non-Repudiation

When a reviewer approves a content submission:
1. The submission text, current revision ID, channel, reviewer identity, and timestamp are serialized into a canonical JSON structure.
2. A cryptographic SHA-256 hash is generated and persisted in `submissions.sha256_hash`.
3. Any subsequent modification to the underlying text or revision history invalidates the cryptographic verification check (`integrityVerified === false`), providing tamper-proof non-repudiation.
