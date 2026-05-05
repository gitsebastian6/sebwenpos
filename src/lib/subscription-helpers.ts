// ---------------------------------------------------------------------------
// Ventify POS — Centralized Subscription Helpers
// ---------------------------------------------------------------------------
// Shared utilities for subscription logic: feature checking, status
// transitions, history logging, and plan feature enforcement.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { setSubscriptionStatus } from '@/lib/subscription-cache'

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
  PAST_DUE: 'PAST_DUE',
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
  PAST_DUE: 'Suscripción Vencida',
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

// ── Billing Price Calculator ──

/**
 * Calculate the billing price for a plan + billing period with discount.
 * This is the single source of truth for pricing calculations.
 *
 * @param monthlyPrice  Plan's monthly price in COP
 * @param billingPeriod MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL
 * @returns { fullPrice, discount, discountedPrice } — all in COP
 */
export function calculateBillingPrice(monthlyPrice: number, billingPeriod: string) {
  const period = BILLING_PERIODS[billingPeriod]
  const months = period?.months ?? 1
  const discount = period?.discount ?? 0
  const fullPrice = monthlyPrice * months
  const discountedPrice = Math.round(fullPrice * (1 - discount / 100))
  return { fullPrice, discount, discountedPrice, months }
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
  // R-02 FIX: Allow PAST_DUE (grace period) — user still has feature access during grace
  if (!['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(sub.status)) return false
  return !!sub.features[featureKey]
}

/**
 * Check if a store's subscription is active (ACTIVE or TRIAL or PAST_DUE within grace).
 */
export async function isSubscriptionActive(storeId: number): Promise<boolean> {
  const sub = await getStoreSubscription(storeId)
  if (!sub) return false
  const active = ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(sub.status)
  // Warm cache for middleware gating
  setSubscriptionStatus(storeId, sub.status)
  return active
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

// ── Subscription Transition Logic (shared) ──

/** Grace period: 3 calendar days after endDate before fully expiring. */
export const GRACE_PERIOD_DAYS = 3

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

// ── Feature Gate (M-02 fix: check subscription status) ──

/**
 * Get feature gating response for API middleware.
 * Returns { allowed: true } or { allowed: false, feature, planName, upgradeUrl }.
 * FIXED: Now checks subscription status — EXPIRED/CANCELLED are blocked.
 */
export async function checkFeatureAccess(
  storeId: number,
  featureKey: PlanFeatureKey
): Promise<{ allowed: true } | { allowed: false; feature: string; planName: string }> {
  const sub = await getStoreSubscription(storeId)
  if (!sub) {
    return { allowed: false, feature: PLAN_FEATURES[featureKey], planName: 'Sin suscripción' }
  }
  // R-02 FIX: Block EXPIRED/CANCELLED but allow PAST_DUE (grace period access)
  if (!['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(sub.status)) {
    return { allowed: false, feature: PLAN_FEATURES[featureKey], planName: sub.plan.name }
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
