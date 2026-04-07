import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
        orderItems: {
          select: {
            id: true,
            productName: null as any,
            quantity: true,
            unitPrice: true,
            totalRow: true,
            product: {
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
      subtotal: order.subtotal,
      total: order.total,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      customer: order.customer,
      orderItems: order.orderItems.map((item: any) => ({
        id: item.id,
        productName: item.product?.name ?? 'Producto eliminado',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalRow: item.totalRow,
      })),
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/orders/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
