'use client'

import type { QueryClient } from '@tanstack/react-query'
import { queryFetch } from '@/hooks/api/query-helpers'
import { toast } from 'sonner'
import {
  printDailySummary,
  printProductCatalog,
  printKardex,
  type DailySummaryData,
  type ProductCatalogData,
  type KardexData,
} from '@/lib/print-ticket'

interface StoreInfo {
  id: number
  name: string
  nit?: string | null
}

interface DailyReportResponse {
  date: string
  orders: { total: number; completed: number; cancelled: number }
  sales: { total: number; subtotal: number; tips: number }
  byPayment: Record<string, { count: number; total: number; tips: number }>
  topProducts: Array<{ name: string; quantity: number; total: number }>
  cash: { openingBalance: number; expectedCash: number }
  services: number
}

interface ProductsCatalogResponse {
  data?: Array<{ name: string; category: { name: string } | null; salePrice: number; currentStock: number; sku: string | null }>
  [key: number]: unknown
}

interface KardexResponse {
  movements: KardexData['movements']
}

export async function handlePrintDailySummary(queryClient: QueryClient, store: StoreInfo, currencyCode: string) {
  if (!store.id) return
  try {
    const data = await queryClient.fetchQuery<DailyReportResponse>({
      queryKey: ['daily-report', store.id],
      queryFn: () => queryFetch<DailyReportResponse>(`/api/reports/daily?storeId=${store.id}`),
      staleTime: 60_000,
    })
    const printData: DailySummaryData = {
      storeName: store.name,
      storeNIT: store.nit || undefined,
      date: data.date,
      totalOrders: data.orders.total,
      completedOrders: data.orders.completed,
      cancelledOrders: data.orders.cancelled,
      totalSales: data.sales.total,
      subtotal: data.sales.subtotal,
      tips: data.sales.tips,
      paymentBreakdown: Object.entries(data.byPayment).map(([method, d]: [string, any]) => ({
        method,
        count: d.count,
        total: d.total,
        tips: d.tips,
      })),
      topProducts: data.topProducts.map((p: { name: string; quantity: number; total: number }) => p),
      openingBalance: data.cash.openingBalance,
      expectedCash: data.cash.expectedCash,
      services: data.services,
      currencyCode,
    }
    printDailySummary(printData)
  } catch { toast.error('Error al generar corte Z') }
}

export async function handlePrintCatalog(queryClient: QueryClient, store: StoreInfo, currencyCode: string) {
  if (!store.id) return
  try {
    const data = await queryClient.fetchQuery<ProductsCatalogResponse>({
      queryKey: ['products-catalog', store.id],
      queryFn: () => queryFetch<ProductsCatalogResponse>(`/api/products?storeId=${store.id}&active=true&limit=500`),
      staleTime: 120_000,
    })
    const rawProducts = Array.isArray(data) ? data : (data.data || [])
    const products = rawProducts.map((p: { name: string; category: { name: string } | null; salePrice: number; currentStock: number; sku: string | null }) => ({
      name: p.name,
      category: p.category?.name || 'Sin Categoría',
      price: p.salePrice,
      stock: p.currentStock,
      sku: p.sku,
    }))
    const printData: ProductCatalogData = {
      storeName: store.name,
      storeNIT: store.nit || undefined,
      products,
      currencyCode,
    }
    printProductCatalog(printData)
  } catch { toast.error('Error al generar catálogo') }
}

export async function handlePrintKardex(
  queryClient: QueryClient,
  store: StoreInfo,
  productId: number,
  productName: string,
  category: string,
  sku?: string | null,
  currencyCode?: string,
) {
  if (!store.id) return
  try {
    const data = await queryClient.fetchQuery<KardexResponse>({
      queryKey: ['kardex-print', productId, store.id],
      queryFn: () => queryFetch<KardexResponse>(`/api/inventory/kardex?storeId=${store.id}&productId=${productId}`),
      staleTime: 30_000,
    })
    const printData: KardexData = {
      storeName: store.name,
      productName,
      category,
      sku,
      movements: data.movements,
      currencyCode: currencyCode || 'COP',
    }
    printKardex(printData)
  } catch { toast.error('Error al generar kardex') }
}
