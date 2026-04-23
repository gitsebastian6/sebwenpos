'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { playError } from '@/lib/pos-sounds'
import type { ProductSummary, Service, CategorySummary, CustomerSummary } from '@/types'
import {
  usePosProducts,
  usePosServices,
  usePosCashRegister,
  usePosRecentSales,
} from '@/hooks/api/use-pos'
import { useCategories } from '@/hooks/api/use-categories'
import { useCustomers } from '@/hooks/api/use-customers'

// ─── Types ──────────────────────────────────────────────

// NOTE: local Product alias intentionally kept — uses `categoryId` and `currentStock` (non-optional) which differ from ProductSummary
export type Product = ProductSummary & { currentStock: number; categoryId: number | null }

export interface OpenCashRegister {
  id: number
  user: { fullName: string | null }
  openedAt: string
  openingBalance: number
}

export interface RecentOrder {
  id: number
  orderNumber: string
  customerName: string | null
  status: string
  total: number
  createdAt: string
  orderItems: Array<{ productName: string; quantity: number; totalRow: number }>
}

// ─── Hook ──────────────────────────────────────────────

export function usePosData({ storeId }: { storeId: number | undefined }) {
  // ───────────── TanStack Query ────────────────────────────────────────

  // Products
  const productsQuery = usePosProducts(storeId)
  const products = (productsQuery.data ?? []) as Product[]
  const isLoadingProducts = productsQuery.isLoading

  // Services
  const servicesQuery = usePosServices(storeId)
  const services = (servicesQuery.data ?? []) as Service[]

  // Categories
  const categoriesQuery = useCategories(storeId)
  const categoriesRaw = categoriesQuery.data
  const categories = (Array.isArray(categoriesRaw) ? categoriesRaw : []) as CategorySummary[]

  // Customers
  const customersQuery = useCustomers(storeId, { limit: 200 })
  const customersRaw = customersQuery.data
  const customers = Array.isArray(customersRaw)
    ? (customersRaw as CustomerSummary[])
    : ((customersRaw as any)?.data ?? []) as CustomerSummary[]
  const isLoadingCustomers = customersQuery.isLoading

  // Cash registers
  const cashRegQuery = usePosCashRegister(storeId)
  const cashRegData = cashRegQuery.data
  const cashRegShifts = cashRegData?.shifts ?? []
  const openCashRegisters = cashRegShifts.map(
    (s: any) => ({
      id: s.shift.id,
      user: s.shift.user,
      openedAt: s.shift.openedAt,
      openingBalance: s.shift.openingBalance,
    }) as OpenCashRegister
  )

  // Recent sales
  const recentSalesQuery = usePosRecentSales(storeId)
  const recentOrders = (recentSalesQuery.data ?? []) as RecentOrder[]
  const loadingRecentSales = recentSalesQuery.isLoading

  // ───────────── Local state ───────────────────────────────────────────

  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('auto')
  const [recentSalesSearch, setRecentSalesSearch] = useState('')

  // ───────────── Imperative fetch functions (backward compat) ──────────

  const fetchOpenCashRegisters = useCallback(() => {
    cashRegQuery.refetch()
  }, [cashRegQuery])

  const fetchProducts = useCallback(() => {
    productsQuery.refetch()
  }, [productsQuery])

  const fetchRecentSales = useCallback(() => {
    recentSalesQuery.refetch()
  }, [recentSalesQuery])

  return {
    products,
    services,
    categories,
    customers,
    openCashRegisters,
    selectedCashRegisterId,
    setSelectedCashRegisterId,
    isLoadingProducts,
    fetchProducts,
    fetchOpenCashRegisters,
    fetchRecentSales,
    recentOrders,
    loadingRecentSales,
    recentSalesSearch,
    setRecentSalesSearch,
  }
}
