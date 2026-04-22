// ---------------------------------------------------------------------------
// Ventify POS — Server-side Auth Helpers for API Routes
// ---------------------------------------------------------------------------
// Use these helpers inside API route handlers to extract and validate
// the authenticated user information that the middleware sets in headers.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { AuthPayload } from './auth-helpers'

/**
 * Extract authenticated user info from request headers.
 * The Edge middleware (src/middleware.ts) validates the token and sets these headers:
 *   x-auth-user-id     — User ID (number)
 *   x-auth-role        — Role: SUPER_ADMIN | OWNER | EMPLOYEE
 *   x-auth-store-id    — Store ID (number, empty string for SUPER_ADMIN)
 *   x-auth-employee-id — Employee ID (only for EMPLOYEE role)
 */
export function getAuthUser(request: NextRequest): AuthUser | null {
  const userId = request.headers.get('x-auth-user-id')
  if (!userId) return null

  return {
    userId: parseInt(userId, 10),
    role: request.headers.get('x-auth-role') || '',
    storeId: parseOptionalInt(request.headers.get('x-auth-store-id')),
    employeeId: parseOptionalInt(request.headers.get('x-auth-employee-id')),
  }
}

/**
 * Require authentication — returns AuthUser or sends 401 response.
 * Usage: const auth = await requireAuth(req); if (!auth) return;
 */
export function requireAuth(request: NextRequest): AuthUser | NextResponse {
  const user = getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Autenticación requerida' },
      { status: 401 }
    )
  }
  return user
}

/**
 * Require a specific storeId — validates that the authenticated user
 * belongs to the given store. SUPER_ADMIN can access any store.
 *
 * Returns null if valid, or a NextResponse with error if invalid.
 */
export function requireStoreAccess(
  request: NextRequest,
  targetStoreId: number
): null | NextResponse {
  const user = getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Autenticación requerida' },
      { status: 401 }
    )
  }

  // SUPER_ADMIN can access any store
  if (user.role === 'SUPER_ADMIN') return null

  // Regular users must match storeId
  if (!user.storeId || user.storeId !== targetStoreId) {
    return NextResponse.json(
      { error: 'No tienes acceso a esta tienda' },
      { status: 403 }
    )
  }

  return null
}

/**
 * Require OWNER or SUPER_ADMIN role.
 */
export function requireOwner(request: NextRequest): AuthUser | NextResponse {
  const user = getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Autenticación requerida' },
      { status: 401 }
    )
  }

  if (user.role !== 'OWNER' && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Acceso restringido. Se requiere rol de Administrador.' },
      { status: 403 }
    )
  }

  return user
}

/**
 * Get the authenticated storeId from headers.
 * Returns null for SUPER_ADMIN (they don't have a store).
 * Throws if not authenticated (call requireAuth first).
 */
export function getAuthStoreId(request: NextRequest): number | null {
  const storeId = request.headers.get('x-auth-store-id')
  if (!storeId || storeId === '') return null
  return parseInt(storeId, 10)
}

/**
 * Convenience: get storeId from auth header AND validate store access.
 * Returns the storeId number if valid, or a NextResponse error.
 * SUPER_ADMIN always passes (returns their target storeId).
 *
 * Usage:
 *   const storeIdOrErr = requireAuthStoreId(request, bodyStoreId)
 *   if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
 *   const storeId = storeIdOrErr // number
 */
export function requireAuthStoreId(
  request: NextRequest,
  targetStoreId?: number
): number | NextResponse {
  const auth = getAuthUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })
  }
  // SUPER_ADMIN can access any store — use targetStoreId or header storeId
  const storeId = targetStoreId ?? auth.storeId
  if (!storeId) {
    return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
  }
  if (auth.role !== 'SUPER_ADMIN' && auth.storeId !== storeId) {
    return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 })
  }
  return storeId
}

// ---- Types ----

export interface AuthUser {
  userId: number
  role: string       // SUPER_ADMIN | OWNER | EMPLOYEE
  storeId: number | null
  employeeId: number | null
}

// ---- Helpers ----

function parseOptionalInt(value: string | null): number | null {
  if (!value || value === '') return null
  const n = parseInt(value, 10)
  return isNaN(n) ? null : n
}
