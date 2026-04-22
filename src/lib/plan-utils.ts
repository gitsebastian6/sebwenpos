// ── Plan Utilities ────────────────────────────────────────────────────────────
// Helper functions for plan management: durations, expiration checks, and
// automatic date calculations when a store's plan changes.

export type PlanType = 'TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE'

/** Duration in days for each plan type (null = never expires) */
export const PLAN_DURATIONS: Record<PlanType, number | null> = {
  TRIAL: 15,
  BASIC: 30,
  PRO: 365,
  ENTERPRISE: null,
}

/** Human-readable plan labels (Spanish) */
export const PLAN_LABELS: Record<PlanType, string> = {
  TRIAL: 'Prueba',
  BASIC: 'Básico',
  PRO: 'Pro',
  ENTERPRISE: 'Empresa',
}

/**
 * Returns the duration in days for a given plan.
 * Returns null for ENTERPRISE (never expires).
 * Falls back to 30 days if the plan is unrecognized.
 */
export function getPlanDuration(plan: string): number | null {
  const duration = PLAN_DURATIONS[plan as PlanType]
  if (duration === undefined) return 30
  return duration
}

/**
 * Checks if a store's plan has expired.
 * Returns false if planExpiresAt is null (no expiration set).
 */
export function isPlanExpired(store: {
  plan: string
  planExpiresAt: Date | string | null
}): boolean {
  if (!store.planExpiresAt) return false
  const expiresAt = store.planExpiresAt instanceof Date
    ? store.planExpiresAt
    : new Date(store.planExpiresAt)
  return expiresAt.getTime() < Date.now()
}

/**
 * Returns the number of days remaining until plan expiration.
 * - Returns null if planExpiresAt is not set (no expiration).
 * - Returns a negative number if already expired.
 */
export function getDaysRemaining(store: {
  planExpiresAt: Date | string | null
}): number | null {
  if (!store.planExpiresAt) return null
  const expiresAt = store.planExpiresAt instanceof Date
    ? store.planExpiresAt
    : new Date(store.planExpiresAt)
  const diffMs = expiresAt.getTime() - Date.now()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/** Alias for getDaysRemaining */
export function getPlanDaysRemaining(store: {
  planExpiresAt: Date | string | null
}): number | null {
  return getDaysRemaining(store)
}

/**
 * Calculates the plan start and expiration dates for a given plan.
 * Returns { planStartDate, planExpiresAt } as Date objects.
 * For ENTERPRISE, planExpiresAt will be null (never expires).
 * If a custom number of days is provided, it overrides the default duration.
 */
export function calculatePlanDates(
  plan: string,
  customDays?: number
): {
  planStartDate: Date
  planExpiresAt: Date | null
} {
  const planStartDate = new Date()
  const duration = customDays ?? getPlanDuration(plan)

  if (duration === null) {
    return { planStartDate, planExpiresAt: null }
  }

  const planExpiresAt = new Date(
    planStartDate.getTime() + duration * 24 * 60 * 60 * 1000
  )
  return { planStartDate, planExpiresAt }
}
