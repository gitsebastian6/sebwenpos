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
import { isSubscriptionActive } from '@/lib/subscription-helpers'

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
