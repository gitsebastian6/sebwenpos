import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { parsePlanFeatures } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

// GET: Obtener suscripción actual de la tienda
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const subscription = await db.subscription.findUnique({
      where: { storeId },
      include: {
        plan: true,
      },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'No se encontró suscripción para esta tienda' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      id: subscription.id,
      storeId: subscription.storeId,
      planId: subscription.planId,
      status: subscription.status,
      startDate: subscription.startDate.toISOString(),
      endDate: subscription.endDate?.toISOString() ?? null,
      trialEndDate: subscription.trialEndDate?.toISOString() ?? null,
      billingPeriod: subscription.billingPeriod,
      billingPrice: subscription.billingPrice,
      lastBilledAt: subscription.lastBilledAt?.toISOString() ?? null,
      nextBillingAt: subscription.nextBillingAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        description: subscription.plan.description,
        price: subscription.plan.price,
        maxEmployees: subscription.plan.maxEmployees,
        maxProducts: subscription.plan.maxProducts,
        maxStores: subscription.plan.maxStores,
        features: parsePlanFeatures(subscription.plan.features),
      },
    })
  } catch (error) {
    logger.error('GET /api/subscription error:', error)
    return NextResponse.json({ error: 'Error al obtener suscripción' }, { status: 500 })
  }
}
