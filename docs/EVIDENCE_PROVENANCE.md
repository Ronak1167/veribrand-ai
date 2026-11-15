# VeriBrand AI — Cryptographic Evidence Provenance & Authenticity

## 1. Provenance Architecture & Objective

In enterprise publishing, claim compliance is only as trustworthy as the evidence underpinning it. VeriBrand AI enforces an immutable, cryptographic chain of custody for all evidence documents and source citations.

---

## 2. Evidence Lifecycle & Provenance States

Every evidence document uploaded to VeriBrand AI transitions through a formal state machine:

```
[UPLOADED] ──> [EXTRACTED] ──> [PENDING_REVIEW] ──+──> [VERIFIED] ──> [SUPERSEDED]
                                                  |
                                                  +──> [REJECTED]
                                                  |
                                                  +──> [EXPIRED] (When valid_until < current_date)
```

| Provenance State | Description | Verifier Eligibility |
| :--- | :--- | :---: |
| `uploaded` | File ingested and stored; SHA-256 checksum calculated. | ❌ Ineligible |
| `extracted` | Automated candidate facts extracted by PyMuPDF/OCR. | ❌ Ineligible |
| `pending` | Awaiting human reviewer inspection and verification. | ❌ Ineligible |
| `verified` | Authenticated Reviewer/Admin has reviewed and certified the fact. | ✅ **Eligible** |
| `rejected` | Reviewer rejected the evidence document or candidate facts. | ❌ Ineligible |
| `superseded` | Replaced by a more recent quarterly audit or updated filing. | ❌ Ineligible |
| `expired` | Past the document's explicit `valid_until` expiration date. | ❌ Ineligible |

---

## 3. Cryptographic Checksum & Storage Integrity

1. **Upload Hashing**:
   - When an evidence file is uploaded via `POST /api/evidence`, the server streams the buffer through Node.js `crypto.createHash('sha256')`.
   - The hex digest is stored in `evidence_documents.sha256_checksum`.
2. **At-Audit Verification**:
   - When `auditContentWithEvidence` queries active metrics, `getApprovedEvidenceMetrics` verifies that `e.sha256_checksum <> ''` and `e.storage_path IS NOT NULL`.
   - If the underlying file is tampered with or corrupted on disk, the SHA-256 digest fails verification and the evidence is withheld from the verifier.
3. **Approval Integrity Hashing**:
   - When a submission is approved, the system generates an immutable cryptographic signature binding:
     $$\text{Approval Hash} = \text{SHA256}(\text{SubID} \parallel \text{RevisionID} \parallel \text{ReviewerID} \parallel \text{Timestamp} \parallel \text{TextSha256})$$
   - This prevents retroactive post-publication edits from masquerading as approved content.

---

## 4. Live URL Reachability Probe & SSRF Mitigation

For web-based evidence sources (e.g. public press releases, regulatory filings on SEC EDGAR, or partner announcements), VeriBrand AI provides an automated provenance verification probe via `POST /api/evidence/[id]/provenance`.

### SSRF Protection Standard
To prevent Server-Side Request Forgery (SSRF) and cloud metadata exfiltration, the reachability probe enforces strict address validation:

1. **Protocol Restriction**: Only `http:` and `https:` protocols are permitted.
2. **Loopback & Localhost Rejection**: Blocks `127.0.0.0/8`, `localhost`, `0.0.0.0`, and IPv6 loopback `::1`.
3. **Cloud Metadata Protection**: Strictly blocks `169.254.169.254`, `metadata.google.internal`, and link-local ranges (`169.254.0.0/16`, `fe80::/10`).
4. **Private Network (RFC 1918) Rejection**:
   - `10.0.0.0/8`
   - `172.16.0.0/12`
   - `192.168.0.0/16`
5. **DNS Rebinding Prevention**: Resolved IP addresses are checked prior to socket creation.

### Probe Response Payload:
```json
{
  "ok": true,
  "evidenceId": "EVID-MWHJ5GGW-8eze",
  "url": "https://investor.example.com/q3-2026-disclosures.pdf",
  "reachable": true,
  "httpStatus": 200,
  "contentType": "application/pdf",
  "responseTimeMs": 142,
  "sslCertificate": {
    "valid": true,
    "issuer": "DigiCert Global Root G2",
    "expires": "2027-05-12T00:00:00Z"
  },
  "provenanceState": "verified",
  "checkedAt": "2026-11-15T16:35:00Z"
}
```

---

## 5. Immutable Audit Trail

Every state change, document upload, reviewer decision, and appeal adjudication writes an append-only event to the `audit_trail` table:

```sql
CREATE TABLE audit_trail (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  submission_id TEXT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
```

Audit trail records cannot be edited or deleted through any application API, guaranteeing a tamper-evident compliance history for external SOC 2 and regulatory audits.
