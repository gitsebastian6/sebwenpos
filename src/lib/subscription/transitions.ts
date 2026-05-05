// ---------------------------------------------------------------------------
// Ventify POS — Subscription Status Transitions
// ---------------------------------------------------------------------------
// Auto-transition logic for overdue subscriptions: grace period management,
// status healing, and bulk/single subscription transition functions.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { GRACE_PERIOD_DAYS } from './constants'

/**
 * Transition overdue subscriptions to PAST_DUE or EXPIRED.
 * - Auto-heal EXPIRED/PAST_DUE → TRIAL/ACTIVE when endDate is still in the future
 * - ACTIVE/TRIAL → PAST_DUE when endDate has passed (sets graceEndDate)
 * - PAST_DUE → EXPIRED when grace period ended AND endDate is still past
 *
 * This is the single source of truth for subscription status transitions.
 * Used by login, refresh, switch-store, and subscription/current routes.
 */
export async function transitionOverdueSubscriptions() {
  const now = new Date()

  // ── Step 1: Auto-heal EXPIRED or PAST_DUE when endDate is still in the future ──
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
 * Auto-transition a single subscription and return updated sub with plan.
 * Runs the same 3-step logic as transitionOverdueSubscriptions but for a single store,
 * and returns the updated subscription info for immediate use.
 */
export async function transitionSingleSubscription(subscription: {
  id: number; status: string; endDate: Date | null; graceEndDate: Date | null;
  trialEndDate: Date | null; cancelReason: string | null; billingPeriod: string;
}) {
  const now = new Date()
  // For TRIAL, use trialEndDate; otherwise use endDate
  const effectiveEndDate = (subscription.status === 'TRIAL' && subscription.trialEndDate)
    ? new Date(subscription.trialEndDate)
    : (subscription.endDate ? new Date(subscription.endDate) : null)
  const endDateInFuture = effectiveEndDate && effectiveEndDate > now
  const endDateInPast = effectiveEndDate && effectiveEndDate <= now

  // Auto-heal
  if (
    endDateInFuture &&
    (subscription.status === 'EXPIRED' || subscription.status === 'PAST_DUE') &&
    !subscription.cancelReason
  ) {
    const correctStatus = subscription.billingPeriod === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
    return db.subscription.update({
      where: { id: subscription.id },
      data: { status: correctStatus, graceEndDate: null },
      include: { plan: true },
    })
  }

  // ACTIVE/TRIAL → PAST_DUE
  if (
    endDateInPast &&
    (subscription.status === 'TRIAL' || subscription.status === 'ACTIVE')
  ) {
    const graceEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    return db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE', graceEndDate: graceEnd },
      include: { plan: true },
    })
  }

  // PAST_DUE → EXPIRED
  if (
    subscription.status === 'PAST_DUE' &&
    subscription.graceEndDate &&
    new Date(subscription.graceEndDate) <= now &&
    endDateInPast
  ) {
    return db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED' },
      include: { plan: true },
    })
  }

  return null // No transition needed
}
