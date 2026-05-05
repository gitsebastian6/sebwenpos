// ---------------------------------------------------------------------------
// Ventify POS — Subscription History & Billing Records
// ---------------------------------------------------------------------------
// Functions for logging subscription history events and creating billing
// records for subscription payments/extensions.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import type { HistoryEventType } from './constants'

/**
 * Log a subscription history event.
 */
export async function logSubscriptionHistory(params: {
  storeId: number
  subscriptionId: number
  eventType: HistoryEventType
  previousStatus?: string | null
  newStatus?: string | null
  previousPlanId?: number | null
  newPlanId?: number | null
  previousPlanName?: string | null
  newPlanName?: string | null
  description?: string
  metadata?: Record<string, unknown>
}) {
  return db.subscriptionHistory.create({
    data: {
      storeId: params.storeId,
      subscriptionId: params.subscriptionId,
      eventType: params.eventType,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      previousPlanId: params.previousPlanId ?? null,
      newPlanId: params.newPlanId ?? null,
      previousPlanName: params.previousPlanName ?? null,
      newPlanName: params.newPlanName ?? null,
      description: params.description ?? null,
      metadata: JSON.stringify(params.metadata ?? {}),
    },
  })
}

/**
 * Create a billing record for a subscription payment/extension.
 */
export async function createBillingRecord(params: {
  storeId: number
  subscriptionId: number
  receiptId?: number | null
  planId: number
  planName: string
  billingPeriod: string
  amount: number
  prorationCredit: number
  status?: string
  paymentMethod?: string | null
  periodStart: Date
  periodEnd: Date
  notes?: string | null
}) {
  return db.billingRecord.create({
    data: {
      storeId: params.storeId,
      subscriptionId: params.subscriptionId,
      receiptId: params.receiptId ?? null,
      planId: params.planId,
      planName: params.planName,
      billingPeriod: params.billingPeriod,
      amount: params.amount,
      prorationCredit: params.prorationCredit,
      netAmount: params.amount - params.prorationCredit,
      status: params.status ?? 'PAID',
      paymentMethod: params.paymentMethod ?? null,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      notes: params.notes ?? null,
    },
  })
}
