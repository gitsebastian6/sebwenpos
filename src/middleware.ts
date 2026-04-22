import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromRequest, isPublicPath, isSuperAdminPath, isInternalPath } from '@/lib/auth-helpers'

// ---------------------------------------------------------------------------
// Ventify POS — Auth + CORS Middleware (Edge Runtime compatible)
// ---------------------------------------------------------------------------
// Validates HMAC-SHA256 tokens on every API request.
// Public routes (login, register, init) are exempt.
// Super Admin routes require SUPER_ADMIN role.
// Store routes require matching storeId.
// CORS headers on all API responses + OPTIONS preflight handling.
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = (() => {
  const secret = process.env.INTERNAL_SECRET
  if (!secret) {
    throw new Error('INTERNAL_SECRET environment variable is required. Set it in .env')
  }
  return secret
})()

// CORS configuration — restricted to known origins
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  'http://localhost:3000',
].filter(Boolean) as string[]

const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, X-Internal-Secret, X-Auth-User-Id, X-Auth-Role, X-Auth-Store-Id, X-TransformPort'

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

  // 2. Internal cron routes — check internal secret header
  if (isInternalPath(pathname)) {
    const internalHeader = request.headers.get('x-internal-secret')
    if (internalHeader !== INTERNAL_SECRET) {
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

  const payload = await verifyToken(token)
  if (!payload) {
    return corsError('Token inválido o expirado', 401)
  }

  // 4. Super Admin routes — require SUPER_ADMIN role
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

  // 5. Store routes — verify storeId matches token
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
