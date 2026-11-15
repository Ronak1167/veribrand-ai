# VeriBrand AI — System Architecture & Technical Specification

## 1. Executive Summary

VeriBrand AI is an enterprise-grade, evidence-grounded brand governance platform designed to enforce multi-tenant brand integrity, regulatory compliance, and factual truth across distributed marketing and publishing pipelines.

The platform bridges creative marketing velocity and strict institutional governance by providing deterministic, explainable, sub-millisecond audits of textual claims and visual assets against certified evidence documents and organizational brand guidelines.

---

## 2. High-Level Architecture Overview

VeriBrand AI operates on a multi-tiered architecture combining a modern React 19/Next.js frontend, an authoritative server-side TypeScript verification engine, a multi-tenant relational persistence layer (with dual SQLite DatabaseSync / PostgreSQL schema parity), an asynchronous PDF/OCR candidate fact extraction pipeline, and an external Python differential verifier.

```
+---------------------------------------------------------------------------------------------------+
|                                        CLIENT TIER                                                |
|  +---------------------+   +---------------------+   +---------------------+   +---------------+  |
|  | Studio Editor &     |   | Reviewer Queue &    |   | Evidence Library &  |   | Brand Vault & |  |
|  | Ambiguity Heatmap   |   | Appeal Decisions    |   | Fact Extraction     |   | Multi-Tenant  |  |
|  +---------------------+   +---------------------+   +---------------------+   +---------------+  |
+--------------------------------------------------+------------------------------------------------+
                                                   | HTTP / REST (JSON) + HttpOnly Session
+--------------------------------------------------v------------------------------------------------+
|                                    NEXT.JS APPLICATION TIER                                       |
|  +---------------------------------------------------------------------------------------------+  |
|  | Edge / Node.js Middleware: Security Headers, CSRF, Session Auth, Tenant Context Resolvers   |  |
|  +---------------------------------------------------------------------------------------------+  |
|  | API Routing & RBAC Gate:                                                                    |  |
|  |   - /api/auth/* (Sessions, Bootstrap, Multi-Tenant Organization Switcher)                    |  |
|  |   - /api/audit (Authoritative Deterministic Multi-Tenant Verifier)                           |  |
|  |   - /api/evidence/* (Upload, SHA-256 Checksum, Candidate Fact Gate, SSRF Provenance Probe) |  |
|  |   - /api/vault/* (Rule Versioning, Lifecycle, Interactive Rule Testing Playground)           |  |
|  |   - /api/submissions/* (Drafts, Revisions, Cryptographic Approval Hashes, Resubmissions)     |  |
|  |   - /api/vision/* (Dimensions, Aspect Ratio, WCAG AA/AAA Luminance Contrast, Swatches)       |  |
|  |   - /api/analytics/* (100% Real Derived Persistence Aggregations)                           |  |
|  +---------------------------------------------------------------------------------------------+  |
+--------------------------------------------------+------------------------------------------------+
                                                   |
         +-----------------------------------------+----------------------------------------+
         |                                                                                  |
+--------v------------------------------------------+  +------------------------------------v-------+
|        AUTHORITATIVE VERIFICATION ENGINE          |  |       PERSISTENCE LAYER                    |
|  +---------------------------------------------+  |  |  +--------------------------------------+  |
|  | Tier 1: Aho-Corasick Multi-Pattern Automata |  |  |  | SQLite (Node.js built-in DatabaseSync)|  |
|  |  - Terminology, Banned Phrases, Tone, Casing|  |  |  |   - data/veribrand.db (WAL Mode)     |  |
|  +---------------------------------------------+  |  |  |   - Foreign Keys & ACID Guarantees   |  |
|  | Tier 2: Deterministic Claim Verifier        |  |  |  +--------------------------------------+  |
|  |  - 12 Claim Types & 5 Explicit Verdicts     |  |  |  | PostgreSQL (schema.postgres.sql)     |  |
|  |  - Bidirectional Negation & Scope Bounds    |  |  |  |   - 100% Entity & Constraint Parity  |  |
|  +---------------------------------------------+  |  +--------------------------------------------+
|  | Tier 3: Grounded Evidence Fact Matcher      |  |
|  |  - Tenant-Scoped Approved Source Facts      |  |
|  |  - Cryptographic Provenance Hash Injection  |  |
|  +---------------------------------------------+  |
+---------------------------------------------------+
         |
+--------v------------------------------------------+
|          ASYNC / AUXILIARY SERVICES               |
|  +---------------------------------------------+  |
|  | scripts/extract_facts.py (PyMuPDF & OCR)    |  |
|  |  - Automated Candidate Fact Extraction      |  |
|  +---------------------------------------------+  |
|  | Python FastAPI Differential Verifier        |  |
|  |  - Port 8000, 100% Cross-Engine Parity Check|  |
|  +---------------------------------------------+  |
+---------------------------------------------------+
```

---

## 3. Core Architectural Subsystems

### 3.1 Multi-Tenant Organization & Access Control
- **Tenant Hierarchy**: Every user belongs to one or more organizations via `organization_memberships`. Each membership defines an organization-scoped role (`owner`, `admin`, `reviewer`, `creator`, `readonly`).
- **Context Resolution**: Every request resolves tenant context via the active session cookie or `x-organization-id` header. System administrators maintain cross-tenant oversight while standard users are strictly isolated to their active tenant memberships.
- **Data Scoping**: Every database entity (`submissions`, `evidence_documents`, `brand_rules`, `candidate_facts`, `brand_assets`, `audit_trail`) carries an `organization_id` foreign key. All SQL queries enforce `WHERE organization_id = ?` parameterization.

### 3.2 Dual-Engine Deterministic Verification Pipeline
The platform avoids non-deterministic LLM hallucinations in compliance evaluation. The verification pipeline executes deterministically in under 10 milliseconds:
1. **Tier 1 (Lexical & Tone Enforcement)**: Aho-Corasick string matching automata scanning forbidden terms, casing violations, and hyperbolic superlatives in $O(N)$ linear time relative to input length.
2. **Tier 2 (Syntactic & Semantic Claim Parsing)**: Context-aware regular expression matchers extracting metrics, percentages, revenue figures, SLA commitments, customer counts, and time-bound promises. The parser checks bidirectional negation (e.g. "not only SOC 2" vs "not SOC 2"), contraction negations ("don't have"), phrasal revocations ("is no longer"), and lower-bound qualifications ("at least 420").
3. **Tier 3 (Evidence Grounding & Cryptographic Provenance)**: Matched claims are cross-referenced against the tenant's approved evidence facts in the database. Claims matching reviewer-certified facts receive `VERIFIED` status with full source citation and SHA-256 provenance hashes. Conflicting claims receive `CONFLICT`; claims without source evidence receive `UNVERIFIED`.

### 3.3 Automated Fact Extraction Pipeline
- **Document Ingestion**: Supports PDF, TXT, and scanned image uploads.
- **PyMuPDF Heuristics**: `scripts/extract_facts.py` extracts text blocks, table rows, and page citations.
- **Candidate Fact Queue**: Extracted facts enter the `evidence_candidate_facts` table with status `pending_review`.
- **Human Reviewer Gate**: Candidate facts cannot produce `VERIFIED` claim findings until an authenticated reviewer explicitly reviews, verifies, and promotes the fact into an active evidence document.

### 3.4 Cryptographic Provenance & Security Framework
- **Data Integrity**: Uploaded evidence files are fingerprinted with SHA-256. At audit time, checksums are verified to ensure storage files have not suffered tampering or corruption.
- **Approval Integrity**: Approved submissions generate immutable cryptographic approval hashes binding the submission text, revision ID, reviewer ID, timestamp, and audit findings.
- **SSRF Defense**: The external provenance URL reachability probe enforces a comprehensive CIDR and hostname blocklist, rejecting loopback (`127.0.0.0/8`), link-local metadata (`169.254.169.254`), private RFC 1918 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and DNS rebinding attacks.

### 3.5 Production PostgreSQL Adapter & Versioned Migrations
- **Connection Pooling**: `src/lib/db/postgres.ts` leverages a robust `pg.Pool` with connection timeouts, query profiling, and ACID transaction boundaries via `withTransaction`.
- **Versioned Migration Runner**: `src/lib/db/migrator.ts` tracks schema revisions in a dedicated `schema_migrations` table with migration hashes, ensuring zero downtime and replay safety.
- **Cross-Database Synchronization**: `scripts/migrate-sqlite-to-postgres.mjs` migrates records across all 15 relational tables with 100% data fidelity.

### 3.6 Advanced Visual Verification Engine & Spatial Layout Collision Model
- **WCAG 2.2 AA Contrast Remediation**: `src/lib/engine/visual-verifier.ts` computes relative luminance per ITU-R BT.709. If foreground contrast falls below 4.5:1 against the canvas, the engine deterministically computes a contrast-remediated hex color.
- **Logo Clear Space Boundaries**: Enforces minimum proportional clear space padding (e.g. 10% of logo height or 16px minimum). Elements infringing upon clear space margins are flagged.
- **AABB Spatial Collision Detection**: Implements Axis-Aligned Bounding Box (AABB) intersection algorithms to detect overlaps between headlines, body copy, call-to-action buttons, and promotional badges, returning exact collision pixel areas ($px^2$).
- **Typography Hierarchy Verification**: Audits font scale sequences (Headline $\ge$ Subhead $\ge$ Body $\ge$ Caption) and flags unapproved font families.

### 3.7 Organization & Member Lifecycle Management
- **Full UI Integration**: `src/components/OrganizationManagementModal.tsx` provides full organization profile editing, member role promotions/demotions, invitation token generation/revocation, and sole-owner demotion protection.
- **Multi-Tenant REST Endpoints**: Backed by `/api/organizations/[id]`, `/api/organizations/[id]/members`, `/api/organizations/[id]/members/[memberId]`, and `/api/organizations/invitations/[token]`.

### 3.8 Enterprise Automated Backup, Restore & Disaster Recovery
- **Hot Backups**: `scripts/backup-postgres.mjs` dumps all 15 tables with SHA-256 integrity checksums to timestamped JSON archives.
- **Atomic Restores**: `scripts/restore-postgres.mjs` cleans and repopulates tables in dependency order with cryptographic checksum verification.
- **Disaster Recovery Drill**: `scripts/test-backup-restore-drill.mjs` verifies complete backup-restore roundtrips with 100% data parity.

---

## 4. Hardware & Runtime Specifications

| Component | Technology | Target Latency / Metric | Runtime Environment |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | Next.js 16.4 / React 19 | < 100ms Hydration | Node.js 22-alpine / Edge |
| **Tier-1 Matcher** | TypeScript Aho-Corasick | < 1ms Latency | Next.js Serverless / Standalone |
| **Tier-2 Verifier** | TypeScript Claim Parser | < 5ms Latency | Next.js Serverless / Standalone |
| **Primary Database**| Node.js `node:sqlite` | < 2ms Query Latency | Persistent SSD Volume (`/app/data`) |
| **Production DB Parity**| PostgreSQL 16+ | ACID Compliant | Managed Cloud Postgres |
| **Fact Extractor** | Python 3.12 / PyMuPDF | < 500ms / Page | Asynchronous Worker / CLI |
| **Differential Engine**| Python FastAPI | 0 Delta Parity | Container `python-verifier:8000` |
