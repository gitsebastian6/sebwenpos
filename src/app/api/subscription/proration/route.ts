import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { calculateBillingPrice } from '@/lib/subscription-helpers'
import { requireAuthStoreId } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/proration?storeId=N&targetPlanId=M
 * Returns proration info for a plan change (tenant-isolated).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const rawStoreId = searchParams.get('storeId')
    const storeIdOrErr = requireAuthStoreId(req, rawStoreId ? parseInt(rawStoreId, 10) : undefined)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeId = storeIdOrErr

    const targetPlanId = parseInt(searchParams.get('targetPlanId') || '0', 10)

    if (!targetPlanId) {
      return NextResponse.json({ error: 'targetPlanId es requerido' }, { status: 400 })
    }

    // Get current subscription with plan
    const subscription = await db.subscription.findUnique({
      where: { storeId },
      include: { plan: true },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'No hay suscripción activa' }, { status: 404 })
    }

    // Get target plan
    const targetPlan = await db.plan.findUnique({ where: { id: targetPlanId } })
    if (!targetPlan) {
      return NextResponse.json({ error: 'Plan destino no encontrado' }, { status: 404 })
    }

    // Calculate unused days credit
    let prorationDays = 0
    let prorationCredit = 0
    let hasCredit = false

    if (subscription.status === 'ACTIVE' && subscription.endDate) {
      const endDateObj = new Date(subscription.endDate)
      const nowMs = Date.now()
      if (endDateObj.getTime() > nowMs) {
        const remainingMs = endDateObj.getTime() - nowMs
        prorationDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24))
        // Use actual billingPrice (already has volume discount) to calculate daily rate
        const billingPeriodDays: Record<string, number> = {
          TRIAL: 7, MONTHLY: 30, QUARTERLY: 90, SEMI_ANNUAL: 180, ANNUAL: 365,
        }
        const periodDays = billingPeriodDays[subscription.billingPeriod] || 30
        const dailyRate = subscription.billingPrice / periodDays
        prorationCredit = Math.round(dailyRate * prorationDays)
        hasCredit = prorationDays > 0
      }
    }

    // Current plan info
    const currentPlanInfo = {
      id: subscription.planId,
      name: subscription.plan.name,
      price: subscription.plan.price,
      billingPrice: subscription.billingPrice,
      billingPeriod: subscription.billingPeriod,
      endDate: subscription.endDate,
      daysRemaining: prorationDays,
    }

    // Target plan pricing (with volume discounts) — using centralized calculator
    const periods = [
      { key: 'MONTHLY', label: 'Mensual' },
      { key: 'QUARTERLY', label: 'Trimestral' },
      { key: 'SEMI_ANNUAL', label: 'Semestral' },
      { key: 'ANNUAL', label: 'Anual' },
    ]

    const targetPricing = periods.map(p => {
      const { fullPrice, discount, discountedPrice } = calculateBillingPrice(targetPlan.price, p.key)
      const adjustedPrice = hasCredit ? Math.max(0, discountedPrice - prorationCredit) : discountedPrice
      return {
        period: p.key,
        label: p.label,
        discount,
        fullPrice,
        discountedPrice,
        prorationCredit: hasCredit ? prorationCredit : 0,
        adjustedPrice,
        savings: fullPrice - adjustedPrice,
      }
    })

    return NextResponse.json({
      hasCredit,
      currentPlan: currentPlanInfo,
      targetPlan: {
        id: targetPlan.id,
        name: targetPlan.name,
        price: targetPlan.price,
        maxEmployees: targetPlan.maxEmployees,
        maxProducts: targetPlan.maxProducts,
      },
      proration: hasCredit ? {
        unusedDays: prorationDays,
        creditAmount: prorationCredit,
        dailyRate: Math.round(prorationCredit / Math.max(1, prorationDays)),
      } : null,
      pricing: targetPricing,
    })
  } catch (error) {
    logger.error('GET /api/subscription/proration error:', error)
    return NextResponse.json({ error: 'Error al calcular prorrateo' }, { status: 500 })
  }
}
