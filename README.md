# VeriBrand AI — Intelligent Pre-Publication Brand Governance & Explainable Compliance Engine

[![Local Build](https://img.shields.io/badge/local%20Docker%20build-verified-brightgreen.svg)](docs/TESTING.md)
[![Security Matrix](https://img.shields.io/badge/security%20matrix-21%2F21%20passed-success.svg)](docs/TESTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-black.svg)](https://nextjs.org/)

VeriBrand AI is a prototype for evidence-grounded brand governance. It helps teams review marketing content against configured brand rules, check claims against approved evidence, and route submissions through human review before publication.

Built with **Next.js 16 (React 19)**, a **deterministic claim verification engine**, **organization-scoped roles**, **candidate evidence extraction**, and **cryptographic provenance tracking**, VeriBrand AI demonstrates a workflow for reducing unsupported claims and brand-rule violations. It is not a legal or regulatory compliance certification system.

**Runtime note:** The active application database is SQLite and the supported Docker topology is single-instance. PostgreSQL migration tooling is experimental and is not used by the app's API routes. Visual analysis currently checks image geometry and sampled colors; it does not independently verify logos, typography, text contrast, or semantic layout. See [deployment constraints](docs/DEPLOYMENT.md) and [testing scope](docs/TESTING.md).

---

## Key Highlights

- **Organization-Scoped Access**: Tenant context, membership checks, and role-based access (`owner`, `admin`, `reviewer`, `creator`, `readonly`) across the tested submission, evidence, vault, and organization routes.
- **Deterministic Verification Engine**: Fast evaluation combining Tier-1 Aho-Corasick multi-pattern string automata, Tier-2 contextual claim parsing across 12 distinct categories, and Tier-3 evidence grounding.
- **6 Explicit Outcomes**: `VERIFIED` (matches an approved source fact), `CONFLICT` (contradicts an approved source fact), `UNVERIFIED` (no approved source supports the claim), `REVIEW_REQUIRED` (requires human validation), `NOT_APPLICABLE` (editorial/safe-harbor), and `SUGGESTION` (brand or tone rule needs revision).
- **Automated Evidence Document Extraction**: PyMuPDF-based text and table extraction (`scripts/extract_facts.py`) discovering candidate metrics with an authenticated human reviewer approval gate.
- **Cryptographic Provenance Dossier**: SHA-256 fingerprinting of evidence files, approval hashes recorded with audited submissions, and SSRF-protected reachability verification.
- **Brand Vault & Rule Lifecycle**: Versioned custom brand rules (`brand_rule_versions`) with atomic rollback and an interactive Rule Testing Playground.
- **Visual Brand Inspection**: Actual raster dimensions and sampled dominant pixel colors are inspected. Logo identity, typography, text contrast and semantic layout require human review.
- **Derived Analytics**: Analytics are computed from persisted SQLite records; verify each metric and route against the current test suite before relying on it.
- **Persistence**: Native `node:sqlite` in WAL mode is the active application database. PostgreSQL schema/adapter/migration tooling is experimental and is not used by application API routes.

---

## Architectural Overview

```
+-----------------------------------------------------------------------------------------------+
|                                      CLIENT INTERFACE                                         |
|  Studio Editor (Live Audit) │ Reviewer Queue (Adjudication) │ Brand Vault │ Evidence Library  |
+----------------------------------------------+------------------------------------------------+
                                               │ HTTP / REST (JSON) + HttpOnly Session
+----------------------------------------------v------------------------------------------------+
|                                  NEXT.JS APPLICATION TIER                                     |
|  - RBAC Middleware & Tenant Context Resolution (/api/auth/me, /api/organizations/switch)      |
|  - Authoritative Evidence-Grounded Audit Engine (/api/audit)                                  |
|  - Evidence Extraction & Candidate Fact Gate (/api/evidence/[id]/candidates)                  |
|  - Brand Vault Versioning & Playground (/api/vault/rules, /api/vault/test-rule)               |
|  - Raster Image Inspection & Asset Library (/api/vision/inspect, /api/vision/assets)          |
|  - Organization Analytics (/api/analytics/overview, /api/analytics/ambiguity)                 |
+----------------------------------------------+------------------------------------------------+
                                               │
         +-------------------------------------+------------------------------------+
         │                                                                          │
+--------v--------------------------------------+  +--------------------------------v-------+
|  AUTHORITATIVE VERIFICATION PIPELINE          |  |  PERSISTENCE & STORAGE LAYER           |
|  - Tier 1: Aho-Corasick Multi-Pattern Trie    |  |  - SQLite (node:sqlite DatabaseSync)   |
|  - Tier 2: Deterministic 12-Claim Parser      |  |    data/veribrand.db (WAL Mode)        |
|  - Tier 3: Tenant Evidence Fact Matcher       |  |  - Experimental PostgreSQL schema     |
|  - Negation & Semantic Scope Invariants       |  |    Optional maintenance tooling only  |
+-----------------------------------------------+  +----------------------------------------+
```

---

## Quick Start & Local Setup

### 1. Requirements
- Node.js 22.13+ (built-in `node:sqlite` required)
- npm
- Docker Engine & Docker Compose (optional for containerized deployment)
- Python 3.10+ (for evidence extraction script and differential verifier)

### 2. Local Installation

```bash
# Clone the repository
git clone https://github.com/Ronak1167/veribrand-ai.git
cd veribrand-ai

# Install dependencies
npm ci

# Configure environment variables
cp .env.example .env.local
```

Set a secure random bootstrap token (minimum 32 characters) in `.env.local`:
```dotenv
VERIBRAND_BOOTSTRAP_TOKEN=your-random-32-char-bootstrap-setup-token
```

### 3. Running with Docker Compose (Recommended)

```bash
docker compose up -d --build
```
Access the application at `http://localhost:3000`.

### 4. Running Standalone Node.js

```bash
# Compile production standalone assets
npm run build

# Start the standalone server
node .next/standalone/server.js
```

### 5. Initial Administrator Bootstrap
1. Open `http://localhost:3000` in your browser.
2. Complete the initial setup form using the `VERIBRAND_BOOTSTRAP_TOKEN` configured in `.env.local`.
3. Enter your administrator credentials. The bootstrap endpoint permanently seals upon completion.
4. From the Brand Vault panel, invite or create team members with specific roles: `admin`, `reviewer`, `creator`, or `readonly`.

---

## Verification & Test Suite

VeriBrand AI enforces an empirical verification standard. All test suites run against live server endpoints:

```bash
# 1. ESLint Code Standards
npm run lint

# 2. Next.js Production Compilation & TypeScript
npm run build

# 3. Multi-Tenant Security & Isolation Test Suite (17/17 PASS)
npx tsx scripts/test-multi-tenant-security.mjs

# 4. Penetration & Application Security Audit (7/7 PASS)
node scripts/test-comprehensive-security.mjs

# 5. Adversarial Disinformation & Negation Verification (16/16 PASS)
python test_adversarial.py

# 6. Cross-Engine TypeScript vs Python Differential Parity (Delta 0)
python test_differential.py

# 7. API Boundary Validation Suite (11/11 PASS)
python test_boundary.py

# 8. React Hydration & Mobile Viewport Audit (4/4 PASS)
node test_hydration.mjs
```

---

## Documentation Index

Comprehensive engineering guides and technical reports are available in the [`docs/`](docs/) directory:

- [**System Architecture & Technical Specification**](docs/ARCHITECTURE.md)
- [**Multi-Tenancy & Role-Based Access Control (RBAC)**](docs/MULTI_TENANCY.md)
- [**Automated Evidence Document Extraction Pipeline**](docs/EVIDENCE_EXTRACTION.md)
- [**Cryptographic Evidence Provenance & SSRF Defense**](docs/EVIDENCE_PROVENANCE.md)
- [**Brand Vault & Custom Rule Management**](docs/BRAND_RULES.md)
- [**Deterministic Claim Verification Engine**](docs/VERIFICATION_ENGINE.md)
- [**Security Architecture & Threat Model**](docs/SECURITY.md)
- [**Database Schema, Persistence & Migrations**](docs/DATABASE_MIGRATIONS.md)
- [**Deployment & Operations Guide**](docs/DEPLOYMENT.md)
- [**Testing Strategy & Quality Assurance Guide**](docs/TESTING.md)
- [**Known Limitations & Future Roadmap**](docs/KNOWN_LIMITATIONS.md)
- [**Master Engineering Implementation Report**](docs/FINAL_IMPLEMENTATION_REPORT.md)

---

## Project Status & Hackathon Submission

- **Problem Statement:** Inkloom AI Brand Governance Challenge
- **Competition:** CodeNova India Hackathon 2026
- **Team:** Team Deccans
- **Architect & Full-Stack Lead:** Ronak Jain
- **Status:** **Hackathon / evaluation build — local Docker deployment verified; production go-live gates remain**
