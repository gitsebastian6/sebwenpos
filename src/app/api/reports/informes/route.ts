import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { sql } from '@/lib/db-dialect'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const informesParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  from: z.string().optional(),
  to: z.string().optional(),
})

// Serialize BigInt for JSON responses
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

// GET /api/reports/informes?storeId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = informesParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const { storeId, from, to } = params

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86399999)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Parse custom dates
    const customFrom = from ? new Date(from + 'T00:00:00') : null
    const customTo = to ? new Date(to + 'T23:59:59') : null
    const dateFilter = customFrom || customTo
      ? { gte: customFrom || new Date(2020, 0, 1), lte: customTo || now }
      : null

    const safe = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn() }
      catch (e: unknown) { logger.error(`[Informes] ${name}:`, e instanceof Error ? e.message : String(e)); return null }
    }

    const results = await Promise.all([
      // 1. TU LOCAL EN CIFRAS — General KPIs
      safe('kpi-sales', () => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: todayStart, lte: todayEnd } },
        _sum: { total: true }, _count: { id: true }
      })),
      safe('kpi-month', () => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: monthStart, lte: todayEnd } },
        _sum: { total: true, tipAmount: true, discountAmount: true, subtotal: true }, _count: { id: true }
      })),
      safe('kpi-lastmonth', () => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { total: true }
      })),
      safe('kpi-open-tables', () => db.tableSession.count({ where: { storeId, status: 'OPEN' } })),
      safe('kpi-debt', () => db.customer.aggregate({ where: { storeId, totalDebt: { gt: 0 } }, _sum: { totalDebt: true }, _count: { id: true } })),

      // 2. INVENTARIO — Valuación y días
      safe('inv-valuation', () => db.$queryRawUnsafe(`
        SELECT COALESCE(SUM(cost_price * current_stock), 0) as "totalCost",
               COALESCE(SUM(salePrice * current_stock), 0) as "totalRetail",
               COUNT(CASE WHEN current_stock = 0 THEN 1 END) as "outOfStock",
               COUNT(CASE WHEN current_stock <= min_stock THEN 1 END) as "lowStock",
               COUNT(*) as "totalProducts"
        FROM products WHERE store_id = ${storeId} AND is_active = ${sql.bool(true)}
      `)),
      safe('inv-avg-cogs', () => db.$queryRawUnsafe(`
        SELECT COALESCE(SUM(p.cost_price * oi.quantity) / MAX(days), 0) as "avgDailyCOGS",
               MAX(days) as "days"
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        CROSS JOIN (SELECT COUNT(DISTINCT ${sql.dateCol('created_at')}) as days
                    FROM orders WHERE store_id = ${storeId} AND status = 'COMPLETED'
                    AND created_at >= ${sql.timestamp(now.getTime() - 30 * 86400000)}) d
        WHERE o.store_id = ${storeId} AND o.status = 'COMPLETED'
        AND o.created_at >= ${sql.timestamp(now.getTime() - 30 * 86400000)}
      `)),

      // 3. RENTABILIDAD (respects dateFilter, includes CREDIT orders)
      safe('profit-month', () => {
        const pGte = dateFilter?.gte || monthStart
        const pLte = dateFilter?.lte || todayEnd
        return db.$queryRawUnsafe(`
          SELECT COALESCE(SUM(o.subtotal), 0) as "revenue",
                 COALESCE(SUM(p.cost_price * oi.quantity), 0) as "cogs",
                 COALESCE(SUM(o.discount_amount), 0) as "discounts",
                 COALESCE(SUM(o.tip_amount), 0) as "tips"
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          JOIN products p ON p.id = oi.product_id
          WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT')
          AND o.created_at >= ${sql.timestamp(pGte.getTime())} AND o.created_at <= ${sql.timestamp(pLte.getTime())}
        `)
      }),

      // 4. COMPRAS
      safe('purchases', () => db.purchase.findMany({
        where: { storeId, ...(dateFilter ? { date: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: {
          provider: { select: { name: true } },
          purchaseItems: { include: { product: { select: { name: true, category: { select: { name: true } } } } } }
        },
        orderBy: { date: 'desc' }
      })),

      // 5. VENTAS — GROUP BY aggregates + limited order list (was: load ALL orders + N JS loops)
      safe('sales-data', async () => {
        const sGte = dateFilter?.gte || monthStart
        const sLte = dateFilter?.lte || todayEnd
        const sDateClause = `AND o.created_at >= ${sql.timestamp(sGte.getTime())} AND o.created_at <= ${sql.timestamp(sLte.getTime())}`
        const sBase = `o.store_id = ${storeId} AND o.status IN ('COMPLETED', 'CREDIT') ${sDateClause}`
        const [agg, byPayment, byCategory, bySource, topProds, ordersList] = await Promise.all([
          db.$queryRawUnsafe(`SELECT COALESCE(SUM(o.total),0) as total, COUNT(*) as count FROM orders o WHERE ${sBase}`),
          db.$queryRawUnsafe(`SELECT o.payment_method as method, COUNT(*) as count, SUM(o.total) as total FROM orders o WHERE ${sBase} GROUP BY o.payment_method`),
          db.$queryRawUnsafe(`SELECT COALESCE(c.name, 'Sin categoría') as category, SUM(oi.quantity) as qty, SUM(oi.total_row) as total FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE ${sBase} GROUP BY c.name`),
          db.$queryRawUnsafe(`SELECT CASE WHEN o.table_session_id IS NOT NULL THEN 'MESA' ELSE 'POS' END as source, COUNT(*) as count, SUM(o.total) as total FROM orders o WHERE ${sBase} GROUP BY CASE WHEN o.table_session_id IS NOT NULL THEN 'MESA' ELSE 'POS' END`),
          db.$queryRawUnsafe(`SELECT oi.product_id as productId, COALESCE(p.name, 'Eliminado') as name, SUM(oi.quantity) as qty, SUM(oi.total_row) as total FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id WHERE ${sBase} AND oi.product_id IS NOT NULL GROUP BY oi.product_id ORDER BY total DESC LIMIT 20`),
          db.order.findMany({
            where: { storeId, status: { in: ['COMPLETED', 'CREDIT'] }, ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
            include: {
              orderItems: { include: { product: { select: { name: true, category: { select: { name: true } } } } } },
              customer: { select: { name: true } },
              tableSession: { select: { barTable: { select: { number: true, name: true } } } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        ])
        return { agg, byPayment, byCategory, bySource, topProds, ordersList }
      }),

      // 6. VENTAS PERDIDAS
      safe('lost-sales', () => db.$queryRawUnsafe(`
        SELECT p.id, p.name, p.salePrice as "salePrice",
               COALESCE(v.total_qty, 0) as "sold30d",
               CASE WHEN v.total_qty > 0 THEN ROUND(v.total_qty / 30.0, 1) ELSE 0 END as "avgDaily"
        FROM products p
        LEFT JOIN (
          SELECT oi.product_id, SUM(oi.quantity) as "total_qty"
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.store_id = ${storeId} AND o.status = 'COMPLETED'
          AND o.created_at >= ${sql.timestamp(now.getTime() - 30 * 86400000)}
          GROUP BY oi.product_id
        ) v ON v.product_id = p.id
        WHERE p.store_id = ${storeId} AND p.is_active = ${sql.bool(true)} AND p.current_stock = 0
        ORDER BY v.total_qty DESC
      `)),

      // 7. PUNTO DE EQUILIBRIO (respects dateFilter)
      safe('breakeven', () => {
        const bGte = dateFilter?.gte || monthStart
        const bLte = dateFilter?.lte || todayEnd
        return db.$queryRawUnsafe(`
          SELECT COALESCE(SUM(amount), 0) as "fixedCosts"
          FROM expenses WHERE store_id = ${storeId}
          AND date >= ${sql.timestamp(bGte.getTime())} AND date <= ${sql.timestamp(bLte.getTime())}
        `)
      }),

      // 8. DEVOLUCIONES
      safe('returns', () => db.inventoryMovement.findMany({
        where: { storeId, movementType: 'RETURN', ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { product: { select: { name: true, salePrice: true } } },
        orderBy: { createdAt: 'desc' }
      })),

      // 9. CIERRE DE CAJAS
      safe('cash-registers', () => db.cashRegister.findMany({
        where: { storeId },
        include: { user: { select: { fullName: true } } },
        orderBy: { openedAt: 'desc' },
        take: 30
      })),

      // 10. COMISIONES — Services income
      safe('commissions', () => db.serviceTransaction.findMany({
        where: { storeId, status: 'COMPLETED', ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { service: { select: { name: true, price: true } } },
        orderBy: { createdAt: 'desc' }
      })),

      // 11. AJUSTES DE INVENTARIO
      safe('adjustments', () => db.inventoryMovement.findMany({
        where: { storeId, movementType: 'ADJUSTMENT', ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { product: { select: { name: true, currentStock: true, salePrice: true } } },
        orderBy: { createdAt: 'desc' }
      })),

      // 12. IMPUESTOS — Expenses with category IMPUESTOS (use date field consistently)
      safe('taxes', () => db.expense.findMany({
        where: { storeId, category: 'IMPUESTOS', ...(dateFilter ? { date: dateFilter } : { date: { gte: monthStart, lte: todayEnd } }) },
        orderBy: { date: 'desc' }
      })),

      // 13. GASTOS OPERACIONALES (Salidas de caja)
      safe('expenses', () => db.expense.findMany({
        where: { storeId, ...(dateFilter ? { date: dateFilter } : { date: { gte: monthStart, lte: todayEnd } }) },
        orderBy: { date: 'desc' }
      })),

      // 14. DESCUENTOS
      safe('discounts', () => db.order.findMany({
        where: { storeId, discountAmount: { gt: 0 }, status: 'COMPLETED', ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
      })),

      // 15. TRAZABILIDAD — All movements (includes costPrice/salePrice for loss value calc)
      safe('traceability', () => db.inventoryMovement.findMany({
        where: { storeId, ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { product: { select: { name: true, costPrice: true, salePrice: true, category: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 200
      })),

      // 16. CxC — Customer debts
      safe('debts', () => db.customer.findMany({
        where: { storeId, totalDebt: { gt: 0 } },
        select: { id: true, name: true, phone: true, totalDebt: true },
        orderBy: { totalDebt: 'desc' }
      })),

      // 17. COTIZACIONES — Real quotations table
      safe('quotes', () => db.quotation.findMany({
        where: { storeId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true, nit: true, phone: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      })),

      // 17b. COTIZACIONES — KPIs
      safe('quotes-kpis', () => db.quotation.aggregate({
        where: { storeId, status: 'ACTIVE' },
        _sum: { total: true }, _count: { id: true }
      })),
      safe('quotes-converted', () => db.quotation.count({
        where: { storeId, status: 'CONVERTED' }
      })),

      // 19. FACTURAS ELECTRÓNICAS
      safe('invoices', () => db.invoice.findMany({
        where: { storeId, ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: {
          order: { select: { orderNumber: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      })),

      // 20. NOTAS CRÉDITO/DÉBITO
      safe('credit-notes', () => db.creditNote.findMany({
        where: { storeId, ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: {
          invoice: { select: { prefix: true, consecutive: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      })),

      // 18. IVA RECAUDADO — Tax collected from sales
      safe('iva-orders', () => db.order.findMany({
        where: {
          storeId,
          status: { in: ['COMPLETED', 'CREDIT'] },
          ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } })
        },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          taxAmount: true,
          taxBreakdown: true,
          total: true,
          subtotal: true,
          customer: { select: { name: true, nit: true } },
          orderItems: {
            select: {
              product: { select: { name: true } },
              taxCode: true,
              taxRate: true,
              taxAmount: true,
              taxBase: true,
              totalRow: true,
              quantity: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })),
    ])

    const N = (v: unknown) => Number(v ?? 0)

    // ── 1. TU LOCAL EN CIFRAS ──
    const todaySales = results[0]
    const monthData = results[1]
    const lastMonthData = results[2]
    const localEnCifras = {
      salesToday: N(todaySales?._sum?.total),
      ordersToday: N(todaySales?._count?.id),
      salesMonth: N(monthData?._sum?.total),
      ordersMonth: N(monthData?._count?.id),
      lastMonthSales: N(lastMonthData?._sum?.total),
      monthVariance: N(lastMonthData?._sum?.total) > 0
        ? Math.round(((N(monthData?._sum?.total) - N(lastMonthData?._sum?.total)) / N(lastMonthData?._sum?.total)) * 1000) / 10
        : N(monthData?._sum?.total) > 0 ? 100 : 0,
      tipsMonth: N(monthData?._sum?.tipAmount),
      openTables: N(results[3]),
      totalDebt: N(results[4]?._sum?.totalDebt),
      debtCount: N(results[4]?._count?.id),
    }

    // ── 2. INVENTARIO ──
    const invVal = Array.isArray(results[5]) ? results[5][0] : null
    const invCogs = Array.isArray(results[6]) ? results[6][0] : null
    const totalCost = N(invVal?.totalCost)
    const avgDailyCOGS = N(invCogs?.avgDailyCOGS)
    const inventory = {
      totalCostValue: totalCost,
      totalRetailValue: N(invVal?.totalRetail),
      outOfStockCount: N(invVal?.outOfStock),
      lowStockCount: N(invVal?.lowStock),
      totalProducts: N(invVal?.totalProducts),
      daysOfInventory: avgDailyCOGS > 0 ? Math.round(totalCost / avgDailyCOGS) : 0,
      avgDailyCOGS,
    }

    // ── 3. RENTABILIDAD ──
    const profitRow = Array.isArray(results[7]) ? results[7][0] : null
    const revenue = N(profitRow?.revenue)
    const cogs = N(profitRow?.cogs)
    const discounts = N(profitRow?.discounts)
    const tips = N(profitRow?.tips)
    const profitability = {
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      grossMargin: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : 0,
      netRevenue: revenue - discounts,
      netProfit: revenue - discounts - cogs,
      netMargin: (revenue - discounts) > 0 ? Math.round(((revenue - discounts - cogs) / (revenue - discounts)) * 1000) / 10 : 0,
      discounts,
      tips,
    }

    // ── 4. COMPRAS ──
    const purchases = Array.isArray(results[8]) ? results[8] : []
    const purchasesTotal = purchases.reduce((s, p) => s + p.total, 0)
    const purchasesByProvider: Record<string, { count: number; total: number }> = {}
    for (const p of purchases) {
      const name = p.provider?.name || 'Sin proveedor'
      if (!purchasesByProvider[name]) purchasesByProvider[name] = { count: 0, total: 0 }
      purchasesByProvider[name].count++
      purchasesByProvider[name].total += p.total
    }

    // ── 5. VENTAS — from GROUP BY queries (no N+1) ──
    const salesData = results[9] || {}
    const salesAggRow = Array.isArray(salesData.agg) ? salesData.agg[0] : null
    const salesTotal = N(salesAggRow?.total)
    const salesOrderCount = N(salesAggRow?.count)

    const salesByPayment: Record<string, { count: number; total: number }> = {}
    for (const row of (salesData.byPayment || [])) {
      salesByPayment[row.method] = { count: N(row.count), total: N(row.total) }
    }

    const salesByCategory: Record<string, { qty: number; total: number }> = {}
    for (const row of (salesData.byCategory || [])) {
      salesByCategory[row.category] = { qty: N(row.qty), total: N(row.total) }
    }

    const salesBySource = { MESA: { count: 0, total: 0 }, POS: { count: 0, total: 0 } }
    for (const row of (salesData.bySource || [])) {
      salesBySource[row.source] = { count: N(row.count), total: N(row.total) }
    }

    const topProducts = (salesData.topProds || []).map((row) => ({
      name: row.name, qty: N(row.qty), total: N(row.total),
    }))

    const orders = salesData.ordersList || []

    // ── 7. PUNTO DE EQUILIBRIO ──
    const beRow = Array.isArray(results[11]) ? results[11][0] : null
    const fixedCosts = N(beRow?.fixedCosts)
    const variableCostRatio = revenue > 0 ? cogs / revenue : 0
    const contributionMargin = 1 - variableCostRatio
    const breakEvenPoint = contributionMargin > 0 ? Math.round(fixedCosts / contributionMargin) : 0
    const breakEven = {
      fixedCosts,
      variableCostRatio: Math.round(variableCostRatio * 1000) / 1000,
      contributionMargin: Math.round(contributionMargin * 1000) / 1000,
      breakEvenPoint,
      distanceToBreakEven: Math.max(0, breakEvenPoint - salesTotal),
      achievedPercent: breakEvenPoint > 0 ? Math.min(100, Math.round((salesTotal / breakEvenPoint) * 100)) : 0,
    }

    // ── 8-14. Direct arrays ──
    const returns = Array.isArray(results[12]) ? results[12] : []
    const cashRegisters = Array.isArray(results[13]) ? results[13] : []
    const commissions = Array.isArray(results[14]) ? results[14] : []
    const adjustments = Array.isArray(results[15]) ? results[15] : []
    const taxExpenses = Array.isArray(results[16]) ? results[16] : []
    const allExpenses = Array.isArray(results[17]) ? results[17] : []
    const discountOrders = Array.isArray(results[18]) ? results[18] : []
    const traceability = Array.isArray(results[19]) ? results[19] : []
    const debts = Array.isArray(results[20]) ? results[20] : []
    const quotes = Array.isArray(results[21]) ? results[21] : []
    const quotesKpis = results[22] || null
    const quotesConverted = Number(results[23] || 0)
    const ivaOrdersRaw = Array.isArray(results[24]) ? results[24] : []
    const invoices = Array.isArray(results[25]) ? results[25] : []
    const creditNotes = Array.isArray(results[26]) ? results[26] : []

    // ── 18. IVA RECAUDADO ──
    const ivaOrders = ivaOrdersRaw
      .filter((o) => Number(o.taxAmount) > 0)
      .map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        taxBreakdown: o.taxBreakdown ? JSON.parse(String(o.taxBreakdown)) : [],
      }))

    const totalIva = ivaOrders.reduce((sum, o) => sum + Number(o.taxAmount), 0)
    const totalBase = ivaOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)

    // Group by tax code for summary
    const ivaByCodeMap = new Map<string, { name: string; code: string; rate: number; base: number; amount: number }>()
    ivaOrders.forEach((o) => {
      const breakdown = o.taxBreakdown || []
      breakdown.forEach((t) => {
        const existing = ivaByCodeMap.get(t.code)
        if (existing) {
          existing.base += t.base
          existing.amount += t.amount
        } else {
          ivaByCodeMap.set(t.code, { name: t.name, code: t.code, rate: t.rate, base: t.base, amount: t.amount })
        }
      })
    })
    const ivaByCode = Array.from(ivaByCodeMap.values())

    const ivaCollected = {
      total: totalIva,
      totalBase: totalBase,
      count: ivaOrders.length,
      byCode: ivaByCode,
      orders: ivaOrders.slice(0, 50),
    }

    // Expense summary
    const expensesByCategory: Record<string, { count: number; total: number }> = {}
    const expensesTotal = allExpenses.reduce((s, e) => s + e.amount, 0)
    for (const e of allExpenses) {
      if (!expensesByCategory[e.category]) expensesByCategory[e.category] = { count: 0, total: 0 }
      expensesByCategory[e.category].count++
      expensesByCategory[e.category].total += e.amount
    }

    // Tax total
    const taxTotal = taxExpenses.reduce((s, e) => s + e.amount, 0)

    // Discounts total
    const discountsTotal = discountOrders.reduce((s, o) => s + o.discountAmount, 0)

    // Services/commissions total
    const servicesTotal = commissions.reduce((s, c) => s + c.totalAmount, 0)

    return NextResponse.json({
      period: { from: from || monthStart.toISOString().split('T')[0], to: to || todayEnd.toISOString().split('T')[0] },
      localEnCifras,
      inventory,
      profitability,
      purchases: { items: purchases, total: purchasesTotal, byProvider: purchasesByProvider },
      sales: {
        orders,
        total: salesTotal,
        orderCount: salesOrderCount,
        avgTicket: salesOrderCount > 0 ? Math.round(salesTotal / salesOrderCount) : 0,
        byPayment: salesByPayment,
        byCategory: salesByCategory,
        bySource: salesBySource,
        topProducts,
      },
      lostSales: Array.isArray(results[10]) ? results[10] : [],
      breakEven,
      returns: { items: returns, totalValue: returns.reduce((s, r) => Math.abs(s + r.quantity * (r.product?.salePrice || 0)), 0) },
      cashRegisters: cashRegisters.map(c => ({
        id: c.id, openedAt: c.openedAt.toISOString(), closedAt: c.closedAt?.toISOString() || null,
        openingBalance: c.openingBalance, closingBalance: c.closingBalance,
        expectedCash: c.expectedCash, difference: c.difference,
        status: c.status, user: c.user?.fullName || 'N/A', notes: c.notes
      })),
      commissions: { items: commissions, total: servicesTotal, count: commissions.length },
      adjustments: { items: adjustments, count: adjustments.length },
      taxes: { items: taxExpenses, total: taxTotal, count: taxExpenses.length },
      expenses: { items: allExpenses, total: expensesTotal, byCategory: expensesByCategory },
      discounts: { items: discountOrders, total: discountsTotal, count: discountOrders.length },
      traceability,
      debts,
      quotes,
      quotesSummary: {
        activeCount: Number(quotesKpis?._count?.id || 0),
        activeTotal: Number(quotesKpis?._sum?.total || 0),
        convertedCount: quotesConverted,
        totalCount: quotes.length,
      },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: `${inv.prefix}${String(inv.consecutive).padStart(10, '0')}`,
        customerNit: inv.customerNit,
        customerName: inv.customerName || 'Consumidor Final',
        grandTotal: Number(inv.grandTotal),
        totalTax: Number(inv.totalTaxAmount),
        status: inv.status,
        testMode: inv.testMode,
        cufe: inv.cufe,
        sentAt: inv.sentAt?.toISOString() || null,
        validatedAt: inv.validatedAt?.toISOString() || null,
        createdAt: inv.createdAt.toISOString(),
        orderNumber: inv.order?.orderNumber || null,
      })),
      invoicesSummary: {
        total: invoices.reduce((s, inv) => s + Number(inv.grandTotal), 0),
        count: invoices.length,
        validated: invoices.filter((inv) => inv.status === 'VALIDATED' || inv.status === 'DELIVERED').length,
        pending: invoices.filter((inv) => inv.status === 'DRAFT' || inv.status === 'PENDING_VALIDATE').length,
        rejected: invoices.filter((inv) => inv.status === 'REJECTED').length,
      },
      creditNotes: creditNotes.map((cn) => ({
        id: cn.id,
        noteNumber: `${cn.prefix}${String(cn.consecutive).padStart(10, '0')}`,
        noteType: cn.noteType,
        customerName: cn.customerName || 'Consumidor Final',
        totalAmount: Number(cn.grandTotal),
        reason: cn.concept || '',
        status: cn.status,
        createdAt: cn.createdAt.toISOString(),
        invoiceNumber: cn.invoice ? `${cn.invoice.prefix}${String(cn.invoice.consecutive).padStart(10, '0')}` : null,
      })),
      creditNotesSummary: {
        total: creditNotes.reduce((s, cn) => s + Number(cn.grandTotal), 0),
        count: creditNotes.length,
        creditCount: creditNotes.filter((cn) => cn.noteType === 'CREDIT').length,
        debitCount: creditNotes.filter((cn) => cn.noteType === 'DEBIT').length,
      },
      ivaCollected,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map(i => i.message).join(', ') }, { status: 400 })
    }
    logger.error('GET /api/reports/informes error:', error)
    return NextResponse.json({ error: 'Error al generar informes', detail: String(error) }, { status: 500 })
  }
}
