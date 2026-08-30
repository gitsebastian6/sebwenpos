import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fullPermissions } from '@/lib/permissions-catalog'
import { sanitizeUser } from '@/lib/auth'
import { generateToken } from '@/lib/auth-helpers'
import { getAuthUser } from '@/lib/api-auth'
import { withRateLimit } from '@/lib/rate-limiter'
import { logger } from '@/lib/logger'
import { getSubscriptionInfo } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

const SWITCH_STORE_RATE_LIMIT: { maxRequests: number; windowSeconds: number } = { maxRequests: 30, windowSeconds: 60 }

/** Full OWNER permissions (same as login) */
function buildOwnerPermissions(isPastDue: boolean): Record<string, boolean> {
  // OWNER = acceso completo; en gracia (PAST_DUE) se le quita pos/tables/mesas.
  return { ...fullPermissions(), pos: !isPastDue, tables: !isPastDue }
}

/**
 * POST /api/auth/switch-store
 * Allows an OWNER user to switch their active store (multi-store/sucursal support).
 * Validates ownership, subscription status, and returns same shape as login.
 */
export async function POST(req: NextRequest) {
  // ─── Rate Limiting ───
  const rl = withRateLimit(req, 'switch-store', SWITCH_STORE_RATE_LIMIT)
  if (rl.allowed === false) return rl.response

  try {
    // ─── Authenticate ───
    const auth = getAuthUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })
    }

    // ─── Only OWNER can switch stores ───
    if (auth.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Acceso restringido. Solo el propietario puede cambiar de tienda.' },
        { status: 403 },
      )
    }

    // ─── Parse body ───
    const body = await req.json()
    const targetStoreId = body?.storeId

    if (typeof targetStoreId !== 'number' || targetStoreId <= 0) {
      return NextResponse.json({ error: 'El ID de la tienda es inválido' }, { status: 400 })
    }

    // ─── Fetch user with their current store ───
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      include: { store: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // ─── Validate ownership of the target store ───
    const directOwnership = user.store && user.store.id === targetStoreId

    let parentOwnership = false
    if (!directOwnership && user.store) {
      const targetMeta = await db.store.findUnique({
        where: { id: targetStoreId },
        select: { parentStoreId: true },
      })
      parentOwnership = !!targetMeta && targetMeta.parentStoreId === user.store.id
    }

    if (!directOwnership && !parentOwnership) {
      return NextResponse.json({ error: 'No tienes permisos para acceder a esta tienda' }, { status: 403 })
    }

    // ─── Fetch the target store with subscription ───
    const targetStore = await db.store.findUnique({
      where: { id: targetStoreId },
      include: { subscription: { include: { plan: true } } },
    })

    if (!targetStore) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // ─── Get subscription info (branches inherit parent's subscription) ───
    let subInfo = await getSubscriptionInfo(targetStore.id)

    // Centralized subscription: branches don't have their own subscription.
    // If the target store has a parentStoreId and no subscription, use the parent's.
    if (!subInfo.hasSubscription && targetStore.parentStoreId) {
      subInfo = await getSubscriptionInfo(targetStore.parentStoreId)
    }

    // ─── Block EXPIRED / CANCELLED subscriptions ───
    if (!subInfo.hasSubscription) {
      return NextResponse.json(
        { error: 'Esta tienda no tiene suscripción activa.', subscriptionStatus: 'NO_SUBSCRIPTION' },
        { status: 403 },
      )
    }

    if (subInfo.subscriptionStatus === 'EXPIRED' || subInfo.subscriptionStatus === 'CANCELLED') {
      return NextResponse.json(
        {
          error: 'No puedes acceder a esta tienda. Suscripción expirada o cancelada.',
          subscriptionStatus: subInfo.subscriptionStatus,
          planName: subInfo.planName,
        },
        { status: 403 },
      )
    }

    // ─── Generate new token ───
    const token = await generateToken({
      userId: user.id,
      storeId: targetStore.id,
      role: user.role,
    })

    // ─── Build permissions with PAST_DUE restrictions ───
    const isPastDue = subInfo.subscriptionStatus === 'PAST_DUE'
    const permissions = buildOwnerPermissions(isPastDue)

    // ─── Build availableStores list ───
    const mainStore = user.store
    const branches = await db.store.findMany({
      where: { parentStoreId: mainStore!.id },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })
    const availableStores = [
      { id: mainStore!.id, name: mainStore!.name, isMain: true },
      ...branches.map(b => ({ id: b.id, name: b.name, isMain: false })),
    ]

    // ─── Return same shape as login response ───
    return NextResponse.json({
      user: sanitizeUser(user),
      store: targetStore,
      token,
      isSuperAdmin: false,
      permissions,
      subscription: subInfo,
      availableStores,
    })
  } catch (error: unknown) {
    logger.error('Error al cambiar de tienda:', error)
    return NextResponse.json(
      { error: 'Error al cambiar de tienda. Intente nuevamente.' },
      { status: 500 },
    )
  }
}
