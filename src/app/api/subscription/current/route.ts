import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logSubscriptionHistory, transitionSingleSubscription, parsePlanFeatures, GRACE_PERIOD_DAYS } from '@/lib/subscription-helpers'
import { computeDaysRemaining } from '@/lib/subscription/countdown'
import { setSubscriptionStatus } from '@/lib/subscription-cache'
import { requireAuthStoreId } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/current?storeId=1
 * Returns the active subscription info + plan limits for the given store.
 * Used by the frontend to enforce plan-based UI restrictions.
 * Tenant-isolated: only the store owner (or super admin) can access.
 */
export async function GET(req: NextRequest) {
  try {
    // Tenant isolation: validate storeId against JWT
    const { searchParams } = req.nextUrl
    const rawStoreId = searchParams.get('storeId')
    const storeIdOrErr = requireAuthStoreId(req, rawStoreId ? parseInt(rawStoreId, 10) : undefined)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeId = storeIdOrErr

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

    // Auto-transition: use shared logic
    const updated = await transitionSingleSubscription(subscription)
    if (updated) {
      const prevStatus = subscription.status
      subscription.status = updated.status
      // Log grace/expiry events
      if (updated.status === 'PAST_DUE' && prevStatus !== 'PAST_DUE') {
        await logSubscriptionHistory({
          storeId, subscriptionId: subscription.id,
          eventType: 'GRACE_STARTED', previousStatus: prevStatus, newStatus: 'PAST_DUE',
          previousPlanId: subscription.planId, newPlanId: subscription.planId,
          previousPlanName: subscription.plan.name, newPlanName: subscription.plan.name,
          description: `Período de gracia de ${GRACE_PERIOD_DAYS} días iniciado`,
          metadata: { graceEndDate: updated.graceEndDate?.toISOString() },
        }).catch(() => {})
      } else if (updated.status === 'EXPIRED' && prevStatus !== 'EXPIRED') {
        await logSubscriptionHistory({
          storeId, subscriptionId: subscription.id,
          eventType: 'EXPIRED', previousStatus: prevStatus, newStatus: 'EXPIRED',
          previousPlanId: subscription.planId, newPlanId: subscription.planId,
          previousPlanName: subscription.plan.name, newPlanName: subscription.plan.name,
          description: 'Suscripción expirada después del período de gracia',
        }).catch(() => {})
      }
    }

    const features = parsePlanFeatures(subscription.plan.features)

    const graceEndDate = subscription.graceEndDate
    const graceDaysRemaining = (graceEndDate && subscription.status === 'PAST_DUE')
      ? computeDaysRemaining(graceEndDate)
      : null

    // Warm subscription cache for middleware gating
    setSubscriptionStatus(storeId, subscription.status)

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
      daysRemaining: computeDaysRemaining(
        // For TRIAL subscriptions, use trialEndDate; otherwise use endDate
        subscription.status === 'TRIAL' && subscription.trialEndDate
          ? subscription.trialEndDate
          : subscription.endDate,
      ),
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
