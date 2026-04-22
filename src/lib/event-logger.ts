import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

/**
 * Store Event Logger — Centralized service for tracking store lifecycle events.
 *
 * Event types:
 *   STORE_CREATED, STORE_ACTIVATED, TRIAL_STARTED, TRIAL_ENDED,
 *   SUBSCRIPTION_ACTIVE, SUBSCRIPTION_PAST_DUE, SUBSCRIPTION_CANCELLED,
 *   SUBSCRIPTION_REACTIVATED, PLAN_UPGRADED, PLAN_DOWNGRADED,
 *   BRANCH_CREATED, STORE_DELETED
 *
 * Usage:
 *   import { logStoreEvent } from '@/lib/event-logger'
 *   await logStoreEvent(storeId, 'TRIAL_STARTED', { plan: 'Trial' })
 */

type StoreEventType =
  | 'STORE_CREATED'
  | 'STORE_ACTIVATED'
  | 'TRIAL_STARTED'
  | 'TRIAL_ENDED'
  | 'SUBSCRIPTION_ACTIVE'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_REACTIVATED'
  | 'PLAN_UPGRADED'
  | 'PLAN_DOWNGRADED'
  | 'BRANCH_CREATED'
  | 'STORE_DELETED'

export { type StoreEventType }

/**
 * Log a store lifecycle event.
 * Fire-and-forget — errors are logged but never thrown to the caller.
 */
export async function logStoreEvent(
  storeId: number,
  eventType: StoreEventType,
  options?: {
    previousValue?: string
    newValue?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  try {
    await db.storeEventLog.create({
      data: {
        storeId,
        eventType,
        previousValue: options?.previousValue ?? null,
        newValue: options?.newValue ?? null,
        metadata: JSON.stringify(options?.metadata ?? {}),
      },
    })
  } catch (error) {
    // Never throw — event logging must not break business operations
    logger.error(`[EventLog] Failed to log ${eventType} for store ${storeId}:`, error)
  }
}

/**
 * Log subscription status change with appropriate event type mapping.
 */
export async function logSubscriptionChange(
  storeId: number,
  previousStatus: string | null,
  newStatus: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const statusMap: Record<string, StoreEventType> = {
    TRIAL: 'TRIAL_STARTED',
    ACTIVE: 'SUBSCRIPTION_ACTIVE',
    PAST_DUE: 'SUBSCRIPTION_PAST_DUE',
    CANCELLED: 'SUBSCRIPTION_CANCELLED',
  }

  const eventType = statusMap[newStatus] || 'STORE_ACTIVATED'
  await logStoreEvent(storeId, eventType, {
    previousValue: previousStatus ?? undefined,
    newValue: newStatus,
    metadata,
  })
}

/**
 * Log a plan change (upgrade or downgrade based on price comparison).
 */
export async function logPlanChange(
  storeId: number,
  previousPlan: { name: string; price: number } | null,
  newPlan: { name: string; price: number },
): Promise<void> {
  const eventType: StoreEventType = previousPlan
    ? newPlan.price > previousPlan.price ? 'PLAN_UPGRADED' : 'PLAN_DOWNGRADED'
    : 'PLAN_UPGRADED'

  await logStoreEvent(storeId, eventType, {
    previousValue: previousPlan?.name ?? undefined,
    newValue: newPlan.name,
    metadata: {
      previousPrice: previousPlan?.price ?? 0,
      newPrice: newPlan.price,
    },
  })
}
