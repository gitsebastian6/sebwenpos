import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logSubscriptionChange } from '@/lib/event-logger'
import { getAuthUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const cancelSubscriptionSchema = z.object({
  cancelReason: z
    .string()
    .min(5, 'La razón de cancelación debe tener al menos 5 caracteres'),
})

/**
 * POST /api/super-admin/stores/[id]/cancel-subscription
 * Cancel an active or past-due subscription for a store.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- Auth check: require SUPER_ADMIN ---
    const auth = getAuthUser(req)
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Acceso restringido. Se requiere rol de Super Administrador.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const storeId = parseInt(id, 10)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID de tienda inválido' }, { status: 400 })
    }

    // --- Validate request body ---
    const body = await req.json()
    const data = cancelSubscriptionSchema.parse(body)

    // --- Verify the store exists ---
    const store = await db.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // --- Verify the store has a subscription ---
    const subscription = await db.subscription.findUnique({
      where: { storeId },
      include: { plan: true },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'La tienda no tiene una suscripción' },
        { status: 404 }
      )
    }

    // --- Only ACTIVE or PAST_DUE subscriptions can be cancelled ---
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') {
      return NextResponse.json(
        {
          error: `No se puede cancelar una suscripción en estado ${subscription.status}. Solo se pueden cancelar suscripciones ACTIVE o PAST_DUE.`,
        },
        { status: 409 }
      )
    }

    // --- Determine new endDate ---
    // If the subscription's endDate is in the future, set it to now (immediate cancellation)
    const now = new Date()
    const newEndDate =
      subscription.endDate && subscription.endDate > now ? now : subscription.endDate

    // --- Capture current status for event logging ---
    const currentStatus = subscription.status

    // --- Update subscription ---
    const updated = await db.subscription.update({
      where: { storeId },
      data: {
        status: 'CANCELLED',
        cancelReason: data.cancelReason,
        endDate: newEndDate,
      },
      include: { plan: true },
    })

    // ─── Event logging (fire-and-forget) ───
    await logSubscriptionChange(storeId, currentStatus, 'CANCELLED', { cancelReason: data.cancelReason })

    logger.info(
      `Subscription cancelled for store ${storeId} (reason: ${data.cancelReason})`
    )

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error cancelling subscription:', error)
    return NextResponse.json(
      { error: 'Error al cancelar la suscripción' },
      { status: 500 }
    )
  }
}
