// ---------------------------------------------------------------------------
// Ventify POS — CSRF Token Helpers
// ---------------------------------------------------------------------------
// Implements the Double-Submit Cookie pattern for CSRF protection.
// On login, the server generates a random CSRF token and:
//   1. Returns it in the response body (client stores in memory)
//   2. Sets it as an httpOnly+secure cookie (server-side check)
//
// On state-changing requests, the client must send the token as:
//   - X-CSRF-Token header (from the value stored in memory)
//
// The middleware validates that the header matches the cookie.
//
// NOTE: Bearer token requests are inherently CSRF-safe because
// JavaScript on another origin cannot read the Authorization header
// due to the Same-Origin Policy. CSRF protection is primarily for
// cookie-based session scenarios.
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random CSRF token.
 * Uses Web Crypto API (Edge + Node compatible).
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32)
  // Use crypto.getRandomValues which works in both Edge and Node
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Fallback for older Node.js environments without Web Crypto
    const nodeCrypto = globalThis.process?.versions?.node
      ? await_import_crypto()
      : null
    if (nodeCrypto) {
      const buf = nodeCrypto.randomBytes(32)
      for (let i = 0; i < 32; i++) bytes[i] = buf[i]
    }
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Lazy import for Node.js crypto (avoids require() in Edge Runtime) */
function await_import_crypto(): { randomBytes: (size: number) => Buffer } | null {
  try {
    // Dynamic require is necessary for Node.js fallback — not available in Edge
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('crypto')
  } catch {
    return null
  }
}
