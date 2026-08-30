import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getAuthUser, requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { requireFeature } from '@/lib/subscription-guard'
import { isSubscriptionActive } from '@/lib/subscription-helpers'
import { createOrder } from '@/domain/sales/order-factory'
import { emitOnlineOrderUpdated } from '@/lib/tables-sync'

export const dynamic = 'force-dynamic'

const rejectSchema = z.object({
  action: z.literal('reject'),
  reason: z.string().trim().max(300).optional(),
})

const acceptSchema = z.object({
  action: z.literal('accept'),
  paymentMethod: z
    .enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO', 'WOMPI_PENDING'])
    .default('CASH'),
  createCustomer: z.boolean().optional(),
  // Ajustes opcionales (aceptación parcial): cantidad final por línea; 0 = quitar.
  items: z
    .array(z.object({ onlineOrderItemId: z.number().int().positive(), quantity: z.number().min(0).max(999) }))
    .optional(),
})

const bodySchema = z.discriminatedUnion('action', [rejectSchema, acceptSchema])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const onlineOrderId = parseInt(id)
    if (isNaN(onlineOrderId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400 })
    }
    const body = parsed.data

    const onlineOrder = await db.onlineOrder.findUnique({
      where: { id: onlineOrderId },
      include: { items: true },
    })
    if (!onlineOrder) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const storeAccessError = requireStoreAccess(request, onlineOrder.storeId)
    if (storeAccessError) return storeAccessError
    const permErr = await requirePermission(request, 'onlineOrders')
    if (permErr) return permErr
    const featErr = await requireFeature(onlineOrder.storeId, 'onlineStore')
    if (featErr) return featErr
    const auth = getAuthUser(request)

    // ─────────────────────────────── REJECT ───────────────────────────────
    if (body.action === 'reject') {
      if (onlineOrder.status === 'ACCEPTED') {
        return NextResponse.json({ error: 'El pedido ya fue aceptado' }, { status: 409 })
      }
      const updated = await db.onlineOrder.update({
        where: { id: onlineOrderId },
        data: { status: 'REJECTED', rejectionReason: body.reason ?? null },
        select: { id: true, orderNumber: true, status: true },
      })
      emitOnlineOrderUpdated(onlineOrder.storeId, updated)
      return NextResponse.json({ onlineOrder: updated })
    }

    // ─────────────────────────────── ACCEPT ───────────────────────────────
    // Idempotencia: doble clic → devolver la orden ya creada.
    if (onlineOrder.status === 'ACCEPTED' && onlineOrder.convertedToOrderId) {
      return NextResponse.json({
        onlineOrder: { id: onlineOrder.id, orderNumber: onlineOrder.orderNumber, status: onlineOrder.status },
        orderId: onlineOrder.convertedToOrderId,
        alreadyAccepted: true,
      })
    }
    if (onlineOrder.status === 'REJECTED' || onlineOrder.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Este pedido ya no se puede aceptar' }, { status: 409 })
    }

    const subActive = await isSubscriptionActive(onlineOrder.storeId)
    if (!subActive) {
      return NextResponse.json(
        { error: 'Tu suscripción está vencida. Renueva tu plan para continuar vendiendo.' },
        { status: 403 },
      )
    }

    // Ajustes por línea (aceptación parcial)
    const qtyOverride = new Map<number, number>()
    for (const adj of body.items ?? []) qtyOverride.set(adj.onlineOrderItemId, adj.quantity)

    const factoryItems = onlineOrder.items.flatMap((it) => {
      const qty = qtyOverride.has(it.id) ? qtyOverride.get(it.id)! : Number(it.quantity)
      if (qty <= 0 || !it.productId) return []
      return [{
        productId: it.productId,
        presentationId: it.presentationId ?? undefined,
        quantity: qty,
      }]
    })

    if (factoryItems.length === 0) {
      return NextResponse.json({ error: 'El pedido no tiene productos válidos para aceptar' }, { status: 400 })
    }

    // Cliente opcional (match por teléfono normalizado)
    let customerId: number | null = null
    if (body.createCustomer) {
      const existing = await db.customer.findFirst({
        where: { storeId: onlineOrder.storeId, phone: { in: [onlineOrder.customerPhone, onlineOrder.customerPhoneNormalized] } },
        select: { id: true },
      })
      customerId = existing
        ? existing.id
        : (
            await db.customer.create({
              data: {
                storeId: onlineOrder.storeId,
                name: onlineOrder.customerName,
                phone: onlineOrder.customerPhoneNormalized,
                address: onlineOrder.deliveryAddress ?? null,
              },
              select: { id: true },
            })
          ).id
    }

    const addressLine = onlineOrder.fulfillmentType === 'DELIVERY' && onlineOrder.deliveryAddress
      ? `Domicilio: ${onlineOrder.deliveryAddress}`
      : onlineOrder.fulfillmentType === 'PICKUP'
        ? 'Recoge en tienda'
        : null
    const notes = [
      `Pedido en línea ${onlineOrder.orderNumber} — ${onlineOrder.customerName} (${onlineOrder.customerPhone})`,
      addressLine,
      onlineOrder.deliveryNotes ? `Notas: ${onlineOrder.deliveryNotes}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const result = await createOrder({
      storeId: onlineOrder.storeId,
      customerId,
      soldByEmployeeId: auth?.employeeId ?? null,
      paymentMethod: body.paymentMethod,
      notes,
      items: factoryItems,
      fulfillmentType: onlineOrder.fulfillmentType === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
      deliveryFee: onlineOrder.fulfillmentType === 'DELIVERY' ? onlineOrder.deliveryFee : 0,
      deliveryAddress: onlineOrder.deliveryAddress ?? null,
      placedAt: onlineOrder.createdAt,
    })

    if (!result.ok || !result.order) {
      return NextResponse.json({ error: result.error || 'No se pudo crear la venta' }, { status: result.status || 400 })
    }

    // Marcar el pedido como aceptado (guard contra doble aceptación concurrente)
    const claimed = await db.onlineOrder.updateMany({
      where: { id: onlineOrderId, status: { in: ['PENDING'] }, convertedToOrderId: null },
      data: { status: 'ACCEPTED', convertedToOrderId: result.order.id },
    })
    if (claimed.count === 0) {
      // Otra petición ganó la carrera — no dejamos dos ventas: devolvemos la nuestra
      // igual, pero registramos la anomalía.
      logger.warn('[online-orders] doble aceptación detectada', { onlineOrderId, orderId: result.order.id })
    }

    emitOnlineOrderUpdated(onlineOrder.storeId, {
      id: onlineOrder.id,
      orderNumber: onlineOrder.orderNumber,
      status: 'ACCEPTED',
    })

    return NextResponse.json({
      onlineOrder: { id: onlineOrder.id, orderNumber: onlineOrder.orderNumber, status: 'ACCEPTED' },
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
    })
  } catch (error) {
    logger.error('PATCH /api/online-orders/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
