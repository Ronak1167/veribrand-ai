# VeriBrand AI — Automated Evidence Document Extraction

## 1. Overview & Objective

To eliminate manual transcription fatigue and prevent human data-entry errors, VeriBrand AI includes an automated, server-side document extraction pipeline (`scripts/extract_facts.py`).

The extraction engine parses incoming evidence documents (PDF audits, quarterly shareholder disclosures, SOC 2 reports, SLA contracts, and plain text attestations), discovers numerical and qualitative brand facts, and populates a structured candidate fact queue for reviewer adjudication.

---

## 2. Extraction Pipeline Architecture

```
+-----------------------------------------------------------------------------------------------+
|                                DOCUMENT INGESTION TIER                                        |
|   PDF Audit Reports  |  Attestation Letters (.txt)  |  Scanned Reports / Images (OCR)         |
+---------------------------------------------------+-------------------------------------------+
                                                    |
                                                    v
+-----------------------------------------------------------------------------------------------+
|                             PARSING & EXTRACTION HEURISTICS                                   |
|   +------------------------------------+   +-----------------------------------------------+  |
|   | PyMuPDF (fitz) Text & Layout Parser|   | Heuristic Text & OCR Preprocessor             |  |
|   |  - Page-by-page text stream        |   |  - Sentence boundary isolation                |  |
|   |  - Table row and column extraction |   |  - Noise reduction & normalization            |  |
|   +------------------------------------+   +-----------------------------------------------+  |
+---------------------------------------------------+-------------------------------------------+
                                                    |
                                                    v
+-----------------------------------------------------------------------------------------------+
|                                FACT PATTERN RECOGNIZERS                                       |
|  1. Financial / ARR ($18.5M ARR)           5. Latency & Performance (< 250ms p99)             |
|  2. Customer Accounts (420+ accounts)      6. Percentages (94.2% retention)                   |
|  3. Uptime / SLA (99.9% uptime)            7. Security Certifications (SOC 2 Type II)         |
|  4. Growth / YoY (+35% YoY)                8. Time-bound SLA (24/7 monitoring)                |
+---------------------------------------------------+-------------------------------------------+
                                                    |
                                                    v
+-----------------------------------------------------------------------------------------------+
|                        CANDIDATE FACTS PERSISTENCE & REVIEW GATE                              |
|  Table: evidence_candidate_facts                                                              |
|  - id: 'FACT-XYZ'                          - extracted_value: '94.2%'                         |
|  - document_id: 'EVID-123'                 - page_number: 4                                   |
|  - organization_id: 'ORG-ACME'             - confidence_score: 0.95                           |
|  - claim_type: 'percentages'               - status: 'pending_review'                         |
+---------------------------------------------------+-------------------------------------------+
                                                    |
                         +--------------------------+--------------------------+
                         | Reviewer Adjudication                               |
                         v                                                     v
          +-------------------------------+                     +-------------------------------+
          | REJECT CANDIDATE FACT         |                     | ACCEPT CANDIDATE FACT         |
          | - status: 'rejected'          |                     | - status: 'accepted'          |
          | - Discarded from audits       |                     | - Promoted to active evidence |
          |                               |                     | - Produces VERIFIED claims    |
          +-------------------------------+                     +-------------------------------+
```

---

## 3. Supported Fact Recognition Domains

The extraction engine evaluates candidate text against strict domain-specific patterns in `scripts/extract_facts.py`:

| Domain | Extraction Regex Pattern | Normalized Output | Confidence |
| :--- | :--- | :--- | :---: |
| **Financial / ARR** | `(\$\s*\d+(?:\.\d+)?\s*(?:[BMKbmk]|billion|million|thousand)?)\s*(?:in\s+)?(?:ARR|annual recurring revenue|revenue)` | `$18.5M` | 0.95 |
| **Platform Uptime** | `(\d{2}(?:\.\d+)?%)\s*(?:uptime|availability|SLA|reliability)` | `99.9%` | 0.95 |
| **Customer Counts** | `(\d{1,3}(?:,\d{3})*\+?|\d+\s*(?:million|thousand|k)?\+?)\s*(?:enterprise\s+)?(?:customers|users|clients|organizations|accounts)` | `420+` | 0.95 |
| **Security Certifications**| `\b(SOC\s?2(?:\s+Type\s+(?:I|II))?|ISO\s?27001|HIPAA|GDPR)\b` | `SOC 2 Type II` | 0.92 |
| **Client Retention**| `(\d{1,3}(?:\.\d+)?%)\s*(?:enterprise\s+)?(?:client\s+)?(?:retention|renewal)` | `94.2%` | 0.95 |
| **Growth Rates** | `(\d+(?:\.\d+)?%)\s*(?:growth|YoY|year[- ]over[- ]year|increase)` | `35%` | 0.90 |
| **Response Latency**| `(<\s*\d+(?:\.\d+)?\s*m?s|\d+(?:\.\d+)?\s*ms)\s*(?:latency|response time|p99)` | `< 250ms` | 0.92 |
| **Percentage Metrics**| `(\d{1,3}(?:\.\d+)?%)\s*(?:reduction|efficiency|cost savings|accuracy)` | `up to 75%` | 0.90 |

---

## 4. Candidate Facts Lifecycle & Security Review Gate

To maintain zero false positives and comply with legal governance policies, **unreviewed extracted facts are never automatically trusted by the authoritative verifier**:

1. **Extraction Stage**:
   - The document is processed upon upload or via `POST /api/evidence/[id]/extract`.
   - Extracted facts are inserted into `evidence_candidate_facts` with status `pending_review`.
2. **Reviewer Inspection**:
   - Reviewers query `GET /api/evidence/[id]/candidates`.
   - The UI presents the extracted claim, proposed normalized value, page number, confidence score, and contextual sentence excerpt.
3. **Adjudication**:
   - **Accept**: `POST /api/evidence/[id]/candidates/[candidateId]` with `{ action: 'accept', approvedValue: '...' }`. The fact status becomes `accepted` and is bound as the active `approved_value` on the parent evidence document.
   - **Reject**: `{ action: 'reject', reason: 'Outdated or inaccurate metric context' }`. The fact status becomes `rejected`.
4. **Audit Enforcement**:
   - Only facts with status `accepted` and an approved parent evidence document participate in server-side audits.

---

## 5. CLI Execution & Batch Verification

The fact extraction engine can be invoked directly from the terminal or background automation tasks:

```bash
python scripts/extract_facts.py --file data/evidence/audit_report_q3_2026.pdf
```

### Sample JSON Output:
```json
{
  "ok": true,
  "count": 3,
  "facts": [
    {
      "claimType": "financial",
      "extractedClaim": "Annual Recurring Revenue ($18.5M)",
      "extractedValue": "$18.5M",
      "unit": "USD",
      "pageNumber": 1,
      "textExcerpt": "In Q3 2026, the company generated $18.5M in ARR across enterprise accounts.",
      "confidence": 0.95,
      "extractionMethod": "pdf_text"
    },
    {
      "claimType": "numerical",
      "extractedClaim": "Customer Count (420+)",
      "extractedValue": "420+",
      "unit": "customers",
      "pageNumber": 2,
      "textExcerpt": "Active enterprise accounts grew to 420+ customer accounts worldwide.",
      "confidence": 0.95,
      "extractionMethod": "pdf_text"
    },
    {
      "claimType": "product_capability",
      "extractedClaim": "Security Certification (SOC 2 Type II)",
      "extractedValue": "SOC 2 Type II",
      "unit": "certification",
      "pageNumber": 4,
      "textExcerpt": "Audit confirmed SOC 2 Type II attestation under AICPA trust services criteria.",
      "confidence": 0.92,
      "extractionMethod": "pdf_text"
    }
  ]
}
```
