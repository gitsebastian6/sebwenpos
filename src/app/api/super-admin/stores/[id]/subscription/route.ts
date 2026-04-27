import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logSubscriptionChange, logPlanChange } from '@/lib/event-logger'

export const dynamic = 'force-dynamic'

const billingPeriods = ['TRIAL', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'] as const
const subscriptionStatuses = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const

const updateSubscriptionSchema = z.object({
  planId: z.number().int().positive('El planId debe ser un número positivo'),
  billingPeriod: z.enum(billingPeriods as unknown as [string, ...string[]], {
    message: `billingPeriod debe ser uno de: ${billingPeriods.join(', ')}`,
  }),
  status: z.enum(subscriptionStatuses as unknown as [string, ...string[]]).optional(),
})

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * GET /api/super-admin/stores/[id]/subscription
 * Returns the subscription for a store (including plan details).
 * If no subscription exists, returns null.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const storeId = parseInt(id, 10)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID de tienda inválido' }, { status: 400 })
    }

    const subscription = await db.subscription.findUnique({
      where: { storeId },
      include: {
        plan: true,
      },
    })

    if (!subscription) {
      return NextResponse.json(null)
    }

    return NextResponse.json(subscription)
  } catch (error) {
    logger.error('Error fetching subscription:', error)
    return NextResponse.json({ error: 'Error al obtener la suscripción' }, { status: 500 })
  }
}

/**
 * PUT /api/super-admin/stores/[id]/subscription
 * Create or update a subscription for a store (upsert).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const storeId = parseInt(id, 10)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID de tienda inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateSubscriptionSchema.parse(body)

    // Verify the store exists
    const store = await db.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Verify the plan exists
    const plan = await db.plan.findUnique({ where: { id: data.planId } })
    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }

    // R-04 FIX: Preserve original startDate on reactivation (don't reset customer tenure)
    // ─── Proration: credit for unused days on existing active subscription ───
    // Fetch existing subscription first
    const existingSubscription = await db.subscription.findUnique({
      where: { storeId },
      include: { plan: true },
    })
    const isReactivation = existingSubscription?.status === 'CANCELLED' || existingSubscription?.status === 'EXPIRED'
    const startDate = (isReactivation && existingSubscription?.startDate) ? new Date(existingSubscription.startDate) : new Date()

    let endDate: Date | null = null
    let trialEndDate: Date | null = null
    let billingPrice: number
    let nextBillingAt: Date | null = null

    let prorationCredit = 0
    let prorationDays = 0

    if (existingSubscription && existingSubscription.status === 'ACTIVE' && existingSubscription.endDate) {
      const endDateObj = new Date(existingSubscription.endDate)
      const nowMs = Date.now()
      if (endDateObj.getTime() > nowMs) {
        const remainingMs = endDateObj.getTime() - nowMs
        prorationDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24))
        const dailyRate = existingSubscription.plan.price / 30
        prorationCredit = Math.round(dailyRate * prorationDays)
        logger.info(`Proration: Store ${storeId} has ${prorationDays} unused days on ${existingSubscription.plan.name} → credit: $${prorationCredit}`)
      }
    }

    switch (data.billingPeriod) {
      case 'TRIAL':
        endDate = addDays(startDate, 7)
        trialEndDate = endDate
        billingPrice = 0
        break
      case 'MONTHLY':
        endDate = addDays(startDate, 30)
        billingPrice = plan.price * 1
        nextBillingAt = addDays(endDate, 1)
        break
      case 'QUARTERLY':
        endDate = addDays(startDate, 90)
        billingPrice = Math.round(plan.price * 3 * 0.95)
        nextBillingAt = addDays(endDate, 1)
        break
      case 'SEMI_ANNUAL':
        endDate = addDays(startDate, 180)
        billingPrice = Math.round(plan.price * 6 * 0.90)
        nextBillingAt = addDays(endDate, 1)
        break
      case 'ANNUAL':
        endDate = addDays(startDate, 365)
        billingPrice = Math.round(plan.price * 12 * 0.85)
        nextBillingAt = addDays(endDate, 1)
        break
      default:
        return NextResponse.json({ error: 'Período de facturación inválido' }, { status: 400 })
    }

    // Determine the new status
    // When Super Admin changes a plan, automatically reactivate from EXPIRED/CANCELLED
    // IMPORTANT: If endDate is in the future, status MUST be ACTIVE/TRIAL, never EXPIRED/CANCELLED
    let newStatus: string
    if (data.billingPeriod === 'TRIAL') {
      newStatus = 'TRIAL'
    } else if (isReactivation) {
      newStatus = 'ACTIVE'
    } else {
      newStatus = data.status ?? 'ACTIVE'
    }

    // ─── Capture previous state for event logging ───
    const previousStatus = existingSubscription?.status ?? null
    const previousPlan = existingSubscription?.plan
      ? { name: existingSubscription.plan.name, price: existingSubscription.plan.price }
      : null

    const subscription = await db.subscription.upsert({
      where: { storeId },
      create: {
        storeId,
        planId: data.planId,
        status: newStatus,
        startDate,
        endDate,
        trialEndDate,
        billingPeriod: data.billingPeriod,
        billingPrice,
        nextBillingAt,
        // Store proration info
        prorationCredit: prorationCredit,
        previousPlanId: existingSubscription?.planId ?? null,
        previousPlanName: (prorationDays > 0 ? existingSubscription?.plan.name : null) ?? null,
        proratedDaysRemaining: prorationDays,
      },
      update: {
        planId: data.planId,
        status: newStatus,
        startDate,
        endDate,
        trialEndDate,
        billingPeriod: data.billingPeriod,
        billingPrice,
        nextBillingAt,
        // Store proration info
        prorationCredit: prorationCredit,
        previousPlanId: existingSubscription?.planId ?? null,
        previousPlanName: (prorationDays > 0 ? existingSubscription?.plan.name : null) ?? null,
        proratedDaysRemaining: prorationDays,
        // Reset alert flags on plan change
        alertSentAt3d: null,
        alertSentAt1d: null,
        // Always clear cancel/grace flags on plan change to avoid stale state
        cancelReason: null,
        graceEndDate: null,
      },
      include: {
        plan: true,
      },
    })

    // ─── Event logging (fire-and-forget) ───
    await logSubscriptionChange(storeId, previousStatus, newStatus)
    if (previousPlan && (previousPlan.name !== plan.name || previousPlan.price !== plan.price)) {
      await logPlanChange(storeId, previousPlan, { name: plan.name, price: plan.price })
    }

    return NextResponse.json({
      ...subscription,
      proration: prorationDays > 0 ? {
        creditDays: prorationDays,
        creditAmount: prorationCredit,
        previousPlan: existingSubscription?.plan.name,
      } : null,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error upserting subscription:', error)
    return NextResponse.json({ error: 'Error al guardar la suscripción' }, { status: 500 })
  }
}
