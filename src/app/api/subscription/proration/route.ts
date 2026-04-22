import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/proration?storeId=N&targetPlanId=M
 * Returns proration info for a plan change:
 * - How many days are unused on the current plan
 * - The credit amount in COP
 * - The new plan's price breakdown
 * - The adjusted price after credit
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0', 10)
    const targetPlanId = parseInt(searchParams.get('targetPlanId') || '0', 10)

    if (!storeId || !targetPlanId) {
      return NextResponse.json({ error: 'storeId y targetPlanId son requeridos' }, { status: 400 })
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

    // Target plan pricing (with volume discounts)
    const periods = [
      { key: 'MONTHLY', label: 'Mensual', months: 1, days: 30, discount: 0 },
      { key: 'QUARTERLY', label: 'Trimestral', months: 3, days: 90, discount: 5 },
      { key: 'SEMI_ANNUAL', label: 'Semestral', months: 6, days: 180, discount: 10 },
      { key: 'ANNUAL', label: 'Anual', months: 12, days: 365, discount: 15 },
    ]

    const targetPricing = periods.map(p => {
      const fullPrice = targetPlan.price * p.months
      const discountedPrice = Math.round(fullPrice * (1 - p.discount / 100))
      const adjustedPrice = hasCredit ? Math.max(0, discountedPrice - prorationCredit) : discountedPrice
      return {
        period: p.key,
        label: p.label,
        months: p.months,
        days: p.days,
        discount: p.discount,
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
