'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { playError } from '@/lib/pos-sounds'
import type { ProductSummary, Service, CategorySummary, CustomerSummary } from '@/types'

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
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [openCashRegisters, setOpenCashRegisters] = useState<OpenCashRegister[]>([])
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('auto')
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loadingRecentSales, setLoadingRecentSales] = useState(false)
  const [recentSalesSearch, setRecentSalesSearch] = useState('')

  // ─── Fetch open cash registers ──────────────────
  const fetchOpenCashRegisters = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/cash-register/current?storeId=${storeId}`)
      if (res.ok) {
        const data = await res.json()
        const shifts = data.shifts || []
        setOpenCashRegisters(shifts.map((s: { shift: { id: number; user: { fullName: string | null }; openedAt: string; openingBalance: number } }) => ({
          id: s.shift.id,
          user: s.shift.user,
          openedAt: s.shift.openedAt,
          openingBalance: s.shift.openingBalance,
        })))
      }
    } catch {
      // Silent fail - non-critical check
    }
  }, [storeId])

  // ─── Fetch products ──────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!storeId) return
    setIsLoadingProducts(true)
    try {
      const res = await fetch(`/api/products?storeId=${storeId}&active=true&limit=500`)
      if (!res.ok) throw new Error('Error al cargar productos')
      const json = await res.json()
      setProducts(Array.isArray(json) ? json : (json.data || []))
    } catch {
      toast.error('Error al cargar productos')
      playError()
    } finally {
      setIsLoadingProducts(false)
    }
  }, [storeId])

  // ─── Fetch services ──────────────────────────────────
  const fetchServices = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/services?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar servicios')
      const data = await res.json()
      setServices(data.filter((s: Service) => s.isActive))
    } catch {
      // Silent fail - services are optional
    }
  }, [storeId])

  // ─── Fetch categories ────────────────────────────────
  const fetchCategories = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/categories?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar categorías')
      const data = await res.json()
      setCategories(data)
    } catch {
      // Silent fail - categories are optional
    }
  }, [storeId])

  // ─── Fetch customers ─────────────────────────────────
  const fetchCustomers = useCallback(async () => {
    if (!storeId) return
    setIsLoadingCustomers(true)
    try {
      const res = await fetch(`/api/customers?storeId=${storeId}&limit=200`)
      if (!res.ok) throw new Error('Error al cargar clientes')
      const json = await res.json()
      setCustomers(Array.isArray(json) ? json : (json.data || []))
    } catch {
      // Silent fail - customers are optional
    } finally {
      setIsLoadingCustomers(false)
    }
  }, [storeId])

  // ─── Fetch recent sales ──────────────────────────────
  const fetchRecentSales = useCallback(async () => {
    if (!storeId) return
    setLoadingRecentSales(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const params = new URLSearchParams({
        storeId: storeId.toString(),
        status: 'COMPLETED',
        from: today,
        expand: 'items',
      })
      const res = await fetch(`/api/orders?${params}`)
      if (!res.ok) throw new Error('Error')
      const json = await res.json()
      const recentData = Array.isArray(json) ? json : (json.data || [])
      setRecentOrders(recentData.slice(0, 50)) // Last 50
    } catch {
      toast.error('Error al cargar ventas recientes')
    } finally {
      setLoadingRecentSales(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchProducts()
    fetchServices()
    fetchCategories()
    fetchCustomers()
    fetchOpenCashRegisters()
  }, [fetchProducts, fetchServices, fetchCategories, fetchCustomers, fetchOpenCashRegisters])

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
