import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const orderDetailParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
})

// GET /api/orders/[id]?storeId=X
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const parsed = orderDetailParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const storeId = parsed.storeId

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const order = await db.order.findFirst({
      where: { id: Number(id), storeId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        tableSession: {
          select: {
            barTable: {
              select: {
                number: true,
                name: true,
              },
            },
          },
        },
        orderItems: {
          include: {
            product: {
              select: {
                name: true,
              },
            },
            service: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    const result = {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      subtotal: Number(order.subtotal),
      tipAmount: Number(order.tipAmount ?? 0),
      total: Number(order.total),
      taxAmount: Number(order.taxAmount ?? 0),
      taxBreakdown: order.taxBreakdown ? JSON.parse(order.taxBreakdown as string) : null,
      discountAmount: Number(order.discountAmount ?? 0),
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      customer: order.customer,
      tableName: order.tableSession?.barTable ? `Mesa ${order.tableSession.barTable.number}` : null,
      orderItems: order.orderItems.map((item) => ({
        id: item.id,
        productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
        productId: item.productId,
        quantity: item.quantity,
        returnedQuantity: item.returnedQuantity ?? 0,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
        isService: !!item.serviceId,
        taxCode: item.taxCode ?? undefined,
        taxRate: item.taxRate ?? 0,
        taxAmount: Number(item.taxAmount ?? 0),
        taxBase: Number(item.taxBase ?? 0),
      })),
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map(i => i.message).join(', ') }, { status: 400 })
    }
    logger.error('GET /api/orders/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
