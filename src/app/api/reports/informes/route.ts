import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Serialize BigInt for JSON responses
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

// GET /api/reports/informes?storeId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })

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
      catch (e: any) { console.error(`[Informes] ${name}:`, e.message); return null }
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
               COALESCE(SUM(sale_price * current_stock), 0) as "totalRetail",
               COUNT(CASE WHEN current_stock = 0 THEN 1 END) as "outOfStock",
               COUNT(CASE WHEN current_stock <= min_stock THEN 1 END) as "lowStock",
               COUNT(*) as "totalProducts"
        FROM products WHERE store_id = ${storeId} AND is_active = 1
      `)),
      safe('inv-avg-cogs', () => db.$queryRawUnsafe(`
        SELECT COALESCE(SUM(p.cost_price * oi.quantity) / MAX(days), 0) as "avgDailyCOGS",
               MAX(days) as "days"
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        CROSS JOIN (SELECT COUNT(DISTINCT date(created_at / 1000, 'unixepoch')) as days
                    FROM orders WHERE store_id = ${storeId} AND status = 'COMPLETED'
                    AND created_at >= ${(now.getTime() - 30 * 86400000)}) d
        WHERE o.store_id = ${storeId} AND o.status = 'COMPLETED'
        AND o.created_at >= ${(now.getTime() - 30 * 86400000)}
      `)),

      // 3. RENTABILIDAD
      safe('profit-month', () => db.$queryRawUnsafe(`
        SELECT COALESCE(SUM(o.subtotal), 0) as "revenue",
               COALESCE(SUM(p.cost_price * oi.quantity), 0) as "cogs",
               COALESCE(SUM(o.discount_amount), 0) as "discounts",
               COALESCE(SUM(o.tip_amount), 0) as "tips"
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.store_id = ${storeId} AND o.status = 'COMPLETED'
        AND o.created_at >= ${monthStart.getTime()} AND o.created_at <= ${todayEnd.getTime()}
      `)),

      // 4. COMPRAS
      safe('purchases', () => db.purchase.findMany({
        where: { storeId, ...(dateFilter ? { date: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: {
          provider: { select: { name: true } },
          purchaseItems: { include: { product: { select: { name: true, category: { select: { name: true } } } } } }
        },
        orderBy: { date: 'desc' }
      })),

      // 5. VENTAS — Detalle por período
      safe('sales-orders', () => db.order.findMany({
        where: { storeId, status: { in: ['COMPLETED', 'CREDIT'] }, ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: {
          orderItems: { include: { product: { select: { name: true, category: { select: { name: true } } } } } },
          customer: { select: { name: true } },
          tableSession: { select: { barTable: { select: { number: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      })),

      // 6. VENTAS PERDIDAS
      safe('lost-sales', () => db.$queryRawUnsafe(`
        SELECT p.id, p.name, p.sale_price as "salePrice",
               COALESCE(v.total_qty, 0) as "sold30d",
               CASE WHEN v.total_qty > 0 THEN ROUND(v.total_qty / 30.0, 1) ELSE 0 END as "avgDaily"
        FROM products p
        LEFT JOIN (
          SELECT oi.product_id, SUM(oi.quantity) as "total_qty"
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.store_id = ${storeId} AND o.status = 'COMPLETED'
          AND o.created_at >= ${(now.getTime() - 30 * 86400000)}
          GROUP BY oi.product_id
        ) v ON v.product_id = p.id
        WHERE p.store_id = ${storeId} AND p.is_active = 1 AND p.current_stock = 0
        ORDER BY v.total_qty DESC
      `)),

      // 7. PUNTO DE EQUILIBRIO
      safe('breakeven', () => db.$queryRawUnsafe(`
        SELECT COALESCE(SUM(amount), 0) as "fixedCosts"
        FROM expenses WHERE store_id = ${storeId}
        AND date >= ${monthStart.getTime()} AND date <= ${todayEnd.getTime()}
      `)),

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

      // 12. IMPUESTOS — Expenses with category IMPUESTOS
      safe('taxes', () => db.expense.findMany({
        where: { storeId, category: 'IMPUESTOS', ...(dateFilter ? { date: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        orderBy: { date: 'desc' }
      })),

      // 13. GASTOS OPERACIONALES (Salidas de caja)
      safe('expenses', () => db.expense.findMany({
        where: { storeId, ...(dateFilter ? { date: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        orderBy: { date: 'desc' }
      })),

      // 14. DESCUENTOS
      safe('discounts', () => db.order.findMany({
        where: { storeId, discountAmount: { gt: 0 }, status: 'COMPLETED', ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
      })),

      // 15. TRAZABILIDAD — All movements
      safe('traceability', () => db.inventoryMovement.findMany({
        where: { storeId, ...(dateFilter ? { createdAt: dateFilter } : { createdAt: { gte: monthStart, lte: todayEnd } }) },
        include: { product: { select: { name: true, category: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 200
      })),

      // 16. CxC — Customer debts
      safe('debts', () => db.customer.findMany({
        where: { storeId, totalDebt: { gt: 0 } },
        select: { id: true, name: true, phone: true, totalDebt: true },
        orderBy: { totalDebt: 'desc' }
      })),

      // 17. COTIZACIONES — Pending orders (as quotes proxy)
      safe('quotes', () => db.order.findMany({
        where: { storeId, status: 'PENDING', ...(dateFilter ? { createdAt: dateFilter } : {}) },
        include: {
          orderItems: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
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

    const N = (v: bigint | number | null | undefined) => Number(v ?? 0)

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

    // ── 5. VENTAS ──
    const orders = Array.isArray(results[9]) ? results[9] : []
    const salesByPayment: Record<string, { count: number; total: number }> = {}
    const salesByCategory: Record<string, { qty: number; total: number }> = {}
    const salesBySource = { MESA: { count: 0, total: 0 }, POS: { count: 0, total: 0 } }
    for (const o of orders) {
      const m = o.paymentMethod
      if (!salesByPayment[m]) salesByPayment[m] = { count: 0, total: 0 }
      salesByPayment[m].count++
      salesByPayment[m].total += o.total
      if (o.tableSessionId) { salesBySource.MESA.count++; salesBySource.MESA.total += o.total }
      else { salesBySource.POS.count++; salesBySource.POS.total += o.total }
      for (const item of o.orderItems) {
        const cat = item.product?.category?.name || 'Sin categoría'
        if (!salesByCategory[cat]) salesByCategory[cat] = { qty: 0, total: 0 }
        salesByCategory[cat].qty += item.quantity
        salesByCategory[cat].total += item.totalRow
      }
    }
    const salesTotal = orders.reduce((s, o) => s + o.total, 0)

    // Top products from orders
    const productSales: Record<string, { name: string; qty: number; total: number }> = {}
    for (const o of orders) {
      for (const item of o.orderItems) {
        const name = item.product?.name || 'Eliminado'
        if (!productSales[name]) productSales[name] = { name, qty: 0, total: 0 }
        productSales[name].qty += item.quantity
        productSales[name].total += item.totalRow
      }
    }
    const topProducts = Object.values(productSales).sort((a, b) => b.total - a.total).slice(0, 20)

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
    const ivaOrdersRaw = Array.isArray(results[22]) ? results[22] : []

    // ── 18. IVA RECAUDADO ──
    const ivaOrders = ivaOrdersRaw
      .filter((o: any) => o.taxAmount > 0)
      .map((o: any) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        taxBreakdown: o.taxBreakdown ? JSON.parse(o.taxBreakdown) : [],
      }))

    const totalIva = ivaOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0)
    const totalBase = ivaOrders.reduce((sum: number, o: any) => sum + (o.subtotal || 0), 0)

    // Group by tax code for summary
    const ivaByCodeMap = new Map<string, { name: string; code: string; rate: number; base: number; amount: number }>()
    ivaOrders.forEach((o: any) => {
      const breakdown = o.taxBreakdown || []
      breakdown.forEach((t: any) => {
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
        orders: orders.slice(0, 100),
        total: salesTotal,
        orderCount: orders.length,
        avgTicket: orders.length > 0 ? Math.round(salesTotal / orders.length) : 0,
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
      ivaCollected,
    })
  } catch (error) {
    console.error('GET /api/reports/informes error:', error)
    return NextResponse.json({ error: 'Error al generar informes', detail: String(error) }, { status: 500 })
  }
}
