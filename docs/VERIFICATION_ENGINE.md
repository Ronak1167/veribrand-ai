# VeriBrand AI — Deterministic Claim Verification Engine

## 1. Executive Summary & Design Principles

The VeriBrand AI Verification Engine rejects non-deterministic "vibe-checking" and generative LLM hallucinations in compliance evaluation. It is built as a three-tiered deterministic pipeline operating under three inviolable principles:

1. **Sub-Millisecond Predictability**: Linear time complexity $O(N)$ with zero network latency dependencies during core auditing.
2. **Ground Truth Evidence Primacy**: A factual claim cannot be marked `VERIFIED` without an active, reviewer-certified source fact registered in the tenant's Brand Vault.
3. **Syntactic & Semantic Robustness**: Deep awareness of negation, scope bounds, target framing, and contradictory phrasing.

---

## 2. Three-Tier Pipeline Architecture

```
[INPUT TEXT + CHANNEL]
         │
         ▼
+───────────────────────────────────────────────────────────+
| TIER 1: MULTI-PATTERN LEXICAL MATCHING (Aho-Corasick)     |
| - Pre-compiled trie of forbidden terms, casing violations,|
|   and rogue tokens.                                       |
| - Complexity: O(TextLength + TotalMatches)                |
| - Typical Latency: 0.2 - 0.8 ms                           |
+──────────────────────────────┬────────────────────────────+
                               │
                               ▼
+───────────────────────────────────────────────────────────+
| TIER 2: DETERMINISTIC CLAIM PARSER (12 Claim Types)       |
| - Sentence segmentation and syntactic structure analysis. |
| - Bidirectional negation, contractions ("don't have"),    |
|   phrasal revocations ("no longer"), target framing.      |
| - Typical Latency: 1.0 - 4.0 ms                           |
+──────────────────────────────┬────────────────────────────+
                               │
                               ▼
+───────────────────────────────────────────────────────────+
| TIER 3: EVIDENCE GROUNDING & CRYPTOGRAPHIC PROVENANCE     |
| - Cross-references claims against tenant's approved facts |
|   in SQLite/Postgres.                                     |
| - Injects SHA-256 evidence provenance and citations.      |
| - Typical Latency: 1.0 - 2.0 ms                           |
+──────────────────────────────┬────────────────────────────+
                               │
                               ▼
[EXPLAINABLE AUDIT RESULT: FINDINGS + COMPLIANCE SCORE + CITATIONS]
```

---

## 3. The 12 Recognized Claim Types

VeriBrand AI recognizes and verifies 12 distinct categories of commercial and technical claims:

| Claim Category | Sample Text | Extraction & Verification Semantics |
| :--- | :--- | :--- |
| **1. Numerical Counts** | `"420+ enterprise customers"` | Evaluates certified lower bounds (`420+`), exact counts (`421` -> UNVERIFIED), deficits (`100` -> CONFLICT), and exaggerations (`1,500` -> UNVERIFIED). |
| **2. Percentages** | `"94.2% client retention rate"` | Compares exact percentage claims against audited KPMG attestation records. Tolerates approved bounds ("over 94%"). |
| **3. Financial / ARR** | `"generated $18.5M in ARR"` | Distinguishes Annual Recurring Revenue (ARR) from general annual revenue. Uncertified ARR claims trigger `CONFLICT`. |
| **4. Growth / YoY** | `"+35% YoY increase"` | Compares period-over-period growth rates against registered baseline disclosures. |
| **5. Comparative** | `"10x faster than Competitor X"` | Identifies comparative assertions; requires documented benchmark testing methodology citation. |
| **6. Performance & SLA**| `"guarantees 99.9% uptime"` | Enforces contractual SLA limits. Claiming `99.99%` or `99.999%` triggers direct false advertising `CONFLICT`. |
| **7. Security Certs** | `"SOC 2 Type II certified"` | Enforces specific certification tiers (Type I vs Type II). Prevents unqualified ISO/SOC claims. |
| **8. Time-Bound** | `"24/7 technical support"` | Verifies round-the-clock availability commitments against active support staffing SLA schedules. |
| **9. Geographic** | `"50 global datacenters"` | Checks infrastructure counts against verified cloud provider region disclosures. |
| **10. Superlatives** | `"industry-leading platform"` | Flags absolute rankings ("#1", "best-in-class", "market leader") requiring legal substantiation. |
| **11. Guarantees** | `"guarantees zero downtime"` | Flags unconditional contractual warranties and money-back guarantees. |
| **12. Legal Disclaimers**| `"forward-looking statements"` | Identifies standard safe-harbor disclosures and exempts them from false factual penalties (`NOT_APPLICABLE`). |

---

## 4. The 5 Explicit Compliance Verdicts

Every finding emitted by the engine receives one of 5 unambiguous verdicts:

1. **`VERIFIED` (Success • 0 Penalty Points)**
   - The assertion is substantiated by an active, reviewer-certified evidence document in the tenant's Brand Vault.
   - Includes full provenance dossier, document name, section citation, and SHA-256 fingerprint.
2. **`CONFLICT` (Critical • -18 Penalty Points • Approval Blocker)**
   - The assertion directly contradicts verified evidence (e.g., claiming 99.999% when the approved SLA is 99.9%, understating customer counts, or claiming an uncertified ARR figure).
   - Blocks submission approval unless an authenticated reviewer records a formal exception rationale.
3. **`UNVERIFIED` (Warning • -12 Penalty Points)**
   - A factual assertion was made (e.g., "$99/mo" pricing or "2,000 paying subscribers"), but no approved evidence exists in the tenant's Brand Vault.
   - The engine abstains rather than inventing a verdict.
4. **`REVIEW_REQUIRED` (Warning • -6 Penalty Points)**
   - Evidence exists but requires human verification (e.g., expired evidence, ambiguous comparative competitor benchmark, or uncalibrated superlative claim).
5. **`NOT_APPLICABLE` (Info • 0 Penalty Points)**
   - Non-assertive, editorial, or standard legal safe-harbor disclaimers.

---

## 5. Advanced Semantic & Syntactic Invariants

### 5.1 Bidirectional Negation Awareness
The engine recognizes that negating a claim inverts its compliance semantics:
- *"We are not SOC 2 certified"* -> `CONFLICT` (denies certified ground truth).
- *"We are not only SOC 2 certified, but also enterprise-ready"* -> `VERIFIED` (affirmative idiom correctly identified without false conflict).
- *"We don't provide 99.9% uptime"* -> `CONFLICT` (contraction negation correctly flagged).
- *"Our retention rate is no longer 94.2%"* -> `CONFLICT` (phrasal revocation correctly caught).

### 5.2 Target vs. Outcome Framing
- *"Our co-pilot targets accelerating review turnaround by up to 75%"* -> `VERIFIED` (properly framed as an operational engineering target).
- *"Our co-pilot accelerates review turnaround by 75%"* -> `UNVERIFIED` (unqualified factual outcome claim without longitudinal empirical trial data).

### 5.3 Deterministic Compliance Scoring Formula
$$\text{Score} = \max\left(0, \min\left(100, 100 - 18 \cdot N_{\text{conflict}} - 12 \cdot N_{\text{unverified}} - 6 \cdot N_{\text{review\_req}} - \sum \text{RulePenalties}\right)\right)$$
Where RulePenalties are 10 for critical, 6 for warning, and 3 for info.
