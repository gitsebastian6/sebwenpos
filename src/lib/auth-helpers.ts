import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Ventify POS — Auth Helpers (Web Crypto API for Edge Runtime compatibility)
// ---------------------------------------------------------------------------
// Uses SubtleCrypto (Web Crypto API) which works in both Edge Runtime and Node.js.
// Tokens are base64url-encoded JSON payloads with an HMAC-SHA256 signature.
// ---------------------------------------------------------------------------

const TOKEN_VERSION = 'v1'
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

// Derive a deterministic HMAC key from the AUTH_SECRET env var (or a fallback)
let _hmacKeyPromise: Promise<CryptoKey> | null = null

async function getHmacKey(): Promise<CryptoKey> {
  if (_hmacKeyPromise) return _hmacKeyPromise

  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required. Set it in .env')
  }

  // Encode the secret as UTF-8 bytes
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)

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
// ---------------------------------------------------------------------------
export async function verifyToken(token: string, graceMs: number = 0): Promise<AuthPayload | null> {
  try {
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
  '/api/health',
  '/api/subscription/plans',
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
]

export function isInternalPath(pathname: string): boolean {
  return INTERNAL_PATHS.some(p => pathname.startsWith(p))
}
