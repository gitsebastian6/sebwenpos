// ---------------------------------------------------------------------------
// Ventify POS — Subscription Pricing
// ---------------------------------------------------------------------------
// Pricing calculation and currency formatting utilities for subscriptions.
// ---------------------------------------------------------------------------

import { BILLING_PERIODS } from './constants'

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
