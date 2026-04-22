'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import type { ProductSummary, Service, CategorySummary, CustomerSummary, InvoiceMode, OrderItemData } from '@/types'
import { paymentMethodLabel } from '@/lib/format'
import { playAlert, playSaleSuccess, playError } from '@/lib/pos-sounds'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Plus,
  FileText,
  Receipt,
  QrCode,
  MonitorSmartphone,
  Hash,
  Users,
  Clock,
  DollarSign,
  Search,
  ChefHat,
  CheckCircle2,
  XCircle,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  ShoppingCart,
  Wrench,
  DoorOpen,
  LogOut,
  Minus,
  Loader2,
  Smartphone,
  Trash2,
  Power,
  PowerOff,
  Star,
  Heart,
  Printer,
  AlertTriangle,
  Wallet,
  Percent,
  Tag,
  MessageSquare,
  Pencil,
  X,
} from 'lucide-react'
import { KPIBar } from '@/components/shared/kpi-bar'
import { printTicket, type TicketItem } from '@/lib/print-ticket'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BarTable {
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

interface TableSession {
  id: number
  storeId: number
  barTableId: number
  barTable: { id: number; number: number; name: string | null; zone: string }
  customerId: number | null
  customer?: { id: number; name: string } | null
  guests: number
  startedAt: string
  closedAt: string | null
  status: string
  notes: string | null
  comandaItems?: ComandaItem[]
  orders?: SessionOrder[]
}

interface ComandaItem {
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

interface SessionOrder {
  id: number
  orderNumber: string
  total: number
  paymentMethod: string
  createdAt: string
}

// Product → ProductSummary, Service, Category → CategorySummary, Customer → CustomerSummary imported from @/types
type Product = ProductSummary
type Category = CategorySummary
type Customer = CustomerSummary

// ─── Constants ───────────────────────────────────────────────────────────────

const ZONES = ['PRINCIPAL', 'TERRAZA', 'VIP', 'BARRA', 'EXTERIOR'] as const

const ZONE_STYLES: Record<string, { label: string; className: string; bg: string }> = {
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

const COMANDA_STATUS_STYLES: Record<string, { label: string; className: string }> = {
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

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo', icon: Banknote },
  { value: 'DAVIPLATA', label: 'Daviplata', icon: Smartphone },
  { value: 'NEQUI', label: 'Nequi', icon: Smartphone },
  { value: 'CARD', label: 'Tarjeta', icon: CreditCard },
  { value: 'TRANSFER', label: 'Transferencia', icon: ArrowRightLeft },
  { value: 'FIADO', label: 'Fiado', icon: Users },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeElapsed(startedAt: string): string {
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

function formatTime(startedAt: string): string {
  return new Date(startedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// paymentMethodLabel imported from @/lib/format

// ─── Main Component ──────────────────────────────────────────────────────────

export function TablesView() {
  const { store } = useAuthStore()

  // ── Tables state ──
  const [tables, setTables] = useState<BarTable[]>([])
  const [tablesLoading, setTablesLoading] = useState(true)

  // ── Session detail state ──
  const [selectedTable, setSelectedTable] = useState<BarTable | null>(null)
  const [session, setSession] = useState<TableSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // ── Add table dialog ──
  const [addTableOpen, setAddTableOpen] = useState(false)
  const [addTableSaving, setAddTableSaving] = useState(false)
  const [newTableNumber, setNewTableNumber] = useState('')
  const [newTableName, setNewTableName] = useState('')
  const [newTableCapacity, setNewTableCapacity] = useState('4')
  const [newTableZone, setNewTableZone] = useState('PRINCIPAL')

  // ── Open session dialog ──
  const [openSessionOpen, setOpenSessionOpen] = useState(false)
  const [openSessionSaving, setOpenSessionSaving] = useState(false)
  const [sessionGuests, setSessionGuests] = useState('1')
  const [sessionNotes, setSessionNotes] = useState('')
  const [sessionCustomerId, setSessionCustomerId] = useState<string>('none')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)

  // ── Payment dialog ──
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [tipAmount, setTipAmount] = useState<number>(0)
  const [showTipInput, setShowTipInput] = useState(false)
  const [lastPaymentData, setLastPaymentData] = useState<any>(null)
  const [transferRef, setTransferRef] = useState('')

  // ── Discount state ──
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENTAGE' | 'FIXED'>('NONE')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState<string>('')

  // ── Invoice mode: TIRILLA (default), DOC_EQUIPOS (equivalente POS), or ELECTRONICA (when e-invoicing enabled) ──
  const isEInvEnabled = !!store?.invoiceEnabled && !!store?.nit
  const hasStoreNit = !!store?.nit
  type InvoiceMode = 'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'
  const [tableInvoiceMode, setTableInvoiceMode] = useState<InvoiceMode>('TIRILLA')
  const [invoiceCustomerNit, setInvoiceCustomerNit] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')
  const [nitDvError, setNitDvError] = useState('')
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [lastInvoiceData, setLastInvoiceData] = useState<any>(null)
  const [lastDocType, setLastDocType] = useState<'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'>('TIRILLA')

  // ── Close session confirm ──
  const [closeSessionOpen, setCloseSessionOpen] = useState(false)
  const [closeSessionSaving, setCloseSessionSaving] = useState(false)

  // ── Add items to comanda ──
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [categories, setCategories] = useState<Category[]>([])
  const [addingItem, setAddingItem] = useState<number | null>(null)
  const [pendingItemNotes, setPendingItemNotes] = useState<string>('')

  // ── Comanda notes editing ──
  const [notesPopoverItemId, setNotesPopoverItemId] = useState<number | null>(null)
  const [notesEditText, setNotesEditText] = useState<string>('')
  const [savingNotes, setSavingNotes] = useState(false)

  // ── Comanda actions ──
  const [servingItemIds, setServingItemIds] = useState<number[]>([])

  // ── Delete table ──
  const [deletingTableId, setDeletingTableId] = useState<number | null>(null)
  const [deleteTableOpen, setDeleteTableOpen] = useState(false)
  const [deleteTableSaving, setDeleteTableSaving] = useState(false)

  // ── Toggle table active ──
  const [togglingTableId, setTogglingTableId] = useState<number | null>(null)

  // ── Time ticker ──
  const [tick, setTick] = useState(0)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Tick every 60s for time elapsed ──
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setTick((t) => t + 1)
    }, 60_000)
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [])

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    if (!store?.id) return
    setTablesLoading(true)
    try {
      const res = await fetch(`/api/tables?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error cargando mesas')
      const data = await res.json()
      setTables(data)
    } catch {
      toast.error('Error al cargar mesas')
    } finally {
      setTablesLoading(false)
    }
  }, [store?.id])

  const fetchSession = useCallback(async (sessionId: number) => {
    setSessionLoading(true)
    try {
      const res = await fetch(`/api/tables/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Error cargando sesión')
      const data = await res.json()
      setSession(data)
      setSelectedItemIds([])
    } catch {
      toast.error('Error al cargar la sesión')
    } finally {
      setSessionLoading(false)
    }
  }, [])

  const fetchCustomers = useCallback(async () => {
    if (!store?.id) return
    setCustomersLoading(true)
    try {
      const res = await fetch(`/api/customers?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error')
      const json = await res.json()
      setCustomers(Array.isArray(json) ? json : (json.data || []))
    } catch {
      // silently fail - customers are optional
    } finally {
      setCustomersLoading(false)
    }
  }, [store?.id])

  const fetchProducts = useCallback(async (query?: string, categoryId?: string) => {
    if (!store?.id) return
    setProductsLoading(true)
    try {
      const params = new URLSearchParams({
        storeId: String(store.id),
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
  }, [store?.id])

  const fetchCategories = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/categories?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setCategories(data)
    } catch {
      // silently fail
    }
  }, [store?.id])

  const fetchServices = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/services?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setServices(data.filter((s: Service) => s.isActive))
    } catch {
      // silently fail
    }
  }, [store?.id])

  // ── Open cash registers (cajas) ──
  const [openCashRegisters, setOpenCashRegisters] = useState<Array<{ id: number; user: { fullName: string | null }; openingBalance: number }>>([])
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('auto')

  const fetchOpenCashRegisters = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/cash-register/current?storeId=${store.id}`)
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
  }, [store?.id])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchOpenCashRegisters()
  }, [fetchOpenCashRegisters])

  // ─── Auto-load products when sheet opens with an active session ──
  useEffect(() => {
    if (sheetOpen && session?.status === 'OPEN') {
      fetchProducts()
      fetchCategories()
      fetchServices()
    }
  }, [sheetOpen, session?.status, fetchProducts, fetchCategories, fetchServices])

  // ─── Table Card Click ──────────────────────────────────────────────────

  async function handleTableClick(table: BarTable) {
    if (!table.isActive) return
    if (table.activeSession) {
      // Open session sheet
      setSelectedTable(table)
      setSheetOpen(true)
      setProductSearch('')
      setCategoryFilter('all')
      setPendingItemNotes('')
      await fetchSession(table.activeSession.id)
      // Also fetch products, categories and services so the comanda panel is populated
      fetchProducts()
      fetchCategories()
      fetchServices()
    } else {
      // Open session dialog
      setSelectedTable(table)
      setSessionGuests('1')
      setSessionNotes('')
      setSessionCustomerId('none')
      setOpenSessionOpen(true)
      fetchCustomers()
    }
  }

  // ─── Delete Table ─────────────────────────────────────────────────────

  function handleDeleteClick(table: BarTable, e: React.MouseEvent) {
    e.stopPropagation()
    if (table.activeSession) {
      toast.error('No se puede eliminar una mesa con sesión abierta')
      return
    }
    setDeletingTableId(table.id)
    setDeleteTableOpen(true)
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
      setDeleteTableOpen(false)
      setDeletingTableId(null)
      fetchTables()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al eliminar mesa')
    } finally {
      setDeleteTableSaving(false)
    }
  }

  // ─── Toggle Table Active ──────────────────────────────────────────────

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

  // ─── Open Session ──────────────────────────────────────────────────────

  async function handleOpenSession() {
    if (!store?.id || !selectedTable) return
    const guests = parseInt(sessionGuests, 10)
    if (isNaN(guests) || guests < 1) {
      toast.error('El número de invitados debe ser al menos 1')
      return
    }

    setOpenSessionSaving(true)
    try {
      const body: Record<string, unknown> = {
        storeId: store.id,
        barTableId: selectedTable.id,
        guests,
      }
      if (sessionCustomerId && sessionCustomerId !== 'none') {
        body.customerId = parseInt(sessionCustomerId, 10)
      }
      if (sessionNotes.trim()) {
        body.notes = sessionNotes.trim()
      }

      const res = await fetch('/api/tables/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al abrir mesa')
      }

      toast.success(`Mesa ${selectedTable.number} abierta`)
      setOpenSessionOpen(false)
      fetchTables()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al abrir mesa')
    } finally {
      setOpenSessionSaving(false)
    }
  }

  // ─── Close Session ─────────────────────────────────────────────────────

  async function handleCloseSession() {
    if (!session) return

    // Check for unpaid items
    const unpaidItems = session.comandaItems?.filter(
      (item) => item.status === 'PENDING' || item.status === 'SERVED'
    ) ?? []

    if (unpaidItems.length > 0) {
      toast.error('Hay items sin pagar. Por favor cobre todos los items antes de cerrar.')
      return
    }

    setCloseSessionSaving(true)
    try {
      const res = await fetch(`/api/tables/sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLOSE' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al cerrar mesa')
      }

      toast.success(`Mesa ${session.barTable.number} cerrada`)
      setCloseSessionOpen(false)
      setSheetOpen(false)
      setSession(null)
      setSelectedTable(null)
      fetchTables()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al cerrar mesa')
    } finally {
      setCloseSessionSaving(false)
    }
  }

  // ─── Add Item to Comanda ───────────────────────────────────────────────

  async function handleAddItem(productId: number | null, serviceId?: number | null) {
    if (!session) {
      toast.error('No hay sesión activa')
      return
    }
    if (!store?.id) {
      toast.error('No se pudo identificar la tienda')
      return
    }
    if (!productId && !serviceId) return
    // Guard: ensure storeId consistency between session and auth store
    if (session.storeId !== store.id) {
      toast.error('Error de sesión. Por favor recarga la página.')
      return
    }
    const itemId = productId ?? serviceId
    setAddingItem(itemId)
    try {
      const itemPayload: Record<string, unknown> = {
        ...(productId ? { productId } : { serviceId }),
        quantity: 1,
      }
      if (pendingItemNotes.trim()) {
        itemPayload.notes = pendingItemNotes.trim()
      }

      const res = await fetch(`/api/tables/sessions/${session.id}/comanda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          items: [itemPayload],
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al agregar item')
      }

      playAlert()
      toast.success('Item agregado a la comanda')
      setPendingItemNotes('')
      await fetchSession(session.id)
      // Refresh tables to update total
      fetchTables()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al agregar item')
    } finally {
      setAddingItem(null)
    }
  }

  // ─── Update Item Notes ────────────────────────────────────────────────

  async function handleUpdateItemNotes(itemId: number, notes: string) {
    if (!session) return
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/tables/sessions/${session.id}/comanda`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId], notes }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar nota')
      }
      toast.success('Nota actualizada')
      setNotesPopoverItemId(null)
      await fetchSession(session.id)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al actualizar nota')
    } finally {
      setSavingNotes(false)
    }
  }

  // ─── Mark Items as Served ──────────────────────────────────────────────

  async function handleMarkServed(itemIds: number[]) {
    if (!session || itemIds.length === 0) return
    setServingItemIds(itemIds)
    try {
      const res = await fetch(`/api/tables/sessions/${session.id}/comanda`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, status: 'SERVED' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al marcar como servido')
      }

      toast.success(`${itemIds.length} item${itemIds.length > 1 ? 's' : ''} marcado${itemIds.length > 1 ? 's' : ''} como servido`)
      setSelectedItemIds([])
      await fetchSession(session.id)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al marcar como servido')
    } finally {
      setServingItemIds([])
    }
  }

  // ─── Cancel Items ─────────────────────────────────────────────────────

  async function handleCancelItem(itemIds: number[]) {
    if (!session || itemIds.length === 0) return
    setServingItemIds(itemIds)
    try {
      const res = await fetch(`/api/tables/sessions/${session.id}/comanda`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, status: 'CANCELLED' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al cancelar item')
      }
      toast.success(`${itemIds.length} item${itemIds.length > 1 ? 's' : ''} cancelado${itemIds.length > 1 ? 's' : ''}`)
      setSelectedItemIds((prev) => prev.filter((id) => !itemIds.includes(id)))
      await fetchSession(session.id)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al cancelar item')
    } finally {
      setServingItemIds([])
    }
  }

  // ─── Update Item Quantity ──────────────────────────────────────────

  const [updatingQtyItemId, setUpdatingQtyItemId] = useState<number | null>(null)

  async function handleUpdateItemQuantity(itemId: number, newQuantity: number) {
    if (!session || newQuantity < 1) return
    setUpdatingQtyItemId(itemId)
    try {
      const res = await fetch(`/api/tables/sessions/${session.id}/comanda`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId], quantity: newQuantity }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar cantidad')
      }
      await fetchSession(session.id)
      fetchTables()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al actualizar cantidad')
    } finally {
      setUpdatingQtyItemId(null)
    }
  }

  // ─── Pay for Items ─────────────────────────────────────────────────────

  function handleOpenPayment() {
    if (selectedItemIds.length === 0) {
      toast.error('Selecciona items para cobrar')
      return
    }
    setPaymentMethod('CASH')
    setPaymentOpen(true)
    setTransferRef('')
    setDiscountType('NONE')
    setDiscountValue(0)
    setDiscountReason('')
    setTableInvoiceMode('TIRILLA')
    setInvoiceCustomerNit('')
    setInvoiceCustomerName('')
    setInvoiceCustomerEmail('')
    setNitDvError('')
  }

  async function handleConfirmPayment() {
    if (!session || !store?.id || selectedItemIds.length === 0) return

    // Compute discount
    const subtotal = selectedItemsTotal
    const calcDiscount = discountType === 'PERCENTAGE'
      ? Math.round(subtotal * discountValue / 100)
      : discountType === 'FIXED'
        ? Math.min(discountValue, subtotal)
        : 0

    // Block if no cash register is open — backend also validates, but catch early on frontend
    if (openCashRegisters.length === 0) {
      toast.error('Debes abrir la caja antes de procesar pagos. Ve a Contabilidad → Caja.')
      setPaymentSaving(false)
      return
    }

    // Fiado/CREDIT requires a customer
    if ((paymentMethod === 'FIADO' || paymentMethod === 'CREDIT') && !session.customerId) {
      toast.error('Para vender fiado la mesa debe tener un cliente asignado')
      setPaymentOpen(false)
      return
    }

    // Transfer/Nequi/Daviplata require reference number
    if (['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && !transferRef.trim()) {
      toast.error(`Ingresa el número de ${paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod}`)
      return
    }

    setPaymentSaving(true)
    try {
      const res = await fetch(`/api/tables/sessions/${session.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          itemIds: selectedItemIds,
          paymentMethod,
          cashRegisterId: selectedCashRegisterId !== 'auto' ? Number(selectedCashRegisterId) : undefined,
          tipAmount: (paymentMethod !== 'CREDIT' && paymentMethod !== 'FIADO') ? tipAmount : 0,
          discountType,
          discountAmount: calcDiscount,
          discountReason: discountReason.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al procesar pago')
      }

      playSaleSuccess()
      const paymentData = await res.json()
      setLastPaymentData(paymentData)
      setLastDocType(tableInvoiceMode)
      toast.success(`Pago exitoso - ${paymentMethodLabel(paymentMethod)}`)

      // ── Auto-create electronic invoice if selected ──
      if (tableInvoiceMode === 'ELECTRONICA' && isEInvEnabled && paymentData.id) {
        try {
          setCreatingInvoice(true)
          const finalNit = invoiceCustomerNit.trim()
            ? invoiceCustomerNit.trim().replace(/[^0-9]/g, '')
            : (session?.customer?.nit?.replace(/[^0-9]/g, '') || DIAN_CONSUMIDOR_FINAL_NIT)
          const finalName = invoiceCustomerName.trim() || session?.customer?.name || 'Consumidor Final'
          const finalEmail = invoiceCustomerEmail.trim() || undefined

          const invBody: Record<string, unknown> = {
            orderId: paymentData.id,
            testMode: store?.invoiceTestMode ?? true,
            customerNit: finalNit,
            customerName: finalName,
            autoSend: true,
          }
          if (finalEmail) invBody.customerEmail = finalEmail

          const invRes = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invBody),
          })
          if (invRes.ok) {
            const invoiceData = await invRes.json()
            setLastInvoiceData(invoiceData)
            toast.success(`Factura electrónica ${invoiceData.invoiceNumber} generada`, {
              description: 'CUFE generado correctamente',
              duration: 5000,
            })
          } else {
            const err = await invRes.json().catch(() => ({}))
            toast.error(`Error al generar factura: ${err.error || 'Desconocido'}`, { duration: 6000 })
          }
        } catch {
          toast.error('Error al generar factura electrónica')
        } finally {
          setCreatingInvoice(false)
        }
      }

      setPaymentOpen(false)
      setSelectedItemIds([])
      setTipAmount(0)
      setShowTipInput(false)
      setTransferRef('')
      setSelectedCashRegisterId('auto')
      setDiscountType('NONE')
      setDiscountValue(0)
      setDiscountReason('')
      await fetchSession(session.id)
      fetchTables()
      // Refresh open cash registers after successful payment
      fetchOpenCashRegisters()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al procesar pago')
    } finally {
      setPaymentSaving(false)
    }
  }

  // ─── Create Table ──────────────────────────────────────────────────────

  async function handleCreateTable() {
    if (!store?.id) return
    const number = parseInt(newTableNumber, 10)
    if (isNaN(number) || number < 1) {
      toast.error('El número de mesa es obligatorio')
      return
    }
    const capacity = parseInt(newTableCapacity, 10)
    if (isNaN(capacity) || capacity < 1) {
      toast.error('La capacidad debe ser al menos 1')
      return
    }

    setAddTableSaving(true)
    try {
      const body: Record<string, unknown> = {
        storeId: store.id,
        number,
        capacity,
        zone: newTableZone,
      }
      if (newTableName.trim()) {
        body.name = newTableName.trim()
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
      setAddTableOpen(false)
      setNewTableNumber('')
      setNewTableName('')
      setNewTableCapacity('4')
      setNewTableZone('PRINCIPAL')
      fetchTables()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al crear mesa')
    } finally {
      setAddTableSaving(false)
    }
  }

  // ─── Item Selection ────────────────────────────────────────────────────

  function toggleItemSelection(itemId: number) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    )
  }

  function selectAllPayable() {
    if (!session) return
    const payable = session.comandaItems?.filter(
      (item) => item.status === 'PENDING' || item.status === 'SERVED'
    ).map((item) => item.id) ?? []
    setSelectedItemIds(payable)
  }

  // ─── Computed values ───────────────────────────────────────────────────

  const selectedItemsTotal = session?.comandaItems
    ?.filter((item) => selectedItemIds.includes(item.id))
    .reduce((sum, item) => sum + item.total, 0) ?? 0

  const computedDiscount = discountType === 'PERCENTAGE'
    ? Math.round(selectedItemsTotal * discountValue / 100)
    : discountType === 'FIXED'
      ? Math.min(discountValue, selectedItemsTotal)
      : 0

  const hasUnpaidItems = session?.comandaItems?.some(
    (item) => item.status === 'PENDING' || item.status === 'SERVED'
  ) ?? false

  const pendingItems = session?.comandaItems?.filter((item) => item.status === 'PENDING') ?? []
  const selectedPendingItems = pendingItems.filter((item) => selectedItemIds.includes(item.id))
  const servedItems = session?.comandaItems?.filter((item) => item.status === 'SERVED') ?? []
  const selectedServedItems = servedItems.filter((item) => selectedItemIds.includes(item.id))

  const canServe = selectedPendingItems.length > 0
  const canPay = selectedItemIds.length > 0 && (selectedPendingItems.length > 0 || selectedServedItems.length > 0)

  // ── Tax estimate for selected items (Colombian tax-inclusive pricing) ──
  const taxEstimate = useMemo(() => {
    const breakdownMap = new Map<string, { name: string; code: string; rate: number; base: number; amount: number }>()
    let totalTax = 0

    const tableItems = session?.comandaItems
      ?.filter((item) => selectedItemIds.includes(item.id)) ?? []

    tableItems.forEach(item => {
      if (!item.productId) return
      const product = products.find(p => p.id === item.productId)
      const tr = product?.taxRate
      if (!tr) return

      const totalRow = item.total
      let base = totalRow
      let tax = 0

      // EXEMPT (03) or EXCLUDED (04)
      if (tr.code === '03' || tr.code === '04') {
        base = totalRow
        tax = 0
      } else if (tr.rateType === 'PERCENTAGE' && tr.rate > 0) {
        base = Math.round(totalRow / (1 + tr.rate / 100))
        tax = totalRow - base
      }

      totalTax += tax
      const existing = breakdownMap.get(tr.code)
      if (existing) {
        existing.base += base
        existing.amount += tax
      } else {
        breakdownMap.set(tr.code, { name: tr.name, code: tr.code, rate: tr.rate, base, amount: tax })
      }
    })

    return { breakdown: Array.from(breakdownMap.values()), totalTax }
  }, [session?.comandaItems, selectedItemIds, products])

  // Force re-render with tick (used in time display)
  const _tick = tick

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <KPIBar context="tables" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Mesas y Comandas</h2>
            <p className="text-sm text-muted-foreground">
              {tablesLoading ? 'Cargando...' : `${tables.length} mesa${tables.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <Button className="gap-2 shrink-0 active:scale-[0.98] transition-all" onClick={() => {
          setNewTableNumber('')
          setNewTableName('')
          setNewTableCapacity('4')
          setNewTableZone('PRINCIPAL')
          setAddTableOpen(true)
        }} >
          <Plus className="h-4 w-4" />
          Agregar Mesa
        </Button>
      </div>

      {/* ── Status Summary ──────────────────────────────────────────────── */}
      {!tablesLoading && tables.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-sm hover:shadow-sm transition-all duration-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Disponibles:</span>
            <span className="font-semibold">
              {tables.filter((t) => t.isActive && !t.activeSession).length}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-sm hover:shadow-sm transition-all duration-200">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Ocupadas:</span>
            <span className="font-semibold">
              {tables.filter((t) => t.isActive && !!t.activeSession).length}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-sm hover:shadow-sm transition-all duration-200">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Mantenimiento:</span>
            <span className="font-semibold">
              {tables.filter((t) => !t.isActive).length}
            </span>
          </div>
        </div>
      )}

      {/* ── Floor Plan Grid ─────────────────────────────────────────────── */}
      {tablesLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tables.length === 0 ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/40 mb-4 animate-pulse" />
            <p className="text-muted-foreground font-medium">No hay mesas creadas</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Crea tu primera mesa para comenzar
            </p>
            <Button className="mt-4 gap-2 active:scale-[0.98] transition-all"
              onClick={() => setAddTableOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Crear Mesa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              currencyCode={store?.currencyCode}
              onClick={() => handleTableClick(table)}
              onDelete={(e) => handleDeleteClick(table, e)}
              onToggleActive={(e) => handleToggleTableActive(table, e)}
              togglingTableId={togglingTableId}
            />
          ))}
        </div>
      )}

      {/* ─── OPEN SESSION DIALOG ────────────────────────────────────────── */}
      <Dialog open={openSessionOpen} onOpenChange={(open) => {
        if (!open) setOpenSessionOpen(false)
      }}>
        <DialogContent className="sm:max-w-md backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Abrir Mesa {selectedTable?.number}</DialogTitle>
            <DialogDescription>
              Inicia una nueva sesión para esta mesa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="session-guests">
                Invitados <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-3">
                <Button type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 active:scale-[0.98] transition-all"
                  onClick={() => setSessionGuests(String(Math.max(1, parseInt(sessionGuests, 10) - 1)))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="session-guests"
                  type="number"
                  min="1"
                  max="50"
                  className="w-20 text-center"
                  value={sessionGuests}
                  onChange={(e) => setSessionGuests(e.target.value)}
                />
                <Button type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 active:scale-[0.98] transition-all"
                  onClick={() => setSessionGuests(String(parseInt(sessionGuests, 10) + 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-customer">Cliente (opcional)</Label>
              <Select value={sessionCustomerId} onValueChange={setSessionCustomerId}>
                <SelectTrigger id="session-customer" className="w-full">
                  <SelectValue placeholder={customersLoading ? 'Cargando...' : 'Sin cliente'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}{c.phone ? ` (${c.phone})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-notes">Notas</Label>
              <Textarea
                id="session-notes"
                placeholder="Notas adicionales..."
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSessionOpen(false)} disabled={openSessionSaving}>
              Cancelar
            </Button>
            <Button className="gap-2 active:scale-[0.98] transition-all" onClick={handleOpenSession} disabled={openSessionSaving}>
              {openSessionSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── ADD TABLE DIALOG ───────────────────────────────────────────── */}
      <Dialog open={addTableOpen} onOpenChange={(open) => {
        if (!open) setAddTableOpen(false)
      }}>
        <DialogContent className="sm:max-w-md backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Nueva Mesa</DialogTitle>
            <DialogDescription>
              Agrega una nueva mesa al salón.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="table-number">
                  Número <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="table-number"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="table-capacity">
                  Capacidad <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="table-capacity"
                  type="number"
                  min="1"
                  placeholder="4"
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="table-name">Nombre (opcional)</Label>
              <Input
                id="table-name"
                placeholder="Ej: Mesa de la esquina"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="table-zone">Zona</Label>
              <Select value={newTableZone} onValueChange={setNewTableZone}>
                <SelectTrigger id="table-zone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {ZONE_STYLES[zone]?.label ?? zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTableOpen(false)} disabled={addTableSaving}>
              Cancelar
            </Button>
            <Button className="gap-2 active:scale-[0.98] transition-all" onClick={handleCreateTable} disabled={addTableSaving}>
              {addTableSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PAYMENT DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={paymentOpen} onOpenChange={(open) => {
        if (!open) setPaymentOpen(false)
      }}>
        <DialogContent className="sm:max-w-md backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Cobrar</DialogTitle>
            <DialogDescription>
              Selecciona el método de pago para los items seleccionados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Invoice Mode Selector (when store has NIT) ── */}
            {hasStoreNit && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Tipo de Comprobante
                </Label>
                <div className={`grid gap-2 ${isEInvEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <button
                    type="button"
                    onClick={() => setTableInvoiceMode('TIRILLA')}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                      tableInvoiceMode === 'TIRILLA'
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <Receipt className="h-5 w-5" />
                    <span className="text-xs font-semibold">Tirilla</span>
                    <span className="text-[10px] opacity-70">Venta simple</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableInvoiceMode('DOC_EQUIPOS')}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                      tableInvoiceMode === 'DOC_EQUIPOS'
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <MonitorSmartphone className="h-5 w-5" />
                    <span className="text-xs font-semibold">Doc. Equivalente</span>
                    <span className="text-[10px] opacity-70">POS / Resolución</span>
                  </button>
                  {isEInvEnabled && (
                  <button
                    type="button"
                    onClick={() => setTableInvoiceMode('ELECTRONICA')}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                      tableInvoiceMode === 'ELECTRONICA'
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <FileText className="h-5 w-5" />
                    <span className="text-xs font-semibold">Factura Elect.</span>
                    <span className="text-[10px] opacity-70">CUFE y QR DIAN</span>
                  </button>
                  )}
                </div>
                {tableInvoiceMode === 'ELECTRONICA' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                    <QrCode className="h-3 w-3" />
                    Se generará automáticamente con CUFE y QR DIAN
                  </div>
                )}
                {tableInvoiceMode === 'DOC_EQUIPOS' && store?.resolutionNumber && (
                  <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                    <Hash className="h-3 w-3" />
                    Resolución: {store.resolutionNumber} — Prefijo: {store.invoicePrefix || 'POS'}
                  </div>
                )}
                {/* ── Buyer info fields (Art. 11 DIAN: only name, NIT, email) ── */}
                {tableInvoiceMode === 'ELECTRONICA' && (
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                        <Input
                          placeholder={session?.customer?.nit || DIAN_CONSUMIDOR_FINAL_NIT}
                          value={invoiceCustomerNit}
                          onChange={(e) => {
                            setInvoiceCustomerNit(e.target.value)
                            setNitDvError('')
                          }}
                          onBlur={() => {
                            const nit = invoiceCustomerNit.trim().replace(/[^0-9]/g, '')
                            if (nit && nit !== DIAN_CONSUMIDOR_FINAL_NIT && nit.length >= 9) {
                              const digits = nit.slice(0, -1)
                              const dv = parseInt(nit[nit.length - 1], 10)
                              const weights = [71,67,59,53,47,43,41,37,29,23,19,17,13,7,3]
                              const n = digits.length
                              const w = weights.slice(-n)
                              let sum = 0
                              for (let i = 0; i < n; i++) sum += parseInt(digits[i], 10) * w[i]
                              const r = sum % 11
                              const expected = (r === 0 || r === 1) ? r : 11 - r
                              if (dv !== expected) setNitDvError(`DV inválido (esperado: ${expected})`)
                            }
                          }}
                          className="h-9 text-sm"
                          maxLength={20}
                        />
                        {nitDvError && <p className="text-[10px] text-destructive">{nitDvError}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Nombre / Razón social</Label>
                        <Input
                          placeholder={session?.customer?.name || 'Consumidor Final'}
                          value={invoiceCustomerName}
                          onChange={(e) => setInvoiceCustomerName(e.target.value)}
                          className="h-9 text-sm"
                          maxLength={200}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Email (requerido para DIAN)</Label>
                      <Input
                        type="email"
                        placeholder=""
                        value={invoiceCustomerEmail}
                        onChange={(e) => setInvoiceCustomerEmail(e.target.value)}
                        className="h-9 text-sm"
                        maxLength={200}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Selected items summary */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Items a cobrar ({selectedItemIds.length})
              </p>
              <ScrollArea className="max-h-40">
                <div className="space-y-1.5">
                  {session?.comandaItems
                    ?.filter((item) => selectedItemIds.includes(item.id))
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(item.total, store?.currencyCode)}
                        </span>
                      </div>
                    ))}
                </div>
              </ScrollArea>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(selectedItemsTotal, store?.currencyCode)}
                </span>
              </div>
              {/* Tip */}
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                onClick={() => setShowTipInput(!showTipInput)}
              >
                <Heart className="h-3.5 w-3.5" />
                <span>Propina</span>
                {tipAmount > 0 && (
                  <span className="ml-auto font-medium text-pink-600 dark:text-pink-400">
                    +{formatCurrency(tipAmount, store?.currencyCode)}
                  </span>
                )}
                {!showTipInput && (
                  <span className="ml-auto text-xs opacity-60">agregar</span>
                )}
              </button>
              {showTipInput && paymentMethod !== 'CREDIT' && paymentMethod !== 'FIADO' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">$</span>
                  <Input
                    type="number"
                    min="0"
                    value={tipAmount || ''}
                    onChange={(e) => setTipAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="h-8 text-sm tabular-nums"
                  />
                  <Button type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30 active:scale-[0.98] transition-all"
                    onClick={() => setTipAmount(Math.round(selectedItemsTotal * 0.1))}
                  >
                    10%
                  </Button>
                  <Button type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30 active:scale-[0.98] transition-all"
                    onClick={() => setTipAmount(Math.round(selectedItemsTotal * 0.15))}
                  >
                    15%
                  </Button>
                  <Button type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30 active:scale-[0.98] transition-all"
                    onClick={() => setTipAmount(0)}
                  >
                    Quitar
                  </Button>
                </div>
              )}
              {showTipInput && (paymentMethod === 'CREDIT' || paymentMethod === 'FIADO') && (
                <p className="text-xs text-muted-foreground italic">No aplica para ventas fiadas</p>
              )}
              {tipAmount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-pink-600 dark:text-pink-400">Propina</span>
                  <span className="font-medium text-pink-600 dark:text-pink-400">
                    {formatCurrency(tipAmount, store?.currencyCode)}
                  </span>
                </div>
              )}
              {/* Discount */}
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                onClick={() => {
                  if (discountType === 'NONE') {
                    setDiscountType('PERCENTAGE')
                    setDiscountValue(0)
                  } else {
                    setDiscountType('NONE')
                    setDiscountValue(0)
                    setDiscountReason('')
                  }
                }}
              >
                <Tag className="h-3.5 w-3.5" />
                <span>Descuento</span>
                {computedDiscount > 0 && (
                  <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">
                    -{formatCurrency(computedDiscount, store?.currencyCode)}
                  </span>
                )}
                {discountType !== 'NONE' ? null : (
                  <span className="ml-auto text-xs opacity-60">agregar</span>
                )}
              </button>
              {discountType !== 'NONE' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={discountType}
                      onValueChange={(val: 'PERCENTAGE' | 'FIXED') => {
                        setDiscountType(val)
                        setDiscountValue(0)
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm w-auto min-w-[110px] focus-visible:ring-primary/20 focus-visible:border-primary/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">
                          <span className="flex items-center gap-1.5">
                            <Percent className="h-3 w-3" />
                            Porcentaje %
                          </span>
                        </SelectItem>
                        <SelectItem value="FIXED">
                          <span className="flex items-center gap-1.5">
                            <DollarSign className="h-3 w-3" />
                            Valor fijo $
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      max={discountType === 'PERCENTAGE' ? 100 : undefined}
                      value={discountValue || ''}
                      onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0"
                      className="h-8 text-sm tabular-nums flex-1"
                    />
                    <Button type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 shrink-0 active:scale-[0.98] transition-all"
                      onClick={() => {
                        setDiscountType('NONE')
                        setDiscountValue(0)
                        setDiscountReason('')
                      }}
                      title="Quitar descuento"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Motivo del descuento (opcional)"
                    className="h-8 text-sm"
                  />
                </div>
              )}
              {computedDiscount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Descuento
                    {discountType === 'PERCENTAGE' && <span className="text-xs opacity-70">({discountValue}%)</span>}
                  </span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    -{formatCurrency(computedDiscount, store?.currencyCode)}
                  </span>
                </div>
              )}
              {taxEstimate.breakdown.length > 0 && (
                <div className="space-y-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5" />
                      IVA Incluido
                    </span>
                    <span>{formatCurrency(taxEstimate.totalTax, store?.currencyCode)}</span>
                  </div>
                  {taxEstimate.breakdown.map((tax) => (
                    <div key={tax.code} className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                      <span>{tax.name} ({tax.rate}%) — Base: {formatCurrency(tax.base, store?.currencyCode)}</span>
                      <span>{formatCurrency(tax.amount, store?.currencyCode)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between font-semibold">
                <span>Total</span>
                <span className="text-lg text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(selectedItemsTotal - computedDiscount + tipAmount, store?.currencyCode)}
                </span>
              </div>
            </div>

            {/* Caja selector */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" />
                Caja
              </Label>
              {openCashRegisters.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  No hay cajas abiertas
                </div>
              ) : (
                <Select value={selectedCashRegisterId} onValueChange={setSelectedCashRegisterId}>
                  <SelectTrigger className="h-9 focus-visible:ring-primary/20 focus-visible:border-primary/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automática</SelectItem>
                    {openCashRegisters.map((cr) => (
                      <SelectItem key={cr.id} value={String(cr.id)}>
                        Caja #{cr.id} — {cr.user.fullName || 'Usuario'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon
                  const isFiado = method.value === 'FIADO' || method.value === 'CREDIT'
                  const fiadoDisabled = isFiado && !session?.customerId
                  return (
                    <Button
                      key={method.value}
                      type="button"
                      variant={paymentMethod === method.value ? 'default' : 'outline'}
                      className={`justify-start gap-2 h-auto py-3 ${fiadoDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      onClick={() => {
                        if (fiadoDisabled) return
                        setPaymentMethod(method.value)
                        if (!['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(method.value)) setTransferRef('')
                      }}
                      disabled={fiadoDisabled}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {method.label}
                      {fiadoDisabled && <span className="text-[9px] ml-auto opacity-60">Sin cliente</span>}
                    </Button>
                  )
                })}
              </div>
              {(paymentMethod === 'FIADO' || paymentMethod === 'CREDIT') && !session?.customerId && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  La mesa debe tener un cliente asignado para vender fiado
                </p>
              )}
            </div>

            {/* Transfer reference number */}
            {['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Número de {paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  placeholder={paymentMethod === 'TRANSFER' ? 'Ej: 000123456789' : 'Ej: 3111234567'}
                  className="text-sm tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  {paymentMethod === 'TRANSFER'
                    ? 'Número de referencia de la transferencia bancaria'
                    : paymentMethod === 'NEQUI'
                      ? 'Número de transacción o celular asociado'
                      : 'Número de transacción de Daviplata'
                  }
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={paymentSaving}>
              Cancelar
            </Button>
            <Button className="gap-2 active:scale-[0.98] transition-all" onClick={handleConfirmPayment} disabled={paymentSaving || creatingInvoice}>
              {creatingInvoice ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando Factura...
                </>
              ) : (
                <>
                  {paymentSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {tableInvoiceMode === 'ELECTRONICA' ? 'Confirmar + Factura Electrónica' : tableInvoiceMode === 'DOC_EQUIPOS' ? 'Confirmar + Doc. Equivalente' : 'Confirmar Pago'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CLOSE SESSION CONFIRM ──────────────────────────────────────── */}
      <AlertDialog open={closeSessionOpen} onOpenChange={(open) => {
        if (!open) setCloseSessionOpen(false)
      }}>
        <AlertDialogContent className="backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar Mesa</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas cerrar la mesa {session?.barTable.number}?
              {!hasUnpaidItems
                ? ' Todos los items han sido pagados.'
                : ' Aún hay items sin pagar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeSessionSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseSession}
              disabled={closeSessionSaving || hasUnpaidItems}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {closeSessionSaving ? 'Cerrando...' : 'Cerrar Mesa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── DELETE TABLE CONFIRM ──────────────────────────────────────── */}
      <AlertDialog open={deleteTableOpen} onOpenChange={(open) => {
        if (!open) setDeleteTableOpen(false)
      }}>
        <AlertDialogContent className="backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Mesa</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar esta mesa? Esta acción no se puede deshacer.
              {deletingTableId && tables.find(t => t.id === deletingTableId)?.activeSession
                ? ' La mesa tiene una sesión abierta y no se puede eliminar.'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTableSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteTable}
              disabled={
                deleteTableSaving ||
                (deletingTableId !== null && !!tables.find(t => t.id === deletingTableId)?.activeSession)
              }
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteTableSaving ? 'Eliminando...' : 'Eliminar Mesa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── SESSION SHEET (SLIDE-OVER) ─────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        if (!open) {
          setSheetOpen(false)
          setSession(null)
          setSelectedTable(null)
          setSelectedItemIds([])
          setProducts([])
          setProductSearch('')
          setCategoryFilter('all')
          setPendingItemNotes('')
        }
      }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-hidden flex flex-col p-0"
        >
          {selectedTable && (
            <>
              <SheetHeader className="p-4 pb-2 border-b shrink-0">
                <div className="flex items-center justify-between pr-6">
                  <div className="flex items-center gap-3">
                    <SheetTitle className="text-lg font-semibold">
                      Mesa {selectedTable.number}
                      {selectedTable.name && (
                        <span className="text-muted-foreground font-normal ml-2">
                          — {selectedTable.name}
                        </span>
                      )}
                    </SheetTitle>
                    <Badge variant="outline" className={ZONE_STYLES[selectedTable.zone]?.className}>
                      {ZONE_STYLES[selectedTable.zone]?.label ?? selectedTable.zone}
                    </Badge>
                  </div>
                </div>
                {session && (
                  <SheetDescription className="mt-1">
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTime(session.startedAt)}
                      {' · '}
                      {formatTimeElapsed(session.startedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <Users className="h-3.5 w-3.5" />
                      {session.guests} {session.guests === 1 ? 'invitado' : 'invitados'}
                    </span>
                    {session.customer && (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {session.customer.name}
                      </span>
                    )}
                  </SheetDescription>
                )}
              </SheetHeader>

              {/* Sheet Body */}
              <div className="flex-1 overflow-y-auto">
                {sessionLoading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-md" />
                    ))}
                  </div>
                ) : session ? (
                  <div className="space-y-4 p-4">
                    {/* ── Quick Actions ──────────────────────────────── */}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs active:scale-[0.98] transition-all"
                        onClick={selectAllPayable}
                        disabled={!hasUnpaidItems}
                      >
                        Seleccionar todo
                      </Button>
                      <Button size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all"
                        onClick={() => handleMarkServed(selectedPendingItems.map((i) => i.id))}
                        disabled={!canServe || servingItemIds.length > 0}
                      >
                        {servingItemIds.length > 0 ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ChefHat className="h-3.5 w-3.5" />
                        )}
                        Marcar Servido{selectedPendingItems.length > 1 ? 's' : ''}
                      </Button>
                      <Button size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all"
                        onClick={() => handleCancelItem(selectedItemIds)}
                        disabled={selectedItemIds.length === 0 || servingItemIds.length > 0}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Cancelar ({selectedItemIds.length})
                      </Button>
                      <Button size="sm"
                        className="gap-1.5 text-xs active:scale-[0.98] transition-all"
                        onClick={handleOpenPayment}
                        disabled={!canPay}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Cobrar ({selectedItemIds.length})
                      </Button>
                      <Button size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all"
                        onClick={() => setCloseSessionOpen(true)}
                        disabled={hasUnpaidItems}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Cerrar Mesa
                      </Button>
                    </div>

                    {/* ── Comanda Items ──────────────────────────────── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Comanda
                        {session.comandaItems && session.comandaItems.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {session.comandaItems.length}
                          </Badge>
                        )}
                      </h3>

                      {session.comandaItems && session.comandaItems.length > 0 ? (
                        <div className="space-y-1.5">
                          {session.comandaItems.map((item) => {
                            const isPaidOrCancelled = item.status === 'PAID' || item.status === 'CANCELLED'
                            const isServing = servingItemIds.includes(item.id)
                            const statusStyle = COMANDA_STATUS_STYLES[item.status] ?? COMANDA_STATUS_STYLES.CANCELLED
                            return (
                              <div
                                key={item.id}
                                className={`
                                  flex items-center gap-2 rounded-lg border p-2.5 transition-colors cursor-pointer
                                  ${isPaidOrCancelled ? 'opacity-50' : 'hover:bg-muted/50 active:bg-muted/70'}
                                  ${selectedItemIds.includes(item.id) ? 'border-primary/50 bg-primary/5' : ''}
                                `}
                                onClick={!isPaidOrCancelled ? () => toggleItemSelection(item.id) : undefined}
                              >
                                {!isPaidOrCancelled && (
                                  <Checkbox
                                    checked={selectedItemIds.includes(item.id)}
                                    onCheckedChange={() => toggleItemSelection(item.id)}
                                    className="shrink-0"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      {!isPaidOrCancelled ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (item.quantity > 1) handleUpdateItemQuantity(item.id, item.quantity - 1)
                                            }}
                                            disabled={item.quantity <= 1 || updatingQtyItemId !== null}
                                            className="h-5 w-5 rounded border border-border flex items-center justify-center text-xs hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
                                          >
                                            <Minus className="h-3 w-3" />
                                          </button>
                                          <span
                                            className="text-sm font-semibold tabular-nums min-w-[1.5rem] text-center"
                                          >
                                            {item.quantity}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleUpdateItemQuantity(item.id, item.quantity + 1)
                                            }}
                                            disabled={updatingQtyItemId !== null}
                                            className="h-5 w-5 rounded border border-border flex items-center justify-center text-xs hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
                                          >
                                            <Plus className="h-3 w-3" />
                                          </button>
                                        </>
                                      ) : (
                                        <span className="text-sm font-medium tabular-nums">{item.quantity}x</span>
                                      )}
                                      <span
                                        className={`text-sm font-medium truncate ${
                                          isPaidOrCancelled ? 'line-through text-muted-foreground' : ''
                                        }`}
                                      >
                                        {item.productName}
                                      </span>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0 shrink-0 ${statusStyle.className}`}
                                    >
                                      {statusStyle.label}
                                    </Badge>
                                    {item.notes && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 shrink-0 max-w-[140px] truncate" title={item.notes}>
                                        <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                                        {item.notes}
                                      </span>
                                    )}
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {formatCurrency(item.unitPrice, store?.currencyCode)} c/u
                                    {' · '}
                                    {formatCurrency(item.total, store?.currencyCode)}
                                    {isServing && (
                                      <span className="inline-flex items-center gap-1 ml-2 text-amber-600 dark:text-amber-400">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Sirviendo...
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Notes edit button */}
                                {(item.status === 'PENDING' || item.status === 'SERVED') && (
                                  <Popover
                                    open={notesPopoverItemId === item.id}
                                    onOpenChange={(open) => {
                                      if (!open) setNotesPopoverItemId(null)
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setNotesPopoverItemId(item.id)
                                          setNotesEditText(item.notes || '')
                                        }}
                                      >
                                        <Button variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-[0.98] transition-all"
                                          title={item.notes ? 'Editar nota' : 'Agregar nota'}
                                        >
                                          {item.notes ? (
                                            <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                          ) : (
                                            <Pencil className="h-3 w-3" />
                                          )}
                                        </Button>
                                      </span>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3" align="end" side="left">
                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium">
                                          Notas para: {item.productName}
                                        </Label>
                                        <Textarea
                                          value={notesEditText}
                                          onChange={(e) => setNotesEditText(e.target.value)}
                                          placeholder="Ej: sin hielo, extra picante..."
                                          rows={2}
                                          className="text-sm resize-none"
                                          autoFocus
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                          <Button size="sm"
                                            variant="outline"
                                            className="h-7 text-xs active:scale-[0.98] transition-all"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setNotesPopoverItemId(null)
                                            }}
                                          >
                                            Cancelar
                                          </Button>
                                          <Button size="sm"
                                            className="h-7 text-xs gap-1 active:scale-[0.98] transition-all"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleUpdateItemNotes(item.id, notesEditText)
                                            }}
                                            disabled={savingNotes}
                                          >
                                            {savingNotes && <Loader2 className="h-3 w-3 animate-spin" />}
                                            Guardar
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                                {item.status === 'PENDING' && (
                                  <Button variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40 active:scale-[0.98] transition-all"
                                    onClick={() => handleMarkServed([item.id])}
                                    disabled={servingItemIds.length > 0}
                                    title="Marcar como servido"
                                  >
                                    {servingItemIds.includes(item.id) ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {(item.status === 'PENDING' || item.status === 'SERVED') && (
                                  <Button variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40 active:scale-[0.98] transition-all"
                                    onClick={() => handleCancelItem([item.id])}
                                    disabled={servingItemIds.length > 0}
                                    title="Cancelar item"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {item.status === 'CANCELLED' && (
                                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                              </div>
                            )
                          })}

                          {/* Totals */}
                          <div className="rounded-lg border bg-muted/30 p-3 mt-2 space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Total consumido</span>
                              <span className="font-medium">
                                {formatCurrency(
                                  session.comandaItems.reduce((sum, item) => sum + item.total, 0),
                                  store?.currencyCode
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Total pagado</span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(
                                  session.comandaItems
                                    .filter((i) => i.status === 'PAID')
                                    .reduce((sum, item) => sum + item.total, 0),
                                  store?.currencyCode
                                )}
                              </span>
                            </div>
                            <Separator className="my-1" />
                            <div className="flex justify-between text-sm font-semibold">
                              <span>Saldo pendiente</span>
                              <span className={
                                session.comandaItems
                                  .filter((i) => i.status === 'PENDING' || i.status === 'SERVED')
                                  .reduce((sum, item) => sum + item.total, 0) > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }>
                                {formatCurrency(
                                  session.comandaItems
                                    .filter((i) => i.status === 'PENDING' || i.status === 'SERVED')
                                    .reduce((sum, item) => sum + item.total, 0),
                                  store?.currencyCode
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <ShoppingCart className="h-8 w-8 text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">
                            La comanda está vacía
                          </p>
                        </div>
                      )}
                    </div>

                    {/* ── Session Orders ──────────────────────────────── */}
                    {session.orders && session.orders.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Pagos Realizados
                        </h3>
                        <div className="space-y-1.5">
                          {session.orders.map((order) => (
                            <div
                              key={order.id}
                              className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {order.orderNumber}
                                </Badge>
                                <span className="text-muted-foreground text-xs">
                                  {paymentMethodLabel(order.paymentMethod)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {formatCurrency(order.total, store?.currencyCode)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Print last ticket button */}
                        {lastPaymentData && (
                          <Button variant="outline"
                            size="sm"
                            className="mt-2 w-full gap-2 active:scale-[0.98] transition-all"
                            onClick={() => {
                              const items: TicketItem[] = (lastPaymentData.orderItems || []).map((item: OrderItemData) => ({
                                name: item.productName,
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                                total: item.totalRow,
                                isService: item.isService,
                              }))
                              printTicket({
                                storeName: store?.name || '',
                                storeNIT: store?.nit || undefined,
                                storeAddress: store?.address || undefined,
                                storePhone: store?.phone || undefined,
                                storeRegime: 'RESPONSABLE',
                                invoiceResolution: store?.resolutionNumber || undefined,
                                invoicePrefix: store?.invoicePrefix || undefined,
                                orderNumber: lastPaymentData.orderNumber,
                                date: lastPaymentData.createdAt,
                                customer: lastPaymentData.customer?.name || session.customer?.name,
                                tableName: session.barTable ? `Mesa ${session.barTable.number}${session.barTable.name ? ` - ${session.barTable.name}` : ''}` : undefined,
                                items,
                                subtotal: lastPaymentData.subtotal,
                                tipAmount: lastPaymentData.tipAmount || 0,
                                total: lastPaymentData.total,
                                discountAmount: lastPaymentData.discountAmount || 0,
                                taxAmount: lastPaymentData.taxAmount || 0,
                                taxBreakdown: lastPaymentData.taxBreakdown || undefined,
                                paymentMethod: lastPaymentData.paymentMethod,
                                isElectronic: !!lastInvoiceData?.cufe,
                                isDocEquivalente: lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe,
                                cufe: lastInvoiceData?.cufe || undefined,
                                qrCodeUrl: lastInvoiceData?.qrCodeUrl || undefined,
                                customerNit: lastInvoiceData?.customerNit || undefined,
                                resolutionNumber: store?.resolutionNumber || undefined,
                                resolutionStart: store?.resolutionStart ? String(store.resolutionStart) : undefined,
                                resolutionEnd: store?.resolutionEnd ? String(store.resolutionEnd) : undefined,
                                currencyCode: store?.currencyCode || 'COP',
                              })
                            }}
                          >
                            <Printer className="h-4 w-4" />
                            Imprimir Último Ticket
                            {lastInvoiceData?.cufe && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">FE</Badge>
                            )}
                            {lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600">Doc.Equi</Badge>
                            )}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* ── Notes ──────────────────────────────────────── */}
                    {session.notes && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Notas</h3>
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                          {session.notes}
                        </p>
                      </div>
                    )}

                    {/* ── Add Items to Comanda ────────────────────────── */}
                    <div>
                      <Separator className="mb-4" />
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-primary">
                        <Plus className="h-4 w-4" />
                        Agregar a la Comanda
                      </h3>

                      {/* Pending item notes input */}
                      <div className="mb-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          <Label className="text-xs text-muted-foreground">Notas para el próximo item (opcional)</Label>
                          {pendingItemNotes && (
                            <Button type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground ml-auto active:scale-[0.98] transition-all"
                              onClick={() => setPendingItemNotes('')}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <Input
                          value={pendingItemNotes}
                          onChange={(e) => setPendingItemNotes(e.target.value)}
                          placeholder="Ej: sin hielo, extra picante..."
                          className="h-8 text-sm"
                        />
                      </div>

                      {/* Category filter */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Buscar producto..."
                            className="pl-9 h-10 focus-visible:ring-primary/20 focus-visible:border-primary/40"
                            value={productSearch}
                            onChange={(e) => {
                              setProductSearch(e.target.value)
                              fetchProducts(e.target.value, categoryFilter)
                            }}
                          />
                        </div>
                        <Select
                          value={categoryFilter}
                          onValueChange={(val) => {
                            setCategoryFilter(val)
                            fetchProducts(productSearch, val)
                          }}
                        >
                          <SelectTrigger className="w-full sm:w-44 focus-visible:ring-primary/20 focus-visible:border-primary/40">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas las categorías</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={String(cat.id)}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Product list + Services list */}
                      {productsLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-md" />
                          ))}
                        </div>
                      ) : products.length === 0 && services.length === 0 && !productSearch ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No se encontraron productos ni servicios
                        </p>
                      ) : (
                        <ScrollArea className="max-h-64">
                          <div className="space-y-1.5">
                            {products.map((product) => (
                              <div
                                key={`p-${product.id}`}
                                className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 active:bg-muted/70 transition-colors cursor-pointer"
                                onClick={() => handleAddItem(product.id, null)}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{product.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {product.category?.name ?? 'Sin categoría'}
                                    {' · '}
                                    {formatCurrency(product.salePrice, store?.currencyCode)}
                                  </p>
                                </div>
                                <div className="shrink-0 ml-2">
                                  {addingItem === product.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  ) : (
                                    <Plus className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                              </div>
                            ))}

                            {/* Services section */}
                            {services.length > 0 && (
                              <>
                                {services
                                  .filter((s) => !productSearch || s.name.toLowerCase().includes(productSearch.toLowerCase()))
                                  .map((service) => (
                                    <div
                                      key={`s-${service.id}`}
                                      className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-violet-50 dark:hover:bg-violet-950/20 active:bg-violet-100 dark:active:bg-violet-950/40 transition-colors border-violet-200/50 dark:border-violet-800/50 cursor-pointer"
                                      onClick={() => handleAddItem(null, service.id)}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="text-sm font-medium truncate">{service.name}</p>
                                          <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0 bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                                            Svc
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {formatCurrency(service.price, store?.currencyCode)}
                                          {' · por '}
                                          {service.unit}
                                        </p>
                                      </div>
                                      <div className="shrink-0 ml-2">
                                        {addingItem === service.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                                        ) : (
                                          <Plus className="h-4 w-4 text-violet-600" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </>
                            )}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* tick ref for reactivity */}
      <span className="hidden">{_tick}</span>
    </div>
  )
}

// ─── Table Card Sub-Component ────────────────────────────────────────────────

function TableCard({
  table,
  currencyCode,
  onClick,
  onDelete,
  onToggleActive,
  togglingTableId,
}: {
  table: BarTable
  currencyCode?: string
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onToggleActive: (e: React.MouseEvent) => void
  togglingTableId: number | null
}) {
  const zoneStyle = ZONE_STYLES[table.zone] ?? ZONE_STYLES.PRINCIPAL

  const isOccupied = !!table.activeSession
  const isMaintenance = !table.isActive
  const isAvailable = table.isActive && !isOccupied

  let statusColor = 'bg-emerald-500'
  let statusLabel = 'Disponible'
  let statusTextColor = 'text-emerald-600 dark:text-emerald-400'
  let borderHover = 'hover:border-emerald-300 dark:hover:border-emerald-700'
  let cardBg = ''

  if (isOccupied) {
    statusColor = 'bg-amber-500'
    statusLabel = 'Ocupada'
    statusTextColor = 'text-amber-600 dark:text-amber-400'
    borderHover = 'hover:border-amber-300 dark:hover:border-amber-700'
    cardBg = zoneStyle.bg
  } else if (isMaintenance) {
    statusColor = 'bg-red-500'
    statusLabel = 'Mantenimiento'
    statusTextColor = 'text-red-600 dark:text-red-400'
    borderHover = 'hover:border-red-300 dark:hover:border-red-700'
  }

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200
        ${borderHover}
        ${isMaintenance ? 'opacity-60' : 'hover:shadow-md hover:-translate-y-0.5'}
        ${cardBg}
      `}
      onClick={isMaintenance ? undefined : onClick}
      role={isMaintenance ? undefined : 'button'}
      tabIndex={isMaintenance ? undefined : 0}
      onKeyDown={isMaintenance ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
    >
      <CardContent className="p-4">
        {/* Top row: Table number + Zone + Actions */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <span className="text-sm font-bold text-primary">
                {table.number}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                {table.name || `Mesa ${table.number}`}
              </p>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 mt-0.5 ${zoneStyle.className}`}
              >
                {zoneStyle.label}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor} animate-pulse`} />
            {/* Toggle active button */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                table.isActive
                  ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/40'
                  : 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/40'
              }`}
              onClick={onToggleActive}
              disabled={!!table.activeSession || togglingTableId === table.id}
              title={table.isActive ? 'Desactivar mesa' : 'Activar mesa'}
              aria-label={table.isActive ? 'Desactivar mesa' : 'Activar mesa'}
            >
              {togglingTableId === table.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : table.isActive ? (
                <PowerOff className="h-3.5 w-3.5" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
            </Button>
            {/* Delete button */}
            <Button variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/40 active:scale-[0.98] transition-all"
              onClick={onDelete}
              disabled={!!table.activeSession}
              title="Eliminar mesa"
              aria-label="Eliminar mesa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`text-xs font-medium ${statusTextColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Capacity */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Users className="h-3.5 w-3.5" />
          <span>{table.capacity} personas</span>
        </div>

        {/* Occupied info */}
        {isOccupied && table.activeSession && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />
                {table.activeSession.guests} {table.activeSession.guests === 1 ? 'invitado' : 'invitados'}
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTimeElapsed(table.activeSession.startedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-600 dark:text-amber-500">
                {table.activeSession._count?.comandaItems ?? 0} items
              </span>
              {table.activeSession.totalConsumed != null && table.activeSession.totalConsumed > 0 && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(table.activeSession.totalConsumed, currencyCode)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Maintenance indicator */}
        {isMaintenance && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2.5 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-red-500" />
            <span className="text-xs text-red-600 dark:text-red-400">Fuera de servicio</span>
          </div>
        )}

        {/* Available CTA */}
        {isAvailable && (
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <DoorOpen className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Clic para abrir</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
