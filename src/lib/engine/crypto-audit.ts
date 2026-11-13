// VeriBrand AI — Cryptographic Audit Trail
// Generates timestamped SHA-256 content integrity hashes for sign-off verification.

export async function generateContentHash(
  text: string,
  reviewer: string,
  timestamp: string
): Promise<string> {
  const payload = `VERIBRAND_AUDIT_V1|${timestamp}|${reviewer}|${text.trim()}`;

  // Check for Web Crypto API (supported in all modern browsers and Node.js 16+)
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

  // Strict zero-compromise security: Fail explicitly rather than synthesizing non-cryptographic hashes
  throw new Error(
    'Cryptographic failure: Standard Web Crypto API (crypto.subtle) is unavailable in this runtime environment.'
  );
}
