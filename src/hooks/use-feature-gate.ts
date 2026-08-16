// ---------------------------------------------------------------------------
// Sebwen POS — useFeatureGate Hook
// ---------------------------------------------------------------------------
// React hook to check if the current store's plan has a specific feature.
// Shows an upgrade prompt when the feature is not available.
// ---------------------------------------------------------------------------

'use client'

import { useAuthStore } from '@/stores/auth-store'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/lib/subscription-helpers'

interface FeatureGateResult {
  enabled: boolean
  loading: boolean
  label: string
  /** Feature object from subscription info (may be undefined for loading state) */
  feature: PlanFeatureKey
}

/**
 * Hook to check if a plan feature is enabled for the current store.
 * Uses the auth store's subscription info (no API call needed).
 *
 * @param featureKey - The feature to check (e.g., 'electronicInvoicing')
 * @returns { enabled, loading, label, feature }
 *
 * @example
 * const { enabled, loading } = useFeatureGate('electronicInvoicing')
 * if (loading) return <Skeleton />
 * if (!enabled) return <UpgradePrompt feature="Facturación Electrónica" />
 */
export function useFeatureGate(featureKey: PlanFeatureKey): FeatureGateResult {
  const subscription = useAuthStore((s) => s.subscription)

  if (!subscription || !subscription.planLimits?.features) {
    return { enabled: false, loading: !!subscription, label: PLAN_FEATURES[featureKey], feature: featureKey }
  }

  const features = subscription.planLimits.features
  const enabled = subscription.hasSubscription && ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(subscription.subscriptionStatus || '') && !!features[featureKey]

  return { enabled, loading: false, label: PLAN_FEATURES[featureKey], feature: featureKey }
}

/**
 * Get all features with their current status from the auth store.
 * Returns a record of feature key → boolean (enabled/disabled).
 */
export function useAllFeatures(): Record<string, boolean> {
  const subscription = useAuthStore((s) => s.subscription)
  if (!subscription?.planLimits?.features) return {}
  return subscription.planLimits.features as Record<string, boolean>
}
