'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { playError } from '@/lib/pos-sounds'
import type { ProductSummary, Service as ServiceType, CategorySummary, CustomerSummary } from '@/types'

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

  // ── Tables state ──
  const [tables, setTables] = useState<BarTable[]>([])
  const [tablesLoading, setTablesLoading] = useState(true)

  // ── Session detail state ──
  const [session, setSession] = useState<TableSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)

  // ── Products / services / categories for comanda ──
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  // ── Customers ──
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)

  // ── Open cash registers ──
  const [openCashRegisters, setOpenCashRegisters] = useState<OpenCashRegister[]>([])
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('auto')

  // ── Table management state ──
  const [togglingTableId, setTogglingTableId] = useState<number | null>(null)
  const [deletingTableId, setDeletingTableId] = useState<number | null>(null)
  const [deleteTableSaving, setDeleteTableSaving] = useState(false)
  const [addTableSaving, setAddTableSaving] = useState(false)

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    if (!storeId) return
    setTablesLoading(true)
    try {
      const res = await fetch(`/api/tables?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error cargando mesas')
      const data = await res.json()
      setTables(data)
    } catch {
      toast.error('Error al cargar mesas')
    } finally {
      setTablesLoading(false)
    }
  }, [storeId])

  const fetchSession = useCallback(async (sessionId: number) => {
    setSessionLoading(true)
    try {
      const res = await fetch(`/api/tables/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Error cargando sesión')
      const data = await res.json()
      setSession(data)
    } catch {
      toast.error('Error al cargar la sesión')
    } finally {
      setSessionLoading(false)
    }
  }, [])

  const fetchCustomers = useCallback(async () => {
    if (!storeId) return
    setCustomersLoading(true)
    try {
      const res = await fetch(`/api/customers?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error')
      const json = await res.json()
      setCustomers(Array.isArray(json) ? json : (json.data || []))
    } catch {
      // silently fail - customers are optional
    } finally {
      setCustomersLoading(false)
    }
  }, [storeId])

  const fetchProducts = useCallback(async (query?: string, categoryId?: string) => {
    if (!storeId) return
    setProductsLoading(true)
    try {
      const params = new URLSearchParams({
        storeId: String(storeId),
        active: 'true',
      })
      if (query) params.set('q', query)
      if (categoryId && categoryId !== 'all') params.set('categoryId', categoryId)
      const res = await fetch(`/api/products?${params.toString()}`)
      if (!res.ok) throw new Error('Error')
      const json = await res.json()
      setProducts(Array.isArray(json) ? json : (json.data || []))
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setProductsLoading(false)
    }
  }, [storeId])

  const fetchCategories = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/categories?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setCategories(data)
    } catch {
      // silently fail
    }
  }, [storeId])

  const fetchServices = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/services?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setServices(data.filter((s: Service) => s.isActive))
    } catch {
      // silently fail
    }
  }, [storeId])

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
          openingBalance: s.shift.openingBalance,
        })))
      }
    } catch { /* silent */ }
  }, [storeId])

  // ─── Effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchOpenCashRegisters()
  }, [fetchOpenCashRegisters])

  // ─── Table Management ─────────────────────────────────────────────────

  async function handleToggleTableActive(table: BarTable, e: React.MouseEvent) {
    e.stopPropagation()
    if (table.activeSession) {
      toast.error('No se puede desactivar una mesa con sesión abierta')
      return
    }
    setTogglingTableId(table.id)
    try {
      const res = await fetch(`/api/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !table.isActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar mesa')
      }
      toast.success(table.isActive ? 'Mesa desactivada' : 'Mesa activada')
      fetchTables()
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
      const res = await fetch(`/api/tables/${deletingTableId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al eliminar mesa')
      }
      toast.success('Mesa eliminada exitosamente')
      fetchTables()
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

      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear mesa')
      }

      toast.success('Mesa creada exitosamente')
      fetchTables()
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
