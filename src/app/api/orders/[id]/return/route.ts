import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const returnItemSchema = z.object({
  orderItemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
})

const returnSchema = z.object({
  items: z.array(returnItemSchema).min(1),
  reason: z.string().optional(),
})

// POST /api/orders/[id]/return — Devolver parcial o totalmente una venta
// Permite seleccionar productos y cantidades específicas a devolver
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orderId = Number(id)

    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'ID de orden inválido' }, { status: 400 })
    }

    // Parse body
    let body: { items?: { orderItemId: number; quantity: number }[]; reason?: string } = {}
    try {
      const raw = await request.json()
      body = returnSchema.parse(raw)
    } catch (e: any) {
      const msg = e?.issues?.[0]?.message || 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Fetch order with items
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            product: {
              select: { id: true, name: true, currentStock: true },
            },
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Esta orden ya fue cancelada/devuelta' },
        { status: 400 }
      )
    }

    // Build a map of order items for quick lookup
    const itemMap = new Map(order.orderItems.map((item) => [item.id, item]))

    // Validate items
    for (const reqItem of body.items!) {
      const item = itemMap.get(reqItem.orderItemId)
      if (!item) {
        return NextResponse.json(
          { error: `Item #${reqItem.orderItemId} no pertenece a esta orden` },
          { status: 400 }
        )
      }
      const available = item.quantity - (item.returnedQuantity ?? 0)
      if (available <= 0) {
        return NextResponse.json(
          { error: `"${item.product?.name || 'Producto'}" ya fue devuelto completamente` },
          { status: 400 }
        )
      }
      if (reqItem.quantity > available) {
        return NextResponse.json(
          { error: `Solo se pueden devolver ${available} unidad(es) de "${item.product?.name || 'Producto'}". Ya se devolvieron ${item.returnedQuantity ?? 0}.` },
          { status: 400 }
        )
      }
      if (!item.productId) {
        return NextResponse.json(
          { error: `"${item.product?.name || 'Servicio'}" no tiene producto asociado, no se puede devolver al inventario` },
          { status: 400 }
        )
      }
    }

    // Process return in transaction
    const results = await db.$transaction(async (tx) => {
      let totalReturned = 0
      const returnedItems: { name: string; quantity: number }[] = []

      for (const reqItem of body.items!) {
        const item = itemMap.get(reqItem.orderItemId)!
        const productName = item.product?.name || 'Producto'

        // Increment product stock
        await tx.product.update({
          where: { id: item.productId! },
          data: {
            currentStock: { increment: reqItem.quantity },
          },
        })

        // Update returnedQuantity on the order item
        await tx.orderItem.update({
          where: { id: reqItem.orderItemId },
          data: {
            returnedQuantity: { increment: reqItem.quantity },
          },
        })

        // Create inventory movement (RETURN type, positive = stock returned)
        await tx.inventoryMovement.create({
          data: {
            storeId: order.storeId,
            productId: item.productId!,
            quantity: reqItem.quantity,
            movementType: 'RETURN',
            referenceId: orderId,
            notes: `Devolución parcial venta #${order.orderNumber} — ${productName} x${reqItem.quantity}${body.reason ? ` — ${body.reason}` : ''}`,
          },
        })

        totalReturned += reqItem.quantity
        returnedItems.push({ name: productName, quantity: reqItem.quantity })
      }

      // Check if ALL items are now fully returned
      const allFullyReturned = order.orderItems.every(
        (item) => (item.returnedQuantity ?? 0) + (body.items!.find((r) => r.orderItemId === item.id)?.quantity || 0) >= item.quantity
      )

      // Update order status
      if (allFullyReturned) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' },
        })
      }

      return { totalReturned, returnedItems, fullyReturned: allFullyReturned }
    })

    const itemSummary = results.returnedItems.map((i) => `${i.name} x${i.quantity}`).join(', ')
    return NextResponse.json({
      message: results.fullyReturned
        ? `Venta #${order.orderNumber} devuelta completamente: ${itemSummary}`
        : `Devolución parcial de venta #${order.orderNumber}: ${itemSummary}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      fullyReturned: results.fullyReturned,
      totalReturned: results.totalReturned,
    })
  } catch (error) {
    console.error('POST /api/orders/[id]/return error:', error)
    const message = error instanceof Error ? error.message : 'Error al procesar la devolución'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
