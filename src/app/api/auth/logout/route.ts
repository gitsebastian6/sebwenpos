import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  extractTokenFromRequest,
  verifyToken,
  getTokenJti,
  revokeTokenInMemory,
  bulkRevokeTokens,
  cleanupExpiredRevocations,
  getLastRevocationSyncTime,
  markRevocationSynced,
} from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/logout
 * Revokes the current token so it can no longer be used.
 * The token is added to both the DB blacklist and the in-memory cache.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = extractTokenFromRequest(authHeader)

    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      // Token is already invalid/expired — nothing to revoke
      return NextResponse.json({ success: true, message: 'Token ya no es válido' })
    }

    const jti = getTokenJti(token)

    // Add to database blacklist
    await db.revokedToken.upsert({
      where: { tokenJti: jti },
      create: {
        tokenJti: jti,
        userId: payload.userId,
        reason: 'LOGOUT',
        expiresAt: new Date(payload.exp),
      },
      update: {}, // Already revoked — idempotent
    })

    // Add to in-memory cache for Edge middleware
    revokeTokenInMemory(token, payload.exp)

    // Also revoke ALL tokens for this user if ?all=true (e.g., password change)
    const revokeAll = req.nextUrl.searchParams.get('all') === 'true'
    if (revokeAll) {
      await revokeAllUserTokens(payload.userId)
    }

    logger.info(`Token revoked for user ${payload.userId}${revokeAll ? ' (all sessions)' : ''}`)

    return NextResponse.json({
      success: true,
      message: revokeAll ? 'Todas las sesiones cerradas' : 'Sesión cerrada',
    })
  } catch (error) {
    logger.error('Logout error:', error)
    return NextResponse.json({ error: 'Error al cerrar sesión' }, { status: 500 })
  }
}

/**
 * GET /api/auth/logout?sync=true
 * Sync revoked tokens from DB to in-memory cache.
 * Called by the middleware or other API routes to ensure the Edge cache is up-to-date.
 */
export async function GET(req: NextRequest) {
  const isSync = req.nextUrl.searchParams.get('sync') === 'true'
  if (!isSync) {
    return NextResponse.json({ error: 'Use POST to logout or ?sync=true to sync cache' }, { status: 400 })
  }

  try {
    // Throttle syncs — no more than once per 60 seconds
    const lastSync = getLastRevocationSyncTime()
    if (Date.now() - lastSync < 60_000) {
      return NextResponse.json({ synced: true, cached: 'throttled' })
    }

    await syncRevokedTokensFromDb()

    return NextResponse.json({ synced: true })
  } catch (error) {
    logger.error('Token sync error:', error)
    return NextResponse.json({ error: 'Error al sincronizar tokens' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helper: Revoke all tokens for a user (used on password change, account disable)
// ---------------------------------------------------------------------------
export async function revokeAllUserTokens(userId: number, reason: string = 'SECURITY_BREACH'): Promise<number> {
  // We can't enumerate all issued tokens, but we can add a marker that
  // the middleware checks: any token for this user issued BEFORE now is invalid.
  // For now, we rely on the per-token blacklist + a short token expiry (24h).
  // A more robust approach would require storing issued tokens in DB.

  // Clean up expired revocations while we're at it
  await cleanupExpiredDbTokens()

  // For "revoke all", we set a user-level revocation timestamp
  // The middleware will check: if the token's iat is before this timestamp, reject it.
  // We store this as a special RevokedToken entry with a known pattern.
  const markerJti = `user-revoke-${userId}`
  await db.revokedToken.upsert({
    where: { tokenJti: markerJti },
    create: {
      tokenJti: markerJti,
      userId,
      reason,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24h (max token lifetime)
    },
    update: {
      reason,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  return 1
}

// ---------------------------------------------------------------------------
// Helper: Check if all tokens for a user were revoked (user-level revocation)
// Returns the revocation timestamp if found, null otherwise.
// ---------------------------------------------------------------------------
export async function getUserRevocationTimestamp(userId: number): Promise<number | null> {
  const markerJti = `user-revoke-${userId}`
  const marker = await db.revokedToken.findUnique({
    where: { tokenJti: markerJti },
    select: { expiresAt: true },
  })
  if (!marker) return null

  // The marker's createdAt tells us when the revocation happened
  // We use the expiresAt minus 24h as a proxy for the creation time
  // But more accurately, we store the timestamp in a different way.
  // For simplicity: if the marker exists and hasn't expired, all tokens
  // issued before the marker's creation are revoked.
  // Since we can't get createdAt easily, we use expiresAt - 24h as approximation.
  const approxCreatedAt = marker.expiresAt.getTime() - 24 * 60 * 60 * 1000
  return approxCreatedAt
}

// ---------------------------------------------------------------------------
// Helper: Sync revoked tokens from DB to in-memory cache
// ---------------------------------------------------------------------------
export async function syncRevokedTokensFromDb(): Promise<void> {
  const now = new Date()

  // Fetch all non-expired revoked tokens
  const revoked = await db.revokedToken.findMany({
    where: { expiresAt: { gt: now } },
    select: { tokenJti: true, expiresAt: true },
  })

  // Build entries for bulk load
  const entries = revoked
    .filter(r => !r.tokenJti.startsWith('user-revoke-')) // Skip user-level markers
    .map(r => ({
      jti: r.tokenJti,
      expiresAtMs: r.expiresAt.getTime(),
    }))

  bulkRevokeTokens(entries)
  cleanupExpiredRevocations()
  markRevocationSynced()
}

// ---------------------------------------------------------------------------
// Helper: Clean up expired token revocations from DB
// ---------------------------------------------------------------------------
export async function cleanupExpiredDbTokens(): Promise<number> {
  const result = await db.revokedToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}
