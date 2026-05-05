import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { transitionOverdueSubscriptions } from '@/lib/subscription-helpers'
import { logSubscriptionChange } from '@/lib/event-logger'
import { safeStringEqual } from '@/lib/crypto-utils'

export const dynamic = 'force-dynamic'

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
    if (!expected || !safeStringEqual(internalSecret, expected)) {
      return NextResponse.json({ error: 'Invalid internal secret' }, { status: 401 })
    }
  }

  try {
    // ── Capture before-state for change detection ──
    const before = await db.subscription.findMany({
      where: {
        OR: [
          { endDate: { lt: new Date() }, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
          { endDate: { gt: new Date() }, status: { in: ['EXPIRED', 'PAST_DUE'] }, cancelReason: null },
        ],
      },
      select: { id: true, storeId: true, status: true },
    })

    const beforeMap = new Map(before.map(s => [s.id, s]))

    // ── Run shared transition logic (single source of truth) ──
    await transitionOverdueSubscriptions()

    // ── Capture after-state and log transitions ──
    const after = await db.subscription.findMany({
      where: { id: { in: before.map(s => s.id) } },
      select: { id: true, storeId: true, status: true },
    })

    const results = {
      checked: before.length,
      pastDue: 0,
      expired: 0,
      errors: 0,
    }

    for (const sub of after) {
      const prev = beforeMap.get(sub.id)
      if (!prev || prev.status === sub.status) continue

      // Log store event for each status change
      await logSubscriptionChange(sub.storeId, prev.status, sub.status, {
        subscriptionId: sub.id,
        triggeredBy: 'billing-check',
      }).catch(() => { /* non-blocking */ })

      if (sub.status === 'PAST_DUE') {
        results.pastDue++
      } else if (sub.status === 'EXPIRED') {
        results.expired++
      }
    }

    logger.info(
      `[Billing Check] Checked ${results.checked} subscriptions — PAST_DUE: ${results.pastDue}, EXPIRED: ${results.expired}`
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
