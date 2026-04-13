'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'

// ── Types ───────────────────────────────────────────────

interface KPIS {
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
  kpis: KPIS
  salesByDay: { date: string; total: number }[]
  topProducts: Array<{ product: { id: number; name: string; imgUrl?: string | null } | null; totalQuantity: number; totalRevenue: number; totalCOGS: number; grossProfit: number; marginPercent: number }>
  lowStockProducts: Array<{ id: number; name: string; currentStock: number; minStock: number }>
  recentOrders: Array<{ id: number; orderNumber: string; status: string; total: number; customerName: string | null; createdAt: string }>
}

// ── Hook ────────────────────────────────────────────────

export function useDashboardKPIs() {
  const store = useAuthStore((s) => s.store)
  const queryClient = useQueryClient()

  const query = useQuery<DashboardData>({
    queryKey: ['dashboard', 'kpis', store?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?storeId=${store!.id}`)
      if (!res.ok) throw new Error('Error al cargar KPIs')
      return res.json()
    },
    enabled: !!store?.id,
    refetchInterval: 60_000,
  })

  return {
    data: query.data,
    kpis: query.data?.kpis ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', store?.id] }),
  }
}
