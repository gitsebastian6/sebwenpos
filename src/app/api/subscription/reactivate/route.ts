import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireStoreAccess } from '@/lib/api-auth'
import {
  logSubscriptionHistory,
  BILLING_PERIODS,
  createBillingRecord,
} from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

const reactivateSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive(),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']),
})

/**
 * POST /api/subscription/reactivate
 * Self-service reactivation for CANCELLED/EXPIRED stores.
 * Owner selects a plan + period and uploads a payment receipt.
 * The subscription is reactivated to ACTIVE status after payment verification.
 *
 * This endpoint handles the reactivation request creation + payment receipt upload.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0', 10)
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const accessErr = requireStoreAccess(req, storeId)
    if (accessErr) return accessErr

    const body = await req.json()
    const data = reactivateSchema.parse({ ...body, storeId })

    // Get current subscription
    const subscription = await db.subscription.findUnique({
      where: { storeId },
      include: { plan: true },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'No se encontró suscripción para esta tienda' },
        { status: 404 }
      )
    }

    // Can only reactivate CANCELLED or EXPIRED
    if (subscription.status !== 'CANCELLED' && subscription.status !== 'EXPIRED') {
      return NextResponse.json(
        {
          error: `La reactivación solo está disponible para suscripciones canceladas o expiradas. Estado actual: ${subscription.status}`,
        },
        { status: 409 }
      )
    }

    // Verify plan exists and is active
    const targetPlan = await db.plan.findUnique({ where: { id: data.planId } })
    if (!targetPlan || !targetPlan.isActive) {
      return NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 404 })
    }

    // Calculate pricing
    const periodInfo = BILLING_PERIODS[data.billingPeriod]
    const months = periodInfo.months
    const discount = periodInfo.discount
    const fullPrice = targetPlan.price * months
    const discountedPrice = Math.round(fullPrice * (1 - discount / 100))

    // Update subscription to PENDING_REACTIVATION-like state
    // The actual activation happens when the Super Admin approves the payment receipt
    const now = new Date()
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        // Keep current status until receipt is approved
        // Store the requested plan for when it gets approved
        cancelReason: null,
      },
    })

    // Log the reactivation request
    await logSubscriptionHistory({
      storeId,
      subscriptionId: subscription.id,
      eventType: 'REACTIVATED',
      previousStatus: subscription.status,
      newStatus: 'PENDING_APPROVAL',
      previousPlanId: subscription.planId,
      newPlanId: data.planId,
      previousPlanName: subscription.plan.name,
      newPlanName: targetPlan.name,
      description: `Solicitud de reactivación: ${subscription.plan.name} → ${targetPlan.name} (${periodInfo.label})`,
      metadata: {
        requestedPlanId: data.planId,
        requestedBillingPeriod: data.billingPeriod,
        amount: discountedPrice,
        discount,
        isReactivation: true,
      },
    })

    return NextResponse.json({
      message: 'Solicitud de reactivación creada. Sube tu comprobante de pago para completar la reactivación.',
      reactivation: {
        requestedPlanId: data.planId,
        requestedPlanName: targetPlan.name,
        billingPeriod: data.billingPeriod,
        billingPeriodLabel: periodInfo.label,
        amount: discountedPrice,
        fullPrice,
        discount,
        daysIncluded: periodInfo.days,
      },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/subscription/reactivate error:', error)
    return NextResponse.json({ error: 'Error al procesar reactivación' }, { status: 500 })
  }
}
