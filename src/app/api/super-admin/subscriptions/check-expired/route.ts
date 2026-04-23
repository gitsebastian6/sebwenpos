import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  logSubscriptionHistory,
  transitionOverdueSubscriptions,
  GRACE_PERIOD_DAYS,
  SUB_STATUS,
} from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/super-admin/subscriptions/check-expired
 * Runs the shared transition logic and logs each transition for audit trail.
 * Uses the centralized transitionOverdueSubscriptions() from subscription-helpers.
 */
export async function POST(_req: NextRequest) {
  try {
    // ── Capture before-state for logging ──
    const before = await db.subscription.findMany({
      where: {
        OR: [
          { endDate: { lt: new Date() }, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
          { endDate: { gt: new Date() }, status: { in: ['EXPIRED', 'PAST_DUE'] }, cancelReason: null },
        ],
      },
      include: {
        store: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
    })

    const beforeMap = new Map(before.map(s => [s.id, s]))

    // ── Run shared transition logic (single source of truth) ──
    await transitionOverdueSubscriptions()

    // ── Capture after-state and log transitions ──
    const after = await db.subscription.findMany({
      where: { id: { in: before.map(s => s.id) } },
      include: {
        store: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
    })

    const transitions: Array<{
      id: number; storeId: number; storeName: string;
      planName: string; previousStatus: string; newStatus: string;
      endDate: Date | null; autoHealed?: boolean;
    }> = []

    for (const sub of after) {
      const prev = beforeMap.get(sub.id)
      if (!prev || prev.status === sub.status) continue

      const eventType = sub.status === 'PAST_DUE' ? 'GRACE_STARTED'
        : sub.status === 'EXPIRED' ? 'EXPIRED'
        : 'REACTIVATED'

      const description = eventType === 'GRACE_STARTED'
        ? `Período de gracia de ${GRACE_PERIOD_DAYS} días iniciado`
        : eventType === 'EXPIRED'
          ? 'Suscripción expirada después del período de gracia'
          : `Auto-corrección: suscripción estaba ${prev.status} con endDate en el futuro. Restaurada a ${sub.status}.`

      await logSubscriptionHistory({
        storeId: sub.storeId,
        subscriptionId: sub.id,
        eventType: eventType as 'GRACE_STARTED' | 'EXPIRED' | 'REACTIVATED',
        previousStatus: prev.status,
        newStatus: sub.status,
        previousPlanId: prev.planId,
        newPlanId: sub.planId,
        previousPlanName: prev.plan.name,
        newPlanName: sub.plan.name,
        description,
        metadata: {
          graceEndDate: sub.graceEndDate?.toISOString(),
          triggeredBy: 'check-expired',
          autoHealed: eventType === 'REACTIVATED',
          endDate: sub.endDate?.toISOString(),
        },
      }).catch(() => { /* non-blocking */ })

      if (eventType === 'REACTIVATED') {
        logger.warn(
          `Auto-healed subscription ${sub.id} for store "${sub.store.name}": ${prev.status} → ${sub.status} (endDate in future)`
        )
      }

      transitions.push({
        id: sub.id,
        storeId: sub.storeId,
        storeName: sub.store.name,
        planName: sub.plan.name,
        previousStatus: prev.status,
        newStatus: sub.status,
        endDate: sub.endDate,
        autoHealed: eventType === 'REACTIVATED',
      })
    }

    const pastDueCount = transitions.filter(t => t.newStatus === 'PAST_DUE').length
    const expiredCount = transitions.filter(t => t.newStatus === 'EXPIRED').length
    const healedCount = transitions.filter(t => t.autoHealed).length

    return NextResponse.json({
      message: `Verificación completada: ${pastDueCount} a PAST_DUE, ${expiredCount} a EXPIRED, ${healedCount} auto-corregidas`,
      pastDueCount,
      expiredCount,
      healedCount,
      transitions,
    })
  } catch (error) {
    logger.error('Error checking expired subscriptions:', error)
    return NextResponse.json({ error: 'Error al verificar suscripciones expiradas' }, { status: 500 })
  }
}
