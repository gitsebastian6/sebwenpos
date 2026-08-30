import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromRequest, isPublicPath, isSuperAdminPath, isInternalPath, isTokenRevoked } from '@/lib/auth-helpers'
import { getInternalSecret } from '@/lib/env'
import { rateLimit, getClientIp, type RateLimitConfig } from '@/lib/rate-limiter'
import { isSubscriptionBlocked, getCachedSubscriptionStatus } from '@/lib/subscription-cache'
import { safeStringEqual } from '@/lib/crypto-utils'

// ---------------------------------------------------------------------------
// Sebwen POS — Auth + CORS + Rate Limit + Subscription Middleware
// ---------------------------------------------------------------------------
// Validates HMAC-SHA256 tokens on every API request.
// Checks token revocation blacklist (in-memory cache synced from DB).
// Applies rate limiting to business-critical routes.
// Checks subscription status from in-memory cache (blocks EXPIRED/CANCELLED).
// Public routes (login, register, init) are exempt from auth.
// Super Admin routes require SUPER_ADMIN role.
// Store routes require matching storeId.
//
// No CSRF protection: every API call is authenticated with a Bearer token in
// the Authorization header (injected by src/lib/auth-interceptor.ts). A
// cross-site attacker cannot read localStorage to forge that header and the
// browser does not attach it automatically the way it does cookies, so these
// endpoints are not CSRF-exploitable. No route authenticates via a session
// cookie.
// ---------------------------------------------------------------------------

// CORS configuration — restricted to known origins
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  'http://localhost:3000',
].filter(Boolean) as string[]

const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, X-Internal-Secret, X-Auth-User-Id, X-Auth-Role, X-Auth-Store-Id, X-Transform-Port'

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
// Route-based rate limit configuration
// ---------------------------------------------------------------------------

const ROUTE_RATE_LIMITS: Array<{
  pattern: RegExp
  config: RateLimitConfig
  key: string
}> = [
  // Business-critical routes
  { pattern: /^\/api\/orders/, config: { maxRequests: 30, windowSeconds: 60 }, key: 'orders' },
  { pattern: /^\/api\/invoices/, config: { maxRequests: 10, windowSeconds: 60 }, key: 'invoices' },
  { pattern: /^\/api\/credit-notes/, config: { maxRequests: 10, windowSeconds: 60 }, key: 'credit-notes' },
  { pattern: /^\/api\/contingency-invoices/, config: { maxRequests: 10, windowSeconds: 60 }, key: 'contingency' },
  { pattern: /^\/api\/super-admin/, config: { maxRequests: 15, windowSeconds: 60 }, key: 'super-admin' },
  { pattern: /^\/api\/products/, config: { maxRequests: 30, windowSeconds: 60 }, key: 'products' },
  { pattern: /^\/api\/inventory/, config: { maxRequests: 20, windowSeconds: 60 }, key: 'inventory' },
  { pattern: /^\/api\/purchases/, config: { maxRequests: 20, windowSeconds: 60 }, key: 'purchases' },
  { pattern: /^\/api\/customers/, config: { maxRequests: 30, windowSeconds: 60 }, key: 'customers' },
  { pattern: /^\/api\/stores/, config: { maxRequests: 20, windowSeconds: 60 }, key: 'stores' },
]

// ---------------------------------------------------------------------------
// Subscription-exempt paths: these work even with expired subscription
// ---------------------------------------------------------------------------
// A store with EXPIRED/CANCELLED subscription must still be able to:
// - Check subscription status, upload payment receipts, manage payments
// - Use auth endpoints (refresh, switch-store)
// - Access store info (multi-store switching)
// - View files (receipt images)

const SUBSCRIPTION_EXEMPT_PATHS = [
  '/api/subscription',
  '/api/payment-receipts',
  '/api/auth',
  '/api/stores',
  '/api/payments/wompi',
  '/api/files',
  '/api/webhooks',
]

function isSubscriptionExemptPath(pathname: string): boolean {
  return SUBSCRIPTION_EXEMPT_PATHS.some(p => pathname.startsWith(p))
}

// ---------------------------------------------------------------------------
// PAST_DUE (gracia de pago): endpoints de VENTA bloqueados server-side.
// La gracia permite entrar a consultar/cobrar deudas y renovar, pero NO
// registrar ventas nuevas. Coincide con el flag permissions.pos=false que
// el login ya aplicaba — esto lo hace cumplir en el servidor.
// ---------------------------------------------------------------------------
// En gracia se permite: consultar, cobrar deudas de clientes, cerrar caja y
// renovar. Se bloquea "operar el negocio como siempre": vender, comprar,
// mover inventario, registrar gastos.
const PAST_DUE_WRITE_PREFIXES = [
  '/api/orders',     // crear órdenes / devoluciones de venta
  '/api/tables',     // comandas y pagos de mesa
  '/api/purchases',  // compras a proveedores
  '/api/expenses',   // gastos
  '/api/inventory',  // ajustes / mermas / devoluciones / reset de stock
  '/api/services',   // alta de servicio y venta de servicio
]

function isPastDueRestrictedWrite(method: string, pathname: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
  // Facturación nueva (POST /api/invoices) también es "venta nueva".
  if (method === 'POST' && pathname.startsWith('/api/invoices')) return true
  return PAST_DUE_WRITE_PREFIXES.some(p => pathname.startsWith(p))
}

function checkRouteRateLimit(request: NextRequest, pathname: string): NextResponse | null {
  for (const { pattern, config, key } of ROUTE_RATE_LIMITS) {
    if (pattern.test(pathname)) {
      const ip = getClientIp(request)
      const result = rateLimit(key, ip, config)
      if (!result.success) {
        return corsError(
          'Demasiados intentos. Por favor espere unos minutos.',
          429
        )
      }
      return null // Allowed
    }
  }
  return null // No rate limit for this route — allowed
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

  // 1. Public routes — no auth needed
  if (isPublicPath(pathname)) {
    return withCORS(NextResponse.next(), origin)
  }

  // 2. Internal cron routes — check internal secret header (constant-time comparison)
  if (isInternalPath(pathname)) {
    const internalHeader = request.headers.get('x-internal-secret')
    if (!internalHeader || !safeStringEqual(internalHeader, getInternalSecret())) {
      return corsError('Acceso no autorizado', 401)
    }
    return withCORS(NextResponse.next(), origin)
  }

  // 3. All other API routes require authentication
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

  // 4. Route-based rate limiting (after auth, before business logic)
  const rateLimitResult = checkRouteRateLimit(request, pathname)
  if (rateLimitResult) return rateLimitResult

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

  // 7. Subscription gating — block expired/cancelled stores mid-session
  //    Uses in-memory cache populated by login/refresh/subscription routes.
  //    Fail-open on cache miss (allows request, next route re-warms cache).
  //    Exempt paths (subscription management, payments, auth) always pass.
  if (payload.storeId && !isSubscriptionExemptPath(pathname)) {
    const blocked = isSubscriptionBlocked(payload.storeId)
    if (blocked === true) {
      return corsError(
        'Suscripción expirada o cancelada. Renueva tu plan para continuar.',
        403,
      )
    }

    // 7b. PAST_DUE (gracia de pago): solo lectura + gestión de suscripción.
    //     Bloquea ventas nuevas server-side (POS/Mesas/Facturación) — antes
    //     esta restricción solo existía como flag en la respuesta del login.
    const cachedStatus = getCachedSubscriptionStatus(payload.storeId)
    if (cachedStatus === 'PAST_DUE' && isPastDueRestrictedWrite(request.method, pathname)) {
      return corsError(
        'Suscripción en mora (PAST_DUE): no se pueden registrar ventas nuevas. Renueva tu plan para reactivar el POS.',
        403,
      )
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
