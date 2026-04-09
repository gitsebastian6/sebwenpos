import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const closeShiftSchema = z.object({
  closingBalance: z.number().int().min(0),
  notes: z.string().max(500).optional(),
})

// GET: Get single shift with order totals
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

    // Calculate orders in the shift period
    const ordersWhere: Record<string, unknown> = {
      storeId: shift.storeId,
      status: { in: ['COMPLETED', 'CREDIT'] },
      createdAt: { gte: shift.openedAt },
    }
    if (shift.closedAt) {
      ordersWhere.createdAt = { gte: shift.openedAt, lte: shift.closedAt }
    }

    const orders = await db.order.findMany({
      where: ordersWhere,
      select: {
        id: true,
        total: true,
        subtotal: true,
        tipAmount: true,
        paymentMethod: true,
        status: true,
      },
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

    return NextResponse.json({
      shift,
      orderSummary: {
        totalOrders,
        totalSales,
        totalTips,
        cashSales,
        otherSales,
        byPayment,
      },
    })
  } catch (error) {
    console.error('GET /api/cash-register/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener turno' }, { status: 500 })
  }
}

// PUT: Close shift
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

    const body = await request.json()
    const parsed = closeShiftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { closingBalance, notes: closeNotes } = parsed.data

    // Get shift
    const shift = await db.cashRegister.findUnique({ where: { id: shiftId } })
    if (!shift) {
      return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 })
    }
    if (shift.status === 'CLOSED') {
      return NextResponse.json({ error: 'El turno ya está cerrado' }, { status: 400 })
    }

    // Calculate expected cash from CASH orders in the period
    const orders = await db.order.findMany({
      where: {
        storeId: shift.storeId,
        status: { in: ['COMPLETED', 'CREDIT'] },
        createdAt: { gte: shift.openedAt },
      },
      select: { total: true, paymentMethod: true, tipAmount: true },
    })

    let cashTotal = 0
    for (const order of orders) {
      if (order.paymentMethod === 'CASH' || order.paymentMethod === 'EFECTIVO') {
        cashTotal += order.total
      }
    }

    const expectedCash = shift.openingBalance + cashTotal
    const difference = closingBalance - expectedCash
    const closedAt = new Date()

    const updated = await db.cashRegister.update({
      where: { id: shiftId },
      data: {
        closedAt,
        closingBalance,
        expectedCash,
        difference,
        status: 'CLOSED',
        notes: closeNotes || shift.notes,
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
      },
    })

    return NextResponse.json({ shift: updated, expectedCash, difference })
  } catch (error) {
    console.error('PUT /api/cash-register/[id] error:', error)
    return NextResponse.json({ error: 'Error al cerrar caja' }, { status: 500 })
  }
}
