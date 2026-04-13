import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/orders/[id]?storeId=X
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

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
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      customer: order.customer,
      tableName: order.tableSession?.barTable ? `Mesa ${order.tableSession.barTable.number}` : null,
      orderItems: order.orderItems.map((item: any) => ({
        id: item.id,
        productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
        productId: item.productId,
        quantity: item.quantity,
        returnedQuantity: item.returnedQuantity ?? 0,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
        isService: !!item.serviceId,
      })),
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/orders/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
