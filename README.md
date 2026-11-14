# VeriBrand AI: Intelligent Pre-Publication Brand Governance & Explainable Compliance Engine

[![CodeNova India 2026](https://img.shields.io/badge/Hackathon-CodeNova%20India%202026-indigo.svg)](https://antigravity.dev)
[![Track: Inkloom AI](https://img.shields.io/badge/Track-Inkloom%20AI%20(Brand%20Governance)-cyan.svg)](https://inkloom.ai)
[![Team: Team Deccans](https://img.shields.io/badge/Team-Team%20Deccans-emerald.svg)](https://github.com/Ronak1167)
[![Solo Architect](https://img.shields.io/badge/Solo%20Builder-Ronak%20Jain-purple.svg)](mailto:ronak1167.h@gmail.com)
[![Next.js 16](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org)
[![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI%20Async-009688.svg)](https://fastapi.tiangolo.com)
[![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-blue.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

> **Round 2: The Build Submission**  
> **Problem Statement by Inkloom AI**: Build an intelligent brand-governance platform that reviews content before publication, checking it against approved guidelines, facts, and assets. Replace punitive rejections with transparent citations and intent-preserving corrections.

---

## 🌟 The Core Vision: "Coaching & Elevation over Gatekeeping"

Modern enterprises publish at dizzying velocity across dispersed teams, freelance agencies, and generative AI drafting tools. When brand governance acts as a rigid, black-box gatekeeper with binary rejections, creators bypass review workflows.

**VeriBrand AI** transforms brand governance from a punitive blocker into an active, explainable co-pilot:
1. **Seeded Brand Vault (Demo)**: Configured demo metrics, trademark rules, and visual swatches; document ingestion and source versioning are not yet implemented.
2. **Two-Tier Hybrid Pipeline**: Measured deterministic filtering (Aho-Corasick; latency varies by device and input) paired with deterministic claim verification against configured demo metrics (Tri-state evaluation).
3. **Intent-Preserving Rewrites**: Generates 3 tone-matched alternatives (Direct, Punchy, Conservative) with 1-click adoption.
4. **Human-in-the-Loop Sign-Off**: Side-by-side diff inspection, creator appeal notes, and browser-side SHA-256 content-integrity verification records.
5. **Reverse Brand Intelligence**: Guideline Ambiguity Heatmap combining seeded benchmark values with current-draft findings and browser-recorded creator overrides.

---

## 🎯 The Three Named Improvements (Official Rubric Core)

In our Round 1 proposal, we committed to delivering three primary architectural advancements:

| Named Improvement | Technical Architecture | User & Enterprise Value |
|---|---|---|
| **1. Deterministic Claim Verification Engine** | Deterministic Tri-State Model (`VERIFIED`, `CONFLICT`, `UNVERIFIED`). Compares supported claim patterns against configured demo metrics. Evidence references are seeded metadata; source-document ingestion and page-level retrieval are not implemented. It abstains (unverified metrics trigger `OUTDATED` or `MISSING_SOURCE`). | Helps identify unsupported or contradictory claims; it is not legal advice, a compliance certification, or a guarantee against regulatory penalties. |
| **2. Intent-Preserving Explainable Corrections** | Real-time redlines paired with exact rule citations and **3 Tone-Matched Alternatives** (*Direct*, *Punchy*, *Conservative*) with 1-click replacement. | Offers deterministic rewrite alternatives while preserving creator choice. The 75% turnaround figure is an internal projected target, not a measured product outcome. |
| **3. Reverse Brand Intelligence & Ambiguity Feedback Loop** | Heatmap combining seeded baseline metrics with current draft-scan findings and creator overrides recorded in this browser; it is not a multi-user analytics service. | Closes the loop for CMOs and Brand Directors: identifies ambiguously worded guidelines rather than blaming writers. |

---

## ⚡ Two-Tier Engine Architecture

```
                       [ Content Draft Input ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
   [ TIER-1 FILTER ]                          [ TIER-2 CLAIM VERIFIER ]
Aho-Corasick Automaton (<1ms)             Configured-Metric Tri-State Claim Verifier
  • Trademark Casing Rules                      • Factual Assertion Extraction
  • Deprecated Jargon Terminology               • Configured Demo Metrics
  • Non-Brand Hex Swatches (#FF0033)            • Tri-State Verification
          │                                               │
          └───────────────────────┬───────────────────────┘
                                  ▼
                   [ Explainable Redline Matrix ]
                 • Exact Stylebook / Legal Citation
                 • Configured evidence metadata (if claim)
                 • 3 Tone-Matched Alternatives (Direct/Punchy/Conservative)
                                  │
                                  ▼
                [ Human-in-the-Loop Review Queue ]
                 • Creator Override Justification
                 • Side-by-Side Revision Diff View
                 • SHA-256 Content-Integrity Hash Ledger Stamped
                                  │
                                  ▼
                 [ Reverse Brand Intelligence ]
                 • Guideline Ambiguity Heatmap
                 • Stylebook Clarification Recommendations
```

---

## 🛠️ Technology Stack & Decisions

- **Frontend Canvas**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion.
- **Backend API**: Python FastAPI (Async ASGI), Pydantic V2 structured models, OpenAPI/Swagger docs.
- **Deterministic String Engine**: In-memory Aho-Corasick Automaton for O(n + m) multi-pattern matching.
- **Computer Vision**: OpenCV + Pillow for dominant color extraction & WCAG 2.1 AA luminance contrast validation.
- **Audit Cryptography**: Browser-side SHA-256 content-integrity verification records.
- **Containerization**: Docker & Multi-stage container builds.

---

## 🚀 Quickstart Guide (Run Locally in 60 Seconds)

### 1. Run the Next.js Frontend & Unified API
```bash
cd veribrand-ai
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 2. Run the Python FastAPI Backend (Optional Microservice)
```bash
cd veribrand-ai/backend
pip install -r requirements.txt
python main.py
```
FastAPI Swagger docs available at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

### 3. Run the Automated Test Suite
```bash
cd veribrand-ai
python test_adversarial.py
```

---

## 🧪 Preset Test Scenarios for Hackathon Judges

To facilitate frictionless evaluation, VeriBrand AI features 3 built-in demo scenarios selectable from the header:

1. **Scenario 1: High-Risk Copy with Multiple Violations (8 Flags Across Tiers 1 & 2)**:
   - Includes lowercase `"inkloom"`, `"artificial intelligence wizard"`, hyperbolic `"world's most revolutionary"`, contradictory SLA (`99.999%` vs approved `99.9%`), exaggerated customer count (`1,500` vs approved `420+`), conflicting revenue (`$50M` vs audited `$18.5M`), outdated pricing (`$49/mo`), and rogue hex swatch (`#ff0033`).
2. **Scenario 2: Subtle Borderline Copy (2 Flags)**:
   - Demonstrates nuance: verified metrics pass cleanly, while unverified legal superlatives trigger deterministic abstention.
3. **Scenario 3: 100% On-Brand Compliant Draft (Green Pass)**:
   - Demonstrates a flawless draft receiving a 100/100 compliance score, ready for 1-click reviewer sign-off.

---

## 🛡️ Enterprise Verification Invariants & Channel Governance

VeriBrand AI enforces rigorous deterministic invariants across both its Next.js and Python engines:

- **Numerical Comparison & Bidirectional Negation**: Metric assertions undergo exact numerical verification against configured demo Brand Vault disclosures (e.g. 94.2% client retention verified; 94.9% or 95% triggers `CONFLICT`). Preceding and subsequent negations (e.g. `"We do not provide 99.9% uptime"`, `"SOC 2 Type II is no longer active"`) are flagged as critical contractual contradictions.
- **Context-Aware Financial Classification**: Distinguishes audited Annual Recurring Revenue ($18.5M ARR) from total annual revenue while automatically recognizing non-revenue financial contexts (seed/series funding rounds, corporate valuations, capital investments) without false classification.
- **Entity Scope Strictness**: Ground truth customer account metrics (`420+ active enterprise customer accounts`) are strictly bound to accounts; assertions quoting "brands" or "organizations" trigger deterministic abstention (`UNVERIFIED`).
- **Channel-Aware Governance Policies**:
  - **Twitter / X**: Enforces platform length limits (>280 characters flagged with condensation rewrites).
  - **Press Releases**: Heightens regulatory scrutiny under SEC/ASCI guidelines, elevating marketing tone warnings and unsubstantiated superlatives to critical severity.

---

## 👤 Team & Contribution Details

- **Hackathon**: CodeNova India 2026
- **Track**: Inkloom AI (Brand Governance)
- **Official Team Name**: Team Deccans (VeriBrand AI)
- **Solo Architect & Full-Stack Engineer**: Ronak Jain (`ronak1167.h@gmail.com`)
- **100% Solo Ownership**: System architecture, Next.js frontend canvas, FastAPI backend services, Aho-Corasick string matching, hybrid claim verifier, and UI/UX design.
