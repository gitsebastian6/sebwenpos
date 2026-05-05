import { NextRequest, NextResponse } from 'next/server'
import { requireEnv } from '@/lib/env'

// ---------------------------------------------------------------------------
// Ventify POS — Auth Helpers (Web Crypto API for Edge Runtime compatibility)
// ---------------------------------------------------------------------------
// Uses SubtleCrypto (Web Crypto API) which works in both Edge Runtime and Node.js.
// Tokens are base64url-encoded JSON payloads with an HMAC-SHA256 signature.
//
// Token Revocation: Revoked tokens are checked via an in-memory cache that is
// populated by API routes (Node.js runtime) and consumed by the Edge middleware.
// The cache syncs from the database on first check and periodically thereafter.
// ---------------------------------------------------------------------------

const TOKEN_VERSION = 'v1'
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

// Derive a deterministic HMAC key from the AUTH_SECRET env var
let _hmacKeyPromise: Promise<CryptoKey> | null = null

async function getHmacKey(): Promise<CryptoKey> {
  if (_hmacKeyPromise) return _hmacKeyPromise

  // AUTH_SECRET is REQUIRED — uses requireEnv() which warns in dev, throws in prod.
  const secretValue = requireEnv('AUTH_SECRET')

  // Encode the secret as UTF-8 bytes
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secretValue)

  _hmacKeyPromise = crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )

  return _hmacKeyPromise
}

// ---------------------------------------------------------------------------
// Token Payload
// ---------------------------------------------------------------------------
export interface AuthPayload {
  userId: number
  storeId: number | null // null for Super Admin
  role: string           // SUPER_ADMIN | OWNER | EMPLOYEE
  employeeId?: number | null
  iat: number            // issued at (ms)
  exp: number            // expires at (ms)
}

// ---------------------------------------------------------------------------
// Token Revocation — In-memory blacklist (synced from DB by Node.js routes)
// ---------------------------------------------------------------------------
// The Edge Runtime middleware cannot access Prisma, so we maintain an
// in-memory set of revoked token JTIs. API routes (Node.js) populate this
// set when they revoke tokens or when they need to check revocation.

const revokedTokens = new Map<string, number>() // jti -> expiresAt (ms)
let lastSyncTime = 0
const SYNC_INTERVAL_MS = 60_000 // Sync from DB every 60 seconds

/**
 * Compute a unique token identifier (JTI) from a token string.
 * Uses the version + payloadBase64 as the identifier (signature is derived from these).
 * This is deterministic — same token always produces the same JTI.
 */
export function getTokenJti(token: string): string {
  const parts = token.split('.')
  if (parts.length < 2) return ''
  return `${parts[0]}.${parts[1]}` // version.payloadBase64
}

/**
 * Check if a token has been revoked (in-memory check, Edge-safe).
 * This is fast O(1) lookup against the in-memory cache.
 */
export function isTokenRevoked(token: string): boolean {
  const jti = getTokenJti(token)
  if (!jti) return true // Malformed tokens are treated as revoked

  const expiresAt = revokedTokens.get(jti)
  if (expiresAt === undefined) return false // Not in blacklist

  // If the token would have expired by now, clean up the entry
  if (Date.now() > expiresAt) {
    revokedTokens.delete(jti)
    return false
  }

  return true
}

/**
 * Add a token to the in-memory revocation list.
 * Called from Node.js API routes when a token is revoked (logout, password change, etc.)
 */
export function revokeTokenInMemory(token: string, expiresAtMs: number): void {
  const jti = getTokenJti(token)
  if (jti) {
    revokedTokens.set(jti, expiresAtMs)
  }
}

/**
 * Bulk load revoked tokens into the in-memory cache.
 * Called by API routes after syncing from the database.
 */
export function bulkRevokeTokens(entries: Array<{ jti: string; expiresAtMs: number }>): void {
  const now = Date.now()
  for (const entry of entries) {
    // Skip already-expired entries
    if (entry.expiresAtMs > now) {
      revokedTokens.set(entry.jti, entry.expiresAtMs)
    }
  }
  lastSyncTime = now
}

/**
 * Get the last sync timestamp (for periodic DB sync in API routes).
 */
export function getLastRevocationSyncTime(): number {
  return lastSyncTime
}

/**
 * Mark that a sync has been performed (called after DB sync).
 */
export function markRevocationSynced(): void {
  lastSyncTime = Date.now()
}

/**
 * Clean up expired entries from the in-memory revocation list.
 * Should be called periodically (e.g., on every sync).
 */
export function cleanupExpiredRevocations(): void {
  const now = Date.now()
  for (const [jti, expiresAt] of revokedTokens.entries()) {
    if (now > expiresAt) {
      revokedTokens.delete(jti)
    }
  }
}

// ---------------------------------------------------------------------------
// generateToken — Create a signed token (for use in API routes / Node.js)
// ---------------------------------------------------------------------------
export async function generateToken(payload: {
  userId: number
  storeId: number | null
  role: string
  employeeId?: number | null
  expiryMs?: number
}): Promise<string> {
  const now = Date.now()
  const expiryMs = payload.expiryMs || DEFAULT_EXPIRY_MS

  const tokenPayload: AuthPayload = {
    userId: payload.userId,
    storeId: payload.storeId,
    role: payload.role,
    employeeId: payload.employeeId ?? null,
    iat: now,
    exp: now + expiryMs,
  }

  const encoder = new TextEncoder()
  const payloadB64 = btoa(JSON.stringify(tokenPayload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const key = await getHmacKey()
  const data = encoder.encode(`${TOKEN_VERSION}.${payloadB64}`)
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data)
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${TOKEN_VERSION}.${payloadB64}.${signature}`
}

// ---------------------------------------------------------------------------
// verifyToken — Validate and decode a token (works in Edge Runtime)
// Also checks the in-memory revocation blacklist.
// ---------------------------------------------------------------------------
export async function verifyToken(token: string, graceMs: number = 0): Promise<AuthPayload | null> {
  try {
    // 1. Check revocation blacklist first (fast in-memory check)
    if (isTokenRevoked(token)) return null

    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [version, payloadB64, signature] = parts
    if (version !== TOKEN_VERSION) return null

    // Decode base64url payload
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    const payload: AuthPayload = JSON.parse(payloadJson)

    // Check expiry first (cheap check) — with optional grace period for refresh
    if (Date.now() > payload.exp + graceMs) return null

    // Verify HMAC signature
    const encoder = new TextEncoder()
    const key = await getHmacKey()
    const data = encoder.encode(`${version}.${payloadB64}`)

    // Decode base64url signature
    const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data)
    if (!valid) return null

    return payload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// extractTokenFromRequest — Get token from Authorization header
// ---------------------------------------------------------------------------
export function extractTokenFromRequest(authHeader: string | null): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

// ---------------------------------------------------------------------------
// Public route patterns that do NOT require authentication
// ---------------------------------------------------------------------------
export const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/init',
  '/api/auth/setup',
  '/api/auth/refresh',
  '/api/auth/reset-password',
  '/api/auth/security-question',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/otp-status',
  '/api/auth/logout',  // Logout is public — it only needs the token itself
  '/api/health',
  '/api/subscription/plans',
  '/api/webhooks/wompi',
  '/api/payments/wompi/health',
  // DEV-ONLY: Test endpoints (only accessible in development mode)
  ...(process.env.NODE_ENV === 'development' ? ['/api/test'] : []),
  // NOTE: /api/auth/register is NOT public — user creation is ONLY
  // allowed through the Super Admin panel (/api/super-admin/stores).
  // This prevents self-service account creation with store access.
]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

// ---------------------------------------------------------------------------
// Super Admin path patterns (require SUPER_ADMIN role)
// ---------------------------------------------------------------------------
export const SUPER_ADMIN_PATHS = [
  '/api/super-admin',
  '/api/admin',
]

export function isSuperAdminPath(pathname: string): boolean {
  return SUPER_ADMIN_PATHS.some(p => pathname.startsWith(p))
}

// ---------------------------------------------------------------------------
// Internal paths (require internal secret header)
// ---------------------------------------------------------------------------
export const INTERNAL_PATHS = [
  '/api/cron',
  '/api/subscription/alerts',
  '/api/payments/wompi/demo-process',
]

export function isInternalPath(pathname: string): boolean {
  return INTERNAL_PATHS.some(p => pathname.startsWith(p))
}
