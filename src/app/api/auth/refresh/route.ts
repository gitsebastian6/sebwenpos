import { NextRequest, NextResponse } from 'next/server'
import { generateToken, verifyToken, extractTokenFromRequest } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Grace period: accept tokens expired up to 1 hour ago for refresh
const REFRESH_GRACE_MS = 1 * 60 * 60 * 1000

// Grace period before fully expiring a subscription
const GRACE_PERIOD_DAYS = 3

/**
 * Transition overdue subscriptions (same logic as login route).
 * Kept in sync so subscription status is consistent across the app.
 */
async function transitionOverdueSubscriptions() {
  const now = new Date()

  // Only heal EXPIRED subscriptions with future endDate (never CANCELLED — that's an intentional admin action)
  const healed = await db.subscription.findMany({
    where: {
      endDate: { gt: now },
      status: 'EXPIRED',
      cancelReason: null,
    },
  })
  for (const sub of healed) {
    const correctStatus = sub.billingPeriod === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: correctStatus, graceEndDate: null },
    })
  }

  // Mark as PAST_DUE: expired but within grace window
  await db.subscription.updateMany({
    where: {
      endDate: { lt: now },
      status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
      graceEndDate: null,
    },
    data: {
      status: 'PAST_DUE',
      graceEndDate: new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
    },
  })

  // Mark as EXPIRED: grace period ended
  await db.subscription.updateMany({
    where: {
      graceEndDate: { lt: now },
      status: 'PAST_DUE',
    },
    data: { status: 'EXPIRED' },
  })
}

interface RefreshResponse {
  token: string
  expiresIn: number
  subscriptionStatus?: string | null
  subscriptionWarning?: string | null
  forceLogout?: boolean
}

// Refresh endpoint — extends token expiry by 24h
// Also checks subscription status to catch mid-session expirations
export async function POST(request: NextRequest): Promise<NextResponse<RefreshResponse>> {
  try {
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromRequest(authHeader)
    if (!token) {
      return NextResponse.json({ error: 'Token requerido', token: '', expiresIn: 0 }, { status: 401 })
    }

    // Verify token with grace period (will fail if expired beyond 1 hour)
    const payload = await verifyToken(token, REFRESH_GRACE_MS)
    if (!payload) {
      return NextResponse.json({ error: 'Token inválido o expirado', token: '', expiresIn: 0 }, { status: 401 })
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario eliminado', token: '', expiresIn: 0 }, { status: 401 })
    }

    // Skip subscription check for SUPER_ADMIN
    if (user.role === 'SUPER_ADMIN') {
      const newToken = await generateToken({
        userId: payload.userId,
        storeId: payload.storeId,
        role: payload.role,
        employeeId: payload.employeeId,
        expiryMs: 24 * 60 * 60 * 1000,
      })
      return NextResponse.json({ token: newToken, expiresIn: 24 * 60 * 60 * 1000 })
    }

    // ─── Subscription check for regular users (OWNER / EMPLOYEE) ───
    // Run transition logic so status is up-to-date
    await transitionOverdueSubscriptions()

    const response: RefreshResponse = {
      token: '',
      expiresIn: 24 * 60 * 60 * 1000,
    }

    // Check store's subscription status
    if (payload.storeId) {
      const subscription = await db.subscription.findUnique({
        where: { storeId: payload.storeId },
        select: { status: true, endDate: true, graceEndDate: true },
      })

      if (!subscription) {
        // No subscription at all — force logout
        response.forceLogout = true
        response.subscriptionStatus = 'NO_SUBSCRIPTION'
        response.subscriptionWarning = 'No tienes una suscripción activa. Contacte al soporte.'
        return NextResponse.json(response, { status: 403 })
      }

      if (subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED') {
        // Fully expired — force logout
        response.forceLogout = true
        response.subscriptionStatus = subscription.status
        response.subscriptionWarning = 'Tu suscripción ha expirado. Contacta al administrador para renovar.'
        return NextResponse.json(response, { status: 403 })
      }

      if (subscription.status === 'PAST_DUE') {
        // In grace period — allow but warn the frontend to show banner
        const graceEnd = subscription.graceEndDate
          ? new Date(subscription.graceEndDate)
          : new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
        const daysLeft = Math.ceil((graceEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        response.subscriptionStatus = 'PAST_DUE'
        response.subscriptionWarning = `Tu suscripción venció. Tienes ${daysLeft} día${daysLeft !== 1 ? 's' : ''} de gracia para renovar.`
      } else {
        // Active or Trial — return status so frontend can update banner
        response.subscriptionStatus = subscription.status
      }
    }

    // Generate new token with fresh 24h expiry
    const newToken = await generateToken({
      userId: payload.userId,
      storeId: payload.storeId,
      role: payload.role,
      employeeId: payload.employeeId,
      expiryMs: 24 * 60 * 60 * 1000,
    })
    response.token = newToken

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json({ error: 'Error al refrescar token', token: '', expiresIn: 0 }, { status: 500 })
  }
}
