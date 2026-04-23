import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, sanitizeUser } from '@/lib/auth'
import { generateToken } from '@/lib/auth-helpers'
import { withRateLimit, LOGIN_RATE_LIMIT, attachRateLimitHeaders } from '@/lib/rate-limiter'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  cedula: z.string().min(3, 'Identificación mínimo 3 caracteres'),
  password: z.string().min(1, 'Contraseña es requerida'),
})

/**
 * Grace period: 3 calendar days after endDate before fully expiring.
 * Subscriptions transition: ACTIVE/TRIAL → PAST_DUE (3 days) → EXPIRED
 */
const GRACE_PERIOD_DAYS = 3

/**
 * Transition overdue subscriptions to PAST_DUE or EXPIRED.
 * - If endDate < now but within grace period → PAST_DUE
 * - If endDate < now and beyond grace period → EXPIRED
 * Called on every login to keep subscription status accurate.
 */
async function transitionOverdueSubscriptions() {
  const now = new Date()

  // ── Step 1: Auto-heal EXPIRED or PAST_DUE when endDate is still in the future ──
  //    (e.g. after a payment extends the period while status was stale)
  //    Never heal CANCELLED — that's an intentional admin action.
  const healed = await db.subscription.findMany({
    where: {
      endDate: { gt: now },
      status: { in: ['EXPIRED', 'PAST_DUE'] },
      cancelReason: null,
    },
  })
  for (const sub of healed) {
    const correctStatus = sub.billingPeriod === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: correctStatus, graceEndDate: null },
    })
    logger.warn(`Auto-healed subscription ${sub.id}: ${sub.status} → ${correctStatus} (endDate in future)`)
  }

  // ── Step 2: ACTIVE/TRIAL → PAST_DUE when endDate has passed ──
  await db.subscription.updateMany({
    where: {
      endDate: { lt: now },
      status: { in: ['TRIAL', 'ACTIVE'] },
    },
    data: {
      status: 'PAST_DUE',
      graceEndDate: new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
    },
  })

  // ── Step 3: PAST_DUE → EXPIRED when grace period ended AND endDate is still past ──
  await db.subscription.updateMany({
    where: {
      graceEndDate: { lt: now },
      status: 'PAST_DUE',
      endDate: { lt: now },
    },
    data: { status: 'EXPIRED' },
  })
}

/**
 * Get subscription info for a store, including plan limits and current usage.
 */
async function getSubscriptionInfo(storeId: number) {
  const subscription = await db.subscription.findUnique({
    where: { storeId },
    include: { plan: true },
  })

  if (!subscription) {
    return {
      hasSubscription: false,
      subscriptionStatus: null,
      planName: null,
      planLimits: null,
      currentUsage: null,
    }
  }

  // Auto-transition based on dates
  const now = new Date()
  const endDateInFuture = subscription.endDate && new Date(subscription.endDate) > now
  const endDateInPast = subscription.endDate && new Date(subscription.endDate) <= now

  // Auto-heal: EXPIRED or PAST_DUE → ACTIVE when endDate is still valid
  if (
    endDateInFuture &&
    (subscription.status === 'EXPIRED' || subscription.status === 'PAST_DUE') &&
    !subscription.cancelReason
  ) {
    const correctStatus = subscription.billingPeriod === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: { status: correctStatus, graceEndDate: null },
      include: { plan: true },
    })
    logger.warn(`Auto-healed subscription ${subscription.id}: ${subscription.status} → ${correctStatus} (endDate in future)`)
    return buildSubInfo(updated)
  }

  // ACTIVE/TRIAL → PAST_DUE when endDate has passed
  if (
    endDateInPast &&
    (subscription.status === 'TRIAL' || subscription.status === 'ACTIVE')
  ) {
    const graceEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE', graceEndDate: graceEnd },
      include: { plan: true },
    })
    return buildSubInfo(updated)
  }

  // PAST_DUE → EXPIRED when grace period ended AND endDate is still past
  if (
    subscription.status === 'PAST_DUE' &&
    subscription.graceEndDate &&
    new Date(subscription.graceEndDate) <= now &&
    endDateInPast
  ) {
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED' },
      include: { plan: true },
    })
    return buildSubInfo(updated)
  }

  return buildSubInfo(subscription)
}

function buildSubInfo(sub: { id: number; status: string; planId: number; endDate: Date | string | null; graceEndDate: Date | string | null; trialEndDate: Date | string | null; billingPeriod: string; startDate: Date | string; plan: { id: number; name: string; price: number; maxEmployees: number; maxProducts: number; features: string } }) {
  const now = new Date()
  const endDate = sub.endDate ? new Date(sub.endDate) : null
  const graceEndDate = sub.graceEndDate ? new Date(sub.graceEndDate) : null
  let daysRemaining: number | null = null
  let graceDaysRemaining: number | null = null

  if (endDate) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    daysRemaining = Math.ceil((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (graceEndDate && sub.status === 'PAST_DUE') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const graceEnd = new Date(graceEndDate.getFullYear(), graceEndDate.getMonth(), graceEndDate.getDate())
    graceDaysRemaining = Math.ceil((graceEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  return {
    hasSubscription: true,
    subscriptionStatus: sub.status,
    subscriptionId: sub.id,
    planId: sub.planId,
    planName: sub.plan.name,
    planPrice: sub.plan.price,
    endDate: sub.endDate,
    startDate: sub.startDate,
    trialEndDate: sub.trialEndDate,
    billingPeriod: sub.billingPeriod,
    daysRemaining,
    graceEndDate: sub.graceEndDate,
    graceDaysRemaining,
    planLimits: {
      maxEmployees: sub.plan.maxEmployees,
      maxProducts: sub.plan.maxProducts,
      features: JSON.parse(sub.plan.features),
    },
  }
}

export async function POST(req: NextRequest) {
  // ─── Rate Limiting: 5 intentos por minuto por IP ───
  const rl = withRateLimit(req, 'login', LOGIN_RATE_LIMIT)
  if (!rl.allowed) return (rl as { allowed: false; response: NextResponse }).response

  try {
    const body = await req.json()
    const data = loginSchema.parse(body)

    // Buscar usuario por cédula
    const user = await db.user.findUnique({
      where: { cedula: data.cedula },
      include: {
        store: {
          include: {
            subscription: {
              include: { plan: true },
            },
          },
        },
        employee: { include: { store: { include: { subscription: { include: { plan: true } } } }, role: true } },
      },
    })

    if (!user) {
      return attachRateLimitHeaders(
        NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 }),
        rl.result,
      )
    }

    const valid = await verifyPassword(data.password, user.passwordHash)
    if (!valid) {
      return attachRateLimitHeaders(
        NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 }),
        rl.result,
      )
    }

    const safeUser = sanitizeUser(user)
    const token = await generateToken({
      userId: user.id,
      storeId: null,
      role: user.role,
    })

    // ========================================
    // SUPER ADMIN — No tiene tienda asociada
    // ========================================
    if (user.role === 'SUPER_ADMIN') {
      return NextResponse.json({
        user: safeUser,
        store: null,
        token,
        isSuperAdmin: true,
        permissions: {
          dashboard: true, manageStores: true,
        },
      })
    }

    // ========================================
    // OWNER — Tiene acceso completo a su tienda
    // ========================================
    let store = user.store
    let permissions: Record<string, boolean> = {}
    let roleId: number | null = null
    let roleName: string | null = null
    let employeeId: number | null = null
    let availableStores: Array<{ id: number; name: string; isMain: boolean }> | null = null

    if (user.role === 'OWNER' && store) {
      permissions = {
        dashboard: true, pos: true, tables: true, products: true,
        customers: true, providers: true, orders: true, invoices: true,
        inventory: true, accounting: true, services: true, reports: true,
        settings: true, quotations: true, manageEmployees: true, manageRoles: true,
      }
    } else if (user.role === 'EMPLOYEE' && user.employee) {
      store = user.employee.store
      employeeId = user.employee.id

      // Obtener permisos del ROL asignado (prioridad) o del empleado directamente
      if (user.employee.role && user.employee.role.isActive) {
        try {
          permissions = JSON.parse(user.employee.role.permissions || '{}')
          roleId = user.employee.role.id
          roleName = user.employee.role.name
        } catch {
          permissions = {}
        }
      } else {
        try {
          permissions = JSON.parse(user.employee.permissions || '{}')
        } catch {
          permissions = {}
        }
      }
    }

    // ── Multi-store: find branches for OWNER ──
    if (user.role === 'OWNER' && store) {
      const branches = await db.store.findMany({
        where: { parentStoreId: store.id },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      })
      availableStores = [
        { id: store.id, name: store.name, isMain: true },
        ...branches.map(b => ({ id: b.id, name: b.name, isMain: false })),
      ]
    }

    if (!store) {
      return NextResponse.json({ error: 'No hay tienda asociada' }, { status: 400 })
    }

    // ========================================
    // Transition overdue subscriptions on every login
    // ========================================
    await transitionOverdueSubscriptions()

    // ========================================
    // Get fresh subscription info after auto-expire
    // Centralized model: branches inherit parent's subscription
    // ========================================
    let subInfo = await getSubscriptionInfo(store.id)

    // If this store is a branch with no subscription, try parent's subscription
    if (!subInfo.hasSubscription && store.parentStoreId) {
      const parentStore = await db.store.findUnique({
        where: { id: store.parentStoreId },
        select: { id: true },
      })
      if (parentStore) {
        subInfo = await getSubscriptionInfo(parentStore.id)
      }
    }

    // ─── Safety net: auto-assign Trial subscription if missing (only for main stores) ───
    if (!subInfo.hasSubscription && !store.parentStoreId) {
      try {
        const trialPlan = await db.plan.findFirst({ where: { name: 'Trial' } })
        if (trialPlan) {
          const now = new Date()
          const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          await db.subscription.create({
            data: {
              storeId: store!.id,
              planId: trialPlan.id,
              status: 'TRIAL',
              startDate: now,
              endDate: trialEnd,
              trialEndDate: trialEnd,
              billingPeriod: 'TRIAL',
              billingPrice: 0,
            },
          })
          logger.info(`Auto-assigned Trial subscription to store ${store!.id} (${store!.name})`)
          // Re-fetch subscription info after auto-assign
          const freshSubInfo = await getSubscriptionInfo(store!.id)
          if (freshSubInfo.hasSubscription && freshSubInfo.subscriptionStatus !== 'EXPIRED' && freshSubInfo.subscriptionStatus !== 'CANCELLED') {
            const authToken = await generateToken({
              userId: user.id,
              storeId: store!.id,
              role: user.role,
              employeeId,
            })
            return attachRateLimitHeaders(
              NextResponse.json({
                user: safeUser,
                store,
                token: authToken,
                isSuperAdmin: false,
                permissions,
                roleId,
                roleName,
                subscription: freshSubInfo,
                availableStores,
              }),
              rl.result,
            )
          }
        }
      } catch (autoAssignError: unknown) {
        logger.error('Failed to auto-assign Trial subscription:', autoAssignError)
      }
    }

    // ─── Subscription gate: no access without an active subscription ───
    if (!subInfo.hasSubscription) {
      return NextResponse.json({
        error: 'No tienes una suscripción activa. Contacte al soporte para asignar un plan.',
        subscriptionStatus: 'NO_SUBSCRIPTION',
      }, { status: 403 })
    }

    // Block access if subscription is EXPIRED or CANCELLED
    // PAST_DUE is allowed (user gets restricted access with banner)
    if (subInfo.subscriptionStatus === 'EXPIRED' || subInfo.subscriptionStatus === 'CANCELLED') {
      return NextResponse.json({
        error: 'Suscripción expirada. Contacte al administrador para renovar su plan.',
        subscriptionStatus: subInfo.subscriptionStatus,
        planName: subInfo.planName,
        endDate: subInfo.endDate,
      }, { status: 403 })
    }

    // PAST_DUE: allow login but mark restricted in permissions
    const isPastDue = subInfo.subscriptionStatus === 'PAST_DUE'
    if (isPastDue) {
      // Block POS and Tables during grace period (no new sales)
      permissions.pos = false
      permissions.tables = false
    }

    // Generate signed token with storeId for regular users
    const authToken = await generateToken({
      userId: user.id,
      storeId: store!.id,
      role: user.role,
      employeeId,
    })

    return attachRateLimitHeaders(
      NextResponse.json({
        user: safeUser,
        store,
        token: authToken,
        isSuperAdmin: false,
        permissions,
        roleId,
        roleName,
        subscription: subInfo,
        availableStores,
      }),
      rl.result,
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Login error:', error)
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
