// VeriBrand AI — Cryptographic Audit Trail
// Generates timestamped SHA-256 content integrity hashes for sign-off verification.

export async function generateContentHash(
  text: string,
  reviewer: string,
  timestamp: string
): Promise<string> {
  const payload = `VERIBRAND_AUDIT_V1|${timestamp}|${reviewer}|${text.trim()}`;

  const subtleCrypto =
    (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle);

  if (subtleCrypto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await subtleCrypto.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error(
    'Cryptographic failure: Standard Web Crypto API (crypto.subtle) is unavailable in this runtime environment.'
  );
}

export async function verifyContentHash(
  text: string,
  reviewer: string,
  timestamp: string,
  expectedHash: string
): Promise<boolean> {
  const computed = await generateContentHash(text, reviewer, timestamp);
  return computed.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Computes a stable canonical fingerprint for a lint finding so appeal decisions
 * can be deterministically bound to specific violations across revisions.
 */
export function computeFindingFingerprint(finding: {
  ruleId?: string;
  id: string;
  verdict: string;
  matchedText: string;
  guidelineTitle: string;
}): string {
  const key = `${finding.ruleId || finding.id}|${finding.verdict}|${finding.matchedText.trim().toLowerCase()}|${finding.guidelineTitle.trim().toLowerCase()}`;
  return key;
}

/**
 * Generates canonical SHA-256 hash for structured objects (keys sorted alphabetically)
 */
export async function generateCanonicalObjectHash(data: Record<string, unknown>): Promise<string> {
  const sortedKeys = Object.keys(data).sort();
  const canonicalObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    canonicalObj[k] = data[k];
  }
  const payload = JSON.stringify(canonicalObj);

  const subtleCrypto =
    (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle);

  if (subtleCrypto) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(payload);
    const hashBuffer = await subtleCrypto.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Web Crypto API unavailable');
}
