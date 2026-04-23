'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { queryFetch, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Response from GET /api/reports/informes — the main informes report data. */
export interface InformesData {
  localEnCifras: {
    salesToday: number
    ordersToday: number
    salesMonth: number
    ordersMonth: number
    monthVariance: number
    tipsMonth: number
    openTables: number
    totalDebt: number
    debtCount: number
    lastMonthSales: number
  }
  sales: {
    total: number
    orderCount: number
    avgTicket: number
    byPayment: Record<string, { total: number; count: number; tips?: number }>
    byCategory: Record<string, { total: number; qty: number }>
    bySource: Record<string, { total: number; count: number }>
    topProducts: Array<{ name: string; qty: number; total: number }>
  }
  profitability: {
    revenue: number
    cogs: number
    grossProfit: number
    grossMargin: number
    discounts: number
    netRevenue: number
    netProfit: number
    netMargin: number
    tips: number
  }
  purchases: {
    total: number
    items: Array<{
      id: number
      date: string
      provider: { name: string } | null
      invoiceNumber: string | null
      total: number
    }>
    byProvider: Record<string, { count: number; total: number }> | null
  }
  inventory: {
    totalCostValue: number
    totalRetailValue: number
    totalProducts: number
    daysOfInventory: number
    outOfStockCount: number
    lowStockCount: number
    avgDailyCOGS: number
  }
  lostSales: Array<{
    id: number
    name: string
    salePrice: number
    sold30d: number
    avgDaily: number
  }>
  breakEven: {
    breakEvenPoint: number
    fixedCosts: number
    variableCostRatio: number
    contributionMargin: number
    distanceToBreakEven: number
    achievedPercent: number
  }
  discounts: {
    total: number
    count: number
    items: Array<{
      id: number
      createdAt: string
      customer: { name: string } | null
      discountType: string
      discountReason: string | null
      discountAmount: number
      total: number
    }>
  }
  cashRegisters: Array<{
    id: number
    openedAt: string
    closedAt: string | null
    user: string
    openingBalance: number
    expectedCash: number | null
    closingBalance: number | null
    difference: number | null
    status: string
  }>
  commissions: {
    total: number
    count: number
    items: Array<{
      id: number
      date: string
      name: string
      quantity: number
      unitPrice: number
      total: number
    }>
  }
  expenses: {
    total: number
    count: number
    items: Array<{
      id: number
      date: string
      category: string
      description: string
      amount: number
    }>
    byCategory: Record<string, number>
  }
  taxes: {
    totalIva: number
    totalIvaCollected: number
    ivaByCode: Array<{ code: string; base: number; iva: number; total: number }>
  }
  returns: {
    total: number
    count: number
    items: Array<{
      id: number
      date: string
      orderNumber: string
      customer: string
      total: number
    }>
  }
  adjustments: {
    total: number
    count: number
    items: Array<{
      id: number
      date: string
      productName: string
      type: string
      quantity: number
      reason: string | null
    }>
  }
  traceability: Array<{
    id: number
    productId: number
    product: { name: string; salePrice: number; costPrice: number } | null
    movementType: string
    quantity: number
    notes: string | null
    createdAt: string
  }>
  quotes: Array<{
    id: number
    date: string
    customer: string
    total: number
    status: string
  }>
  invoices: Array<{
    id: number
    date: string
    number: string
    customer: string
    total: number
    status: string
  }>
  creditNotes: Array<{
    id: number
    date: string
    number: string
    concept: string
    total: number
  }>
  debts: Array<{
    id: number
    customer: string
    totalDebt: number
    ordersCount: number
  }>
}

/** Response from GET /api/reports (accounting-view reports-tab). */
export interface AccountingReportData {
  sales: {
    total: number
    orderCount: number
    avgTicket: number
    completed: number
    credit: number
    tips: number
    tipsOrderCount: number
  }
  openTables: {
    count: number
    consumption: number
  }
  salesByPayment: Record<string, { total: number; count: number }>
  salesByCategory: Record<string, { total: number; quantity: number }>
  topProducts: Array<{ productId: number; name: string; quantity: number; total: number }>
  customerDebts: Array<{ id: number; name: string; phone: string | null; totalDebt: number }>
  lowStockProducts: Array<{
    id: number
    name: string
    category: { name: string } | null
    currentStock: number
    minStock: number
    salePrice: number
  }>
  inventory: {
    totalCostValue: number
    totalRetailValue: number
    lowStockCount: number
  }
  accountBalances: Record<string, number>
  dailySales: Array<{ date: string; sales: number; orders: number }>
  profit: number
  salesBySource: Record<string, { total: number; count: number }>
  recentOrders: Array<{
    id: number
    orderNumber: string
    createdAt: string
    total: number
    paymentMethod: string
    source: string
    customer: { name: string } | null
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>
  }>
  [key: string]: unknown
}

/** Response from GET /api/reports/daily */
export interface DailyReportData {
  date: string
  orders: { total: number; completed: number; cancelled: number }
  sales: { total: number; subtotal: number; tips: number }
  byPayment: Record<string, { count: number; total: number; tips: number }>
  topProducts: Array<{ name: string; quantity: number; total: number }>
  cash: { openingBalance: number; expectedCash: number }
  services: unknown
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the main informes report for a store within a date range.
 */
export function useInformes(
  storeId: number | undefined | null,
  from?: string,
  to?: string
) {
  return useQuery<InformesData>({
    queryKey: ['informes', storeId, from, to],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (from) sp.set('from', from)
      if (to) sp.set('to', to)
      return queryFetch<InformesData>(`/api/reports/informes?${sp.toString()}`)
    },
    enabled: !!storeId && !!from && !!to,
    staleTime: 30_000,
  })
}

/**
 * Fetches the accounting report (reports-tab) for a store within a date range.
 */
export function useAccountingReport(
  storeId: number | undefined | null,
  from?: string,
  to?: string
) {
  return useQuery<AccountingReportData>({
    queryKey: ['accounting-report', storeId, from, to],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (from) sp.set('from', from)
      if (to) sp.set('to', to)
      return queryFetch<AccountingReportData>(`/api/reports?${sp.toString()}`)
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetches the daily summary report for a store.
 */
export function useDailyReport(storeId: number | undefined | null) {
  return useQuery<DailyReportData>({
    queryKey: ['daily-report', storeId],
    queryFn: async () => {
      return queryFetch<DailyReportData>(
        `/api/reports/daily?storeId=${storeId}`
      )
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Exports a report to PDF via POST /api/reports/export-pdf.
 * Returns a Blob that can be downloaded.
 */
export function useExportPdf() {
  return useMutation<Blob, Error, Record<string, unknown>>({
    mutationFn: async (body) => {
      const res = await fetch('/api/reports/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message =
          data?.error ?? `Error ${res.status}: ${res.statusText}`
        throw new Error(message)
      }
      return res.blob()
    },
  })
}
