'use client'

import { useQuery } from '@tanstack/react-query'

export interface DashboardKPIS {
  sales: {
    today: number; yesterday: number; variance: number
    thisMonth: number; lastMonth: number; monthVariance: number
    thisYear: number
  }
  profitability: {
    today: { revenue: number; cogs: number; grossProfit: number; margin: number; avgTicket: number }
    month: { revenue: number; cogs: number; grossProfit: number; margin: number; netRevenue: number; netProfit: number; discounts: number; tips: number }
    year: { revenue: number; cogs: number; grossProfit: number; margin: number }
  }
  inventory: { totalCost: number; daysOfInventory: number; avgDailyCOGS: number }
  losses: { outOfStockCount: number; outOfStockValue: number; estimatedLostDailyRevenue: number; estimatedLostMonthlyRevenue: number }
  breakEven: { monthlyFixedCosts: number; variableCostRatio: number; contributionMargin: number; breakEvenPoint: number; distanceToBreakEven: number; achievedPercent: number }
  operational: { ordersToday: number; ordersThisMonth: number; avgTicketMonth: number; totalDebt: number; openTablesCount: number; openTables: any[] }
}

export interface DashboardData {
  kpis: DashboardKPIS
  salesByDay: { date: string; total: number }[]
  topProducts: Array<{
    product: { id: number; name: string; imgUrl?: string | null } | null
    totalQuantity: number
    totalRevenue: number
    totalCOGS: number
    grossProfit: number
    marginPercent: number
  }>
  lowStockProducts: Array<{ id: number; name: string; currentStock: number; minStock: number }>
  recentOrders: Array<{
    id: number; orderNumber: string; status: string; total: number; customerName: string | null; createdAt: string
  }>
}

export function useDashboard(storeId: number | undefined | null) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
