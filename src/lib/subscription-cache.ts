// ---------------------------------------------------------------------------
// Sebwen POS — Subscription Status In-Memory Cache
// ---------------------------------------------------------------------------
// Lightweight in-memory cache shared between middleware and API routes.
// Follows the same pattern as the token revocation list in auth-helpers.ts:
//
// - API routes (login, refresh, subscription/current) WARM the cache after
//   verifying the status in the database.
// - Middleware READS the cache to block EXPIRED/CANCELLED stores mid-session.
// - Cache entries have a 5-minute TTL — on miss or expiry, the middleware
//   FAILS OPEN (allows the request) and the next API route re-warms it.
//
// This closes the "mid-session expiry" gap: if a subscription expires while
// the user has a valid 24h token, the middleware will catch it within 5 min.
// ---------------------------------------------------------------------------

interface SubscriptionCacheEntry {
  status: string   // TRIAL | ACTIVE | PAST_DUE | EXPIRED | CANCELLED
  updatedAt: number // Date.now() timestamp (ms)
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Module-level Map — shared across middleware and API routes in the same process
const subscriptionCache = new Map<number, SubscriptionCacheEntry>()

/**
 * Set (or update) the subscription status for a store in the cache.
 * Called from API routes after verifying the status in the database.
 */
export function setSubscriptionStatus(storeId: number, status: string): void {
  subscriptionCache.set(storeId, { status, updatedAt: Date.now() })
}

/**
 * Check if a store's subscription is blocked (EXPIRED or CANCELLED).
 *
 * Returns:
 *   - `true`  → Subscription is EXPIRED or CANCELLED → BLOCK the request
 *   - `false` → Subscription is ACTIVE, TRIAL, or PAST_DUE → ALLOW
 *   - `null`  → Cache miss or stale entry → FAIL OPEN (allow)
 *
 * Fail-open design: if the cache is cold or stale, we don't block.
 * The downstream API route will handle the actual status check, and the
 * next call to setSubscriptionStatus() will re-warm the cache.
 */
export function isSubscriptionBlocked(storeId: number): boolean | null {
  const entry = subscriptionCache.get(storeId)
  if (!entry) return null // Cache miss — fail open
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) return null // Stale — fail open

  // Block only EXPIRED and CANCELLED
  // Allow TRIAL (active trial), ACTIVE (paid), and PAST_DUE (grace period)
  return !['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(entry.status)
}

/**
 * Get the cached subscription status for a store (if available and fresh).
 * Returns undefined if not cached or expired.
 */
export function getCachedSubscriptionStatus(storeId: number): string | undefined {
  const entry = subscriptionCache.get(storeId)
  if (!entry) return undefined
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) return undefined
  return entry.status
}

/**
 * Invalidate (remove) a store's entry from the cache.
 * Called after subscription status changes (approval, cancellation, etc.)
 * so the next request fetches fresh data.
 */
export function invalidateSubscriptionCache(storeId: number): void {
  subscriptionCache.delete(storeId)
}

/**
 * Clear all entries from the cache.
 * Useful for testing or full system resets.
 */
export function clearSubscriptionCache(): void {
  subscriptionCache.clear()
}
