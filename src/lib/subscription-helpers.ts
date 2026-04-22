// ---------------------------------------------------------------------------
// Ventify POS — Centralized Subscription Helpers
// ---------------------------------------------------------------------------
// Shared utilities for subscription logic: feature checking, status
// transitions, history logging, and plan feature enforcement.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'

// ── Plan Feature Keys ──
export const PLAN_FEATURES = {
  electronicInvoicing: 'Facturación Electrónica',
  multiStore: 'Multi-Tienda',
  reports: 'Reportes Avanzados',
  advancedInventory: 'Inventario Avanzado',
  api: 'Acceso API',
  customBranding: 'Branding Personalizado',
  multiCurrency: 'Multi-Moneda',
  support: 'Soporte',
  priority: 'Soporte Prioritario',
} as const

export type PlanFeatureKey = keyof typeof PLAN_FEATURES

// ── Subscription Status ──
export const SUB_STATUS = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const

export type SubscriptionStatus = (typeof SUB_STATUS)[keyof typeof SUB_STATUS]

// ── History Event Types ──
export const HISTORY_EVENTS = {
  CREATED: 'CREATED',
  TRIAL_STARTED: 'TRIAL_STARTED',
  RENEWED: 'RENEWED',
  PLAN_CHANGED: 'PLAN_CHANGED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  REACTIVATED: 'REACTIVATED',
  GRACE_STARTED: 'GRACE_STARTED',
  BILLING_PERIOD_CHANGED: 'BILLING_PERIOD_CHANGED',
} as const

export type HistoryEventType = (typeof HISTORY_EVENTS)[keyof typeof HISTORY_EVENTS]

// ── Status Labels (Spanish) ──
export const STATUS_LABELS: Record<string, string> = {
  TRIAL: 'Prueba',
  ACTIVE: 'Activa',
  PAST_DUE: 'Vencida',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
}

// ── Event Type Labels (Spanish) ──
export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Suscripción Creada',
  TRIAL_STARTED: 'Prueba Iniciada',
  RENEWED: 'Suscripción Renovada',
  PLAN_CHANGED: 'Plan Cambiado',
  CANCELLED: 'Suscripción Cancelada',
  EXPIRED: 'Suscripción Expirada',
  REACTIVATED: 'Suscripción Reactivada',
  GRACE_STARTED: 'Período de Gracia',
  BILLING_PERIOD_CHANGED: 'Período de Facturación Cambiado',
}

// ── Billing Period Info ──
export const BILLING_PERIODS: Record<string, { label: string; days: number; months: number; discount: number }> = {
  TRIAL: { label: 'Prueba', days: 7, months: 0, discount: 0 },
  MONTHLY: { label: 'Mensual', days: 30, months: 1, discount: 0 },
  QUARTERLY: { label: 'Trimestral', days: 90, months: 3, discount: 5 },
  SEMI_ANNUAL: { label: 'Semestral', days: 180, months: 6, discount: 10 },
  ANNUAL: { label: 'Anual', days: 365, months: 12, discount: 15 },
}

// ── Feature Check Helpers ──

/**
 * Parse plan features JSON string into a typed record.
 */
export function parsePlanFeatures(featuresJson: string): Record<string, boolean | string> {
  try {
    return JSON.parse(featuresJson)
  } catch {
    return {}
  }
}

/**
 * Check if a plan has a specific feature enabled.
 */
export function planHasFeature(featuresJson: string, featureKey: PlanFeatureKey): boolean {
  const features = parsePlanFeatures(featuresJson)
  return !!features[featureKey]
}

/**
 * Get the subscription info with parsed features for a store.
 * Returns null if no subscription exists.
 */
export async function getStoreSubscription(storeId: number) {
  const subscription = await db.subscription.findUnique({
    where: { storeId },
    include: { plan: true },
  })
  if (!subscription) return null
  return {
    ...subscription,
    features: parsePlanFeatures(subscription.plan.features),
  }
}

/**
 * Check if a store's plan has a specific feature enabled.
 * Returns false if no subscription or feature not enabled.
 */
export async function storeHasFeature(storeId: number, featureKey: PlanFeatureKey): Promise<boolean> {
  const sub = await getStoreSubscription(storeId)
  if (!sub) return false
  if (sub.status !== 'ACTIVE' && sub.status !== 'TRIAL') return false
  return !!sub.features[featureKey]
}

/**
 * Check if a store's subscription is active (ACTIVE or TRIAL or PAST_DUE within grace).
 */
export async function isSubscriptionActive(storeId: number): Promise<boolean> {
  const sub = await getStoreSubscription(storeId)
  if (!sub) return false
  return ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(sub.status)
}

// ── History Logging ──

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

// ── Billing Record Creation ──

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

// ── Format Helpers ──

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/**
 * Get feature gating response for API middleware.
 * Returns { allowed: true } or { allowed: false, feature, planName, upgradeUrl }.
 */
export async function checkFeatureAccess(
  storeId: number,
  featureKey: PlanFeatureKey
): Promise<{ allowed: true } | { allowed: false; feature: string; planName: string }> {
  const sub = await getStoreSubscription(storeId)
  if (!sub) {
    return { allowed: false, feature: PLAN_FEATURES[featureKey], planName: 'Sin suscripción' }
  }
  if (!sub.features[featureKey]) {
    return { allowed: false, feature: PLAN_FEATURES[featureKey], planName: sub.plan.name }
  }
  return { allowed: true }
}

/**
 * Build feature-gated API response when feature is not available.
 */
export function featureGatedResponse(feature: string, planName: string) {
  return {
    error: `La funcionalidad "${feature}" no está disponible en tu plan actual (${planName}).`,
    feature,
    planName,
    upgradeRequired: true,
  }
}
