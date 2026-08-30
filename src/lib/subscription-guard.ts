// ---------------------------------------------------------------------------
// Sebwen POS — Authoritative subscription guard for API routes
// ---------------------------------------------------------------------------
// `src/middleware.ts` blocks EXPIRED/CANCELLED stores using an in-memory cache
// that is *fail-open* on a cache miss (cold process, or after the 5-min TTL).
// For routes that move money or stock, that window is not acceptable — this
// helper does an authoritative DB read (via `isSubscriptionActive`, which also
// re-warms the middleware cache).
//
//   const subErr = await requireActiveSubscription(storeId)
//   if (subErr) return subErr
//
// Allowed statuses: ACTIVE, TRIAL, PAST_DUE (grace). EXPIRED / CANCELLED / no
// subscription → 403. PAST_DUE-specific "no new sales" is enforced separately
// by the middleware (PAST_DUE_WRITE_PREFIXES) and the login `permissions` flag.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server'
import { isSubscriptionActive, storeHasFeature } from '@/lib/subscription-helpers'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/lib/subscription/constants'

export async function requireActiveSubscription(
  storeId: number,
): Promise<null | NextResponse> {
  const active = await isSubscriptionActive(storeId)
  if (active) return null
  return NextResponse.json(
    { error: 'Tu suscripción está vencida o cancelada. Renueva tu plan para continuar.' },
    { status: 403 },
  )
}

/**
 * Gate a route on a plan feature (HALLAZGO #2).
 *
 *   const featErr = await requireFeature(storeId, 'reports')
 *   if (featErr) return featErr
 *
 * Returns `null` when the store's plan includes `feature` (and the subscription
 * is ACTIVE/TRIAL/PAST_DUE), or a 403 with `upgradeRequired: true`. Branches
 * inherit the parent's plan (see getStoreSubscription).
 */
export async function requireFeature(
  storeId: number,
  feature: PlanFeatureKey,
): Promise<null | NextResponse> {
  const ok = await storeHasFeature(storeId, feature)
  if (ok) return null
  const label = PLAN_FEATURES[feature]
  return NextResponse.json(
    {
      error: `La funcionalidad "${label}" no está disponible en tu plan actual.`,
      feature: label,
      upgradeRequired: true,
    },
    { status: 403 },
  )
}
