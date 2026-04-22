'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, FileSpreadsheet, Plus, Filter, X as XIcon, Eye, Trash2,
  Printer, RefreshCw, Loader2, CheckCircle2, Clock, AlertTriangle,
  MoreHorizontal, Hash, User, CalendarDays, ShoppingBag, ArrowRight,
  ChevronLeft, Send, Ban, CheckCircle, XCircle, Copy, Zap,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCurrency } from '@/lib/auth'

// ── Constants ───────────────────────────────────────────────────────────────

const STORE_ID = '3'

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border border-slate-200 dark:border-slate-700' },
  SENT: { label: 'Enviada', className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-200 dark:border-sky-800' },
  APPROVED: { label: 'Aprobada', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' },
  REJECTED: { label: 'Rechazada', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800' },
  EXPIRED: { label: 'Vencida', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800' },
  CONVERTED: { label: 'Convertida', className: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800' },
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviada' },
  { value: 'APPROVED', label: 'Aprobada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'EXPIRED', label: 'Vencida' },
  { value: 'CONVERTED', label: 'Convertida' },
]

const STATUS_TRANSITIONS: Record<string, { value: string; label: string; icon: React.ReactNode }[]> = {
  DRAFT: [
    { value: 'SENT', label: 'Marcar como Enviada', icon: <Send className="h-4 w-4" /> },
    { value: 'REJECTED', label: 'Rechazar', icon: <XCircle className="h-4 w-4 text-red-500" /> },
  ],
  SENT: [
    { value: 'APPROVED', label: 'Aprobar', icon: <CheckCircle className="h-4 w-4 text-emerald-500" /> },
    { value: 'REJECTED', label: 'Rechazar', icon: <XCircle className="h-4 w-4 text-red-500" /> },
  ],
  APPROVED: [
    { value: 'REJECTED', label: 'Rechazar', icon: <XCircle className="h-4 w-4 text-red-500" /> },
  ],
}

// ── Types ───────────────────────────────────────────────────────────────────

interface QuoteSummary {
  id: number
  quoteNumber: string
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  subtotal: number
  taxAmount: number
  discountAmount: number
  discountType: string
  total: number
  status: string
  validityDays: number
  expiresAt: string | null
  createdAt: string
  itemCount: number
}

interface QuoteDetailItem {
  id: number
  productId: number | null
  serviceId: number | null
  productName: string
  quantity: number
  unitPrice: number
  totalRow: number
  taxRate: number
  taxAmount: number
  notes: string | null
  product: { name: string; salePrice: number; currentStock: number; category: string | null } | null
  service: { name: string; price: number } | null
}

interface QuoteDetail {
  id: number
  quoteNumber: string
  customerId: number | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  customerNit: string | null
  subtotal: number
  taxAmount: number
  discountAmount: number
  discountType: string
  total: number
  status: string
  validityDays: number
  expiresAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  convertedOrder: { id: number; orderNumber: string; status: string; total: number; createdAt: string } | null
  items: QuoteDetailItem[]
}

interface CartItem {
  productId: number | null
  serviceId: number | null
  productName: string
  quantity: number
  unitPrice: number
  taxRate: number
  notes: string
}

interface ProductSearchResult {
  id: number
  name: string
  sku: string | null
  salePrice: number
  currentStock: number
  category: { name: string } | null
  taxRate: { code: string; rate: number; rateType: string } | null
}

interface ServiceSearchResult {
  id: number
  name: string
  price: number
}

// ── Component ───────────────────────────────────────────────────────────────

export function QuotesView() {
  const { store } = useAuthStore()

  // ── List state ──
  const [quotes, setQuotes] = useState<QuoteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ── Detail dialog ──
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null)
  const [quoteDetail, setQuoteDetail] = useState<QuoteDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ── Create dialog ──
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [creating, setCreating] = useState(false)

  // ── Create form: customer ──
  const [formCustomerId, setFormCustomerId] = useState<number | null>(null)
  const [formCustomerName, setFormCustomerName] = useState('')
  const [formCustomerPhone, setFormCustomerPhone] = useState('')
  const [formCustomerEmail, setFormCustomerEmail] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string; phone: string | null; email: string | null }[]>([])
  const [customerSearching, setCustomerSearching] = useState(false)

  // ── Create form: items ──
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [serviceResults, setServiceResults] = useState<ServiceSearchResult[]>([])

  // ── Create form: step 2 ──
  const [formValidityDays, setFormValidityDays] = useState('15')
  const [formNotes, setFormNotes] = useState('')
  const [formDiscountType, setFormDiscountType] = useState('NONE')
  const [formDiscountAmount, setFormDiscountAmount] = useState('0')

  // ── Convert dialog ──
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [convertPaymentMethod, setConvertPaymentMethod] = useState('CASH')
  const [convertNotes, setConvertNotes] = useState('')
  const [converting, setConverting] = useState(false)

  // ── Delete dialog ──
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Status change dialog ──
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [changingStatus, setChangingStatus] = useState(false)

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = quotes.length
    const pending = quotes.filter(q => ['DRAFT', 'SENT', 'APPROVED'].includes(q.status)).length
    const pendingTotal = quotes
      .filter(q => ['DRAFT', 'SENT', 'APPROVED'].includes(q.status))
      .reduce((sum, q) => sum + q.total, 0)
    return { total, pending, pendingTotal }
  }, [quotes])

  // ── Cart totals ──
  const cartTotals = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    let discountAmount = 0
    if (formDiscountType === 'PERCENTAGE') {
      discountAmount = Math.round(subtotal * (parseInt(formDiscountAmount) || 0) / 100)
    } else if (formDiscountType === 'FIXED') {
      discountAmount = parseInt(formDiscountAmount) || 0
    }
    const totalTax = cartItems.reduce((sum, item) => {
      if (item.taxRate > 0) return sum + Math.round(item.unitPrice * item.quantity * item.taxRate / (100 + item.taxRate))
      return sum
    }, 0)
    return { subtotal, discountAmount, totalTax, total: subtotal - discountAmount + totalTax }
  }, [cartItems, formDiscountType, formDiscountAmount])

  // ── Fetch quotes ──
  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: STORE_ID })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/quotes?${params}`)
      if (!res.ok) throw new Error()
      setQuotes(await res.json())
    } catch {
      toast.error('Error al cargar cotizaciones')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo, search])

  useEffect(() => {
    const timer = setTimeout(() => fetchQuotes(), 300)
    return () => clearTimeout(timer)
  }, [fetchQuotes])

  // ── Open detail ──
  async function openDetail(id: number) {
    setSelectedQuoteId(id)
    setQuoteDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/quotes/${id}?storeId=${STORE_ID}`)
      if (!res.ok) throw new Error()
      setQuoteDetail(await res.json())
    } catch {
      toast.error('Error al cargar el detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Product search ──
  async function searchProducts(query: string) {
    if (query.length < 1) { setProductResults([]); setServiceResults([]); return }
    setProductSearching(true)
    try {
      // Use dedicated search endpoint that searches by name and SKU
      const res = await fetch(`/api/quotes/search-products?storeId=${STORE_ID}&q=${encodeURIComponent(query)}&type=all`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setProductResults((data.products || []).slice(0, 20))
      setServiceResults((data.services || []).slice(0, 10))
    } catch { /* ignore */ } finally {
      setProductSearching(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => searchProducts(productSearch), 300)
    return () => clearTimeout(t)
  }, [productSearch])

  // ── Customer search ──
  async function searchCustomers(query: string) {
    if (query.length < 2) { setCustomerResults([]); return }
    setCustomerSearching(true)
    try {
      const res = await fetch(`/api/customers?storeId=${STORE_ID}&q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error()
      setCustomerResults((await res.json()).slice(0, 10))
    } catch { /* ignore */ } finally {
      setCustomerSearching(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  // ── Add to cart ──
  function addToCart(product: ProductSearchResult) {
    const existing = cartItems.find(i => i.productId === product.id)
    if (existing) {
      setCartItems(cartItems.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCartItems([...cartItems, {
        productId: product.id,
        serviceId: null,
        productName: product.name,
        quantity: 1,
        unitPrice: product.salePrice,
        taxRate: product.taxRate?.rate ?? 0,
        notes: '',
      }])
    }
    setProductSearch('')
    setProductResults([])
    setServiceResults([])
  }

  function addServiceToCart(service: ServiceSearchResult) {
    const existing = cartItems.find(i => i.serviceId === service.id)
    if (existing) {
      setCartItems(cartItems.map(i => i.serviceId === service.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCartItems([...cartItems, {
        productId: null,
        serviceId: service.id,
        productName: service.name,
        quantity: 1,
        unitPrice: service.price,
        taxRate: 0,
        notes: '',
      }])
    }
    setProductSearch('')
    setProductResults([])
    setServiceResults([])
  }

  function selectCustomer(customer: { id: number; name: string; phone: string | null; email: string | null }) {
    setFormCustomerId(customer.id)
    setFormCustomerName(customer.name)
    setFormCustomerPhone(customer.phone || '')
    setFormCustomerEmail(customer.email || '')
    setCustomerSearch('')
    setCustomerResults([])
  }

  function updateCartItem(index: number, updates: Partial<CartItem>) {
    setCartItems(cartItems.map((item, i) => i === index ? { ...item, ...updates } : i === index ? { ...item, ...updates } : item))
  }

  function removeCartItem(index: number) {
    setCartItems(cartItems.filter((_, i) => i !== index))
  }

  // ── Create quote ──
  async function handleCreate() {
    if (cartItems.length === 0) {
      toast.error('Agrega al menos un producto o servicio')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: parseInt(STORE_ID),
          customerId: formCustomerId,
          customerName: formCustomerName || undefined,
          customerPhone: formCustomerPhone || undefined,
          customerEmail: formCustomerEmail || undefined,
          validityDays: parseInt(formValidityDays) || 15,
          notes: formNotes || undefined,
          discountType: formDiscountType,
          discountAmount: parseInt(formDiscountAmount) || 0,
          items: cartItems.map(item => ({
            productId: item.productId ?? undefined,
            serviceId: item.serviceId ?? undefined,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            notes: item.notes || undefined,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al crear cotización')
      }
      const data = await res.json()
      toast.success(`Cotización ${data.quoteNumber} creada exitosamente`)
      setShowCreateDialog(false)
      resetCreateForm()
      fetchQuotes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear cotización')
    } finally {
      setCreating(false)
    }
  }

  function resetCreateForm() {
    setCreateStep(1)
    setFormCustomerId(null)
    setFormCustomerName('')
    setFormCustomerPhone('')
    setFormCustomerEmail('')
    setCustomerSearch('')
    setCustomerResults([])
    setCartItems([])
    setProductSearch('')
    setProductResults([])
    setServiceResults([])
    setFormValidityDays('15')
    setFormNotes('')
    setFormDiscountType('NONE')
    setFormDiscountAmount('0')
  }

  // ── Delete quote ──
  async function handleDelete() {
    if (!selectedQuoteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/quotes/${selectedQuoteId}?storeId=${STORE_ID}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al eliminar')
      }
      toast.success('Cotización eliminada')
      setShowDeleteDialog(false)
      setSelectedQuoteId(null)
      setQuoteDetail(null)
      fetchQuotes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  // ── Convert to order ──
  async function handleConvert() {
    if (!selectedQuoteId) return
    setConverting(true)
    try {
      const res = await fetch(`/api/quotes/${selectedQuoteId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: convertPaymentMethod,
          notes: convertNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al convertir')
      }
      const data = await res.json()
      toast.success(`Cotización convertida en orden ${data.orderNumber}`)
      setShowConvertDialog(false)
      setSelectedQuoteId(null)
      setQuoteDetail(null)
      fetchQuotes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al convertir')
    } finally {
      setConverting(false)
    }
  }

  // ── Change status ──
  async function handleChangeStatus() {
    if (!selectedQuoteId || !newStatus) return
    setChangingStatus(true)
    try {
      const res = await fetch(`/api/quotes/${selectedQuoteId}?storeId=${STORE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al cambiar estado')
      }
      toast.success('Estado actualizado')
      setShowStatusDialog(false)
      setNewStatus('')
      openDetail(selectedQuoteId)
      fetchQuotes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar estado')
    } finally {
      setChangingStatus(false)
    }
  }

  // ── Print ──
  function handlePrint() {
    window.print()
  }

  // ── Copy quote number ──
  function copyQuoteNumber(num: string) {
    navigator.clipboard.writeText(num)
    toast.success('Número copiado al portapapeles')
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('ALL')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = statusFilter !== 'ALL' || dateFrom || dateTo || search.trim()

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Cotizaciones</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : 'Gestión de cotizaciones y presupuestos'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchQuotes} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true) }} className="gap-2">
            <Plus className="h-4 w-4" /> Nueva Cotización
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Cotizaciones</p>
                <p className="text-2xl font-bold mt-1">{kpis.total}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-sky-200 dark:border-sky-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">Pendientes</p>
                <p className="text-2xl font-bold mt-1 text-sky-700 dark:text-sky-300">{kpis.pending}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Total Pendiente</p>
                <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(kpis.pendingTotal, store?.currencyCode || 'COP')}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={clearFilters}>
                <XIcon className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo || undefined} />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom || undefined} />
          </div>
        </CardContent>
      </Card>

      {/* ── Table ──────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Sin cotizaciones</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No se encontraron cotizaciones con los filtros actuales. Crea tu primera cotización.
              </p>
              <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true) }} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Nueva Cotización
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs w-10">#</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Cotización</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Total</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Estado</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Vencimiento</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Creada</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q, idx) => {
                    const badge = STATUS_BADGES[q.status] || STATUS_BADGES.DRAFT
                    const isExpired = q.expiresAt && new Date(q.expiresAt) < new Date() && q.status === 'DRAFT'
                    return (
                      <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(q.id)}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-mono text-xs font-medium">{q.quoteNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[150px]" title={q.customerName || ''}>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{q.customerName || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-xs">
                          {formatCurrency(q.total, store?.currencyCode || 'COP')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badge.className}`}>
                            {isExpired ? STATUS_BADGES.EXPIRED.label : badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {q.expiresAt
                            ? format(new Date(q.expiresAt), 'dd MMM yyyy', { locale: es })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 shrink-0" />
                            {format(new Date(q.createdAt), 'dd MMM HH:mm', { locale: es })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => openDetail(q.id)} className="gap-2">
                                <Eye className="h-4 w-4" /> Ver Detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyQuoteNumber(q.quoteNumber)} className="gap-2">
                                <Copy className="h-4 w-4" /> Copiar Número
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { openDetail(q.id).then(() => setTimeout(() => { /* print will be available */ }, 200)) }} className="gap-2">
                                <Printer className="h-4 w-4" /> Imprimir
                              </DropdownMenuItem>
                              {['DRAFT', 'SENT', 'APPROVED'].includes(q.status) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => { openDetail(q.id); setTimeout(() => setShowConvertDialog(true), 300) }}
                                    className="gap-2 text-emerald-600 dark:text-emerald-400"
                                  >
                                    <ShoppingBag className="h-4 w-4" /> Convertir a Venta
                                  </DropdownMenuItem>
                                </>
                              )}
                              {STATUS_TRANSITIONS[q.status] && STATUS_TRANSITIONS[q.status].length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  {STATUS_TRANSITIONS[q.status].map(t => (
                                    <DropdownMenuItem key={t.value} onClick={() => { openDetail(q.id); setTimeout(() => { setNewStatus(t.value); setShowStatusDialog(true) }, 300) }} className="gap-2">
                                      {t.icon} {t.label}
                                    </DropdownMenuItem>
                                  ))}
                                </>
                              )}
                              {q.status === 'DRAFT' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => { openDetail(q.id); setTimeout(() => setShowDeleteDialog(true), 300) }} className="gap-2 text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4" /> Eliminar
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Quote Dialog ──────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={open => { if (!open) { setShowCreateDialog(false); resetCreateForm() } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createStep === 1 ? 'Nueva Cotización — Paso 1: Cliente y Productos' : 'Nueva Cotización — Paso 2: Resumen'}
            </DialogTitle>
            <DialogDescription>
              {createStep === 1 ? 'Selecciona un cliente y agrega productos o servicios a la cotización' : 'Revisa el resumen, ajusta descuentos y confirma'}
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 && (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                <div className="h-0.5 flex-1 bg-primary" />
                <div className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">2</div>
              </div>

              {/* Customer */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Cliente (opcional)</Label>
                {!formCustomerId ? (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente por nombre o teléfono..."
                      className="pl-9"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                    />
                    {customerResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-48 overflow-y-auto">
                        {customerResults.map(c => (
                          <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2" onClick={() => selectCustomer(c)}>
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{c.name}</span>
                            {c.phone && <span className="text-muted-foreground text-xs">{c.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium flex-1">{formCustomerName}</span>
                    {formCustomerPhone && <span className="text-xs text-muted-foreground">{formCustomerPhone}</span>}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFormCustomerId(null); setFormCustomerName(''); setFormCustomerPhone(''); setFormCustomerEmail('') }}>
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {!formCustomerId && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Nombre del cliente" value={formCustomerName} onChange={e => setFormCustomerName(e.target.value)} />
                    <Input placeholder="Teléfono" value={formCustomerPhone} onChange={e => setFormCustomerPhone(e.target.value)} />
                  </div>
                )}
              </div>

              <Separator />

              {/* Product search */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Agregar Productos o Servicios</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  {productSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground animate-spin" />}
                  <Input
                    placeholder="Buscar producto o servicio por nombre o SKU..."
                    className="pl-9 pr-9"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                  />
                  {productSearching && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md p-3 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Buscando productos...</span>
                    </div>
                  )}
                  {!productSearching && productSearch.length >= 1 && productResults.length === 0 && serviceResults.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md p-3 text-center">
                      <span className="text-xs text-muted-foreground">No se encontraron productos ni servicios</span>
                    </div>
                  )}
                  {!productSearching && (productResults.length > 0 || serviceResults.length > 0) && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-60 overflow-y-auto">
                      {productResults.map(p => (
                        <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => addToCart(p)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <span className="truncate block">{p.name}</span>
                              {p.sku && <span className="text-[10px] text-muted-foreground">SKU: {p.sku}</span>}
                            </div>
                            {p.category && <Badge variant="outline" className="text-[10px] px-1 shrink-0">{p.category.name}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-xs text-muted-foreground">Stock: {p.currentStock}</span>
                            <span className="font-medium text-xs">{formatCurrency(p.salePrice, store?.currencyCode || 'COP')}</span>
                          </div>
                        </button>
                      ))}
                      {serviceResults.length > 0 && productResults.length > 0 && <Separator />}
                      {serviceResults.map(s => (
                        <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => addServiceToCart(s)}>
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{s.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1">Servicio</Badge>
                          </div>
                          <span className="font-medium text-xs">{formatCurrency(s.price, store?.currencyCode || 'COP')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {productSearch.length > 0 && productSearch.length < 2 && (
                  <p className="text-xs text-muted-foreground pl-1">Escribe al menos 2 caracteres para buscar</p>
                )}
              </div>

              {/* Cart items */}
              {cartItems.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Items ({cartItems.length})</div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {cartItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice, store?.currencyCode || 'COP')} c/u</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCartItem(idx, { quantity: Math.max(1, item.quantity - 1) })}>−</Button>
                          <Input className="h-6 w-10 text-center text-xs p-0" value={item.quantity} readOnly />
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCartItem(idx, { quantity: item.quantity + 1 })}>+</Button>
                        </div>
                        <span className="font-medium text-xs w-20 text-right">{formatCurrency(item.unitPrice * item.quantity, store?.currencyCode || 'COP')}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCartItem(idx)}>
                          <XIcon className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">Busca y agrega productos o servicios</div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm() }}>Cancelar</Button>
                <Button disabled={cartItems.length === 0} onClick={() => setCreateStep(2)} className="gap-2">
                  Siguiente <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="h-0.5 flex-1 bg-primary" />
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
              </div>

              {/* Items summary */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Productos y Servicios</Label>
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Producto</TableHead>
                        <TableHead className="text-xs text-center">Cant.</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{item.productName}</TableCell>
                          <TableCell className="text-xs text-center">{item.quantity}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{formatCurrency(item.unitPrice * item.quantity, store?.currencyCode || 'COP')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo de Descuento</Label>
                  <Select value={formDiscountType} onValueChange={setFormDiscountType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sin descuento</SelectItem>
                      <SelectItem value="PERCENTAGE">Porcentaje (%)</SelectItem>
                      <SelectItem value="FIXED">Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formDiscountType !== 'NONE' && (
                  <div>
                    <Label className="text-xs">{formDiscountType === 'PERCENTAGE' ? 'Porcentaje' : 'Monto'}</Label>
                    <Input type="number" min="0" value={formDiscountAmount} onChange={e => setFormDiscountAmount(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-muted/50 p-3 rounded-md space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(cartTotals.subtotal, store?.currencyCode || 'COP')}</span>
                </div>
                {cartTotals.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span>Descuento</span>
                    <span>-{formatCurrency(cartTotals.discountAmount, store?.currencyCode || 'COP')}</span>
                  </div>
                )}
                {cartTotals.totalTax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Impuestos</span>
                    <span>{formatCurrency(cartTotals.totalTax, store?.currencyCode || 'COP')}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(cartTotals.total, store?.currencyCode || 'COP')}</span>
                </div>
              </div>

              {/* Validity + notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Vigencia (días)</Label>
                  <Input type="number" min="1" max="365" value={formValidityDays} onChange={e => setFormValidityDays(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Notas</Label>
                  <Input placeholder="Notas adicionales..." value={formNotes} onChange={e => setFormNotes(e.target.value)} />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCreateStep(1)} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Atrás
                </Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crear Cotización
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ──────────────────────────────── */}
      <Dialog open={!!selectedQuoteId && !!quoteDetail && !showDeleteDialog && !showConvertDialog && !showStatusDialog} onOpenChange={open => { if (!open) { setSelectedQuoteId(null); setQuoteDetail(null) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : quoteDetail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-primary" />
                  {quoteDetail.quoteNumber}
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-2 ${STATUS_BADGES[quoteDetail.status]?.className || ''}`}>
                    {STATUS_BADGES[quoteDetail.status]?.label || quoteDetail.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Creada el {format(new Date(quoteDetail.createdAt), "d 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
                  {quoteDetail.expiresAt && (
                    <> · Vence el {format(new Date(quoteDetail.expiresAt), "d 'de' MMMM yyyy", { locale: es })}</>
                  )}
                </DialogDescription>
              </DialogHeader>

              {/* Customer info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-medium">{quoteDetail.customerName || '—'}</p>
                </div>
                {quoteDetail.customerNit && (
                  <div>
                    <p className="text-xs text-muted-foreground">NIT</p>
                    <p className="font-medium">{quoteDetail.customerNit}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="font-medium">{quoteDetail.customerPhone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{quoteDetail.customerEmail || '—'}</p>
                </div>
              </div>

              <Separator />

              {/* Items table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Producto</TableHead>
                    <TableHead className="text-xs text-center">Cant.</TableHead>
                    <TableHead className="text-xs text-right">P. Unit.</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteDetail.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">
                        {item.productName}
                        {item.notes && <p className="text-muted-foreground text-[10px] mt-0.5">{item.notes}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-center">{item.quantity}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(item.unitPrice, store?.currencyCode || 'COP')}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{formatCurrency(item.totalRow, store?.currencyCode || 'COP')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="bg-muted/50 p-3 rounded-md space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(quoteDetail.subtotal, store?.currencyCode || 'COP')}</span>
                </div>
                {quoteDetail.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span>Descuento ({quoteDetail.discountType === 'PERCENTAGE' ? '%' : ''})</span>
                    <span>-{formatCurrency(quoteDetail.discountAmount, store?.currencyCode || 'COP')}</span>
                  </div>
                )}
                {quoteDetail.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Impuestos</span>
                    <span>{formatCurrency(quoteDetail.taxAmount, store?.currencyCode || 'COP')}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(quoteDetail.total, store?.currencyCode || 'COP')}</span>
                </div>
              </div>

              {/* Notes */}
              {quoteDetail.notes && (
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p>{quoteDetail.notes}</p>
                </div>
              )}

              {/* Converted order info */}
              {quoteDetail.convertedOrder && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 rounded-md text-sm">
                  <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Convertida en Orden {quoteDetail.convertedOrder.orderNumber}
                  </div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(quoteDetail.convertedOrder.total, store?.currencyCode || 'COP')} ·{' '}
                    {format(new Date(quoteDetail.convertedOrder.createdAt), 'dd MMM yyyy', { locale: es })}
                  </p>
                </div>
              )}

              {/* Actions */}
              <DialogFooter className="gap-2 flex-wrap">
                <Button variant="outline" className="gap-2" onClick={handlePrint}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => copyQuoteNumber(quoteDetail.quoteNumber)}>
                  <Copy className="h-4 w-4" /> Copiar Número
                </Button>
                {['DRAFT', 'SENT', 'APPROVED'].includes(quoteDetail.status) && (
                  <Button className="gap-2" onClick={() => { setConvertPaymentMethod('CASH'); setConvertNotes(''); setShowConvertDialog(true) }}>
                    <ShoppingBag className="h-4 w-4" /> Convertir a Venta
                  </Button>
                )}
                {STATUS_TRANSITIONS[quoteDetail.status] && STATUS_TRANSITIONS[quoteDetail.status].length > 0 && STATUS_TRANSITIONS[quoteDetail.status].map(t => (
                  <Button key={t.value} variant="outline" className="gap-2" onClick={() => { setNewStatus(t.value); setShowStatusDialog(true) }}>
                    {t.icon} {t.label}
                  </Button>
                ))}
                {quoteDetail.status === 'DRAFT' && (
                  <Button variant="destructive" className="gap-2" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4" /> Eliminar
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Convert Dialog ──────────────────────────────── */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertir a Venta</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará una orden de venta a partir de la cotización {quoteDetail?.quoteNumber} y se actualizará el stock de los productos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Método de Pago</Label>
              <Select value={convertPaymentMethod} onValueChange={setConvertPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                  <SelectItem value="CARD">Tarjeta</SelectItem>
                  <SelectItem value="DAVIPLATA">Daviplata</SelectItem>
                  <SelectItem value="NEQUI">Nequi</SelectItem>
                  <SelectItem value="TRANSFER">Transferencia</SelectItem>
                  <SelectItem value="FIADO">Fiado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea placeholder="Notas adicionales..." value={convertNotes} onChange={e => setConvertNotes(e.target.value)} rows={2} />
            </div>
            {quoteDetail && (
              <div className="bg-muted/50 p-2 rounded-md text-sm font-medium text-center">
                Total: {formatCurrency(quoteDetail.total, store?.currencyCode || 'COP')}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert} disabled={converting}>
              {converting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar Conversión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Dialog ──────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Cotización?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La cotización {quoteDetail?.quoteNumber} será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Status Change Dialog ────────────────────────── */}
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar Estado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas cambiar el estado de la cotización {quoteDetail?.quoteNumber} a{' '}
              <strong>{STATUS_BADGES[newStatus]?.label || newStatus}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangeStatus} disabled={changingStatus}>
              {changingStatus && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
