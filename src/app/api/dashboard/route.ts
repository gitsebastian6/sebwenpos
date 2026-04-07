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
      db.product.findMany({
        where: {
          storeId: storeIdNum,
          isActive: true,
          currentStock: { lte: 10 }, // reasonable threshold
        },
        orderBy: { currentStock: 'asc' },
        take: 20,
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          minStock: true,
          imgUrl: true,
        },
      }),

      // recentOrders: last 10 orders
      db.order.findMany({
        where: { storeId: storeIdNum },
        include: {
          customer: {
            select: { id: true, name: true },
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
        // Calculate 7 days ago
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        sevenDaysAgo.setHours(0, 0, 0, 0)

        return db.$queryRawUnsafe<Array<{ day: string; total: number | null }>>(`
          SELECT DATE(created_at) as day, SUM(total) as total
          FROM orders
          WHERE store_id = ${storeIdNum}
            AND status = 'COMPLETED'
            AND created_at >= '${sevenDaysAgo.toISOString()}'
          GROUP BY DATE(created_at)
          ORDER BY day ASC
        `)
      })(),
    ])

    // Enrich topProducts with product names
    const topProductIds = topProductsResult.map((p) => p.productId)
    const topProductData = topProductIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true, imgUrl: true },
        })
      : []

    const topProductMap = new Map(topProductData.map((p) => [p.id, p]))
    const topProducts = topProductsResult.map((item) => ({
      product: topProductMap.get(item.productId),
      totalQuantity: item._sum.quantity,
      totalRevenue: item._sum.totalRow,
    }))

    // Build sales by day with zeros for missing days
    const salesByDayMap = new Map(
      salesByDayResult.map((row) => [row.day.split('T')[0], row.total ?? 0])
    )
    const salesByDay = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      salesByDay.push({
        date: dateStr,
        total: salesByDayMap.get(dateStr) ?? 0,
      })
    }

    return NextResponse.json({
      totalSalesToday: totalSalesTodayResult._sum.total ?? 0,
      totalOrdersToday: totalOrdersTodayResult,
      lowStockProducts,
      recentOrders,
      topProducts,
      totalDebt: totalDebtResult._sum.totalDebt ?? 0,
      salesByDay,
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 })
  }
}
