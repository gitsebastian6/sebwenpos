import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateOrderNumber } from '@/lib/auth'
import { z } from 'zod'

// ─── POST: Create order ─────────────────────────────────────────────

const orderItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1),
}).refine((d) => d.productId || d.serviceId, {
  message: 'Debe especificar productId o serviceId',
}).refine((d) => !(d.productId && d.serviceId), {
  message: 'Solo puede especificar productId o serviceId, no ambos',
})

const createOrderSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO']),
  tipAmount: z.number().int().min(0).default(0),
  notes: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, 'La orden debe tener al menos un producto o servicio'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createOrderSchema.parse(body)

    // Separate product and service items
    const productItems = data.items.filter((i) => i.productId)
    const serviceItems = data.items.filter((i) => i.serviceId)

    // Resolve product info
    const productMap = new Map<number, { id: number; name: string; salePrice: number; currentStock: number }>()
    if (productItems.length > 0) {
      const productIds = productItems.map((i) => i.productId!)
      const products = await db.product.findMany({
        where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, salePrice: true, currentStock: true },
      })
      for (const p of products) productMap.set(p.id, p)
    }

    // Resolve service info
    const serviceMap = new Map<number, { id: number; name: string; price: number }>()
    if (serviceItems.length > 0) {
      const serviceIds = serviceItems.map((i) => i.serviceId!)
      const services = await db.service.findMany({
        where: { id: { in: serviceIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, price: true },
      })
      for (const s of services) serviceMap.set(s.id, s)
    }

    // Validate all items exist
    for (const item of productItems) {
      const product = productMap.get(item.productId!)
      if (!product) {
        return NextResponse.json(
          { error: `Producto con ID ${item.productId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
      if (product.currentStock < item.quantity) {
        return NextResponse.json(
          { error: `Stock insuficiente para "${product.name}" (disponible: ${product.currentStock})` },
          { status: 400 },
        )
      }
    }

    for (const item of serviceItems) {
      const service = serviceMap.get(item.serviceId!)
      if (!service) {
        return NextResponse.json(
          { error: `Servicio con ID ${item.serviceId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
    }

    // Calculate totals and build order item data
    const orderItemsData = data.items.map((item) => {
      if (item.productId) {
        const product = productMap.get(item.productId)!
        return {
          productId: item.productId,
          serviceId: null,
          quantity: item.quantity,
          unitPrice: product.salePrice,
          totalRow: product.salePrice * item.quantity,
        }
      } else {
        const service = serviceMap.get(item.serviceId!)!
        return {
          productId: null,
          serviceId: item.serviceId,
          quantity: item.quantity,
          unitPrice: service.price,
          totalRow: service.price * item.quantity,
        }
      }
    })
    const subtotal = orderItemsData.reduce((sum, i) => sum + i.totalRow, 0)
    const tipAmount = data.tipAmount || 0
    const total = subtotal + tipAmount

    // Tip is only allowed for non-credit orders
    if (tipAmount > 0 && (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO')) {
      return NextResponse.json(
        { error: 'No se puede agregar propina a una venta fiada' },
        { status: 400 },
      )
    }

    const orderNumber = generateOrderNumber()

    // Create order, inventory movements, and journal entries in a transaction
    const order = await db.$transaction(async (tx) => {
      // 1. Create the order
      const createdOrder = await tx.order.create({
        data: {
          storeId: data.storeId,
          customerId: data.customerId ?? null,
          orderNumber,
          subtotal,
          tipAmount,
          total,
          status: (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') ? 'CREDIT' : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          notes: data.notes ?? null,
          orderItems: { create: orderItemsData },
        },
        include: {
          customer: { select: { id: true, name: true } },
          orderItems: true,
        },
      })

      // 2. Create inventory movements and decrement stock (only for product items)
      for (const item of productItems) {
        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            quantity: -item.quantity, // negative for sale
            movementType: 'SALE',
            referenceId: createdOrder.id,
            notes: `Venta ${orderNumber}`,
          },
        })
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        })
      }

      // 2b. Create ServiceTransactions for service items
      for (const item of serviceItems) {
        await tx.serviceTransaction.create({
          data: {
            storeId: data.storeId,
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: serviceMap.get(item.serviceId!)!.price,
            totalAmount: serviceMap.get(item.serviceId!)!.price * item.quantity,
            notes: `Venta ${orderNumber}`,
            status: 'COMPLETED',
          },
        })
      }

      // 3. Create journal entries (double-entry accounting)
      if (data.paymentMethod !== 'CREDIT' && data.paymentMethod !== 'FIADO') {
        // Find or use default asset account (Caja) and income account (Ventas)
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'ASSET', isDefault: true },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })

        // DEBIT Caja for full total (subtotal + tip)
        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cajaAccount.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta ${orderNumber}${tipAmount > 0 ? ` + Propina $${tipAmount.toLocaleString()}` : ''}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Ventas for subtotal (product/service value)
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta ${orderNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Propina for tip amount (if any)
        if (tipAmount > 0) {
          const propinaAccount = await tx.ledgerAccount.findFirst({
            where: { storeId: data.storeId, name: 'Propina' },
          })
          if (propinaAccount) {
            await tx.journalEntry.create({
              data: {
                storeId: data.storeId,
                ledgerAccountId: propinaAccount.id,
                amount: tipAmount,
                direction: 'CREDIT',
                description: `Propina venta ${orderNumber}`,
                referenceType: 'ORDER',
                referenceId: createdOrder.id,
              },
            })
          }
        }
      }

      // 4. Update customer debt if CREDIT/FIADO payment
      if ((data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') && data.customerId) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: { totalDebt: { increment: subtotal } },
        })
        // Also create accounts receivable journal entry
        const cuentasPorCobrar = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: { contains: 'Cuentas por Cobrar' } },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })
        if (cuentasPorCobrar) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cuentasPorCobrar.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta fiada ${orderNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta fiada ${orderNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
      }

      return createdOrder
    })

    return NextResponse.json(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: Number(order.total),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/orders error:', error)
    return NextResponse.json({ error: 'Error interno al crear la orden' }, { status: 500 })
  }
}

// ─── GET: List orders ───────────────────────────────────────────────

// GET /api/orders?storeId=X&status=Y&from=DATE&to=DATE&q=ORDER_NUMBER&customerId=Z
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const q = searchParams.get('q')?.trim()
    const customerId = searchParams.get('customerId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const where: any = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (customerId) {
      where.customerId = Number(customerId)
    }

    if (from || to) {
      where.createdAt = {}
      if (from) {
        where.createdAt.gte = new Date(from)
      }
      if (to) {
        // End of day
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = endDate
      }
    }

    if (q) {
      where.orderNumber = { contains: q }
    }

    const orders = await db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        total: true,
        createdAt: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
    })

    const result = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? null,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/orders error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
