# VeriBrand AI — Known Limitations & Future Roadmap

## 1. Scope & Objective

In accordance with enterprise engineering standards, this document outlines the current technical boundaries, architectural constraints, and future evolution roadmap for VeriBrand AI.

---

## 2. Current Technical Limitations

### 2.1 Single-Node SQLite File Locking
- **Current Behavior**: The default persistence layer uses Node.js built-in `node:sqlite` in Write-Ahead Logging (WAL) mode.
- **Constraint**: While WAL mode permits unlimited concurrent readers and handles serialized writes with a 5,000ms busy timeout, SQLite cannot be shared across multiple independent physical servers or ephemeral container instances simultaneously.
- **Production Remedy**: For multi-node Kubernetes clusters or autoscaling groups, deploy the included `schema.postgres.sql` schema on managed PostgreSQL (AWS RDS, Supabase, Cloud SQL).

### 2.2 In-Memory Rate Limiting
- **Current Behavior**: Authentication brute force protection (`/api/auth/login`) is tracked via an in-memory sliding window map.
- **Constraint**: If the application restarts, or if traffic is distributed across multiple load-balanced web instances without sticky sessions, rate-limit counters reset.
- **Production Remedy**: Integrate Redis or Upstash for distributed rate limiting in multi-cluster environments.

### 2.3 Optical Character Recognition (OCR) Heuristics
- **Current Behavior**: `scripts/extract_facts.py` utilizes PyMuPDF for vector PDF text extraction and fallback heuristic segmentation.
- **Constraint**: On low-resolution, degraded, or skewed scanned documents (< 150 DPI), OCR confidence may drop below the 0.85 acceptance threshold.
- **Operational Standard**: The human reviewer gate explicitly addresses this constraint by presenting extracted text excerpts alongside the source PDF for verification before promoting candidate facts.

### 2.4 Visual Brand Inspection Scope
- **Current Behavior**: The visual inspection endpoint (`/api/vision/inspect`) verifies asset dimensions, aspect ratio tolerances, forbidden hex codes, and WCAG AA/AAA luminance contrast.
- **Constraint**: It does not perform computer vision object detection (e.g. verifying that a physical product photo is placed correctly in a 3D mock).

---

## 3. Product & Engineering Roadmap

| Quarter | Milestone / Feature | Architectural Scope |
| :---: | :--- | :--- |
| **Q1 2027** | **PostgreSQL Native Driver Integration** | Direct connection pooling (pgbouncer) for multi-region active-active clusters. |
| **Q1 2027** | **Enterprise SAML / SCIM SSO** | Okta, Microsoft Entra ID, and Google Workspace identity synchronization with role mapping. |
| **Q2 2027** | **Semantic Vector Fact Retrieval** | Hybrid semantic vector search to identify paraphrased claims that vary widely from exact keyword patterns. |
| **Q2 2027** | **Auditor Webhooks & Automated Attestation Sync** | Automated API ingestion pipelines connecting directly to Vanta, Drata, and KPMG audit portals. |
| **Q3 2027** | **Headless CMS & DAM Plugins** | Native plugins for Adobe Experience Manager (AEM), Contentful, Sanity, and WordPress to audit copy inside creator editors. |

## Follow-up audit limitations

The follow-up patch improves several identified security and honesty issues. It does not establish full production readiness. The provenance URL checker resolves and rejects private/reserved addresses, pins the HTTP/TLS connection to the validated address, and disables redirects. Network egress controls are still recommended as defense in depth. Visual inspection now samples actual uploaded image pixels and dimensions, but remains advisory and requires human review for brand identity, typography and semantic layout. PostgreSQL runtime support and a full production operations/security review remain outstanding.


Visual inspection now samples actual uploaded image pixels and dimensions, but remains advisory: it does not identify logos, read text regions, identify fonts, verify layout semantics, or establish WCAG text contrast. The organization must configure `brandColors` or `brandPalette` in its settings for palette comparison.
