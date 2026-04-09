import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/dashboard?storeId=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const storeIdNum = parseInt(storeId)

    // Get today's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // Run all queries in parallel for performance
    const [
      totalSalesTodayResult,
      totalOrdersTodayResult,
      lowStockProducts,
      recentOrders,
      topProductsResult,
      totalDebtResult,
      salesByDayResult,
      openTableSessions,
      profitabilityResult,
    ] = await Promise.all([
      // totalSalesToday: sum of completed orders today
      db.order.aggregate({
        where: {
          storeId: storeIdNum,
          status: 'COMPLETED',
          createdAt: { gte: today, lte: todayEnd },
        },
        _sum: { total: true },
      }),

      // totalOrdersToday: count
      db.order.count({
        where: {
          storeId: storeIdNum,
          status: 'COMPLETED',
          createdAt: { gte: today, lte: todayEnd },
        },
      }),

      // lowStockProducts: products where currentStock <= minStock
      db.$queryRawUnsafe<Array<{
        id: number; name: string; sku: string | null;
        currentStock: number; minStock: number; imgUrl: string | null;
      }>>(`
        SELECT id, name, sku, current_stock as "currentStock", min_stock as "minStock", img_url as "imgUrl"
        FROM products
        WHERE store_id = ${storeIdNum}
          AND is_active = 1
          AND current_stock <= min_stock
        ORDER BY current_stock ASC
        LIMIT 20
      `),

      // recentOrders: last 10 orders
      db.order.findMany({
        where: { storeId: storeIdNum },
        include: {
          customer: {
            select: { id: true, name: true },
          },
          tableSession: {
            select: {
              id: true,
              barTable: { select: { number: true, name: true } },
            },
          },
          orderItems: {
            select: {
              quantity: true,
              unitPrice: true,
              totalRow: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // topProducts: top 5 products by sales quantity
      db.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            storeId: storeIdNum,
            status: 'COMPLETED',
          },
        },
        _sum: {
          quantity: true,
          totalRow: true,
        },
        orderBy: {
          _sum: { quantity: 'desc' },
        },
        take: 5,
      }),

      // totalDebt: sum of all customer debt
      db.customer.aggregate({
        where: { storeId: storeIdNum },
        _sum: { totalDebt: true },
      }),

      // salesByDay: last 7 days sales grouped by day
      (() => {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        sevenDaysAgo.setHours(0, 0, 0, 0)
        // created_at is stored as INTEGER (Unix ms) in SQLite
        // Use date(created_at/1000, 'unixepoch') to extract YYYY-MM-DD
        // Compare as integers for the date filter
        return db.$queryRawUnsafe<Array<{ day: string; total: bigint | null }>>(`
          SELECT date(created_at / 1000, 'unixepoch') as day, SUM(total) as total
          FROM orders
          WHERE store_id = ${storeIdNum}
            AND status = 'COMPLETED'
            AND created_at >= ${sevenDaysAgo.getTime()}
          GROUP BY date(created_at / 1000, 'unixepoch')
          ORDER BY day ASC
        `)
      })(),

      // Open table sessions (active tables)
      db.tableSession.findMany({
        where: { storeId: storeIdNum, status: 'OPEN' },
        include: {
          barTable: { select: { number: true, name: true, zone: true } },
          customer: { select: { name: true } },
          _count: { select: { comandaItems: true, orders: true } },
        },
        orderBy: { startedAt: 'asc' },
      }),

      // Profitability: COGS and gross profit for today
      // created_at stored as INTEGER (Unix ms), SUM returns BigInt in SQLite
      db.$queryRawUnsafe<Array<{ totalRevenue: bigint | null; totalCOGS: bigint | null; totalOrders: number | null; avgTicket: number | null }>>(`
        SELECT 
          SUM(oi.total_row) as "totalRevenue",
          SUM(p.cost_price * oi.quantity) as "totalCOGS",
          COUNT(DISTINCT oi.order_id) as "totalOrders",
          CASE WHEN COUNT(DISTINCT oi.order_id) > 0 
            THEN SUM(oi.total_row) / COUNT(DISTINCT oi.order_id) 
            ELSE 0 
          END as "avgTicket"
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.store_id = ${storeIdNum}
          AND o.status = 'COMPLETED'
          AND o.created_at >= ${today.getTime()}
          AND o.created_at <= ${todayEnd.getTime()}
      `),
    ])

    // Enrich topProducts with product names and profitability
    const topProductIds = topProductsResult.map((p) => p.productId)
    const topProductData = topProductIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true, imgUrl: true, costPrice: true, salePrice: true },
        })
      : []

    const topProductMap = new Map(topProductData.map((p) => [p.id, p]))
    const topProducts = topProductsResult.map((item) => {
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

    // Build sales by day with zeros for missing days
    const salesByDayMap = new Map(
      salesByDayResult
        .filter((row) => row.day) // filter out NULL days
        .map((row) => [row.day.split('T')[0], Number(row.total ?? 0)])
    )
    const salesByDay: Array<{ date: string; total: number }> = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      salesByDay.push({
        date: dateStr,
        total: Number(salesByDayMap.get(dateStr) ?? 0),
      })
    }

    // Financial profitability metrics (Number() to handle BigInt from raw queries)
    const totalRevenue = Number(profitabilityResult[0]?.totalRevenue ?? 0)
    const totalCOGS = Number(profitabilityResult[0]?.totalCOGS ?? 0)
    const grossProfit = totalRevenue - totalCOGS
    const grossMarginPercent = totalRevenue > 0 ? Math.round(((grossProfit / totalRevenue) * 100) * 10) / 10 : 0
    const avgTicket = Number(profitabilityResult[0]?.avgTicket ?? 0)

    // Open table sessions summary
    const openTables = openTableSessions.map(s => ({
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

    return NextResponse.json({
      totalSalesToday: Number(totalSalesTodayResult._sum.total ?? 0),
      totalOrdersToday: totalOrdersTodayResult,
      lowStockProducts: lowStockProducts.map(p => ({
        id: p.id,
        name: p.name,
        currentStock: p.currentStock,
        minStock: p.minStock,
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: Number(o.total),
        customerName: o.customer?.name ?? null,
        tableInfo: o.tableSession ? {
          tableNumber: o.tableSession.barTable.number,
          tableName: o.tableSession.barTable.name,
        } : null,
        createdAt: o.createdAt.toISOString(),
      })),
      topProducts,
      totalDebt: Number(totalDebtResult._sum.totalDebt ?? 0),
      salesByDay,
      // Financial profitability
      profitability: {
        totalRevenue,
        totalCOGS,
        grossProfit,
        grossMarginPercent,
        avgTicket,
      },
      // Open table sessions
      openTables,
      openTablesCount: openTableSessions.length,
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 })
  }
}
