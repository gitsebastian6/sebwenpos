import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET: Get all open shifts for store with real-time linked orders
export async function GET(request: NextRequest) {
  try {
    const storeId = z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get('storeId'))

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const shifts = await db.cashRegister.findMany({
      where: { storeId, status: 'OPEN' },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { openedAt: 'desc' },
    })

    if (shifts.length === 0) {
      return NextResponse.json({ shifts: [] })
    }

    // Get real-time data for each open shift
    const shiftData = await Promise.all(shifts.map(async (shift) => {
      const orders = await db.order.findMany({
        where: {
          cashRegisterId: shift.id,
          status: { in: ['COMPLETED', 'CREDIT'] },
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          subtotal: true,
          tipAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      let totalSales = 0
      let totalTips = 0
      let cashSales = 0
      let otherSales = 0
      let creditSales = 0
      const byPayment: Record<string, { count: number; total: number; tips: number }> = {}

      for (const order of orders) {
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
        } else if (order.status === 'CREDIT') {
          creditSales += order.total
        } else {
          otherSales += order.total
        }
      }

      return {
        shift,
        orderCount: orders.length,
        totalSales,
        totalTips,
        cashSales,
        otherSales,
        creditSales,
        expectedCash: shift.openingBalance + cashSales,
        byPayment,
        recentOrders: orders.slice(0, 15).map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          total: Number(o.total),
          paymentMethod: o.paymentMethod,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
        })),
      }
    }))

    return NextResponse.json({ shifts: shiftData })
  } catch (error) {
    logger.error('GET /api/cash-register/current error:', error)
    return NextResponse.json({ error: 'Error al obtener turnos abiertos' }, { status: 500 })
  }
}
