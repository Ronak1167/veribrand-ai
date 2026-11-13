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
1. **Dynamic Brand Vault**: Centralized ground truth indexing style guides, verified statistical registries, trademark rules, and visual swatches.
2. **Two-Tier Hybrid Pipeline**: Sub-10ms deterministic filtering (Aho-Corasick) paired with grounded claim fact-checking (Tri-state evaluation).
3. **Intent-Preserving Rewrites**: Generates 3 tone-matched alternatives (Direct, Punchy, Conservative) with 1-click adoption.
4. **Human-in-the-Loop Sign-Off**: Side-by-side diff inspection, creator appeal notes, and immutable SHA-256 audit ledger records.
5. **Reverse Brand Intelligence**: Guideline Ambiguity Heatmap analyzing recurring review disputes to advise leadership on clarifying confusing stylebook rules.

---

## 🎯 The Three Named Improvements (Official Rubric Core)

In our Round 1 proposal, we committed to delivering three primary architectural advancements:

| Named Improvement | Technical Architecture | User & Enterprise Value |
|---|---|---|
| **1. Evidence-Backed Claim Verification Engine** | Grounded Tri-State Model (`VERIFIED`, `CONFLICT`, `UNVERIFIED`). Features programmatic evidence gating and mandatory model abstention (unverified metrics trigger `OUTDATED` or `MISSING_SOURCE`). | Prevents regulatory false-advertising fines (FTC/ASCI) and eliminates fabricated claims. |
| **2. Intent-Preserving Explainable Corrections** | Real-time redlines paired with exact rule citations and **3 Tone-Matched Alternatives** (*Direct*, *Punchy*, *Conservative*) with 1-click replacement. | Protects creative voice while slashing routine review cycle turnaround by up to 75%. |
| **3. Reverse Brand Intelligence & Ambiguity Feedback Loop** | Heatmap matrix tracking review redlines, creator appeals, and override ratios across 8 core brand rules. | Closes the loop for CMOs and Brand Directors: identifies ambiguously worded guidelines rather than blaming writers. |

---

## ⚡ Two-Tier Engine Architecture

```
                       [ Content Draft Input ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
   [ TIER-1 FILTER ]                             [ TIER-2 CLAIM RAG ]
Aho-Corasick Automaton (<10ms)                Hybrid Lexical + Dense RAG
  • Trademark Casing Rules                      • Factual Assertion Extraction
  • Deprecated Jargon Terminology               • Audited Brand Vault Metrics
  • Non-Brand Hex Swatches (#FF0033)            • Tri-State Verification
          │                                               │
          └───────────────────────┬───────────────────────┘
                                  ▼
                   [ Explainable Redline Matrix ]
                 • Exact Stylebook / Legal Citation
                 • Evidence Provenance Box (if Claim)
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
- **Audit Cryptography**: SHA-256 cryptographic hashing committed to the audit ledger.
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
cd veribrand-ai/backend
python test_engine.py
```

---

## 🧪 Preset Test Scenarios for Hackathon Judges

To facilitate frictionless evaluation, VeriBrand AI features 3 built-in demo scenarios selectable from the header:

1. **Scenario 1: Broken High-Risk Copy (6 Violations)**:
   - Includes lowercase `"inkloom"`, `"artificial intelligence wizard"`, hyperbolic `"world's most revolutionary"`, contradictory SLA (`99.999%` vs approved `99.9%`), exaggerated customer count (`1,500` vs approved `420+`), conflicting revenue (`$50M` vs audited `$18.5M`), outdated pricing (`$49/mo`), and rogue hex swatch (`#ff0033`).
2. **Scenario 2: Subtle Borderline Copy (2 Flags)**:
   - Demonstrates nuance: verified metrics pass cleanly, while unverified legal superlatives trigger model abstention.
3. **Scenario 3: 100% On-Brand Compliant Draft (Green Pass)**:
   - Demonstrates a flawless draft receiving a 100/100 compliance score, ready for 1-click reviewer sign-off.

---

## 👤 Team & Contribution Details

- **Hackathon**: CodeNova India 2026
- **Track**: Inkloom AI (Brand Governance)
- **Official Team Name**: Team Deccans (VeriBrand AI)
- **Solo Architect & Full-Stack Engineer**: Ronak Jain (`ronak1167.h@gmail.com`)
- **100% Solo Ownership**: System architecture, Next.js frontend canvas, FastAPI backend services, Aho-Corasick string matching, hybrid claim verifier, and UI/UX design.
