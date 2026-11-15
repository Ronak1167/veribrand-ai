# VeriBrand AI — Brand Vault & Custom Rule Management

## 1. Overview & Purpose

The **Brand Vault** is the centralized policy governance repository in VeriBrand AI. It empowers Brand Directors, Legal Counsels, and Compliance Administrators to codify, version, and enforce institutional brand standards across all publishing channels.

---

## 2. Rule Configuration Schema

Each brand rule in the Brand Vault is defined with strict semantic governance fields:

```typescript
export interface BrandRule {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: 'terminology' | 'tone_voice' | 'claim_verification' | 'visual_token';
  authorityLevel: 1 | 2 | 3; // 1 = Legal/Regulatory, 2 = Brand Stylebook, 3 = Campaign Guide
  severity: 'critical' | 'warning' | 'info';
  status: 'draft' | 'active' | 'inactive' | 'archived';
  version: number;
  forbiddenPatterns: string[];
  approvedAlternative: string;
  citation: string;
  scopeChannels: ChannelType[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}
```

### Hierarchy of Authority
1. **Level 1 (Legal & Regulatory Compliance)**: Non-negotiable legal mandates (e.g., FTC disclosure rules, trademark casing, false SLA claims). Violations trigger `critical` blocking severity and prevent publication approval.
2. **Level 2 (Brand Stylebook)**: Core institutional identity rules (e.g., approved brand voice, terminology, color palettes). Violations trigger `warning` severity requiring reviewer sign-off.
3. **Level 3 (Campaign Guidance)**: Transient campaign-specific slogans, hashtag policies, or seasonal messaging. Violations trigger `info` suggestions.

---

## 3. Rule Lifecycle State Machine

Brand rules follow a managed lifecycle to prevent breaking changes during live marketing campaigns:

```
[DRAFT] ──────> [ACTIVE] ──────> [INACTIVE] ──────> [ARCHIVED]
   │               │                │
   │               ▼                │
   └───────> [NEW VERSION] <────────┘
             (Version N+1)
```

- **`draft`**: Being authored by an Admin or Brand Specialist. Has zero impact on live audits.
- **`active`**: Enforced live by the server-authoritative verifier across all matching channels.
- **`inactive`**: Temporarily disabled (e.g., paused seasonal promotion).
- **`archived`**: Permanently retired. Preserved for historical audit trail re-verification.

---

## 4. Rule Version History & Atomic Rollback

Every update to an active brand rule triggers automatic snapshotting in the `brand_rule_versions` table:

```sql
CREATE TABLE brand_rule_versions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  authority_level INTEGER NOT NULL,
  severity TEXT NOT NULL,
  forbidden_patterns_json TEXT NOT NULL,
  approved_alternative TEXT NOT NULL,
  citation TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_notes TEXT,
  created_at TEXT NOT NULL
);
```

### Rollback Workflow
When a rule modification introduces unintended false positives or needs reversal:
1. Administrator requests version history: `GET /api/vault/rules/[id]/versions`.
2. Administrator triggers atomic rollback: `POST /api/vault/rules/[id]/versions` with `{ action: 'rollback', targetVersion: 2 }`.
3. The server restores the target version parameters, increments the rule version counter, and records a rollback event in the immutable audit trail.

---

## 5. Interactive Rule Testing Playground

To verify rule behavior before deploying changes to live production channels, administrators utilize the **Rule Testing Playground** (`POST /api/vault/test-rule`).

### Test Rule Request:
```json
{
  "rule": {
    "category": "terminology",
    "forbiddenPatterns": ["magic AI", "automatic wizard"],
    "approvedAlternative": "Deterministic Governance Engine",
    "severity": "critical"
  },
  "sampleText": "Our platform features a magic AI tool that writes all copy automatically."
}
```

### Response Payload:
```json
{
  "ok": true,
  "matched": true,
  "matchCount": 1,
  "matches": [
    {
      "pattern": "magic AI",
      "matchedText": "magic AI",
      "index": 22,
      "length": 8,
      "sentenceExcerpt": "Our platform features a magic AI tool that writes all copy automatically."
    }
  ],
  "proposedRewrite": "Our platform features a Deterministic Governance Engine tool that writes all copy automatically.",
  "executionLatencyMs": 0.42
}
```
The playground runs in isolation without altering stored rules or triggering production notifications.
