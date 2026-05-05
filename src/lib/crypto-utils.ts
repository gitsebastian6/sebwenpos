/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Works in both Node.js runtime (API routes) and Edge runtime (middleware).
 * Uses pure JavaScript XOR comparison — no Node.js `crypto` dependency.
 */
export function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
