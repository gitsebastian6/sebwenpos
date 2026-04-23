'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { playError } from '@/lib/pos-sounds'
import type { ProductSummary, Service as ServiceType, CategorySummary, CustomerSummary } from '@/types'
import {
  useTables,
  useTableSession,
  useCashRegisters,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
} from '@/hooks/api/use-tables'
import { useProducts } from '@/hooks/api/use-products'
import { useCategories } from '@/hooks/api/use-categories'
import { useServices } from '@/hooks/api/use-services'
import { useCustomers } from '@/hooks/api/use-customers'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BarTable {
  id: number
  storeId: number
  number: number
  name: string | null
  capacity: number
  zone: string
  isActive: boolean
  activeSession?: {
    id: number
    guests: number
    startedAt: string
    _count?: { comandaItems: number }
    totalConsumed?: number
  } | null
}

export interface TableSession {
  id: number
  storeId: number
  barTableId: number
  barTable: { id: number; number: number; name: string | null; zone: string }
  customerId: number | null
  customer?: { id: number; name: string; nit?: string } | null
  guests: number
  startedAt: string
  closedAt: string | null
  status: string
  notes: string | null
  comandaItems?: ComandaItem[]
  orders?: SessionOrder[]
}

export interface ComandaItem {
  id: number
  productId: number
  productName: string
  quantity: number
  unitPrice: number
  total: number
  status: string
  createdAt: string
  notes?: string | null
}

export interface SessionOrder {
  id: number
  orderNumber: string
  total: number
  paymentMethod: string
  createdAt: string
}

export type Product = ProductSummary
export type Service = ServiceType
export type Category = CategorySummary
export type Customer = CustomerSummary

// ─── Constants ───────────────────────────────────────────────────────────────

export const ZONES = ['PRINCIPAL', 'TERRAZA', 'VIP', 'BARRA', 'EXTERIOR'] as const

export const ZONE_STYLES: Record<string, { label: string; className: string; bg: string }> = {
  PRINCIPAL: {
    label: 'Principal',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    bg: 'bg-slate-50 dark:bg-slate-900/50',
  },
  TERRAZA: {
    label: 'Terraza',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/30',
  },
  VIP: {
    label: 'VIP',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50/50 dark:bg-amber-950/30',
  },
  BARRA: {
    label: 'Barra',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    bg: 'bg-sky-50/50 dark:bg-sky-950/30',
  },
  EXTERIOR: {
    label: 'Exterior',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    bg: 'bg-violet-50/50 dark:bg-violet-950/30',
  },
}

export const COMANDA_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Pendiente',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  SERVED: {
    label: 'Servido',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  PAID: {
    label: 'Pagado',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  CANCELLED: {
    label: 'Cancelado',
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  },
}

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo', icon: 'Banknote' },
  { value: 'DAVIPLATA', label: 'Daviplata', icon: 'Smartphone' },
  { value: 'NEQUI', label: 'Nequi', icon: 'Smartphone' },
  { value: 'CARD', label: 'Tarjeta', icon: 'CreditCard' },
  { value: 'TRANSFER', label: 'Transferencia', icon: 'ArrowRightLeft' },
  { value: 'FIADO', label: 'Fiado', icon: 'Users' },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatTimeElapsed(startedAt: string): string {
  const start = new Date(startedAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Ahora'
  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  if (hours === 0) return `${mins}min`
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function formatTime(startedAt: string): string {
  return new Date(startedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface OpenCashRegister {
  id: number
  user: { fullName: string | null }
  openingBalance: number
}

export function useTablesData() {
  const { store } = useAuthStore()
  const storeId = store?.id
  const queryClient = useQueryClient()

  // ── Session tracking state ──
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)

  // ── Product search state ──
  const [productSearchQuery, setProductSearchQuery] = useState<string>('')
  const [productCategoryId, setProductCategoryId] = useState<string>('')

  // ── Table management state ──
  const [togglingTableId, setTogglingTableId] = useState<number | null>(null)
  const [deletingTableId, setDeletingTableId] = useState<number | null>(null)
  const [deleteTableSaving, setDeleteTableSaving] = useState(false)
  const [addTableSaving, setAddTableSaving] = useState(false)

  // ── Open cash register selection ──
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('auto')

  // ───────────── TanStack Query ────────────────────────────────────────

  // Tables
  const tablesQuery = useTables(storeId)
  const tables = (tablesQuery.data ?? []) as BarTable[]
  const tablesLoading = tablesQuery.isLoading

  // Session (reactive — enables when activeSessionId is set)
  const sessionQuery = useTableSession(activeSessionId)
  const session = (sessionQuery.data ?? null) as TableSession | null
  const sessionLoading = sessionQuery.isLoading

  // Products (reactive — updates when search/categoryId changes)
  const productsQuery = useProducts(storeId, {
    active: 'true',
    search: productSearchQuery || undefined,
    categoryId: productCategoryId && productCategoryId !== 'all' ? productCategoryId : undefined,
  })
  const productsRaw = productsQuery.data
  const products = Array.isArray(productsRaw)
    ? (productsRaw as Product[])
    : ((productsRaw as any)?.data ?? []) as Product[]
  const productsLoading = productsQuery.isLoading

  // Categories
  const categoriesQuery = useCategories(storeId)
  const categories = (categoriesQuery.data ?? []) as Category[]

  // Services
  const servicesQuery = useServices(storeId)
  const servicesRaw = servicesQuery.data ?? []
  const services = (Array.isArray(servicesRaw) ? servicesRaw : []).filter((s: Service) => s.isActive) as Service[]

  // Customers
  const customersQuery = useCustomers(storeId, { limit: 200 })
  const customersRaw = customersQuery.data
  const customers = Array.isArray(customersRaw)
    ? (customersRaw as Customer[])
    : ((customersRaw as any)?.data ?? []) as Customer[]
  const customersLoading = customersQuery.isLoading

  // Cash registers
  const cashRegQuery = useCashRegisters(storeId)
  const cashRegData = cashRegQuery.data
  const shifts = cashRegData?.shifts ?? []
  const openCashRegisters = shifts.map(
    (s: any) => ({
      id: s.shift.id,
      user: s.shift.user,
      openingBalance: s.shift.openingBalance,
    }) as OpenCashRegister
  )

  // ───────────── Mutations ─────────────────────────────────────────────

  const createTableMutation = useCreateTable()
  const updateTableMutation = useUpdateTable()
  const deleteTableMutation = useDeleteTable()

  // ───────────── Imperative fetch functions (backward compat) ──────────

  const fetchTables = useCallback(() => {
    tablesQuery.refetch()
  }, [tablesQuery])

  const fetchSession = useCallback(async (sessionId: number) => {
    setActiveSessionId(sessionId)
    // Prefetch and await so the caller can await the data
    try {
      await queryClient.ensureQueryData({
        queryKey: ['table-session', sessionId],
        queryFn: async () => {
          const res = await fetch(`/api/tables/sessions/${sessionId}`)
          if (!res.ok) throw new Error('Error cargando sesión')
          return res.json()
        },
        staleTime: 5_000,
      })
    } catch {
      toast.error('Error al cargar la sesión')
    }
  }, [queryClient])

  const setSession = useCallback((s: TableSession | null) => {
    if (s) {
      setActiveSessionId(s.id)
    } else {
      setActiveSessionId(null)
    }
  }, [])

  const fetchCustomers = useCallback(() => {
    customersQuery.refetch()
  }, [customersQuery])

  const fetchProducts = useCallback((query?: string, categoryId?: string) => {
    setProductSearchQuery(query ?? '')
    setProductCategoryId(categoryId ?? '')
  }, [])

  const fetchCategories = useCallback(() => {
    categoriesQuery.refetch()
  }, [categoriesQuery])

  const fetchServices = useCallback(() => {
    servicesQuery.refetch()
  }, [servicesQuery])

  const fetchOpenCashRegisters = useCallback(() => {
    cashRegQuery.refetch()
  }, [cashRegQuery])

  // ───────────── Table Management ──────────────────────────────────────

  async function handleToggleTableActive(table: BarTable, e: React.MouseEvent) {
    e.stopPropagation()
    if (table.activeSession) {
      toast.error('No se puede desactivar una mesa con sesión abierta')
      return
    }
    setTogglingTableId(table.id)
    try {
      await updateTableMutation.mutateAsync({ id: table.id, isActive: !table.isActive })
      toast.success(table.isActive ? 'Mesa desactivada' : 'Mesa activada')
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al actualizar mesa')
    } finally {
      setTogglingTableId(null)
    }
  }

  async function handleConfirmDeleteTable() {
    if (!deletingTableId) return
    setDeleteTableSaving(true)
    try {
      await deleteTableMutation.mutateAsync(deletingTableId)
      toast.success('Mesa eliminada exitosamente')
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al eliminar mesa')
    } finally {
      setDeleteTableSaving(false)
    }
  }

  async function handleCreateTable(input: {
    number: string
    name: string
    capacity: string
    zone: string
  }): Promise<boolean> {
    if (!storeId) return false
    const number = parseInt(input.number, 10)
    if (isNaN(number) || number < 1) {
      toast.error('El número de mesa es obligatorio')
      return false
    }
    const capacity = parseInt(input.capacity, 10)
    if (isNaN(capacity) || capacity < 1) {
      toast.error('La capacidad debe ser al menos 1')
      return false
    }

    setAddTableSaving(true)
    try {
      const body: Record<string, unknown> = {
        storeId,
        number,
        capacity,
        zone: input.zone,
      }
      if (input.name.trim()) {
        body.name = input.name.trim()
      }

      await createTableMutation.mutateAsync(body)
      toast.success('Mesa creada exitosamente')
      return true
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al crear mesa')
      return false
    } finally {
      setAddTableSaving(false)
    }
  }

  function handleDeleteClick(table: BarTable, e: React.MouseEvent) {
    e.stopPropagation()
    if (table.activeSession) {
      toast.error('No se puede eliminar una mesa con sesión abierta')
      return
    }
    setDeletingTableId(table.id)
  }

  return {
    // Data
    tables,
    tablesLoading,
    session,
    sessionLoading,
    setSession,
    customers,
    customersLoading,
    products,
    productsLoading,
    services,
    categories,
    openCashRegisters,
    selectedCashRegisterId,
    setSelectedCashRegisterId,

    // Fetch functions
    fetchTables,
    fetchSession,
    fetchCustomers,
    fetchProducts,
    fetchCategories,
    fetchServices,
    fetchOpenCashRegisters,

    // Table management
    togglingTableId,
    handleToggleTableActive,
    deletingTableId,
    setDeletingTableId,
    deleteTableSaving,
    handleConfirmDeleteTable,
    handleDeleteClick,
    addTableSaving,
    handleCreateTable,
  }
}
