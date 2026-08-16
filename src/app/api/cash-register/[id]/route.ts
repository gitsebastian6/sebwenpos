import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const closeShiftSchema = z.object({
  closingBalance: z.number().int().min(0),
  countBreakdown: z.record(z.string(), z.number().int().min(0)).optional(),
  notes: z.string().max(500).optional(),
})

// GET: Get single shift with order totals and items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const shiftId = parseInt(id)
    if (isNaN(shiftId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const shift = await db.cashRegister.findUnique({
      where: { id: shiftId },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
        store: { select: { id: true, name: true, nit: true, address: true, phone: true, currencyCode: true } },
      },
    })

    if (!shift) {
      return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, shift.storeId)
    if (storeAccessErr) return storeAccessErr

    const { searchParams } = request.nextUrl
    const includeOrders = searchParams.get('includeOrders') === 'true'

    // Get all orders linked to this cash register shift
    const orders = await db.order.findMany({
      where: {
        cashRegisterId: shiftId,
        status: { in: ['COMPLETED', 'CREDIT'] },
      },
      include: {
        orderItems: {
          include: {
            product: { select: { id: true, name: true, sku: true, category: { select: { name: true } } } },
            service: { select: { id: true, name: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
        tableSession: { select: { id: true, barTable: { select: { number: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Payment method breakdown
    const byPayment: Record<string, { count: number; total: number; tips: number }> = {}
    let totalOrders = 0
    let totalSales = 0
    let totalTips = 0
    let cashSales = 0
    let otherSales = 0

    for (const order of orders) {
      totalOrders++
      totalSales += order.total
      totalTips += order.tipAmount || 0

      if (!byPayment[order.paymentMethod]) {
        byPayment[order.paymentMethod] = { count: 0, total: 0, tips: 0 }
      }
      byPayment[order.paymentMethod].count++
      byPayment[order.paymentMethod].total += order.total
      byPayment[order.paymentMethod].tips += order.tipAmount || 0

      if (order.paymentMethod === 'CASH' || order.paymentMethod === 'EFECTIVO') {
        cashSales += order.total
      } else if (order.status !== 'CREDIT') {
        otherSales += order.total
      }
    }

    // Aggregate products by name (for detail view)
    const productAggregation: Record<string, { productId: number | null; serviceId: number | null; name: string; category: string | null; sku: string | null; quantity: number; total: number; isService: boolean }> = {}
    for (const order of orders) {
      for (const item of order.orderItems) {
        const itemName = item.product?.name || item.service?.name || 'Producto eliminado'
        const key = `${item.productId || 's'}-${item.serviceId || 'p'}-${itemName}`
        if (!productAggregation[key]) {
          productAggregation[key] = {
            productId: item.productId,
            serviceId: item.serviceId,
            name: itemName,
            category: item.product?.category?.name || null,
            sku: item.product?.sku || null,
            quantity: 0,
            total: 0,
            isService: item.serviceId !== null,
          }
        }
        productAggregation[key].quantity += item.quantity
        productAggregation[key].total += item.totalRow
      }
    }

    // Sort aggregated products alphabetically (A-Z)
    const aggregatedProducts = Object.values(productAggregation).sort((a, b) =>
      a.name.localeCompare(b.name, 'es-CO')
    )

    // Parse countBreakdown if it exists
    let parsedCountBreakdown: Record<string, number> | null = null
    if (shift.countBreakdown) {
      try {
        parsedCountBreakdown = JSON.parse(shift.countBreakdown)
      } catch {
        parsedCountBreakdown = null
      }
    }

    // Build response
    const response: Record<string, unknown> = {
      shift,
      orderSummary: {
        totalOrders,
        totalSales,
        totalTips,
        cashSales,
        otherSales,
        byPayment,
      },
      countBreakdown: parsedCountBreakdown,
      aggregatedProducts,
    }

    // Include full order details if requested
    if (includeOrders) {
      response.orders = orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        subtotal: order.subtotal,
        tipAmount: order.tipAmount,
        paymentMethod: order.paymentMethod,
        status: order.status,
        createdAt: order.createdAt,
        customer: order.customer,
        tableName: order.tableSession?.barTable?.name || order.tableSession?.barTable?.number
          ? `Mesa ${order.tableSession.barTable.number}${order.tableSession.barTable.name ? ` (${order.tableSession.barTable.name})` : ''}`
          : null,
        items: order.orderItems.map((item) => ({
          id: item.id,
          name: item.product?.name || item.service?.name || 'Producto eliminado',
          sku: item.product?.sku || null,
          category: item.product?.category?.name || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalRow: item.totalRow,
          isService: item.serviceId !== null,
        })),
      }))
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error('GET /api/cash-register/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener turno' }, { status: 500 })
  }
}

// PUT: Close shift OR Reopen a closed shift
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const shiftId = parseInt(id)
    if (isNaN(shiftId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const shift = await db.cashRegister.findUnique({ where: { id: shiftId } })
    if (!shift) {
      return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 })
    }

    const body = await request.json()

    const storeAccessErr = requireStoreAccess(request, shift.storeId)
    if (storeAccessErr) return storeAccessErr


    // ── Reopen closed shift ────────────────────────────────────────────────
    if (body.action === 'reopen' && shift.status === 'CLOSED') {
      const updated = await db.cashRegister.update({
        where: { id: shiftId },
        data: {
          status: 'OPEN',
          closedAt: null,
          closingBalance: null,
          expectedCash: null,
          difference: null,
          countBreakdown: null,
        },
        include: {
          user: { select: { id: true, fullName: true, phone: true } },
        },
      })
      return NextResponse.json({ shift: updated, message: 'Turno reabierto' })
    }

    // ── Close open shift ───────────────────────────────────────────────────
    const parsed = closeShiftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Datos inválidos',
        details: parsed.error.flatten(),
        hint: 'Envía { closingBalance: number, countBreakdown?: Record<string,number>, notes?: string }'
      }, { status: 400 })
    }

    const { closingBalance, countBreakdown, notes: closeNotes } = parsed.data

    if (shift.status === 'CLOSED') {
      return NextResponse.json({ error: 'El turno ya está cerrado' }, { status: 400 })
    }

    // Calculate expected cash from orders linked to this cash register shift
    const orders = await db.order.findMany({
      where: {
        cashRegisterId: shiftId,
        status: { in: ['COMPLETED', 'CREDIT'] },
      },
      select: { total: true, paymentMethod: true, tipAmount: true },
    })

    let cashTotal = 0
    for (const order of orders) {
      if (order.paymentMethod === 'CASH' || order.paymentMethod === 'EFECTIVO') {
        cashTotal += order.total
      }
    }

    // Recaudos CxC: cash abonos collected during this shift (fiado being paid off)
    const cashPayments = await db.customerPayment.aggregate({
      where: { cashRegisterId: shiftId, paymentMethod: 'CASH' },
      _sum: { amount: true },
    })
    const cxcCollected = cashPayments._sum.amount ?? 0

    // Gastos de caja menor: cash expenses paid out of this shift's till
    const cashExpenses = await db.expense.aggregate({
      where: { cashRegisterId: shiftId },
      _sum: { amount: true },
    })
    const pettyCashExpenses = cashExpenses._sum.amount ?? 0

    // Fondo Inicial + Ventas Efectivo + Recaudos CxC - Gastos Caja Menor = Saldo Teórico
    const expectedCash = shift.openingBalance + cashTotal + cxcCollected - pettyCashExpenses
    const difference = closingBalance - expectedCash
    const closedAt = new Date()

    const updated = await db.cashRegister.update({
      where: { id: shiftId },
      data: {
        closedAt,
        closingBalance,
        expectedCash,
        difference,
        countBreakdown: countBreakdown ? JSON.stringify(countBreakdown) : null,
        status: 'CLOSED',
        notes: closeNotes || shift.notes,
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
      },
    })

    return NextResponse.json({
      shift: updated,
      expectedCash,
      difference,
      breakdown: { openingBalance: shift.openingBalance, cashSales: cashTotal, cxcCollected, pettyCashExpenses },
    })
  } catch (error) {
    logger.error('PUT /api/cash-register/[id] error:', error)
    return NextResponse.json({ error: 'Error al procesar turno' }, { status: 500 })
  }
}

// DELETE: Delete a shift (only if no linked orders, or force)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const shiftId = parseInt(id)
    if (isNaN(shiftId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const shift = await db.cashRegister.findUnique({
      where: { id: shiftId },
      include: {
        _count: { select: { orders: true } },
      },
    })

    if (!shift) {
      return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, shift.storeId)
    if (storeAccessErr) return storeAccessErr

    if (shift._count.orders > 0) {
      return NextResponse.json({
        error: 'No se puede eliminar un turno con ventas asociadas',
        orderCount: shift._count.orders,
      }, { status: 400 })
    }

    await db.cashRegister.delete({ where: { id: shiftId } })

    return NextResponse.json({ message: 'Turno eliminado correctamente' })
  } catch (error) {
    logger.error('DELETE /api/cash-register/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar turno' }, { status: 500 })
  }
}
