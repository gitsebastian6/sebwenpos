import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/super-admin/subscriptions/seed-missing
 * Assigns Trial subscription to all stores that don't have one yet.
 */
export async function POST() {
  try {
    const trialPlan = await db.plan.findFirst({ where: { name: 'Trial' } })
    if (!trialPlan) {
      return NextResponse.json({ error: 'Plan Trial no encontrado. Ejecute seed de planes primero.' }, { status: 400 })
    }

    const storesWithoutSub = await db.store.findMany({
      where: { subscription: null },
      select: { id: true, name: true },
    })

    if (storesWithoutSub.length === 0) {
      return NextResponse.json({
        message: 'Todas las tiendas ya tienen suscripción asignada.',
        assigned: 0,
      })
    }

    const now = new Date()
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const result = await db.subscription.createMany({
      data: storesWithoutSub.map(store => ({
        storeId: store.id,
        planId: trialPlan.id,
        status: 'TRIAL',
        startDate: now,
        endDate: trialEnd,
        trialEndDate: trialEnd,
        billingPeriod: 'TRIAL',
        billingPrice: 0,
      })),
    })

    // Auto-expire any subscriptions that should be expired
    const expiredCount = await db.subscription.updateMany({
      where: {
        endDate: { lt: now },
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      data: { status: 'EXPIRED' },
    })

    return NextResponse.json({
      message: `${result.count} suscripción(es) Trial asignada(s).`,
      assigned: result.count,
      stores: storesWithoutSub.map(s => ({ id: s.id, name: s.name })),
      expiredUpdated: expiredCount.count,
    })
  } catch (error) {
    logger.error('Seed subscriptions error:', error)
    return NextResponse.json({ error: 'Error al asignar suscripciones' }, { status: 500 })
  }
}
