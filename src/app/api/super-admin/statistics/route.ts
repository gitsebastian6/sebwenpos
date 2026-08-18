import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { sql } from '@/lib/db-dialect'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const now = new Date()

    // ─── 1. Store counts by subscription status ───
    const [totalStores, activeStores, trialStores, pastDueStores, cancelledStores, expiredStores, branches] = await Promise.all([
      db.store.count({ where: { parentStoreId: null } }),
      db.store.count({ where: { parentStoreId: null, subscription: { status: 'ACTIVE' } } }),
      db.store.count({ where: { parentStoreId: null, subscription: { status: 'TRIAL' } } }),
      db.store.count({ where: { parentStoreId: null, subscription: { status: 'PAST_DUE' } } }),
      db.store.count({ where: { parentStoreId: null, subscription: { status: 'CANCELLED' } } }),
      db.store.count({ where: { parentStoreId: null, subscription: { status: 'EXPIRED' } } }),
      db.store.count({ where: { parentStoreId: { not: null } } }),
    ])

    // ─── 2. Subscription distribution by plan ───
    const planDistribution = await db.subscription.groupBy({
      by: ['planId'],
      where: { store: { parentStoreId: null } },
      _count: { id: true },
    })

    const planIds = planDistribution.map(p => p.planId)
    const planNames = planIds.length > 0
      ? await db.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true, price: true } })
      : []

    const planBreakdown = planDistribution.map(p => {
      const plan = planNames.find(pn => pn.id === p.planId)
      return { planId: p.planId, planName: plan?.name || 'Desconocido', price: plan?.price || 0, count: p._count.id }
    })

    // ─── 3. Global metrics across all stores ───
    const [totalOrders, totalEmployees, totalProducts, totalCustomers, totalInvoices] = await Promise.all([
      db.order.count({ where: { store: { parentStoreId: null } } }),
      db.employee.count({ where: { store: { parentStoreId: null } } }),
      db.product.count({ where: { store: { parentStoreId: null } } }),
      db.customer.count({ where: { store: { parentStoreId: null } } }),
      db.invoice.count({ where: { store: { parentStoreId: null } } }),
    ])

    // ─── 4. Revenue from active subscriptions (MRR) ───
    const activeSubscriptions = await db.subscription.findMany({
      where: { status: 'ACTIVE', store: { parentStoreId: null } },
      include: { plan: { select: { price: true } } },
    })

    const monthlyRevenue = activeSubscriptions.reduce((sum, s) => sum + (s.plan.price || 0), 0)
    const annualRevenueEstimate = monthlyRevenue * 12

    // ─── 5. Trial → Paid conversion rate (from SubscriptionHistory — source of truth) ───
    // Find all distinct stores that ever had a TRIAL_STARTED event in their subscription history
    const trialHistories = await db.subscriptionHistory.findMany({
      where: { eventType: 'TRIAL_STARTED' },
      select: { storeId: true },
      distinct: ['storeId'],
    })
    const trialStoreIds = trialHistories.map(h => h.storeId)
    const trialCount = trialStoreIds.length

    // Of those trial stores, how many are now ACTIVE (converted to paid)?
    let convertedCount = 0
    if (trialCount > 0) {
      // Use main stores only (not branches)
      const converted = await db.subscription.findMany({
        where: {
          storeId: { in: trialStoreIds },
          status: 'ACTIVE',
          store: { parentStoreId: null },
        },
        select: { storeId: true },
      })
      convertedCount = converted.length
    }
    const conversionRate = trialCount > 0 ? Math.round((convertedCount / trialCount) * 100) : 0

    // ─── 6. Pending payment receipts ───
    const pendingReceipts = await db.paymentReceipt.count({ where: { status: 'PENDING' } })

    // ─── 7. MORA: Detailed overdue analysis ───
    // Two states:
    //   a) "En período de gracia" — PAST_DUE with graceEndDate still in the future (3-day window)
    //   b) "En mora" — EXPIRED or PAST_DUE with graceEndDate passed (true mora, forward-looking)
    const moraData = await db.subscription.findMany({
      where: {
        status: { in: ['PAST_DUE', 'EXPIRED'] },
        store: { parentStoreId: null },
      },
      include: {
        plan: { select: { name: true, price: true } },
        store: { select: { id: true, name: true, nit: true, phone: true, user: { select: { fullName: true, email: true, phone: true } } } },
      },
    })

    const gracePeriodStores: Array<{
      storeId: number; storeName: string; storeNit: string | null;
      planName: string; planPrice: number;
      graceEndDate: Date; daysRemaining: number;
      endDate: Date; daysSinceExpiry: number;
    }> = []

    const moraStores: Array<{
      storeId: number; storeName: string; storeNit: string | null;
      planName: string; planPrice: number;
      status: string; endDate: Date | null;
      daysInMora: number; revenueAtRisk: number;
      contactName: string | null; contactPhone: string | null; contactEmail: string | null;
    }> = []

    let moraRevenueAtRisk = 0

    for (const sub of moraData) {
      const store = sub.store
      const daysSinceExpiry = sub.endDate
        ? Math.floor((now.getTime() - new Date(sub.endDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0

      if (sub.status === 'PAST_DUE' && sub.graceEndDate && new Date(sub.graceEndDate) > now) {
        // Still within grace period
        const daysRemaining = Math.ceil((new Date(sub.graceEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        gracePeriodStores.push({
          storeId: store.id,
          storeName: store.name,
          storeNit: store.nit,
          planName: sub.plan.name,
          planPrice: sub.plan.price,
          graceEndDate: new Date(sub.graceEndDate),
          daysRemaining,
          endDate: new Date(sub.endDate!),
          daysSinceExpiry,
        })
      } else {
        // In true mora: EXPIRED or PAST_DUE with grace period ended
        moraRevenueAtRisk += sub.plan.price || 0
        moraStores.push({
          storeId: store.id,
          storeName: store.name,
          storeNit: store.nit,
          planName: sub.plan.name,
          planPrice: sub.plan.price,
          status: sub.status,
          endDate: sub.endDate ? new Date(sub.endDate) : null,
          daysInMora: daysSinceExpiry > 0 ? daysSinceExpiry : 0,
          revenueAtRisk: sub.plan.price || 0,
          contactName: store.user?.fullName || null,
          contactPhone: store.user?.phone || null,
          contactEmail: store.user?.email || null,
        })
      }
    }

    // Sort mora stores by severity (most days in mora first)
    moraStores.sort((a, b) => b.daysInMora - a.daysInMora)

    // ─── 8. Historical: Store registrations by month (12 months) ───
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    twelveMonthsAgo.setDate(1)
    twelveMonthsAgo.setHours(0, 0, 0, 0)

    const monthlyStores = await db.$queryRawUnsafe(`
      SELECT ${sql.monthCol('created_at')} as month, COUNT(*) as count
      FROM stores
      WHERE parent_store_id IS NULL AND created_at >= '${twelveMonthsAgo.toISOString()}'
      GROUP BY ${sql.monthCol('created_at')}
      ORDER BY month ASC
    `)

    // ─── 9. Historical: Revenue by month (from billing records) ───
    const monthlyRevenueHistory = await db.$queryRawUnsafe(`
      SELECT ${sql.monthCol('period_start')} as month,
             SUM(CASE WHEN status = 'PAID' THEN net_amount ELSE 0 END) as revenue,
             COUNT(*) as billing_count,
             SUM(CASE WHEN status = 'PENDING' THEN net_amount ELSE 0 END) as pending_amount
      FROM billing_records
      WHERE period_start >= '${twelveMonthsAgo.toISOString()}'
      GROUP BY ${sql.monthCol('period_start')}
      ORDER BY month ASC
    `)

    // ─── 10. Historical: Orders by month (12 months) ───
    const monthlyOrders = await db.$queryRawUnsafe(`
      SELECT ${sql.monthCol('created_at')} as month,
             COUNT(*) as count,
             SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END) as total_sales
      FROM orders
      WHERE created_at >= '${twelveMonthsAgo.toISOString()}'
      GROUP BY ${sql.monthCol('created_at')}
      ORDER BY month ASC
    `)

    // ─── 11. Historical: Customer growth by month ───
    const monthlyCustomers = await db.$queryRawUnsafe(`
      SELECT ${sql.monthCol('created_at')} as month, COUNT(*) as count
      FROM customers
      WHERE created_at >= '${twelveMonthsAgo.toISOString()}'
      GROUP BY ${sql.monthCol('created_at')}
      ORDER BY month ASC
    `)

    // ─── 12. Event timeline: Store lifecycle events (last 90 days) ───
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const recentEvents = await db.storeEventLog.findMany({
      where: { createdAt: { gte: ninetyDaysAgo } },
      include: {
        store: { select: { name: true, parentStoreId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const eventTimeline = recentEvents.map(e => ({
      id: e.id,
      eventType: e.eventType,
      storeName: e.store.name,
      isBranch: e.store.parentStoreId !== null,
      newValue: e.newValue,
      previousValue: e.previousValue,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }))

    // ─── 13. Churn data: cancellations and reactivations by month ───
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const churnByMonth = await db.$queryRawUnsafe(`
      SELECT ${sql.monthCol('created_at')} as month,
             SUM(CASE WHEN event_type = 'SUBSCRIPTION_CANCELLED' THEN 1 ELSE 0 END) as cancelled,
             SUM(CASE WHEN event_type = 'SUBSCRIPTION_REACTIVATED' THEN 1 ELSE 0 END) as reactivated,
             SUM(CASE WHEN event_type = 'SUBSCRIPTION_PAST_DUE' THEN 1 ELSE 0 END) as past_due
      FROM store_event_logs
      WHERE created_at >= '${sixMonthsAgo.toISOString()}'
        AND event_type IN ('SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_REACTIVATED', 'SUBSCRIPTION_PAST_DUE')
      GROUP BY ${sql.monthCol('created_at')}
      ORDER BY month ASC
    `)

    // ─── 14. Recent activity (last 7 days) ───
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const [recentNewStores, recentOrders, recentInvoices] = await Promise.all([
      db.store.count({ where: { parentStoreId: null, createdAt: { gte: sevenDaysAgo } } }),
      db.order.count({ where: { store: { parentStoreId: null }, createdAt: { gte: sevenDaysAgo } } }),
      db.invoice.count({ where: { store: { parentStoreId: null }, createdAt: { gte: sevenDaysAgo } } }),
    ])

    // ─── 15. Top stores by orders (last 30 days) ───
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // NOTE: aliases must be double-quoted to keep camelCase in the result set —
    // PostgreSQL folds unquoted identifiers to lowercase (SQLite doesn't), and
    // a SELECT alias can't be referenced in HAVING (only in ORDER BY) — this
    // query previously only worked against the SQLite dev database.
    const topStores = await db.$queryRawUnsafe(`
      SELECT s.id as "storeId", s.name as "storeName", COUNT(o.id) as "orderCount",
             SUM(CASE WHEN o.status != 'CANCELLED' THEN o.total ELSE 0 END) as "totalSales"
      FROM stores s
      LEFT JOIN orders o ON o.store_id = s.id AND o.created_at >= '${thirtyDaysAgo.toISOString()}'
      WHERE s.parent_store_id IS NULL
      GROUP BY s.id, s.name
      HAVING COUNT(o.id) > 0
      ORDER BY "orderCount" DESC
      LIMIT 10
    `)

    // ─── 16. Accumulated totals (cumulative growth) ───
    const totalRevenueCollected = await db.billingRecord.aggregate({
      where: { status: 'PAID' },
      _sum: { netAmount: true },
    })

    const totalRevenuePending = await db.billingRecord.aggregate({
      where: { status: 'PENDING' },
      _sum: { netAmount: true },
    })

    return NextResponse.json({
      overview: {
        totalStores,
        activeStores,
        trialStores,
        pastDueStores,
        expiredStores,
        cancelledStores,
        branches,
      },
      subscription: {
        planBreakdown,
        monthlyRevenue,
        annualRevenueEstimate,
        trialCount,
        convertedCount,
        conversionRate,
        pendingReceipts,
      },
      mora: {
        gracePeriodCount: gracePeriodStores.length,
        moraCount: moraStores.length,
        revenueAtRisk: moraRevenueAtRisk,
        gracePeriodStores,
        moraStores,
      },
      globalMetrics: {
        totalOrders,
        totalEmployees,
        totalProducts,
        totalCustomers,
        totalInvoices,
      },
      revenue: {
        totalCollected: totalRevenueCollected._sum.netAmount || 0,
        totalPending: totalRevenuePending._sum.netAmount || 0,
        monthlyHistory: monthlyRevenueHistory,
      },
      monthlyStores,
      monthlyOrders,
      monthlyCustomers,
      churnByMonth,
      eventTimeline,
      recentActivity: {
        newStores: recentNewStores,
        newOrders: recentOrders,
        newInvoices: recentInvoices,
      },
      topStores,
    })
  } catch (error) {
    logger.error('Error fetching statistics:', error)
    return NextResponse.json({ error: 'Error al cargar estadísticas' }, { status: 500 })
  }
}
