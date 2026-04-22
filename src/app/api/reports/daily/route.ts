import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { sql } from '@/lib/db-dialect'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const dailyReportParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  date: z.string().optional(),
})

// GET: Daily summary report (Corte Z)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = dailyReportParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const { storeId, date: dateParam } = params

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    // Determine date range
    const reportDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    const startOfDay = new Date(reportDate)
    startOfDay.setHours(0, 0, 0, 0)

    const startTs = startOfDay.getTime()
    const endTs = startTs + 24 * 60 * 60 * 1000

    const dateStr = reportDate.toISOString().split('T')[0]

    const dayFilter = `AND o.created_at >= ${sql.timestamp(startTs)} AND o.created_at < ${sql.timestamp(endTs)}`
    // For tables without 'o' alias (service_transactions, cash_registers)
    const dayFilterNoAlias = `AND created_at >= ${sql.timestamp(startTs)} AND created_at < ${sql.timestamp(endTs)}`

    // Helper: convert bigint/number to plain number
    const N = (v: number | bigint | null | undefined) => Number(v ?? 0)

    // ───────────────────────────────────────────────────────
    // ALL QUERIES IN PARALLEL — use CAST(...AS INTEGER) to
    // prevent BigInt from SQLite SUM/COUNT aggregates
    // ───────────────────────────────────────────────────────
    const [
      orderStatsRaw,
      byPaymentRaw,
      topProductsRaw,
      cashRegisterRaw,
      closedShiftRaw,
      newDebtsRaw,
      servicesRaw,
      cancelledCount,
    ] = await Promise.all([
      // 1. Sales totals (completed + credit)
      db.$queryRawUnsafe<Array<{ total: number; subtotal: number; tips: number; count: number }>>(`
        SELECT CAST(COALESCE(SUM(o.total), 0) AS INTEGER) as total,
               CAST(COALESCE(SUM(o.subtotal), 0) AS INTEGER) as subtotal,
               CAST(COALESCE(SUM(o.tip_amount), 0) AS INTEGER) as tips,
               CAST(COUNT(*) AS INTEGER) as count
        FROM orders o
        WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT') ${dayFilter}
      `),

      // 2. Payment method breakdown
      db.$queryRawUnsafe<Array<{ method: string; count: number; total: number; tips: number }>>(`
        SELECT o.payment_method as method,
               CAST(COUNT(*) AS INTEGER) as count,
               CAST(SUM(o.total) AS INTEGER) as total,
               CAST(SUM(o.tip_amount) AS INTEGER) as tips
        FROM orders o
        WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT') ${dayFilter}
        GROUP BY o.payment_method
      `),

      // 3. Top products
      db.$queryRawUnsafe<Array<{ productId: number; name: string; quantity: number; total: number }>>(`
        SELECT oi.product_id as productId, COALESCE(p.name, 'Eliminado') as name,
               CAST(SUM(oi.quantity) AS INTEGER) as quantity,
               CAST(SUM(oi.total_row) AS INTEGER) as total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT') ${dayFilter}
        GROUP BY oi.product_id
        ORDER BY total DESC LIMIT 5
      `),

      // 4. Cash register open today
      db.$queryRawUnsafe<Array<{ openingBalance: number }>>(`
        SELECT CAST(opening_balance AS INTEGER) as openingBalance FROM cash_registers
        WHERE store_id = ${storeId} AND status = 'OPEN'
        ORDER BY opened_at DESC LIMIT 1
      `),

      // 5. Closed shift today
      db.$queryRawUnsafe<Array<{ openingBalance: number }>>(`
        SELECT CAST(opening_balance AS INTEGER) as openingBalance FROM cash_registers
        WHERE store_id = ${storeId} AND status = 'CLOSED'
          AND opened_at >= ${sql.timestamp(startTs)} AND opened_at < ${sql.timestamp(endTs)}
        ORDER BY opened_at DESC LIMIT 1
      `),

      // 6. Customer debts created today
      db.$queryRawUnsafe<Array<{ total: number; customerName: string | null }>>(`
        SELECT CAST(o.total AS INTEGER) as total, c.name as customerName
        FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.store_id = ${storeId} AND o.status = 'CREDIT'
          ${dayFilter}
      `),

      // 7. Services income today
      db.$queryRawUnsafe<Array<{ totalAmount: number | null }>>(`
        SELECT CAST(COALESCE(SUM(total_amount), 0) AS INTEGER) as totalAmount FROM service_transactions
        WHERE store_id = ${storeId} AND status = 'COMPLETED'
          ${dayFilterNoAlias}
      `),

      // 8. Cancelled orders count
      db.order.count({
        where: {
          storeId,
          status: 'CANCELLED',
          createdAt: { gte: new Date(startTs), lt: new Date(endTs) },
        },
      }),
    ])

    // Process results
    const statsRow = orderStatsRaw[0]
    const totalSales = N(statsRow?.total)
    const totalSubtotal = N(statsRow?.subtotal)
    const totalTips = N(statsRow?.tips)
    const completedCount = N(statsRow?.count)

    // Payment method breakdown
    const byPayment: Record<string, { count: number; total: number; tips: number }> = {}
    for (const row of byPaymentRaw) {
      byPayment[row.method] = { count: N(row.count), total: N(row.total), tips: N(row.tips) }
    }

    // Top products (already sorted from SQL)
    const topProducts = topProductsRaw.map(row => ({
      productId: row.productId,
      name: row.name,
      quantity: N(row.quantity),
      total: N(row.total),
    }))

    // Cash register
    let openingBalance = 0
    if (cashRegisterRaw.length > 0) {
      openingBalance = Number(cashRegisterRaw[0].openingBalance ?? 0)
    } else if (closedShiftRaw.length > 0) {
      openingBalance = Number(closedShiftRaw[0].openingBalance ?? 0)
    }

    const cashTotal = (byPayment['CASH']?.total || 0) + (byPayment['EFECTIVO']?.total || 0)
    const expectedCash = openingBalance + cashTotal

    // Customer debts
    const totalNewDebts = newDebtsRaw.reduce((s, o) => s + N(o.total), 0)

    // Services
    const totalServices = servicesRaw[0]?.totalAmount ? Number(servicesRaw[0].totalAmount) : 0

    return NextResponse.json({
      date: dateStr,
      orders: {
        total: completedCount + cancelledCount,
        completed: completedCount,
        cancelled: cancelledCount,
      },
      sales: { total: totalSales, subtotal: totalSubtotal, tips: totalTips },
      byPayment,
      topProducts,
      cash: { openingBalance, expectedCash },
      newDebts: {
        count: newDebtsRaw.length,
        total: totalNewDebts,
        details: newDebtsRaw.map((d) => ({ customer: d.customerName || 'Cliente general', total: N(d.total) })),
      },
      services: totalServices,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map(i => i.message).join(', ') }, { status: 400 })
    }
    logger.error('GET /api/reports/daily error:', error)
    return NextResponse.json({ error: 'Error al generar corte Z' }, { status: 500 })
  }
}
