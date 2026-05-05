// ---------------------------------------------------------------------------
// Ventify POS — Subscription Feature Checking
// ---------------------------------------------------------------------------
// Feature parsing, plan/store feature checks, subscription status helpers,
// and feature-gating utilities for API middleware.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { setSubscriptionStatus } from '@/lib/subscription-cache'
import { PLAN_FEATURES, type PlanFeatureKey } from './constants'

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
