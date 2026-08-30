import { getAuthUser, requireStoreAccess } from '@/lib/api-auth'
import { requirePermission, requireAnyPermission } from '@/lib/permissions'
import { auditLogFromRequest } from '@/lib/audit-logger'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { isSubscriptionActive } from '@/lib/subscription-helpers'
import { createOrder, findOrderByIdempotencyKey, type OrderWithItems } from '@/domain/sales/order-factory'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Shared response shape ────────────────────────────────────────────
// El cuerpo es idéntico tanto si la orden se acaba de crear como si se
// recupera por replay idempotente.
function buildOrderResponse(order: OrderWithItems, cashRegisterId: number | null) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: Number(order.subtotal),
    taxAmount: Number(order.taxAmount ?? 0),
    taxBreakdown: order.taxBreakdown ? JSON.parse(order.taxBreakdown) : null,
    tipAmount: Number(order.tipAmount ?? 0),
    discountAmount: Number(order.discountAmount ?? 0),
    discountType: order.discountType,
    total: Number(order.total),
    paymentMethod: order.paymentMethod,
    customer: order.customer,
    cashRegisterId,
    createdAt: order.createdAt.toISOString(),
    orderItems: order.orderItems.map((item) => ({
      id: item.id,
      productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
      presentationName: item.presentationName ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalRow: Number(item.totalRow),
      taxCode: item.taxCode,
      taxRate: item.taxRate,
      taxAmount: Number(item.taxAmount),
      taxBase: Number(item.taxBase),
      isService: !!item.serviceId,
    })),
  }
}

// ─── POST: Create order ─────────────────────────────────────────────

const orderItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  // Extra presentation of the product (e.g. Six-pack, Caja x24). Omit for
  // the product's own "Unidad" (base) presentation.
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().min(0.001),
  notes: z.string().max(200).optional(),
}).refine((d) => d.productId || d.serviceId, {
  message: 'Debe especificar productId o serviceId',
}).refine((d) => !(d.productId && d.serviceId), {
  message: 'Solo puede especificar productId o serviceId, no ambos',
}).refine((d) => !d.presentationId || d.productId, {
  message: 'presentationId solo aplica a productos',
})

const createOrderSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  cashRegisterId: z.number().int().positive().optional(),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO', 'WOMPI_PENDING']),
  // Split-tender: multiple payment methods for a single sale (paymentMethod='MIXED')
  paymentSplits: z.array(
    z.object({
      method: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'WOMPI']),
      amount: z.number().int().positive(),
      reference: z.string().max(100).optional(),
    })
  ).optional(),
  tipAmount: z.number().int().min(0).default(0),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
  discountAmount: z.number().int().min(0).default(0),
  discountReason: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, 'La orden debe tener al menos un producto o servicio'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createOrderSchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError
    const permErr = await requireAnyPermission(req, ['orders', 'pos'])
    if (permErr) return permErr
    const auth = getAuthUser(req)

    // ── Idempotency (Kleppmann Ch. 11): un POST reintentado tras un timeout
    //    (donde el servidor sí procesó la venta pero la respuesta se perdió)
    //    debe devolver la orden original. El sync offline envía el temp order
    //    number como key, estable entre reintentos. Se resuelve ANTES del gate
    //    de suscripción para que un replay funcione aunque el plan haya vencido.
    const idempotencyKey = req.headers.get('x-idempotency-key')?.trim() || null
    if (idempotencyKey) {
      const replayed = await findOrderByIdempotencyKey(data.storeId, idempotencyKey)
      if (replayed) {
        return NextResponse.json(
          buildOrderResponse(replayed, replayed.cashRegisterId ?? null),
          { status: 200 },
        )
      }
    }

    // ── Subscription gate: block order creation when subscription is expired/cancelled ──
    const subActive = await isSubscriptionActive(data.storeId)
    if (!subActive) {
      return NextResponse.json(
        { error: 'Tu suscripción está vencida. Renueva tu plan para continuar vendiendo.' },
        { status: 403 },
      )
    }

    const result = await createOrder({
      storeId: data.storeId,
      customerId: data.customerId ?? null,
      cashRegisterId: data.cashRegisterId ?? null,
      soldByEmployeeId: auth?.employeeId ?? null,
      paymentMethod: data.paymentMethod,
      paymentSplits: data.paymentSplits,
      tipAmount: data.tipAmount,
      discountType: data.discountType,
      discountAmount: data.discountAmount,
      discountReason: data.discountReason,
      notes: data.notes ?? null,
      items: data.items,
      idempotencyKey,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    if (!result.replayed) {
      // Audit: order created (fire-and-forget)
      auditLogFromRequest(req, {
        storeId: data.storeId,
        action: 'CREATE',
        entity: 'Order',
        entityId: result.order.id,
        newValue: { orderNumber: result.order.orderNumber, total: result.order.total, paymentMethod: result.order.paymentMethod, discountType: result.order.discountType, discountAmount: result.order.discountAmount },
        metadata: { itemcount: data.items.length },
      }).catch(() => {})
    }

    return NextResponse.json(
      buildOrderResponse(result.order, result.cashRegisterId || null),
      { status: result.replayed ? 200 : 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/orders error:', error)
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
    const expand = searchParams.get('expand')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const skip = (page - 1) * limit

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(request, storeId)
    if (storeAccessError) return storeAccessError
    const permErr = await requireAnyPermission(request, ['orders', 'pos'])
    if (permErr) return permErr

    const where: Record<string, unknown> = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (customerId) {
      where.customerId = Number(customerId)
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) {
        dateFilter.gte = new Date(from)
      }
      if (to) {
        // End of day
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        dateFilter.lte = endDate
      }
      where.createdAt = dateFilter
    }

    if (q) {
      where.orderNumber = { contains: q }
    }

    const includeItems = expand === 'items'

    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        total: true,
        createdAt: true,
        tableSessionId: true,
        customer: {
          select: {
            name: true,
          },
        },
        tableSession: {
          select: {
            barTable: {
              select: { number: true, name: true },
            },
          },
        },
        ...(includeItems ? {
          orderItems: {
            select: {
              quantity: true,
              totalRow: true,
              presentationName: true,
              product: { select: { name: true } },
              service: { select: { name: true } },
            },
          },
        } : {}),
      },
    }),
    ])

    const result = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? null,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      tableSessionId: order.tableSessionId ?? null,
      tableName: order.tableSession?.barTable ? `Mesa ${order.tableSession.barTable.number}` : null,
      ...(includeItems ? {
        orderItems: (order.orderItems || []).map((item) => ({
          productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
          presentationName: item.presentationName ?? null,
          quantity: item.quantity,
          totalRow: Number(item.totalRow),
        })),
      } : {}),
    }))

    return NextResponse.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('GET /api/orders error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
