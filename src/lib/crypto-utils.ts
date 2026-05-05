import { timingSafeEqual } from 'crypto'

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Works in both Node.js runtime (API routes) and Edge runtime (middleware).
 * Returns `false` immediately when lengths differ (the length of secrets
 * is typically not sensitive in HMAC-based auth schemes).
 */
export function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
