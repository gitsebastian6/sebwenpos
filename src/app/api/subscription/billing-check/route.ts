import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { logSubscriptionHistory, GRACE_PERIOD_DAYS } from '@/lib/subscription-helpers'
import { logSubscriptionChange } from '@/lib/event-logger'

export const dynamic = 'force-dynamic'

// Constant-time string comparison to prevent timing attacks on secret check
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a)
  const bBuf = encoder.encode(b)
  const result = new Uint8Array(aBuf.length)
  for (let i = 0; i < aBuf.length; i++) {
    result[i] = aBuf[i] ^ bBuf[i]
  }
  return result.every(byte => byte === 0)
}

// POST /api/subscription/billing-check
// Checks for overdue subscriptions and updates their status.
// Can be called manually or by a cron job.
// Protected by INTERNAL_SECRET or auth.
export async function POST(request: NextRequest) {
  // Verify auth: either INTERNAL_SECRET header or Bearer token
  const internalSecret = request.headers.get('X-Internal-Secret')
  const authHeader = request.headers.get('Authorization')

  if (!internalSecret && !authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (internalSecret) {
    const expected = process.env.INTERNAL_SECRET
    if (!expected || !timingSafeEqual(internalSecret, expected)) {
      return NextResponse.json({ error: 'Invalid internal secret' }, { status: 401 })
    }
  }

  try {
    const now = new Date()
    const gracePeriodDays = GRACE_PERIOD_DAYS
    const results = {
      checked: 0,
      pastDue: 0,
      expired: 0,
      errors: 0,
    }

    // Find all subscriptions that are overdue
    const overdueSubscriptions = await db.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        nextBillingAt: { lte: now },
      },
      include: {
        plan: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
      },
    })

    results.checked = overdueSubscriptions.length

    for (const sub of overdueSubscriptions) {
      try {
        const nextBilling = sub.nextBillingAt ? new Date(sub.nextBillingAt) : null
        if (!nextBilling) continue

        const daysOverdue = Math.floor(
          (now.getTime() - nextBilling.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (sub.status === 'ACTIVE' && daysOverdue >= 0 && daysOverdue < gracePeriodDays) {
          // Grace period — mark as PAST_DUE but don't block
          await db.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'PAST_DUE',
              graceEndDate: new Date(
                nextBilling.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000
              ),
            },
          })

          await logSubscriptionHistory({
            storeId: sub.storeId,
            subscriptionId: sub.id,
            eventType: 'PAST_DUE',
            previousStatus: 'ACTIVE',
            newStatus: 'PAST_DUE',
            previousPlanId: sub.planId,
            newPlanId: sub.planId,
            previousPlanName: sub.plan.name,
            newPlanName: sub.plan.name,
            description: `Suscripción vencida hace ${daysOverdue} día(s). Período de gracia: ${gracePeriodDays - daysOverdue} día(s) restante(s).`,
            metadata: {
              daysOverdue,
              gracePeriodDays,
              nextBillingAt: nextBilling.toISOString(),
            },
          })

          await logSubscriptionChange(sub.storeId, 'ACTIVE', 'PAST_DUE', {
            subscriptionId: sub.id,
            daysOverdue,
          })

          results.pastDue++
        } else if (sub.status === 'PAST_DUE' && daysOverdue >= gracePeriodDays) {
          // Past grace period — mark as EXPIRED
          await db.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'EXPIRED',
              cancelReason: 'BILLING_OVERDUE',
            },
          })

          await logSubscriptionHistory({
            storeId: sub.storeId,
            subscriptionId: sub.id,
            eventType: 'EXPIRED',
            previousStatus: 'PAST_DUE',
            newStatus: 'EXPIRED',
            previousPlanId: sub.planId,
            newPlanId: sub.planId,
            previousPlanName: sub.plan.name,
            newPlanName: sub.plan.name,
            description: `Suscripción expirada después de ${daysOverdue} días sin pago. Período de gracia de ${gracePeriodDays} días excedido.`,
            metadata: {
              daysOverdue,
              gracePeriodDays,
              nextBillingAt: nextBilling.toISOString(),
            },
          })

          await logSubscriptionChange(sub.storeId, 'PAST_DUE', 'EXPIRED', {
            subscriptionId: sub.id,
            daysOverdue,
          })

          results.expired++
        }
      } catch (error) {
        logger.error(
          `[Billing Check] Error processing subscription ${sub.id}:`,
          error
        )
        results.errors++
      }
    }

    logger.info(
      `[Billing Check] Checked ${results.checked} subscriptions — PAST_DUE: ${results.pastDue}, EXPIRED: ${results.expired}, Errors: ${results.errors}`
    )

    return NextResponse.json(results)
  } catch (error) {
    logger.error('[Billing Check] Error:', error)
    return NextResponse.json(
      { error: 'Error en verificación de facturación' },
      { status: 500 }
    )
  }
}
