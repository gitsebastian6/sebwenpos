import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

const cancelSchema = z.object({
  storeId: z.coerce.number().int().positive('storeId requerido'),
  cancelReason: z
    .string()
    .min(5, 'La razón de cancelación debe tener al menos 5 caracteres')
    .max(500, 'La razón no puede exceder 500 caracteres'),
})

/**
 * POST /api/subscription/cancel
 * Owner-side subscription cancellation with reason.
 * Only ACTIVE, TRIAL, or PAST_DUE subscriptions can be cancelled by the owner.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId es requerido' },
        { status: 400 },
      )
    }

    const storeAccessErr = requireStoreAccess(req, parseInt(storeId, 10))
    if (storeAccessErr) return storeAccessErr

    const body = await req.json()
    const data = cancelSchema.parse({ ...body, storeId })

    // Verify subscription exists
    const subscription = await db.subscription.findUnique({
      where: { storeId: data.storeId },
      include: { plan: true },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'No se encontró suscripción para esta tienda' },
        { status: 404 },
      )
    }

    // Only ACTIVE, TRIAL, or PAST_DUE can be cancelled
    if (
      subscription.status !== 'ACTIVE' &&
      subscription.status !== 'TRIAL' &&
      subscription.status !== 'PAST_DUE'
    ) {
      return NextResponse.json(
        {
          error: `No se puede cancelar una suscripción en estado ${subscription.status}. Solo se pueden cancelar suscripciones activas, en prueba o vencidas.`,
        },
        { status: 409 },
      )
    }

    // Cancel immediately (set endDate to now if in the future)
    const now = new Date()
    const newEndDate =
      subscription.endDate && new Date(subscription.endDate) > now
        ? now
        : subscription.endDate

    const updated = await db.subscription.update({
      where: { storeId: data.storeId },
      data: {
        status: 'CANCELLED',
        cancelReason: data.cancelReason,
        endDate: newEndDate,
      },
    })

    // Log cancellation to history
    await logSubscriptionHistory({
      storeId: data.storeId,
      subscriptionId: updated.id,
      eventType: 'CANCELLED',
      previousStatus: subscription.status,
      newStatus: 'CANCELLED',
      previousPlanId: subscription.planId,
      newPlanId: subscription.planId,
      previousPlanName: subscription.plan.name,
      newPlanName: subscription.plan.name,
      description: `Suscripción cancelada por el owner. Motivo: ${data.cancelReason}`,
      metadata: { cancelledBy: 'OWNER', reason: data.cancelReason },
    })

    logger.info(
      `Owner cancelled subscription for store ${data.storeId} (reason: ${data.cancelReason})`,
    )

    return NextResponse.json({
      message: 'Suscripción cancelada correctamente.',
      subscription: {
        id: updated.id,
        status: updated.status,
        cancelReason: updated.cancelReason,
        endDate: updated.endDate,
      },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      )
    }
    logger.error('Error cancelling subscription:', error)
    return NextResponse.json(
      { error: 'Error al cancelar la suscripción' },
      { status: 500 },
    )
  }
}
