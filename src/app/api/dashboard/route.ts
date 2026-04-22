import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { sql } from '@/lib/db-dialect'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const dashboardParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
})

// GET /api/dashboard?storeId=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = dashboardParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const { storeId: storeIdNum } = params

    const storeAccessErr = requireStoreAccess(request, storeIdNum)
    if (storeAccessErr) return storeAccessErr

    // ── Date boundaries ──
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(today.getTime() + 86400000 - 1)
    const yesterdayStart = new Date(today.getTime() - 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    // Run queries with error isolation
    const runSafe = async (name: string, fn: () => Promise<unknown>) => {
      try {
        return await fn()
      } catch (e: unknown) {
        logger.error(`Dashboard query [${name}] failed:`, e instanceof Error ? e.message : String(e))
        return null
      }
    }

    const [
      salesTodayResult,
      salesYesterdayResult,
      salesThisMonthResult,
      salesLastMonthResult,
      salesThisYearResult,
      ordersTodayResult,
      ordersThisMonthResult,
      profitTodayResult,
      profitThisMonthResult,
      profitThisYearResult,
      inventoryCostResult,
      avgDailyCogsResult,
      outOfStockCountResult,
      outOfStockProducts,
      recentSalesVelocity,
      totalDebtResult,
      openTableSessions,
      lowStockProducts,
      recentOrders,
      topProductsResult,
      salesByDayResult,
      expensesThisMonthResult,
    ] = await Promise.all([
      runSafe('salesToday', () => db.order.aggregate({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: today, lte: todayEnd } }, _sum: { total: true, subtotal: true } })),
      runSafe('salesYesterday', () => db.order.aggregate({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: yesterdayStart, lte: new Date(today.getTime() - 1) } }, _sum: { total: true } })),
      runSafe('salesThisMonth', () => db.order.aggregate({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: monthStart, lte: todayEnd } }, _sum: { total: true, subtotal: true, discountAmount: true, tipAmount: true }, _count: { id: true } })),
      runSafe('salesLastMonth', () => db.order.aggregate({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { total: true } })),
      runSafe('salesThisYear', () => db.order.aggregate({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: yearStart, lte: todayEnd } }, _sum: { total: true, subtotal: true }, _count: { id: true } })),
      runSafe('ordersToday', () => db.order.count({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: today, lte: todayEnd } } })),
      runSafe('ordersThisMonth', () => db.order.count({ where: { storeId: storeIdNum, status: 'COMPLETED', createdAt: { gte: monthStart, lte: todayEnd } } })),
      runSafe('profitToday', () => db.$queryRawUnsafe(`SELECT COALESCE(SUM(oi.total_row),0) as "totalRevenue", COALESCE(SUM(p.cost_price * oi.quantity),0) as "totalCOGS", COUNT(DISTINCT oi.order_id) as "totalOrders", CASE WHEN COUNT(DISTINCT oi.order_id) > 0 THEN SUM(oi.total_row) / COUNT(DISTINCT oi.order_id) ELSE 0 END as "avgTicket" FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN orders o ON o.id = oi.order_id WHERE o.store_id = ${storeIdNum} AND o.status = 'COMPLETED' AND o.created_at >= ${sql.timestamp(today.getTime())} AND o.created_at <= ${sql.timestamp(todayEnd.getTime())}`)),
      runSafe('profitMonth', () => db.$queryRawUnsafe(`SELECT COALESCE(SUM(o.subtotal),0) as "totalRevenue", COALESCE(SUM(p.cost_price * oi.quantity),0) as "totalCOGS", COALESCE(SUM(o.discount_amount),0) as "totalDiscounts", COALESCE(SUM(o.tip_amount),0) as "totalTips" FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE o.store_id = ${storeIdNum} AND o.status = 'COMPLETED' AND o.created_at >= ${sql.timestamp(monthStart.getTime())} AND o.created_at <= ${sql.timestamp(todayEnd.getTime())}`)),
      runSafe('profitYear', () => db.$queryRawUnsafe(`SELECT COALESCE(SUM(o.subtotal),0) as "totalRevenue", COALESCE(SUM(p.cost_price * oi.quantity),0) as "totalCOGS" FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE o.store_id = ${storeIdNum} AND o.status = 'COMPLETED' AND o.created_at >= ${sql.timestamp(yearStart.getTime())} AND o.created_at <= ${sql.timestamp(todayEnd.getTime())}`)),
      runSafe('inventoryCost', () => db.$queryRawUnsafe(`SELECT COALESCE(SUM(cost_price * current_stock), 0) as "totalCost" FROM products WHERE store_id = ${storeIdNum} AND is_active = ${sql.bool(true)} AND current_stock > 0`)),
      // Use o.created_at / 86400000 to get day-level granularity without date() function (avoids ambiguous column in multi-table join)
      runSafe('avgDailyCOGS', () => db.$queryRawUnsafe(`SELECT CASE WHEN COUNT(DISTINCT (o.created_at / 86400000)) > 0 THEN SUM(p.cost_price * oi.quantity) / COUNT(DISTINCT (o.created_at / 86400000)) ELSE 0 END as "avgDailyCOGS" FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN orders o ON o.id = oi.order_id WHERE o.store_id = ${storeIdNum} AND o.status = 'COMPLETED' AND o.created_at >= ${sql.timestamp(new Date(now.getTime() - 30 * 86400000).getTime())} AND oi.product_id IS NOT NULL`)),
      runSafe('outOfStockCount', () => db.product.count({ where: { storeId: storeIdNum, isActive: true, currentStock: 0 } })),
      runSafe('outOfStock', () => db.$queryRawUnsafe(`SELECT id, name, salePrice as "salePrice" FROM products WHERE store_id = ${storeIdNum} AND is_active = ${sql.bool(true)} AND current_stock = 0 ORDER BY name ASC LIMIT 50`)),
      runSafe('velocity', () => db.$queryRawUnsafe(`SELECT oi.product_id as "productId", SUM(oi.quantity) as "totalQty" FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.store_id = ${storeIdNum} AND o.status = 'COMPLETED' AND o.created_at >= ${sql.timestamp(new Date(now.getTime() - 30 * 86400000).getTime())} AND oi.product_id IS NOT NULL GROUP BY oi.product_id`)),
      runSafe('totalDebt', () => db.customer.aggregate({ where: { storeId: storeIdNum }, _sum: { totalDebt: true } })),
      runSafe('openTables', () => db.tableSession.findMany({ where: { storeId: storeIdNum, status: 'OPEN' }, include: { barTable: { select: { number: true, name: true, zone: true } }, customer: { select: { name: true } }, _count: { select: { comandaItems: true, orders: true } } }, orderBy: { startedAt: 'asc' } })),
      runSafe('lowStock', () => db.$queryRawUnsafe(`SELECT id, name, current_stock as "currentStock", min_stock as "minStock" FROM products WHERE store_id = ${storeIdNum} AND is_active = ${sql.bool(true)} AND current_stock <= min_stock ORDER BY current_stock ASC LIMIT 20`)),
      runSafe('recentOrders', () => db.order.findMany({ where: { storeId: storeIdNum }, include: { customer: { select: { id: true, name: true } }, tableSession: { select: { id: true, barTable: { select: { number: true, name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 10 })),
      runSafe('topProducts', () => db.orderItem.groupBy({ by: ['productId'], where: { order: { storeId: storeIdNum, status: 'COMPLETED' } }, _sum: { quantity: true, totalRow: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 })),
      runSafe('salesByDay', () => { const sda = new Date(now.getTime() - 6 * 86400000); sda.setHours(0,0,0,0); return db.$queryRawUnsafe(`SELECT ${sql.dateCol('created_at')} as day, SUM(total) as total FROM orders WHERE store_id = ${storeIdNum} AND status = 'COMPLETED' AND created_at >= ${sql.timestamp(sda.getTime())} GROUP BY ${sql.dateCol('created_at')} ORDER BY day ASC`) }),
      runSafe('expenses', () => db.$queryRawUnsafe(`SELECT COALESCE(SUM(e.amount), 0) as total FROM expenses e WHERE e.store_id = ${storeIdNum} AND e.date >= ${sql.timestamp(monthStart.getTime())} AND e.date <= ${sql.timestamp(todayEnd.getTime())}`)),
    ])

    // ───────────────────────────────────────────────────
    // CALCULATE ALL KPIs
    // ───────────────────────────────────────────────────

    const N = (v: bigint | number | null | undefined) => Number(v ?? 0)

    // ── 1. VENTAS POR PERIODO ──
    const salesToday = N(salesTodayResult?._sum?.total)
    const salesYesterday = N(salesYesterdayResult?._sum?.total)
    const salesThisMonth = N(salesThisMonthResult?._sum?.total)
    const salesLastMonth = N(salesLastMonthResult?._sum?.total)
    const salesThisYear = N(salesThisYearResult?._sum?.total)

    const salesVariance = salesYesterday > 0
      ? ((salesToday - salesYesterday) / salesYesterday) * 100
      : salesToday > 0 ? 100 : 0

    const monthVariance = salesLastMonth > 0
      ? ((salesThisMonth - salesLastMonth) / salesLastMonth) * 100
      : 0

    const ordersToday = ordersTodayResult ?? 0
    const ordersThisMonth = ordersThisMonthResult ?? 0
    const avgTicketMonth = ordersThisMonth > 0 ? salesThisMonth / ordersThisMonth : 0

    // ── 2. UTILIDAD BRUTA Y RENTABILIDAD ──
    // Today
    const ptData = Array.isArray(profitTodayResult) ? profitTodayResult[0] : null
    const todayRevenue = N(ptData?.totalRevenue)
    const todayCOGS = N(ptData?.totalCOGS)
    const todayGrossProfit = todayRevenue - todayCOGS
    const todayMargin = todayRevenue > 0 ? Math.round(((todayGrossProfit / todayRevenue) * 100) * 10) / 10 : 0
    const todayAvgTicket = N(ptData?.avgTicket)

    // Month
    const pmData = Array.isArray(profitThisMonthResult) ? profitThisMonthResult[0] : null
    const monthRevenue = N(pmData?.totalRevenue)
    const monthCOGS = N(pmData?.totalCOGS)
    const monthGrossProfit = monthRevenue - monthCOGS
    const monthMargin = monthRevenue > 0 ? Math.round(((monthGrossProfit / monthRevenue) * 100) * 10) / 10 : 0
    const monthDiscounts = N(pmData?.totalDiscounts)
    const monthTips = N(pmData?.totalTips)
    const monthNetRevenue = monthRevenue - monthDiscounts
    const monthNetProfit = monthNetRevenue - monthCOGS

    // Year
    const pyData = Array.isArray(profitThisYearResult) ? profitThisYearResult[0] : null
    const yearRevenue = N(pyData?.totalRevenue)
    const yearCOGS = N(pyData?.totalCOGS)
    const yearGrossProfit = yearRevenue - yearCOGS
    const yearMargin = yearRevenue > 0 ? Math.round(((yearGrossProfit / yearRevenue) * 100) * 10) / 10 : 0

    // ── 3. INVENTARIO ──
    const inventoryCost = N(inventoryCostResult?.[0]?.totalCost)
    const avgDailyCOGS = N(avgDailyCogsResult?.[0]?.avgDailyCOGS)
    const inventoryDays = avgDailyCOGS > 0 ? Math.round(inventoryCost / avgDailyCOGS) : 0

    // ── 4. PÉRDIDAS Y FALTANTES ──
    // Out of stock products
    const safeOutOfStock = Array.isArray(outOfStockProducts) ? outOfStockProducts : []
    const outOfStockCount = outOfStockCountResult ?? safeOutOfStock.length
    const outOfStockValue = safeOutOfStock.reduce((sum, p) => sum + N(p.salePrice), 0)

    // Lost sales estimation: for out-of-stock products, estimate daily lost revenue
    const safeVelocity = Array.isArray(recentSalesVelocity) ? recentSalesVelocity : []
    const velocityMap = new Map(safeVelocity.map(v => [v.productId, Number(v.totalQty ?? 0)]))
    const daysForVelocity = 30
    let estimatedLostDailyRevenue = 0
    for (const oos of safeOutOfStock) {
      const totalSold30d = velocityMap.get(oos.id) ?? 0
      const avgDailyQty = totalSold30d / daysForVelocity
      estimatedLostDailyRevenue += avgDailyQty * N(oos.salePrice)
    }

    // ── 5. PUNTO DE EQUILIBRIO ──
    // Fixed costs = estimated monthly expenses
    const expensesThisMonth = N(expensesThisMonthResult?.[0]?.total)
    // Variable cost ratio = COGS / Revenue (month)
    const variableCostRatio = monthRevenue > 0 ? monthCOGS / monthRevenue : 0
    const contributionMargin = 1 - variableCostRatio
    // Break-even = Fixed Costs / Contribution Margin
    const breakEven = contributionMargin > 0 ? Math.round(expensesThisMonth / contributionMargin) : 0

    // ───────────────────────────────────────────────────
    // ENRICH TOP PRODUCTS
    // ───────────────────────────────────────────────────

    const safeTopProducts = Array.isArray(topProductsResult) ? topProductsResult : []
    // Filter out null productIds (items without product) to avoid Prisma "Argument 'in' is missing" error
    const topProductIds = safeTopProducts.map((p) => p.productId).filter((id): id is number => id != null)
    const topProductData = topProductIds.length > 0
      ? await runSafe('topProductData', () => db.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true, imgUrl: true, costPrice: true, salePrice: true },
        }))
      : []
    const safeTopProductData = Array.isArray(topProductData) ? topProductData : []

    const topProductMap = new Map(safeTopProductData.map((p) => [p.id, p]))
    const topProducts = safeTopProducts.map((item) => {
      const prod = topProductMap.get(item.productId)
      const qty = Number(item._sum.quantity ?? 0)
      const revenue = Number(item._sum.totalRow ?? 0)
      const cogs = prod ? Number(prod.costPrice) * qty : 0
      const margin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0
      return {
        product: prod ? { id: prod.id, name: prod.name, imgUrl: prod.imgUrl } : null,
        totalQuantity: qty,
        totalRevenue: revenue,
        totalCOGS: cogs,
        grossProfit: revenue - cogs,
        marginPercent: Math.round(margin * 10) / 10,
      }
    })

    // ───────────────────────────────────────────────────
    // SALES BY DAY (fill zeros)
    // ───────────────────────────────────────────────────

    const safeSalesByDay = Array.isArray(salesByDayResult) ? salesByDayResult : []
    const salesByDayMap = new Map(
      safeSalesByDay
        .filter((row) => row.day)
        .map((row) => [row.day.split('T')[0], Number(row.total ?? 0)])
    )
    const salesByDay: Array<{ date: string; total: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      d.setHours(0, 0, 0, 0)
      const dateStr = d.toISOString().split('T')[0]
      salesByDay.push({ date: dateStr, total: Number(salesByDayMap.get(dateStr) ?? 0) })
    }

    // ───────────────────────────────────────────────────
    // OPEN TABLES
    // ───────────────────────────────────────────────────

    const safeOpenTableSessions = Array.isArray(openTableSessions) ? openTableSessions : []
    const openTables = safeOpenTableSessions.map(s => ({
      id: s.id,
      tableNumber: s.barTable.number,
      tableName: s.barTable.name,
      tableZone: s.barTable.zone,
      customerName: s.customer?.name ?? null,
      guests: s.guests,
      startedAt: s.startedAt.toISOString(),
      itemsCount: s._count.comandaItems,
      ordersCount: s._count.orders,
    }))

    // ───────────────────────────────────────────────────
    // RETURN DASHBOARD DATA
    // ───────────────────────────────────────────────────

    return NextResponse.json({
      // ── KPIs Críticos ──
      kpis: {
        sales: {
          today: salesToday,
          yesterday: salesYesterday,
          variance: Math.round(salesVariance * 10) / 10,
          thisMonth: salesThisMonth,
          lastMonth: salesLastMonth,
          monthVariance: Math.round(monthVariance * 10) / 10,
          thisYear: salesThisYear,
        },
        profitability: {
          today: { revenue: todayRevenue, cogs: todayCOGS, grossProfit: todayGrossProfit, margin: todayMargin, avgTicket: todayAvgTicket },
          month: { revenue: monthRevenue, cogs: monthCOGS, grossProfit: monthGrossProfit, margin: monthMargin, netRevenue: monthNetRevenue, netProfit: monthNetProfit, discounts: monthDiscounts, tips: monthTips },
          year: { revenue: yearRevenue, cogs: yearCOGS, grossProfit: yearGrossProfit, margin: yearMargin },
        },
        inventory: {
          totalCost: inventoryCost,
          daysOfInventory: inventoryDays,
          avgDailyCOGS,
        },
        losses: {
          outOfStockCount,
          outOfStockValue,
          estimatedLostDailyRevenue: Math.round(estimatedLostDailyRevenue),
          estimatedLostMonthlyRevenue: Math.round(estimatedLostDailyRevenue * 30),
        },
        breakEven: {
          monthlyFixedCosts: expensesThisMonth,
          variableCostRatio: Math.round(variableCostRatio * 1000) / 1000,
          contributionMargin: Math.round(contributionMargin * 1000) / 1000,
          breakEvenPoint: breakEven,
          distanceToBreakEven: Math.max(0, breakEven - salesThisMonth),
          achievedPercent: breakEven > 0 ? Math.min(100, Math.round((salesThisMonth / breakEven) * 100)) : 0,
        },
        operational: {
          ordersToday,
          ordersThisMonth,
          avgTicketMonth,
          totalDebt: N(totalDebtResult?._sum?.totalDebt),
          openTablesCount: safeOpenTableSessions.length,
          openTables,
        },
      },

      // ── Data for charts/lists ──
      salesByDay,
      topProducts,
      lowStockProducts: (Array.isArray(lowStockProducts) ? lowStockProducts : []).map(p => ({ id: p.id, name: p.name, currentStock: p.currentStock, minStock: p.minStock })),
      recentOrders: (Array.isArray(recentOrders) ? recentOrders : []).map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: Number(o.total),
        customerName: o.customer?.name ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map((i: z.ZodIssue) => i.message).join(', ') }, { status: 400 })
    }
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('Dashboard API error:', errMsg)
    return NextResponse.json({ error: 'Failed to fetch dashboard stats', detail: errMsg }, { status: 500 })
  }
}

