import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

const GRACE_PERIOD_DAYS = 3

/**
 * POST /api/super-admin/subscriptions/check-expired
 * Finds all subscriptions that have expired (endDate < now) and are still in TRIAL or ACTIVE status,
 * then marks them as PAST_DUE (grace period) or EXPIRED (after grace).
 * Same logic as login transitionOverdueSubscriptions.
 */
export async function POST(_req: NextRequest) {
  try {
    const now = new Date()

    // ── Step 1: Mark as PAST_DUE: expired but within grace window ──
    const pastDueSubs = await db.subscription.findMany({
      where: {
        endDate: { lt: now },
        status: { in: ['TRIAL', 'ACTIVE'] },
        graceEndDate: null,
      },
      include: {
        store: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
    })

    let pastDueCount = 0
    for (const sub of pastDueSubs) {
      const graceEnd = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      const prevStatus = sub.status

      await db.subscription.update({
        where: { id: sub.id },
        data: { status: 'PAST_DUE', graceEndDate: graceEnd },
      })

      await logSubscriptionHistory({
        storeId: sub.storeId,
        subscriptionId: sub.id,
        eventType: 'GRACE_STARTED',
        previousStatus: prevStatus,
        newStatus: 'PAST_DUE',
        previousPlanId: sub.plan.id,
        newPlanId: sub.plan.id,
        previousPlanName: sub.plan.name,
        newPlanName: sub.plan.name,
        description: `Período de gracia de ${GRACE_PERIOD_DAYS} días iniciado`,
        metadata: { graceEndDate: graceEnd.toISOString(), triggeredBy: 'check-expired' },
      }).catch(() => { /* non-blocking */ })

      pastDueCount++
    }

    // ── Step 2: Mark as EXPIRED: grace period ended AND endDate is still past ──
    const expiredSubs = await db.subscription.findMany({
      where: {
        graceEndDate: { lt: now },
        status: 'PAST_DUE',
        endDate: { lt: now },
      },
      include: {
        store: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
    })

    let expiredCount = 0
    for (const sub of expiredSubs) {
      await db.subscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED' },
      })

      await logSubscriptionHistory({
        storeId: sub.storeId,
        subscriptionId: sub.id,
        eventType: 'EXPIRED',
        previousStatus: 'PAST_DUE',
        newStatus: 'EXPIRED',
        previousPlanId: sub.plan.id,
        newPlanId: sub.plan.id,
        previousPlanName: sub.plan.name,
        newPlanName: sub.plan.name,
        description: 'Suscripción expirada después del período de gracia',
        metadata: { triggeredBy: 'check-expired' },
      }).catch(() => { /* non-blocking */ })

      expiredCount++
    }

    // ── Step 3: Self-heal — fix inconsistent subscriptions (endDate in future but EXPIRED/PAST_DUE, no cancelReason) ──
    const healedSubs = await db.subscription.findMany({
      where: {
        endDate: { gt: now },
        status: { in: ['EXPIRED', 'PAST_DUE'] },
        cancelReason: null,
      },
      include: {
        store: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
    })

    let healedCount = 0
    for (const sub of healedSubs) {
      const prevStatus = sub.status
      const newStatus = sub.billingPeriod === 'TRIAL' ? 'TRIAL' : 'ACTIVE'

      await db.subscription.update({
        where: { id: sub.id },
        data: { status: newStatus, graceEndDate: null },
      })

      await logSubscriptionHistory({
        storeId: sub.storeId,
        subscriptionId: sub.id,
        eventType: 'REACTIVATED',
        previousStatus: prevStatus,
        newStatus: newStatus,
        previousPlanId: sub.plan.id,
        newPlanId: sub.plan.id,
        previousPlanName: sub.plan.name,
        newPlanName: sub.plan.name,
        description: `Auto-corrección: suscripción estaba ${prevStatus} con endDate en el futuro. Restaurada a ${newStatus}.`,
        metadata: { triggeredBy: 'check-expired self-heal', endDate: sub.endDate?.toISOString() },
      }).catch(() => { /* non-blocking */ })

      logger.warn(`Auto-healed subscription ${sub.id} for store "${sub.store.name}": ${prevStatus} → ${newStatus} (endDate in future)`)
      healedCount++
    }

    return NextResponse.json({
      message: `Verificación completada: ${pastDueCount} a PAST_DUE, ${expiredCount} a EXPIRED, ${healedCount} auto-corregidas`,
      pastDueCount,
      expiredCount,
      healedCount,
      transitions: [
        ...pastDueSubs.map(s => ({
          id: s.id, storeId: s.storeId, storeName: s.store.name,
          planName: s.plan.name, previousStatus: s.status, newStatus: 'PAST_DUE',
          endDate: s.endDate,
        })),
        ...expiredSubs.map(s => ({
          id: s.id, storeId: s.storeId, storeName: s.store.name,
          planName: s.plan.name, previousStatus: s.status, newStatus: 'EXPIRED',
          endDate: s.endDate,
        })),
        ...healedSubs.map(s => ({
          id: s.id, storeId: s.storeId, storeName: s.store.name,
          planName: s.plan.name, previousStatus: s.status, newStatus: 'ACTIVE',
          endDate: s.endDate, autoHealed: true,
        })),
      ],
    })
  } catch (error) {
    logger.error('Error checking expired subscriptions:', error)
    return NextResponse.json({ error: 'Error al verificar suscripciones expiradas' }, { status: 500 })
  }
}
