# VeriBrand AI — Multi-Tenancy & Role-Based Access Control (RBAC)

## 1. Multi-Tenant Architecture Overview

VeriBrand AI provides complete, enterprise-grade multi-tenant data isolation. Organizations operate as independent compliance boundaries with isolated rule vaults, evidence repositories, asset libraries, submission queues, and audit analytics.

---

## 2. Organization Data Hierarchy

```
+--------------------------------------------------------------+
|                      ORGANIZATION                            |
|  - id: 'ORG-ACME-CORP'                                       |
|  - name: 'Acme Corporation'                                  |
|  - slug: 'acme-corp'                                         |
|  - tier: 'enterprise'                                        |
+------------------------------+-------------------------------+
                               |
         +---------------------+---------------------+
         |                                           |
+--------v---------------------+   +-----------------v---------+
|   ORGANIZATION MEMBERSHIPS   |   |   ORGANIZATION INVITATIONS|
|  - user_id                   |   |  - email                  |
|  - organization_id           |   |  - token (Secure Random)  |
|  - role: 'admin'|'reviewer'| |   |  - expires_at             |
|          'creator'|'readonly'|   +---------------------------+
+------------------------------+
         |
+--------v---------------------------------------------------------------------------------+
|                                 ORGANIZATION ISOLATED ENTITIES                           |
|  +---------------------+   +---------------------+   +--------------------------------+  |
|  | Submissions &       |   | Evidence Documents  |   | Brand Rules &                  |  |
|  | Revisions           |   | & Candidate Facts   |   | Version History                |  |
|  +---------------------+   +---------------------+   +--------------------------------+  |
|  | Visual Brand Assets |   | Audit Trail Logs    |   | Derived Organization Analytics |  |
|  | & Contrast Presets  |   | & Provenance Records|   | (Real Computed Metrics)        |  |
|  +---------------------+   +---------------------+   +--------------------------------+  |
+------------------------------------------------------------------------------------------+
```

---

## 3. Role-Based Access Control (RBAC) Matrix

VeriBrand AI enforces role separation both at the platform administrative level and within each specific organization tenant:

| Action / Capability | Owner | Admin | Reviewer | Creator | Readonly |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Manage Organization Settings & Billing** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Invite & Remove Members** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Users & Role Assignment** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Configure Brand Vault Rules (Create/Edit/Archive)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Upload Visual Brand Assets** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Review & Approve Submissions** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Request Changes on Submissions** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Adjudicate Appeals (Accept / Reject)** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Review & Approve Candidate Evidence Facts** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Create & Submit Content Drafts** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Revise & Resubmit Own Content Drafts** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Upload Evidence Documents for Verification**| ✅ | ✅ | ✅ | ✅ | ❌ |
| **Inspect Visual Assets (Aspect Ratio/Contrast)**| ✅ | ✅ | ✅ | ✅ | ✅ |
| **View Organization Compliance Analytics** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **View Approved Brand Rules & Evidence** | ✅ | ✅ | ✅ | ✅ | ✅ |

### Key Security Gates
1. **Self-Review Prevention Gate**: Creators are cryptographically and programmatically forbidden from reviewing, approving, or adjudicating appeals on their own submissions (`HTTP 403 Forbidden`).
2. **Reviewer Gate for Candidate Facts**: Facts extracted automatically from PDFs or OCR reside in a pending state and cannot produce `VERIFIED` claims until an authenticated Reviewer or Admin accepts them.
3. **Admin Privilege Isolation**: Reviewers and Creators cannot create new users, modify roles, or invite members to foreign organizations.

---

## 4. Tenant Context Resolution Protocol

Each incoming HTTP request undergoes deterministic tenant context resolution in `src/lib/auth/session.ts`:

1. **Authentication Extraction**:
   - Inspects `Authorization: Bearer <sessionToken>` header.
   - Inspects `veribrand_session` HttpOnly cookie.
2. **Session Verification**:
   - Queries `sessions` table in SQLite/Postgres.
   - Verifies session expiration and revokes expired tokens.
3. **Tenant Binding**:
   - Checks `x-organization-id` header or URL query parameter `?organizationId=`.
   - If omitted, defaults to the user's `active_organization_id`.
   - Checks `organization_memberships` table:
     - If the user is a verified member of the requested organization, the request proceeds with their tenant-specific role.
     - If the user is **not** a member and not a global platform administrator, access is denied with `HTTP 403 Forbidden`.
4. **Platform Administrator Override**:
   - Global administrators (`role === 'admin'`) possess cross-tenant governance privileges and can audit or manage any organization with full oversight.

---

## 5. Multi-Tenant Data Isolation Guarantees

- **Query-Level Parameterization**: Every SQL query across `database.ts` includes the organization ID in the `WHERE` clause.
- **Path Traversal & Storage Isolation**: Uploaded evidence documents and visual assets are stored in isolated tenant subdirectories (`data/evidence/[orgId]/[timestamp]-[hash].[ext]`), preventing cross-tenant filesystem access.
- **Submissions Isolation**: An organization member cannot read, update, or list submissions belonging to another organization. Attempts to query foreign submission IDs return `HTTP 404 Not Found` or `HTTP 403 Forbidden`.
- **Custom Rule Isolation**: Custom brand rules created in Organization A (e.g. Acme Corp) have zero effect on Organization B (e.g. Wayne Enterprises).
