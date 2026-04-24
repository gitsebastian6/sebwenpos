/**
 * Ventify POS — In-Memory Rate Limiter
 * ─────────────────────────────────────────────────────────
 * Token bucket style rate limiter using a Map with TTL cleanup.
 * Suitable for single-instance deployments.
 * For multi-instance, migrate to Redis.
 */

interface RateLimitEntry {
  count: number
  resetAt: number // timestamp ms when the window resets
}

// Separate stores per route pattern to avoid cross-contamination
const stores = new Map<string, Map<string, RateLimitEntry>>()

// Cleanup interval — purge expired entries every 60s
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [routeKey, store] of stores.entries()) {
      for (const [ipKey, entry] of store.entries()) {
        if (now >= entry.resetAt) {
          store.delete(ipKey)
        }
      }
      // Remove empty route stores
      if (store.size === 0) stores.delete(routeKey)
    }
  }, 60_000)

  // Don't prevent Node from exiting
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number
  /** Time window in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean
  /** Number of requests remaining in this window */
  remaining: number
  /** Seconds until the window resets */
  resetIn: number
  /** Current count in this window */
  limit: number
}

/**
 * Check (and increment) the rate limit for a given IP + route.
 *
 * @param routeKey  - Unique identifier per route (e.g. 'login', 'register', 'setup')
 * @param ip        - Client IP address (or fallback identifier)
 * @param config    - Rate limit configuration
 */
export function rateLimit(
  routeKey: string,
  ip: string,
  config: RateLimitConfig = { maxRequests: 10, windowSeconds: 60 },
): RateLimitResult {
  ensureCleanup()

  const now = Date.now()
  const windowMs = config.windowSeconds * 1000

  // Get or create route-specific store
  let routeStore = stores.get(routeKey)
  if (!routeStore) {
    routeStore = new Map()
    stores.set(routeKey, routeStore)
  }

  // Get or create entry for this IP
  const entry = routeStore.get(ip)
  const resetAt = Math.floor((now + windowMs) / 1000) * 1000

  if (!entry || now >= entry.resetAt) {
    // New window — reset counter
    const newEntry: RateLimitEntry = { count: 1, resetAt }
    routeStore.set(ip, newEntry)
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowSeconds,
      limit: config.maxRequests,
    }
  }

  // Existing window — check and increment
  if (entry.count >= config.maxRequests) {
    const resetIn = Math.ceil((entry.resetAt - now) / 1000)
    return {
      success: false,
      remaining: 0,
      resetIn,
      limit: config.maxRequests,
    }
  }

  entry.count++
  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetIn: Math.ceil((entry.resetAt - now) / 1000),
    limit: config.maxRequests,
  }
}

/**
 * Extract client IP from NextRequest.
 * Checks X-Forwarded-For (from proxy/Caddy) first, then falls back to remote address.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // Fallback: hash the user-agent + accept-language to fingerprint unique clients
  // when behind a proxy that strips IPs
  const ua = request.headers.get('user-agent') || ''
  const lang = request.headers.get('accept-language') || ''
  const fingerprint = `${ua}:${lang}`

  // Simple hash for fingerprinting (not cryptographic, just dedup)
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `fp-${Math.abs(hash).toString(36)}`
}

// ─── Preset configs for common routes ───────────────────

/** Login: 5 attempts per minute per IP (strict — brute force protection) */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowSeconds: 60,
}

/** Register: 3 per 5 minutes per IP (prevent mass account creation) */
export const REGISTER_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 3,
  windowSeconds: 300,
}

/** Setup: 3 per 5 minutes per IP (prevent abuse of first-time setup) */
export const SETUP_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 3,
  windowSeconds: 300,
}

// ─── Next.js helper: create a rate-limited response or null ───────────

import { NextRequest, NextResponse } from 'next/server'

/**
 * Convenience: check rate limit and return 429 response if exceeded.
 * Returns null if the request is allowed (continue processing).
 */
export function checkRateLimit(
  request: NextRequest,
  routeKey: string,
  config: RateLimitConfig,
): NextResponse | null {
  const ip = getClientIp(request)
  const result = rateLimit(routeKey, ip, config)

  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Demasiados intentos. Por favor espere unos minutos antes de intentar de nuevo.',
        retryAfter: result.resetIn,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.resetIn),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetIn),
        },
      },
    )
  }

  // Attach rate limit headers to the response later
  return null
}

/**
 * Attach rate limit info headers to any NextResponse.
 */
export function attachRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  response.headers.set('X-RateLimit-Limit', String(result.limit))
  response.headers.set('X-RateLimit-Reset', String(result.resetIn))
  return response
}

/**
 * Full rate-limit check: returns { allowed, result } or a 429 NextResponse.
 * Use this in route handlers.
 */
export function withRateLimit(
  request: NextRequest,
  routeKey: string,
  config: RateLimitConfig,
): { allowed: true; result: RateLimitResult } | { allowed: false; response: NextResponse } {
  const ip = getClientIp(request)
  const result = rateLimit(routeKey, ip, config)

  if (!result.success) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Demasiados intentos. Por favor espere unos minutos antes de intentar de nuevo.',
          retryAfter: result.resetIn,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.resetIn),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetIn),
          },
        },
      ),
    }
  }

  return { allowed: true, result }
}
