// ---------------------------------------------------------------------------
// Viva POS — Subscription Info Building
// ---------------------------------------------------------------------------
// Functions to fetch, transition, and build subscription info objects
// for API responses. Centralized so login, switch-store, and subscription
// routes use identical logic and response shapes.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { setSubscriptionStatus } from '@/lib/subscription-cache'
import { parsePlanFeatures } from './features'
import { transitionSingleSubscription } from './transitions'

/**
 * Get subscription info for a store, running auto-transition and building response.
 * Centralized so login, switch-store, and other routes use identical logic.
 * Returns null-subscription shape when no subscription exists.
 */
export async function getSubscriptionInfo(storeId: number) {
  const subscription = await db.subscription.findUnique({
    where: { storeId },
    include: { plan: true },
  })

  if (!subscription) {
    // Cache NO_SUBSCRIPTION so middleware can detect stores without plans
    setSubscriptionStatus(storeId, 'NO_SUBSCRIPTION')
    return {
      hasSubscription: false,
      subscriptionStatus: null,
      planName: null,
      planLimits: null,
      currentUsage: null,
    }
  }

  // Use shared transition logic
  const updated = await transitionSingleSubscription(subscription)
  const finalSub = updated || subscription
  const result = buildSubInfo(finalSub)

  // Warm cache with final subscription status for middleware gating
  if (result.hasSubscription && result.subscriptionStatus) {
    setSubscriptionStatus(storeId, result.subscriptionStatus)
  }

  return result
}

/**
 * Build subscription info object for API responses.
 * Centralized so login, switch-store, and subscription routes use identical shape.
 */
export function buildSubInfo(sub: {
  id: number; status: string; planId: number;
  endDate: Date | string | null; graceEndDate: Date | string | null;
  trialEndDate: Date | string | null; billingPeriod: string; startDate: Date | string;
  plan: { id: number; name: string; price: number; maxEmployees: number; maxProducts: number; features: string };
}) {
  const now = new Date()
  const endDate = sub.endDate ? new Date(sub.endDate) : null
  const trialEndDate = sub.trialEndDate ? new Date(sub.trialEndDate) : null
  const graceEndDate = sub.graceEndDate ? new Date(sub.graceEndDate) : null
  let daysRemaining: number | null = null
  let graceDaysRemaining: number | null = null

  // For TRIAL subscriptions, use trialEndDate for daysRemaining
  if (sub.status === 'TRIAL' && trialEndDate) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const trialEnd = new Date(trialEndDate.getFullYear(), trialEndDate.getMonth(), trialEndDate.getDate())
    daysRemaining = Math.ceil((trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  } else if (endDate) {
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
      features: parsePlanFeatures(sub.plan.features),
    },
  }
}
