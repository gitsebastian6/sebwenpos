import { requireStoreAccess } from '@/lib/api-auth'
import { requireAnyPermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { sql } from '@/lib/db-dialect'
import { logger } from '@/lib/logger'
import { toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const reportParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  from: z.string().optional(),
  to: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = reportParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const { storeId, from, to } = params

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requireAnyPermission(request, ['reports', 'accounting'])
    if (permErr) return permErr

    // Build date filter for Prisma queries
    const dateFilter: Record<string, unknown> = {}
    if (from) {
      const d = new Date(from)
      d.setHours(0, 0, 0, 0)
      dateFilter.gte = d
    }
    if (to) {
      const d = new Date(to)
      d.setHours(23, 59, 59, 999)
      dateFilter.lte = d
    }
    const hasDateFilter = from || to
    const fromMs = dateFilter.gte instanceof Date ? (dateFilter.gte as Date).getTime() : null
    const toMs = dateFilter.lte instanceof Date ? (dateFilter.lte as Date).getTime() : null

    // Build SQL date clause for raw queries
    const dateClause = [
      fromMs !== null ? `AND o.created_at >= ${sql.timestamp(fromMs)}` : '',
      toMs !== null ? `AND o.created_at <= ${sql.timestamp(toMs)}` : '',
    ].join(' ')

    const baseWhere = `o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT') ${dateClause}`

    // Prisma where for recentOrders
    const ordersWhere: Record<string, unknown> = { storeId, status: { in: ['COMPLETED', 'CREDIT'] } }
    if (hasDateFilter) ordersWhere.createdAt = dateFilter

    // Services where (for Prisma)
    const servicesWhere: Record<string, unknown> = { storeId, status: 'COMPLETED' }
    if (hasDateFilter) servicesWhere.createdAt = dateFilter

    // ───────────────────────────────────────────────────────────
    // ALL QUERIES IN PARALLEL — no N+1, no full order scan
    // ───────────────────────────────────────────────────────────
    const [
      salesAgg,
      completedAgg,
      creditAgg,
      tipsAgg,
      byPaymentRaw,
      bySourceRaw,
      byCategoryRaw,
      topProductsRaw,
      recentOrders,
      customersWithDebt,
      lowStockProducts,
      inventoryData,
      ledgerAccounts,
      serviceTxns,
      openSessions,
      dailySalesRaw,
    ] = await Promise.all([
      // ── Sales aggregates (was: full order scan + JS reduce) ──
      db.$queryRawUnsafe<Array<{ total: number | bigint; count: number | bigint }>>(`
        SELECT COALESCE(SUM(o.total), 0) as total, COUNT(*) as count
        FROM orders o WHERE ${baseWhere}
      `),
      db.$queryRawUnsafe<Array<{ total: number | bigint; count: number | bigint }>>(`
        SELECT COALESCE(SUM(o.total), 0) as total, COUNT(*) as count
        FROM orders o WHERE o.store_id = ${storeId} AND o.status = 'COMPLETED' ${dateClause}
      `),
      db.$queryRawUnsafe<Array<{ total: number | bigint; count: number | bigint }>>(`
        SELECT COALESCE(SUM(o.total), 0) as total, COUNT(*) as count
        FROM orders o WHERE o.store_id = ${storeId} AND o.status = 'CREDIT' ${dateClause}
      `),
      db.$queryRawUnsafe<Array<{ total: number | bigint; count: number | bigint }>>(`
        SELECT COALESCE(SUM(o.tip_amount), 0) as total, COUNT(*) as count
        FROM orders o WHERE ${baseWhere} AND o.tip_amount > 0
      `),

      // ── GROUP BY queries (was: N nested loops in JS) ──
      db.$queryRawUnsafe<Array<{ method: string; count: number | bigint; total: number | bigint }>>(`
        SELECT o.payment_method as method, COUNT(*) as count, SUM(o.total) as total
        FROM orders o WHERE ${baseWhere}
        GROUP BY o.payment_method
      `),
      db.$queryRawUnsafe<Array<{ source: string; count: number | bigint; total: number | bigint }>>(`
        SELECT CASE WHEN o.table_session_id IS NOT NULL THEN 'MESA' ELSE 'POS' END as source,
               COUNT(*) as count, SUM(o.total) as total
        FROM orders o WHERE ${baseWhere}
        GROUP BY CASE WHEN o.table_session_id IS NOT NULL THEN 'MESA' ELSE 'POS' END
      `),
      db.$queryRawUnsafe<Array<{ category: string; quantity: number | bigint; total: number | bigint }>>(`
        SELECT COALESCE(c.name, 'Sin Categoría') as category,
               SUM(oi.quantity * oi.units_per_pack) as quantity, SUM(oi.total_row) as total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${baseWhere}
        GROUP BY c.name
      `),
      db.$queryRawUnsafe<Array<{ productId: number; name: string; quantity: number | bigint; total: number | bigint }>>(`
        SELECT oi.product_id as productId, COALESCE(p.name, 'Producto eliminado') as name,
               SUM(oi.quantity * oi.units_per_pack) as quantity, SUM(oi.total_row) as total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE ${baseWhere} AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id, p.name
        ORDER BY total DESC LIMIT 15
      `),

      // ── Recent 50 orders (DB-level limit, was: load ALL then slice) ──
      db.order.findMany({
        where: ordersWhere,
        include: {
          orderItems: {
            include: { product: { select: { id: true, name: true, category: { select: { name: true } } } } },
          },
          customer: { select: { name: true } },
          tableSession: { select: { barTable: { select: { number: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // ── Other queries (unchanged logic) ──
      db.customer.findMany({
        where: { storeId, totalDebt: { gt: 0 } },
        select: { id: true, name: true, phone: true, totalDebt: true },
        orderBy: { totalDebt: 'desc' },
      }),
      db.product.findMany({
        where: { storeId, isActive: true, currentStock: { lte: 5 } },
        select: {
          id: true, name: true, currentStock: true, minStock: true, salePrice: true,
          category: { select: { name: true } },
        },
        orderBy: { currentStock: 'asc' },
      }),
      db.product.findMany({
        where: { storeId, isActive: true },
        select: { currentStock: true, costPrice: true, salePrice: true },
      }),
      db.ledgerAccount.findMany({ where: { storeId } }),
      db.serviceTransaction.findMany({
        where: servicesWhere,
        include: { service: { select: { name: true } } },
      }),
      db.tableSession.findMany({
        where: { storeId, status: 'OPEN' },
        include: {
          barTable: { select: { number: true, name: true } },
          comandaItems: { select: { total: true, status: true } },
        },
      }),
      db.$queryRawUnsafe<Array<{ day: string; total: bigint; count: bigint }>>(`
        SELECT ${sql.dateCol('o.created_at')} as day, SUM(o.total) as total, COUNT(*) as count
        FROM orders o
        WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT')
          AND o.created_at >= ${sql.nowMinusDays(6)}
        GROUP BY day ORDER BY day ASC
      `),
    ])

    // ───────────────────────────────────────────────────────────
    // PROCESS RESULTS (no N+1 — all data already from single queries)
    // ───────────────────────────────────────────────────────────
    const N = (v: number | bigint | null | undefined) => Number(v ?? 0)

    const totalSales = N(salesAgg[0]?.total)
    const totalOrders = N(salesAgg[0]?.count)
    const totalCompletedSales = N(completedAgg[0]?.total)
    const totalCreditSales = N(creditAgg[0]?.total)
    const totalTips = N(tipsAgg[0]?.total)
    const tipsOrderCount = N(tipsAgg[0]?.count)

    // 2. Sales by Payment Method
    const salesByPayment: Record<string, { count: number; total: number }> = {}
    for (const row of byPaymentRaw) {
      salesByPayment[row.method] = { count: N(row.count), total: N(row.total) }
    }

    // 3. Sales by Source (MESA vs POS)
    const salesBySource: Record<string, { count: number; total: number }> = { MESA: { count: 0, total: 0 }, POS: { count: 0, total: 0 } }
    for (const row of bySourceRaw) {
      salesBySource[row.source] = { count: N(row.count), total: N(row.total) }
    }

    // 4. Sales by Category
    const salesByCategory: Record<string, { quantity: number; total: number }> = {}
    for (const row of byCategoryRaw) {
      salesByCategory[row.category] = { quantity: N(row.quantity), total: N(row.total) }
    }

    // 5. Top Products (already sorted and limited from SQL)
    const topProducts = topProductsRaw.map(row => ({
      productId: row.productId,
      name: row.name,
      quantity: N(row.quantity),
      total: N(row.total),
    }))

    // 8. Inventory Valuation
    const totalInventoryCost = inventoryData.reduce((s, p) => s + toNum(p.currentStock) * p.costPrice, 0)
    const totalInventoryRetail = inventoryData.reduce((s, p) => s + toNum(p.currentStock) * p.salePrice, 0)

    // 9. Ledger Accounts summary — single GROUP BY query
    const accountBalances: Record<string, number> = {}
    if (ledgerAccounts.length > 0) {
      const balances = await db.$queryRaw<Array<{ name: string; balance: number }>>`
        SELECT la.name, SUM(CASE WHEN je.direction = 'DEBIT' THEN je.amount ELSE -je.amount END) AS balance
        FROM ledger_accounts la
        LEFT JOIN journal_entries je ON je.ledger_account_id = la.id
        WHERE la.store_id = ${storeId}
        GROUP BY la.id, la.name
      `
      for (const b of balances) {
        accountBalances[b.name] = Number(b.balance)
      }
    }

    // 10. Services Summary
    const totalServiceAmount = serviceTxns.reduce((s, svc) => s + Number(svc.totalAmount), 0)

    // 11. Open Tables/Sessions
    const openTableConsumption = openSessions.reduce((s, ses) => {
      return (
        s +
        ses.comandaItems
          .filter((i) => i.status !== 'CANCELLED')
          .reduce((si, i) => si + i.total, 0)
      )
    }, 0)

    // 12. Daily sales breakdown (last 7 days) — fill missing days
    const dailySales: Array<{ date: string; sales: number; orders: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dayStr = d.toISOString().split('T')[0]
      const found = dailySalesRaw.find((r) => r.day === dayStr)
      dailySales.push({
        date: dayStr,
        sales: found ? Number(found.total) : 0,
        orders: found ? Number(found.count) : 0,
      })
    }

    // 13. Profit calculation — uses actual COGS from order items joined with products
    const cogsRaw = await db.$queryRawUnsafe<Array<{ total_cogs: number | bigint }>>(`
      SELECT COALESCE(SUM(oi.quantity * oi.units_per_pack * p.cost_price), 0) as total_cogs
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE ${baseWhere}
    `)
    const totalCOGS = N(cogsRaw[0]?.total_cogs)
    const profit = totalSales > 0 ? totalSales - totalCOGS : 0

    return NextResponse.json({
      period: { from, to },
      sales: {
        total: totalSales,
        subtotal: totalSales - totalTips,
        tips: totalTips,
        tipsOrderCount,
        completed: totalCompletedSales,
        credit: totalCreditSales,
        orderCount: totalOrders,
        avgTicket: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
      },
      salesByPayment,
      salesBySource,
      salesByCategory,
      topProducts,
      customerDebts: customersWithDebt,
      lowStockProducts,
      inventory: {
        totalCostValue: totalInventoryCost,
        totalRetailValue: totalInventoryRetail,
        lowStockCount: lowStockProducts.length,
      },
      accountBalances,
      services: {
        totalAmount: totalServiceAmount,
        transactionCount: serviceTxns.length,
      },
      openTables: {
        count: openSessions.length,
        consumption: openTableConsumption,
      },
      dailySales,
      profit,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer?.name || 'Cliente general',
        total: o.total,
        subtotal: o.subtotal,
        tipAmount: o.tipAmount || 0,
        paymentMethod: o.paymentMethod,
        status: o.status,
        source: o.tableSessionId ? 'MESA' : 'POS',
        tableName: o.tableSession ? `Mesa ${o.tableSession.barTable.number}${o.tableSession.barTable.name ? ` (${o.tableSession.barTable.name})` : ''}` : null,
        items: o.orderItems.map((item) => ({
          name: item.product?.name || 'Producto eliminado',
          presentationName: item.presentationName ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalRow: item.totalRow,
        })),
        createdAt: o.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map(i => i.message).join(', ') }, { status: 400 })
    }
    logger.error('GET /api/reports error:', error)
    return NextResponse.json({ error: 'Error al generar informe' }, { status: 500 })
  }
}
