import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })

    // Build date filter — SQLite stores created_at as INTEGER (Unix ms), not DateTime
    // Prisma expects DateTime objects, but SQLite compares as integers.
    // Use ISO strings for Prisma DateTime comparisons which SQLite handles correctly.
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

    // 1. Sales Summary (from orders)
    const ordersWhere: Record<string, unknown> = { storeId, status: { in: ['COMPLETED', 'CREDIT'] } }
    if (hasDateFilter) ordersWhere.createdAt = dateFilter

    const orders = await db.order.findMany({
      where: ordersWhere,
      include: {
        orderItems: {
          include: { product: { select: { id: true, name: true, category: { select: { name: true } } } } },
        },
        customer: { select: { id: true, name: true } },
        tableSession: {
          select: {
            id: true,
            barTable: { select: { number: true, name: true, zone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const totalSales = orders.reduce((s, o) => s + o.total, 0)
    const totalTips = orders.reduce((s, o) => s + (o.tipAmount || 0), 0)
    const completedOrders = orders.filter((o) => o.status === 'COMPLETED')
    const creditOrders = orders.filter((o) => o.status === 'CREDIT')
    const totalCompletedSales = completedOrders.reduce((s, o) => s + o.total, 0)
    const totalCreditSales = creditOrders.reduce((s, o) => s + o.total, 0)
    const ordersWithTips = orders.filter((o) => (o.tipAmount || 0) > 0)
    const totalOrders = orders.length

    // 2. Sales by Payment Method
    const salesByPayment: Record<string, { count: number; total: number }> = {}
    for (const order of orders) {
      const method = order.paymentMethod
      if (!salesByPayment[method]) salesByPayment[method] = { count: 0, total: 0 }
      salesByPayment[method].count++
      salesByPayment[method].total += order.total
    }

    // 3. Sales by Source (MESA vs POS)
    const salesBySource = { MESA: { count: 0, total: 0 }, POS: { count: 0, total: 0 } }
    for (const order of orders) {
      if (order.tableSessionId) {
        salesBySource.MESA.count++
        salesBySource.MESA.total += order.total
      } else {
        salesBySource.POS.count++
        salesBySource.POS.total += order.total
      }
    }

    // 4. Sales by Category
    const salesByCategory: Record<string, { quantity: number; total: number }> = {}
    for (const order of orders) {
      for (const item of order.orderItems) {
        const cat = item.product?.category?.name || 'Sin Categoría'
        if (!salesByCategory[cat]) salesByCategory[cat] = { quantity: 0, total: 0 }
        salesByCategory[cat].quantity += item.quantity
        salesByCategory[cat].total += item.totalRow
      }
    }

    // 5. Top Products
    const productSales: Record<
      string,
      { productId: number; name: string; quantity: number; total: number }
    > = {}
    for (const order of orders) {
      for (const item of order.orderItems) {
        const key = String(item.productId)
        if (!productSales[key]) {
          productSales[key] = {
            productId: item.productId,
            name: item.product?.name || 'Producto eliminado',
            quantity: 0,
            total: 0,
          }
        }
        productSales[key].quantity += item.quantity
        productSales[key].total += item.totalRow
      }
    }
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)

    // 6. Customer Debts (CxC)
    const customersWithDebt = await db.customer.findMany({
      where: { storeId, totalDebt: { gt: 0 } },
      select: { id: true, name: true, phone: true, totalDebt: true },
      orderBy: { totalDebt: 'desc' },
    })

    // 7. Inventory Status (low stock products)
    const lowStockProducts = await db.product.findMany({
      where: { storeId, isActive: true, currentStock: { lte: 5 } },
      select: {
        id: true,
        name: true,
        currentStock: true,
        minStock: true,
        salePrice: true,
        category: { select: { name: true } },
      },
      orderBy: { currentStock: 'asc' },
    })

    // 8. Inventory Valuation
    const inventoryData = await db.product.findMany({
      where: { storeId, isActive: true },
      select: { currentStock: true, costPrice: true, salePrice: true },
    })
    const totalInventoryCost = inventoryData.reduce((s, p) => s + p.currentStock * p.costPrice, 0)
    const totalInventoryRetail = inventoryData.reduce((s, p) => s + p.currentStock * p.salePrice, 0)

    // 9. Ledger Accounts summary
    const ledgerAccounts = await db.ledgerAccount.findMany({
      where: { storeId },
    })
    const accountBalances: Record<string, number> = {}
    for (const acc of ledgerAccounts) {
      const entries = await db.journalEntry.findMany({
        where: { ledgerAccountId: acc.id },
        select: { amount: true, direction: true },
      })
      let balance = 0
      for (const e of entries) {
        balance += e.direction === 'DEBIT' ? Number(e.amount) : -Number(e.amount)
      }
      accountBalances[acc.name] = balance
    }

    // 10. Services Summary (new model: ServiceTransaction has totalAmount, no commissionEarned)
    const servicesWhere: Record<string, unknown> = { storeId, status: 'COMPLETED' }
    if (hasDateFilter) servicesWhere.createdAt = dateFilter
    const serviceTxns = await db.serviceTransaction.findMany({
      where: servicesWhere,
      include: { service: { select: { name: true } } },
    })
    const totalServiceAmount = serviceTxns.reduce((s, svc) => s + Number(svc.totalAmount), 0)

    // 11. Open Tables/Sessions
    const openSessions = await db.tableSession.findMany({
      where: { storeId, status: 'OPEN' },
      include: {
        barTable: { select: { number: true, name: true } },
        comandaItems: { select: { total: true, status: true } },
      },
    })
    const openTableConsumption = openSessions.reduce((s, ses) => {
      return (
        s +
        ses.comandaItems
          .filter((i) => i.status !== 'CANCELLED')
          .reduce((si, i) => si + i.total, 0)
      )
    }, 0)

    // 12. Daily sales breakdown (last 7 days)
    // Use raw SQL for date comparison since SQLite stores created_at as INTEGER
    const dailySalesRaw = await db.$queryRawUnsafe<Array<{ day: string; total: bigint; count: bigint }>>(`
      SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') as day,
        SUM(total) as total,
        COUNT(*) as count
      FROM orders
      WHERE store_id = ${storeId}
        AND status IN ('COMPLETED', 'CREDIT')
        AND created_at >= (strftime('%s', 'now', 'localtime', '-6 days') * 1000)
      GROUP BY day
      ORDER BY day ASC
    `)

    // Fill missing days
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

    // 13. Profit calculation
    const profit = totalSales > 0 ? totalSales - Math.round(totalSales * 0.4) : 0

    return NextResponse.json({
      period: { from, to },
      sales: {
        total: totalSales,
        subtotal: totalSales - totalTips,
        tips: totalTips,
        tipsOrderCount: ordersWithTips.length,
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
      recentOrders: orders.slice(0, 50).map((o) => ({
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
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalRow: item.totalRow,
        })),
        createdAt: o.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('GET /api/reports error:', error)
    return NextResponse.json({ error: 'Error al generar informe' }, { status: 500 })
  }
}
