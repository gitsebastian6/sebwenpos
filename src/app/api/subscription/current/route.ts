import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

const currentSubSchema = z.object({
  storeId: z.coerce.number().int().positive('storeId requerido'),
})

/**
 * GET /api/subscription/current?storeId=1
 * Returns the active subscription info + plan limits for the given store.
 * Used by the frontend to enforce plan-based UI restrictions.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const parsed = currentSubSchema.safeParse({
      storeId: searchParams.get('storeId'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'storeId es requerido' },
        { status: 400 },
      )
    }

    const storeId = parsed.data.storeId

    const subscription = await db.subscription.findUnique({
      where: { storeId },
      include: { plan: true },
    })

    if (!subscription) {
      return NextResponse.json({
        hasSubscription: false,
        planLimits: null,
        subscriptionStatus: null,
      })
    }

    // Auto-transition: ACTIVE/TRIAL → PAST_DUE, PAST_DUE → EXPIRED
    const GRACE_PERIOD_DAYS = 3
    const now = new Date()

    // Only heal EXPIRED with no cancelReason (never override intentional cancellations)
    if (
      subscription.endDate &&
      new Date(subscription.endDate) > now &&
      subscription.status === 'EXPIRED' &&
      !subscription.cancelReason
    ) {
      const correctStatus = subscription.billingPeriod === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
      const prevStatus = subscription.status
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: correctStatus, graceEndDate: null },
      })
      subscription.status = correctStatus
      logger.warn(`Auto-healed subscription ${subscription.id}: ${prevStatus} → ${correctStatus} (endDate in future)`)
    }

    if (
      subscription.endDate &&
      new Date(subscription.endDate) < new Date() &&
      (subscription.status === 'TRIAL' || subscription.status === 'ACTIVE')
    ) {
      const graceEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      const prevStatus = subscription.status
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE', graceEndDate: graceEnd },
      })
      subscription.status = 'PAST_DUE'
      // Log grace period start
      await logSubscriptionHistory({
        storeId,
        subscriptionId: subscription.id,
        eventType: 'GRACE_STARTED',
        previousStatus: prevStatus,
        newStatus: 'PAST_DUE',
        previousPlanId: subscription.planId,
        newPlanId: subscription.planId,
        previousPlanName: subscription.plan.name,
        newPlanName: subscription.plan.name,
        description: `Período de gracia de ${GRACE_PERIOD_DAYS} días iniciado`,
        metadata: { graceEndDate: graceEnd.toISOString() },
      }).catch(() => { /* non-blocking */ })
    }
    if (
      subscription.status === 'PAST_DUE' &&
      subscription.graceEndDate &&
      new Date(subscription.graceEndDate) < new Date()
    ) {
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      })
      subscription.status = 'EXPIRED'
      // Log expiration
      await logSubscriptionHistory({
        storeId,
        subscriptionId: subscription.id,
        eventType: 'EXPIRED',
        previousStatus: 'PAST_DUE',
        newStatus: 'EXPIRED',
        previousPlanId: subscription.planId,
        newPlanId: subscription.planId,
        previousPlanName: subscription.plan.name,
        newPlanName: subscription.plan.name,
        description: 'Suscripción expirada después del período de gracia',
      }).catch(() => { /* non-blocking */ })
    }

    const features: Record<string, boolean> = (() => {
      try {
        return JSON.parse(subscription.plan.features)
      } catch {
        return {}
      }
    })()

    const graceEndDate = subscription.graceEndDate
    const graceDaysRemaining = (graceEndDate && subscription.status === 'PAST_DUE')
      ? Math.ceil((new Date(graceEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    return NextResponse.json({
      hasSubscription: true,
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      planName: subscription.plan.name,
      planPrice: subscription.plan.price,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      trialEndDate: subscription.trialEndDate,
      graceEndDate,
      graceDaysRemaining,
      billingPeriod: subscription.billingPeriod,
      nextBillingAt: subscription.nextBillingAt,
      billingPrice: subscription.billingPrice,
      prorationCredit: subscription.prorationCredit,
      previousPlanName: subscription.previousPlanName,
      daysRemaining: subscription.endDate
        ? Math.ceil(
            (new Date(subscription.endDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          )
        : null,
      planLimits: {
        maxEmployees: subscription.plan.maxEmployees,
        maxProducts: subscription.plan.maxProducts,
        features,
      },
    })
  } catch (error) {
    logger.error('GET /api/subscription/current error:', error)
    return NextResponse.json(
      { error: 'Error al obtener suscripción' },
      { status: 500 },
    )
  }
}
