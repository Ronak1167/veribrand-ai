# VeriBrand AI: Intelligent Pre-Publication Brand Governance & Explainable Compliance Engine

[![CodeNova India 2026](https://img.shields.io/badge/Hackathon-CodeNova%20India%202026-indigo.svg)](https://antigravity.dev)
[![Track: Inkloom AI](https://img.shields.io/badge/Track-Inkloom%20AI%20(Brand%20Governance)-cyan.svg)](https://inkloom.ai)
[![Team: Team Deccans](https://img.shields.io/badge/Team-Team%20Deccans-emerald.svg)](https://github.com/Ronak1167)
[![Solo Architect](https://img.shields.io/badge/Solo%20Builder-Ronak%20Jain-purple.svg)](mailto:ronak1167.h@gmail.com)
[![Next.js 16](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org)
[![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI%20Async-009688.svg)](https://fastapi.tiangolo.com)
[![SQLite ACID](https://img.shields.io/badge/Persistence-SQLite%20WAL-003B57.svg)](https://sqlite.org)
[![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-blue.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

> **Round 2: The Build Submission — Enterprise Production-Ready Edition**  
> **Problem Statement by Inkloom AI**: Build an intelligent brand-governance platform that reviews content before publication, checking it against approved guidelines, facts, and assets. Replace punitive rejections with transparent citations and intent-preserving corrections.

---

## 🌟 The Core Vision: "Coaching & Elevation over Gatekeeping"

Modern enterprises publish at dizzying velocity across dispersed teams, freelance agencies, and generative AI drafting tools. When brand governance acts as a rigid, black-box gatekeeper with binary rejections, creators bypass review workflows.

**VeriBrand AI** transforms brand governance from a punitive blocker into an active, explainable co-pilot:
1. **Durable Brand Vault & Evidence Provenance**: Ground-truth approved metrics, trademark rules, and evidence citations stored with durable SQLite persistence (`data/veribrand.db`).
2. **Two-Tier Hybrid Pipeline**: Fast in-memory Aho-Corasick automaton for high-velocity lexical scanning paired with a deterministic tri-state claim verifier (`VERIFIED`, `CONFLICT`, `UNVERIFIED`).
3. **Intent-Preserving Explainable Rewrites**: Generates 3 tone-matched alternatives (Direct, Punchy, Conservative) with 1-click adoption and stale rewrite safety.
4. **Human-in-the-Loop Review Workflow**: Revision-scoped appeal adjudication, structured exception sign-offs, and server-side canonical SHA-256 cryptographic provenance stamping.
5. **Reverse Brand Intelligence**: Guideline Ambiguity Heatmap attributing creator overrides to stable rule identifiers, uncovering ambiguous brand guidelines.
6. **Auxiliary Governance APIs**: Multi-modal visual palette WCAG AA/AAA validator (`/api/vision/palette`), automated PII and credential redactor (`/api/privacy/redact`), real evidence management (`/api/evidence`), and immutable audit trail (`/api/audit-trail`).

---

## 🎯 The Three Named Improvements (Official Rubric Core)

| Named Improvement | Technical Architecture | User & Enterprise Value |
|---|---|---|
| **1. Deterministic Claim Verification Engine** | Deterministic Tri-State Model (`VERIFIED`, `CONFLICT`, `UNVERIFIED`). Compares supported assertions against approved Brand Vault metrics. Correctly handles questions, disclaimers, unrenewed/lapsed certifications, competitor claims, and complex double negations with zero false approvals. | Eliminates catastrophic brand and legal exposure by catching contradictory or ungrounded assertions prior to syndication. |
| **2. Intent-Preserving Explainable Corrections** | Real-time redlines paired with exact rule citations and **3 Tone-Matched Alternatives** (*Direct*, *Punchy*, *Conservative*) with 1-click replacement. | Offers deterministic rewrite alternatives while preserving creator velocity and choice. |
| **3. Reverse Brand Intelligence & Ambiguity Feedback Loop** | Heatmap calculating override-to-trigger ratios per stable rule ID. Uncovers guidelines with high creator confusion. | Closes the loop for CMOs and Brand Directors: identifies ambiguously worded guidelines rather than penalizing writers. |

---

## ⚡ Two-Tier Engine Architecture

```
                       [ Content Draft Input ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
   [ TIER-1 FILTER ]                          [ TIER-2 CLAIM VERIFIER ]
Aho-Corasick Automaton (<1ms)             Configured-Metric Tri-State Claim Verifier
  • Trademark Casing Rules                      • Sentence-Level Polarity Extraction
  • Deprecated Jargon Terminology               • Decimal-Safe Question & Negation Parsing
  • Non-Brand Hex Swatches                      • Ground Truth Numerical Verification
          │                                               │
          └───────────────────────┬───────────────────────┘
                                  ▼
                   [ Explainable Redline Matrix ]
                 • Exact Stylebook / Legal Citation
                 • Evidence provenance metadata
                 • 3 Tone-Matched Alternatives (Direct/Punchy/Conservative)
                                  │
                                  ▼
                [ Human-in-the-Loop Review Queue ]
                 • Server-Side Role-Based Session Auth (Creator / Reviewer / Admin)
                 • Revision-Scoped Appeal Adjudication (Prevents Stale Re-Use)
                 • Side-by-Side Revision Diff View
                 • Server-Side Canonical SHA-256 Integrity Stamp
                                  │
                                  ▼
                 [ Reverse Brand Intelligence ]
                 • Guideline Ambiguity Heatmap
                 • Stylebook Clarification Recommendations
```

---

## 🛠️ Technology Stack & Decisions

- **Frontend Canvas**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, Canvas Confetti.
- **Backend API**: Python FastAPI (Async ASGI), Pydantic V2 structured models, OpenAPI/Swagger docs.
- **Deterministic Engine**: Dual-stack (TypeScript + Python) deterministic Aho-Corasick automaton with exact parity.
- **Durable Persistence**: Built-in `node:sqlite` (`DatabaseSync` in Node v25) & Python `sqlite3` on `data/veribrand.db` with WAL mode and ACID transactions.
- **Authentication & RBAC**: Server-side session authentication with HttpOnly cookies, password hashing (`scrypt`), and Creator/Reviewer/Admin authorization gates.
- **Audit Cryptography**: Server-side canonical SHA-256 hashing and tamper-detection verification.
- **Accessibility**: Semantic HTML, ARIA attributes, keyboard navigation, and WCAG 2.1 AA luminance contrast compliant.
- **Containerization**: Multi-stage Docker build with non-root security runner and healthchecks.

---

## 🚀 Quickstart Guide (Run Locally in 60 Seconds)

### 1. Prerequisites
- **Node.js**: v20+ (Node v22 or v25 recommended)
- **Python**: 3.10+ (Python 3.12 or 3.14 tested)

### 2. Run the Next.js Unified Application
```bash
cd veribrand-ai
npm install
npm run build
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

Default Test User Credentials:
- **Reviewer**: `reviewer@inkloom.ai` / `Password123!`
- **Creator**: `creator@inkloom.ai` / `Password123!`
- **Admin**: `admin@inkloom.ai` / `Password123!`

### 3. Run the Python FastAPI Backend (Optional Dedicated Service)
```bash
cd veribrand-ai/backend
pip install -r requirements.txt
python main.py
```
FastAPI Swagger docs available at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

### 4. Run with Docker
```bash
cd veribrand-ai
docker build -t veribrand-ai .
docker run -p 3000:3000 veribrand-ai
```

---

## 🧪 Comprehensive Automated Verification Test Matrix

VeriBrand AI includes an exhaustive test suite verifying every component empirically:

```bash
# 1. Lint and Static Typing
npm run lint

# 2. Production Build Verification
npm run build

# 3. Client Hydration & SSR Safety
node test_hydration.mjs

# 4. End-to-End Workflow & Human Review Sign-Off
node test_workflow.mjs

# 5. Core Python Engine Verification
python backend/test_engine.py

# 6. Assertion Polarity & Regression Suite (Zero False Approvals)
python test_assertion_regressions.py

# 7. Cross-Revision Appeal Security (Prevents Stale Authorizations)
python test_appeal_revision_security.py

# 8. Differential Parity Between TypeScript and Python
python test_differential.py

# 9. Boundary Value Verification
python test_boundary.py

# 10. Adversarial Stress Suite (39 Variations)
python test_adversarial.py
```

---

## 🛡️ Enterprise Verification Invariants & Security Architecture

1. **Zero False Approvals**:
   - **Questions**: Inverted auxiliary phrases (`"Do we have SOC 2 certification?"`) or trailing question marks are flagged as `UNVERIFIED` and cannot yield 100/100.
   - **Lapsed Certifications**: Phrases indicating unrenewed certifications (`"SOC 2 Type II certification has not been renewed"`) yield critical `CONFLICT`.
   - **Disclaimed Guarantees**: Metric assertions qualified by disclaimers (`"We have 99.9% uptime but do not guarantee it"`) yield `UNVERIFIED`.
   - **Competitor Metrics**: Exaggerated metrics attributed to competitors (`"Competitor claims 99.999% uptime"`) are tagged as `SUGGESTION` without contaminating the brand's own SLA rating.
   - **Double Negation**: Sophisticated negative idioms (`"We are not only not SOC 2 certified"`) are parsed as negative assertions and flagged as `CONFLICT`.
   - **Negated Metrics**: Negated unsupported metrics (`"We do not have 17 regional offices"`) are safely ignored, preventing false positives.

2. **Revision-Scoped Authorization**:
   - Appeal decisions are bound strictly to `submissionId`, `revisionId`, and `findingFingerprint`.
   - An appeal accepted on Revision 1 does not authorize approval of Revision 2. If a creator resubmits, unresolved critical findings on the new revision block approval until re-adjudicated or resolved.

3. **Durable ACID Persistence**:
   - Built on local SQLite with WAL mode (`PRAGMA journal_mode = WAL;`).
   - All reviews, revisions, comments, appeal decisions, and evidence records persist across restarts.

4. **Cryptographic Provenance**:
   - Upon sign-off, the server computes a canonical SHA-256 hash incorporating the final sanitized copy, the reviewer identity, and the ISO 8601 timestamp.

---

## 👤 Team & Contribution Details

- **Hackathon**: CodeNova India 2026
- **Track**: Inkloom AI (Brand Governance)
- **Official Team Name**: Team Deccans (VeriBrand AI)
- **Solo Architect & Full-Stack Engineer**: Ronak Jain (`ronak1167.h@gmail.com`)
- **100% Solo Ownership**: End-to-end architecture, Next.js frontend canvas, FastAPI backend services, Aho-Corasick string matching, hybrid claim verifier, SQLite persistence, and UI/UX design.
