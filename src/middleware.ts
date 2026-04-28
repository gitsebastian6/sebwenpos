import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromRequest, isPublicPath, isSuperAdminPath, isInternalPath, isTokenRevoked } from '@/lib/auth-helpers'
import { getInternalSecret } from '@/lib/env'

// ---------------------------------------------------------------------------
// Ventify POS — Auth + CORS + CSRF Middleware (Edge Runtime compatible)
// ---------------------------------------------------------------------------
// Validates HMAC-SHA256 tokens on every API request.
// Checks token revocation blacklist (in-memory cache synced from DB).
// Validates CSRF tokens on state-changing requests (POST/PUT/DELETE/PATCH).
// Public routes (login, register, init) are exempt from auth + CSRF.
// Super Admin routes require SUPER_ADMIN role.
// Store routes require matching storeId.
// CORS headers on all API responses + OPTIONS preflight handling.
// ---------------------------------------------------------------------------

// Constant-time string comparison (Edge-compatible) to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a)
  const bBuf = encoder.encode(b)
  const result = new Uint8Array(aBuf.length)
  for (let i = 0; i < aBuf.length; i++) {
    result[i] = aBuf[i] ^ bBuf[i]
  }
  return result.every(byte => byte === 0)
}

// CORS configuration — restricted to known origins
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  'http://localhost:3000',
].filter(Boolean) as string[]

const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, X-Internal-Secret, X-Auth-User-Id, X-Auth-Role, X-Auth-Store-Id, X-CSRF-Token, X-Transform-Port'

function withCORS(response: NextResponse, origin?: string | null): NextResponse {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  response.headers.set('Access-Control-Allow-Methods', CORS_METHODS)
  response.headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS)
  response.headers.set('Access-Control-Max-Age', '86400')
  return response
}

function corsError(message: string, status: number): NextResponse {
  return withCORS(NextResponse.json({ error: message }, { status }))
}

// ---------------------------------------------------------------------------
// CSRF Protection — Double-Submit Cookie Pattern
// ---------------------------------------------------------------------------
// For state-changing requests (POST/PUT/DELETE/PATCH), we require either:
// 1. A matching X-CSRF-Token header + csrf_token cookie (double-submit), OR
// 2. A valid Authorization: Bearer token (API clients)
//
// Bearer tokens are inherently CSRF-safe because JavaScript on a different
// origin cannot read the token from localStorage/httpOnly cookies (Same-Origin Policy).
// The CSRF check is an additional layer for cookie-based sessions.
// ---------------------------------------------------------------------------

function validateCSRF(request: NextRequest): boolean {
  const method = request.method.toUpperCase()

  // Safe methods don't need CSRF protection
  if (CSRF_SAFE_METHODS.has(method)) return true

  // If the request uses Bearer token auth, it's inherently CSRF-safe
  // (JS on another origin cannot read the Authorization header)
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) return true

  // If using internal secret auth, it's also CSRF-safe
  // (the internal secret is not accessible cross-origin)
  const internalSecret = request.headers.get('x-internal-secret')
  if (internalSecret) return true

  // Double-submit cookie pattern: X-CSRF-Token header must match csrf_token cookie
  const csrfHeader = request.headers.get('x-csrf-token')
  const csrfCookie = request.cookies.get('csrf_token')?.value

  if (!csrfHeader || !csrfCookie) return false
  return timingSafeEqual(csrfHeader, csrfCookie)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin') || null

  // Only intercept API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return withCORS(new NextResponse(null, { status: 204 }), origin)
  }

  // 1. Public routes — no auth needed, no CSRF needed
  if (isPublicPath(pathname)) {
    return withCORS(NextResponse.next(), origin)
  }

  // 2. Internal cron routes — check internal secret header (constant-time comparison)
  if (isInternalPath(pathname)) {
    const internalHeader = request.headers.get('x-internal-secret')
    if (!internalHeader || !timingSafeEqual(internalHeader, getInternalSecret())) {
      return corsError('Acceso no autorizado', 401)
    }
    return withCORS(NextResponse.next(), origin)
  }

  // 3. CSRF validation on all state-changing requests
  if (!validateCSRF(request)) {
    return corsError('Token CSRF inválido — posible ataque cross-site', 403)
  }

  // 4. All other API routes require authentication
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromRequest(authHeader)

  if (!token) {
    return corsError('Token de autenticación requerido', 401)
  }

  // Quick revocation check (in-memory cache — Edge-safe)
  if (isTokenRevoked(token)) {
    return corsError('Token revocado — inicie sesión de nuevo', 401)
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return corsError('Token inválido o expirado', 401)
  }

  // 5. Super Admin routes — require SUPER_ADMIN role
  if (isSuperAdminPath(pathname)) {
    if (payload.role !== 'SUPER_ADMIN') {
      return corsError('Acceso restringido a Super Administrador', 403)
    }
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-auth-user-id', payload.userId.toString())
    requestHeaders.set('x-auth-role', payload.role)
    return withCORS(NextResponse.next({
      request: { headers: requestHeaders },
    }), origin)
  }

  // 6. Store routes — verify storeId matches token
  const url = new URL(request.url)
  const queryStoreId = url.searchParams.get('storeId')

  if (queryStoreId) {
    const parsedStoreId = parseInt(queryStoreId, 10)
    if (!isNaN(parsedStoreId) && payload.role !== 'SUPER_ADMIN' && payload.storeId !== parsedStoreId) {
      return corsError('No tienes acceso a esta tienda', 403)
    }
  }

  // Add user info to headers for downstream use
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-auth-user-id', payload.userId.toString())
  requestHeaders.set('x-auth-role', payload.role)
  requestHeaders.set('x-auth-store-id', (payload.storeId ?? '').toString())
  if (payload.employeeId) {
    requestHeaders.set('x-auth-employee-id', payload.employeeId.toString())
  }

  return withCORS(NextResponse.next({
    request: { headers: requestHeaders },
  }), origin)
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
}
