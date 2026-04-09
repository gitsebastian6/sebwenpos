import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: Daily summary report (Corte Z)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0')
    const dateParam = searchParams.get('date')

    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })

    // Determine date range — SQLite stores created_at as INTEGER (Unix ms)
    const reportDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    const startOfDay = new Date(reportDate)
    startOfDay.setHours(0, 0, 0, 0)

    const startTs = startOfDay.getTime()
    const endTs = startTs + 24 * 60 * 60 * 1000

    const dateStr = reportDate.toISOString().split('T')[0]

    // Orders for the day using Prisma (avoids raw SQL issues)
    const ordersRaw = await db.$queryRawUnsafe<Array<{
      id: number; total: number; subtotal: number; tipAmount: number
      paymentMethod: string; status: string
    }>>(`
      SELECT id, total, subtotal, tip_amount as tipAmount, payment_method as paymentMethod, status
      FROM orders
      WHERE store_id = ${storeId} AND status IN ('COMPLETED', 'CREDIT', 'CANCELLED')
        AND created_at >= ${startTs} AND created_at < ${endTs}
      ORDER BY created_at DESC
    `)

    // Fetch order items separately for product info
    const orders = ordersRaw.length > 0
      ? await db.order.findMany({
          where: { id: { in: ordersRaw.map(o => o.id) } },
          include: {
            orderItems: {
              include: { product: { select: { id: true, name: true, category: { select: { name: true } } } } },
            },
          },
        })
      : []

    const completedOrders = orders.filter((o) => o.status === 'COMPLETED' || o.status === 'CREDIT')
    const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED')

    // Sales totals
    let totalSales = 0
    let totalSubtotal = 0
    let totalTips = 0
    for (const order of completedOrders) {
      totalSales += order.total
      totalSubtotal += order.subtotal
      totalTips += order.tipAmount || 0
    }

    // Payment method breakdown
    const byPayment: Record<string, { count: number; total: number; tips: number }> = {}
    for (const order of completedOrders) {
      const method = order.paymentMethod
      if (!byPayment[method]) byPayment[method] = { count: 0, total: 0, tips: 0 }
      byPayment[method].count++
      byPayment[method].total += order.total
      byPayment[method].tips += order.tipAmount || 0
    }

    // Top products
    const productSales: Record<string, { productId: number; name: string; quantity: number; total: number }> = {}
    for (const order of completedOrders) {
      for (const item of order.orderItems) {
        const key = String(item.productId)
        if (!productSales[key]) {
          productSales[key] = { productId: item.productId || 0, name: item.product?.name || 'Eliminado', quantity: 0, total: 0 }
        }
        productSales[key].quantity += item.quantity
        productSales[key].total += item.totalRow
      }
    }
    const topProducts = Object.values(productSales).sort((a, b) => b.total - a.total).slice(0, 5)

    // Cash register open today
    const cashRegisterRaw = await db.$queryRawUnsafe<Array<{ openingBalance: number }>>(`
      SELECT opening_balance as openingBalance FROM cash_registers
      WHERE store_id = ${storeId} AND status = 'OPEN'
      ORDER BY opened_at DESC LIMIT 1
    `)

    let openingBalance = 0
    if (cashRegisterRaw.length > 0) {
      openingBalance = cashRegisterRaw[0].openingBalance
    } else {
      const closedShiftRaw = await db.$queryRawUnsafe<Array<{ openingBalance: number }>>(`
        SELECT opening_balance as openingBalance FROM cash_registers
        WHERE store_id = ${storeId} AND status = 'CLOSED'
          AND opened_at >= ${startTs} AND opened_at < ${endTs}
        ORDER BY opened_at DESC LIMIT 1
      `)
      if (closedShiftRaw.length > 0) openingBalance = closedShiftRaw[0].openingBalance
    }

    const cashTotal = (byPayment['CASH']?.total || 0) + (byPayment['EFECTIVO']?.total || 0)
    const expectedCash = openingBalance + cashTotal

    // Customer debts created today
    const newDebtsRaw = await db.$queryRawUnsafe<Array<{ total: number; customerName: string | null }>>(`
      SELECT o.total, c.name as customerName
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.store_id = ${storeId} AND o.status = 'CREDIT'
        AND o.created_at >= ${startTs} AND o.created_at < ${endTs}
    `)
    const totalNewDebts = newDebtsRaw.reduce((s, o) => s + Number(o.total), 0)

    // Services income today
    const servicesRaw = await db.$queryRawUnsafe<Array<{ totalAmount: bigint }>>(`
      SELECT SUM(total_amount) as totalAmount FROM service_transactions
      WHERE store_id = ${storeId} AND status = 'COMPLETED'
        AND created_at >= ${startTs} AND created_at < ${endTs}
    `)
    const totalServices = servicesRaw[0]?.totalAmount ? Number(servicesRaw[0].totalAmount) : 0

    return NextResponse.json({
      date: dateStr,
      orders: {
        total: ordersRaw.length,
        completed: completedOrders.length,
        cancelled: cancelledOrders.length,
      },
      sales: { total: totalSales, subtotal: totalSubtotal, tips: totalTips },
      byPayment,
      topProducts,
      cash: { openingBalance, expectedCash },
      newDebts: {
        count: newDebtsRaw.length,
        total: totalNewDebts,
        details: newDebtsRaw.map((d) => ({ customer: d.customerName || 'Cliente general', total: Number(d.total) })),
      },
      services: totalServices,
    })
  } catch (error) {
    console.error('GET /api/reports/daily error:', error)
    return NextResponse.json({ error: 'Error al generar corte Z' }, { status: 500 })
  }
}
