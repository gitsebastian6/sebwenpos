'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NITInput } from '@/components/ui/nit-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  FileText,
  Plus,
  Filter,
  X as XIcon,
  Eye,
  Download,
  Send,
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  ChevronRight,
  Building2,
  User,
  CalendarDays,
  Hash,
  Shield,
  Receipt,
  CreditCard,
  Info,
  MoreHorizontal,
  Package,
  Percent,
  QrCode,
  ExternalLink,
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/lib/format'

// ── Constants ───────────────────────────────────────────────────────────────

// Helper: get store ID from auth store (no hardcoded values)
function getStoreId(store: { id: number } | null): string {
  return store?.id?.toString() || ''
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  PENDING_VALIDATE: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  VALIDATED: { label: 'Validada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  DELIVERED: { label: 'Entregada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  REJECTED: { label: 'Rechazada', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' },
  CANCELLED: { label: 'Anulada', className: 'bg-destructive/10 text-destructive border-destructive/20' },
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'PENDING_VALIDATE', label: 'Pendiente' },
  { value: 'VALIDATED', label: 'Validada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'CANCELLED', label: 'Anulada' },
]

const PAYMENT_LABELS: Record<string, string> = {
  '1': 'Efectivo', '2': 'Tarjeta', '10': 'Transferencia', '42': 'Nequi/Daviplata', '99': 'Mixto',
}

// ── Types ───────────────────────────────────────────────────────────────────

interface InvoiceSummary {
  id: number
  invoiceNumber: string
  prefix: string
  consecutive: number
  customerNit: string
  customerName: string
  orderNumber: string | null
  subtotalBase: number
  totalTaxAmount: number
  grandTotal: number
  status: string
  testMode: boolean
  hasCUFE: boolean
  createdAt: string
  validatedAt: string | null
}

interface InvoiceDetail extends InvoiceSummary {
  resolutionNumber: string | null
  resolutionDate: string | null
  customerAddress: string | null
  customerPhone: string | null
  customerEmail: string | null
  customerRegime: string
  customerType: string
  subtotalBase: number
  taxExemptAmount: number
  taxBreakdown: Array<{ code: string; name: string; rate: number; base: number; amount: number }>
  totalTaxAmount: number
  totalWithTax: number
  discountAmount: number
  tipAmount: number
  grandTotal: number
  paymentMethod: string | null
  cufe: string | null
  qrCode: string | null
  status: string
  dianResponse: string | null
  dianErrorCode: string | null
  sentAt: string | null
  validatedAt: string | null
  emailedAt: string | null
  notes: string | null
  testMode: boolean
  orderId: number
  order: {
    id: number
    orderNumber: string
    paymentMethod: string
    customer: { name: string; phone: string | null; email: string | null } | null
    orderItems: {
      id: number
      productName: string
      productId: number | null
      serviceId: number | null
      quantity: number
      unitPrice: number
      totalRow: number
      taxCode: string | null
      taxRate: number | null
      taxAmount: number
      taxBase: number
      notes: string | null
    }[]
  }
  store: {
    name: string
    legalName: string | null
    nit: string | null
    address: string | null
    phone: string | null
    currencyCode: string | null
  }
}

interface OrderForInvoice {
  id: number
  orderNumber: string
  customerName: string | null
  status: string
  paymentMethod: string
  total: number
  createdAt: string
}

interface ResolutionStatus {
  resolutionNumber: string | null
  consecutiveStart: number | null
  consecutiveEnd: number | null
  currentConsecutive: number | null
  remaining: number
  status: string
}

// ── Component ───────────────────────────────────────────────────────────────

export function InvoicesView() {
  const { store } = useAuthStore()

  // ── List state ──
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ── Detail dialog ──
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ── Create dialog ──
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [availableOrders, setAvailableOrders] = useState<OrderForInvoice[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersSearch, setOrdersSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderForInvoice | null>(null)
  const [creating, setCreating] = useState(false)

  // ── Create form ──
  const [formNit, setFormNit] = useState(DIAN_CONSUMIDOR_FINAL_NIT)
  const [formName, setFormName] = useState('Consumidor Final')
  const [formAddress, setFormAddress] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formContingencyType, setFormContingencyType] = useState('01')
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(true)

  // ── Action loading ──
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Resolution status ──
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus | null>(null)
  const [resolutionLoading, setResolutionLoading] = useState(false)

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = invoices.length
    const validated = invoices.filter(i => i.status === 'VALIDATED' || i.status === 'DELIVERED').length
    const pending = invoices.filter(i => i.status === 'DRAFT' || i.status === 'PENDING_VALIDATE').length
    return { total, validated, pending }
  }, [invoices])

  // ── Fetch invoices ──
  const storeId = getStoreId(store)
  const fetchInvoices = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/invoices?${params}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setInvoices(Array.isArray(json) ? json : (json.data || []))
    } catch {
      toast.error('Error al cargar facturas')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo, search, storeId])

  useEffect(() => {
    if (!storeId) return
    const timer = setTimeout(() => fetchInvoices(), 300)
    return () => clearTimeout(timer)
  }, [fetchInvoices, storeId])

  // ── Fetch resolution status ──
  const fetchResolutionStatus = useCallback(async () => {
    setResolutionLoading(true)
    try {
      const res = await fetch(`/api/invoices/resolution-status?storeId=${storeId}`)
      if (!res.ok) throw new Error()
      setResolutionStatus(await res.json())
    } catch {
      // Resolution status is optional, don't show error
    } finally {
      setResolutionLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId) return
    fetchResolutionStatus()
  }, [fetchResolutionStatus, storeId])

  // ── Open detail dialog ──
  async function openDetail(invoiceId: number) {
    setSelectedInvoiceId(invoiceId)
    setInvoiceDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}?storeId=${storeId}`)
      if (!res.ok) throw new Error()
      setInvoiceDetail(await res.json())
    } catch {
      toast.error('Error al cargar el detalle de la factura')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Open create dialog ──
  async function openCreateDialog() {
    setShowCreateDialog(true)
    setCreateStep(1)
    setSelectedOrderId(null)
    setSelectedOrder(null)
    setOrdersSearch('')
    setFormNit(DIAN_CONSUMIDOR_FINAL_NIT)
    setFormName('Consumidor Final')
    setFormAddress('')
    setFormEmail('')
    setFormNotes('')
    setFormContingencyType('01')
    setIsConsumidorFinal(true)
    setOrdersLoading(true)
    try {
      const from = new Date()
      from.setDate(from.getDate() - 30)
      const params = new URLSearchParams({
        storeId,
        status: 'COMPLETED',
        from: from.toISOString().slice(0, 10),
      })
      const res = await fetch(`/api/orders?${params}`)
      if (!res.ok) throw new Error()
      const ordersJson = await res.json()
      const orders: OrderForInvoice[] = Array.isArray(ordersJson) ? ordersJson : (ordersJson.data || [])
      // Filter out orders that already have invoices
      const invoiceRes = await fetch(`/api/invoices?storeId=${storeId}&status=ALL`)
      if (invoiceRes.ok) {
        const invJson = await invoiceRes.json()
        const existingInvoices: InvoiceSummary[] = Array.isArray(invJson) ? invJson : (invJson.data || [])
        const invoicedOrderIds = new Set(existingInvoices.map(inv => inv.orderNumber).filter(Boolean))
        const filtered = orders.filter(o => !invoicedOrderIds.has(o.orderNumber))
        setAvailableOrders(filtered)
      } else {
        setAvailableOrders(orders)
      }
    } catch {
      toast.error('Error al cargar órdenes disponibles')
    } finally {
      setOrdersLoading(false)
    }
  }

  // ── Select order for invoice ──
  function selectOrder(order: OrderForInvoice) {
    setSelectedOrderId(order.id)
    setSelectedOrder(order)
    setFormName(order.customerName || 'Consumidor Final')
    setCreateStep(2)
  }

  // ── Create invoice ──
  async function handleCreateInvoice() {
    if (!selectedOrderId) return
    setCreating(true)
    try {
      const res = await fetch(`/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderId,
          customerNit: formNit,
          customerName: formName,
          customerAddress: formAddress || undefined,
          customerEmail: formEmail || undefined,
          notes: formNotes || undefined,
          testMode: true,
          invoiceType: formContingencyType,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al crear factura')
      }
      const data = await res.json()
      toast.success(`Factura ${data.invoiceNumber} creada exitosamente`)
      setShowCreateDialog(false)
      fetchInvoices()
      fetchResolutionStatus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear factura')
    } finally {
      setCreating(false)
    }
  }

  // ── Actions ──
  async function handlePrintInvoice(invoiceId: number, invoiceNumber?: string) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al generar PDF')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank')
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      } else {
        toast.error('Permite ventanas emergentes para imprimir')
      }
    } catch {
      toast.error('Error al imprimir factura')
    }
  }

  async function handleAction(action: string, invoiceId: number, invoiceNumber?: string) {
    setActionLoading(action)
    try {
      if (action === 'pdf') {
        const res = await fetch(`/api/invoices/${invoiceId}/pdf?storeId=${storeId}`)
        if (!res.ok) throw new Error('Error al generar PDF')
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Factura_${invoiceNumber || invoiceId}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        toast.success('PDF descargado')
      } else if (action === 'send') {
        const res = await fetch(`/api/invoices/${invoiceId}/send?storeId=${storeId}`, { method: 'POST' })
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error al enviar') }
        toast.success('Factura enviada a DIAN')
        fetchInvoices()
        if (selectedInvoiceId === invoiceId) openDetail(invoiceId)
      } else if (action === 'status') {
        const res = await fetch(`/api/invoices/${invoiceId}/status?storeId=${storeId}`)
        if (!res.ok) throw new Error('Error al consultar estado')
        const data = await res.json()
        toast.success(`Estado DIAN: ${data.dianStatus || data.status || 'Consultado'}`)
        if (selectedInvoiceId === invoiceId) openDetail(invoiceId)
        fetchInvoices()
      } else if (action === 'email') {
        const res = await fetch(`/api/invoices/${invoiceId}/email?storeId=${storeId}`, { method: 'POST' })
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error al enviar email') }
        toast.success('Factura enviada por email')
        if (selectedInvoiceId === invoiceId) openDetail(invoiceId)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en la acción')
    } finally {
      setActionLoading(null)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('ALL')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = statusFilter !== 'ALL' || dateFrom || dateTo || search.trim()

  const filteredOrders = useMemo(() => {
    if (!ordersSearch.trim()) return availableOrders
    const q = ordersSearch.toLowerCase()
    return availableOrders.filter(
      o => o.orderNumber.toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q)
    )
  }, [availableOrders, ordersSearch])

  // ── Resolution info ──
  const resolutionPercent = useMemo(() => {
    if (!resolutionStatus || resolutionStatus.consecutiveStart == null || resolutionStatus.consecutiveEnd == null) return 0
    const total = resolutionStatus.consecutiveEnd - resolutionStatus.consecutiveStart + 1
    const used = (resolutionStatus.currentConsecutive || resolutionStatus.consecutiveStart) - resolutionStatus.consecutiveStart + 1
    return Math.min(100, Math.round((used / total) * 100))
  }, [resolutionStatus])

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Facturación Electrónica</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : `Gestión de facturas electrónicas DIAN`}
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="gap-2 active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" /> Crear Factura
        </Button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Facturas</p>
                <p className="text-2xl font-bold mt-1">{kpis.total}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-800 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Facturas Validadas</p>
                <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{kpis.validated}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Facturas Pendientes</p>
                <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-300">{kpis.pending}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
              <Input placeholder="Buscar factura..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo || undefined} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom || undefined} />
          </div>
        </CardContent>
      </Card>

      {/* ── Invoices Table ─────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-4 animate-pulse">
                <FileText className="h-10 w-10 text-muted-foreground/60" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Sin facturas</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No se encontraron facturas con los filtros actuales. Crea tu primera factura electrónica desde una orden completada.
              </p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-4 gap-2 active:scale-[0.98] transition-all">
                <Plus className="h-4 w-4" /> Crear Factura
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs w-10">#</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Factura</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Total</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Estado</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Creada</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv, idx) => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(inv.id)}>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs font-medium">{inv.invoiceNumber}</span>
                          {inv.testMode && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                              TEST
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]" title={inv.customerName}>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{inv.customerName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">{formatCOP(inv.grandTotal)}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 shrink-0" />
                          {format(new Date(inv.createdAt), 'dd MMM HH:mm', { locale: es })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Más opciones">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openDetail(inv.id)} className="gap-2">
                              <Eye className="h-4 w-4" /> Ver Detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleAction('pdf', inv.id, inv.invoiceNumber)}
                              disabled={actionLoading === `pdf-${inv.id}`}
                              className="gap-2"
                            >
                              {actionLoading === `pdf-${inv.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              Generar PDF
                            </DropdownMenuItem>
                            {(inv.status === 'DRAFT' || inv.status === 'REJECTED') && (
                              <DropdownMenuItem
                                onClick={() => handleAction('send', inv.id, inv.invoiceNumber)}
                                disabled={actionLoading === `send-${inv.id}`}
                                className="gap-2"
                              >
                                {actionLoading === `send-${inv.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Enviar a DIAN
                              </DropdownMenuItem>
                            )}
                            {inv.status === 'PENDING_VALIDATE' && (
                              <DropdownMenuItem
                                onClick={() => handleAction('status', inv.id, inv.invoiceNumber)}
                                disabled={actionLoading === `status-${inv.id}`}
                                className="gap-2"
                              >
                                {actionLoading === `status-${inv.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Consultar Estado
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleAction('email', inv.id, inv.invoiceNumber)}
                              disabled={actionLoading === `email-${inv.id}`}
                              className="gap-2"
                            >
                              {actionLoading === `email-${inv.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                              Enviar por Email
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Resolution Status ──────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Estado de Resolución DIAN
          </CardTitle>
        </CardHeader>
        <CardContent>
          {resolutionLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ) : resolutionStatus ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Resolución</p>
                <p className="font-mono text-sm font-medium mt-0.5">
                  {resolutionStatus.resolutionNumber || 'No configurada'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rango Utilizado</p>
                <p className="text-sm font-medium mt-0.5">
                  {resolutionStatus.consecutiveStart != null && resolutionStatus.currentConsecutive != null
                    ? `${resolutionStatus.consecutiveStart} - ${resolutionStatus.currentConsecutive}`
                    : 'N/A'}
                  <span className="text-xs text-muted-foreground ml-1">
                    (de {resolutionStatus.consecutiveEnd ?? 'N/A'})
                  </span>
                </p>
                <Progress value={resolutionPercent} className="h-2 mt-2" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Facturas Restantes</p>
                <p className={`text-sm font-semibold mt-0.5 ${
                  resolutionStatus.remaining < 50 ? 'text-red-600 dark:text-red-400' :
                  resolutionStatus.remaining < 200 ? 'text-amber-600 dark:text-amber-400' :
                  'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {resolutionStatus.remaining ?? 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <div className="mt-0.5">
                  <ResolutionStatusBadge status={resolutionStatus.status} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se pudo consultar el estado de la resolución. Verifica la configuración en Configuración &gt; Facturación.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Create Invoice Dialog ──────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setCreateStep(1) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Crear Factura Electrónica
            </DialogTitle>
            <DialogDescription>
              {createStep === 1
                ? 'Paso 1: Selecciona la orden de venta para facturar'
                : 'Paso 2: Completa la información del cliente'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${
              createStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>1</div>
            <div className={`h-0.5 flex-1 ${createStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${
              createStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>2</div>
          </div>

          {createStep === 1 ? (
            /* ── Step 1: Select order ── */
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número de orden o cliente..."
                  className="pl-9"
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                />
              </div>
              {ordersLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">No hay órdenes completadas disponibles para facturar.</p>
                  <p className="text-xs text-muted-foreground mt-1">Solo se muestran órdenes de los últimos 30 días sin factura asociada.</p>
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                  {filteredOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => selectOrder(order)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                        <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">{order.customerName || 'Sin cliente'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatCOP(order.total)}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(order.createdAt), 'dd MMM', { locale: es })}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Step 2: Customer info ── */
            <div className="space-y-4">
              {/* Selected order info */}
              {selectedOrder && (
                <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{selectedOrder.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.customerName || 'Consumidor Final'} · {formatCOP(selectedOrder.total)}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCreateStep(1)}>
                    Cambiar
                  </Button>
                </div>
              )}

              {/* DIAN Abecé info */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-medium">Resolución 000165/2023 — Artículo 11</p>
                    <p className="text-muted-foreground mt-0.5">Solo se requiere Nombre, NIT y correo electrónico.</p>
                  </div>
                </div>
              </div>

              {/* Consumidor Final toggle */}
              <Button
                type="button"
                variant={isConsumidorFinal ? 'default' : 'outline'}
                size="sm"
                className={`w-full gap-2 ${isConsumidorFinal ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                onClick={() => {
                  if (isConsumidorFinal) {
                    setIsConsumidorFinal(false)
                    setFormNit('')
                    setFormName('')
                  } else {
                    setIsConsumidorFinal(true)
                    setFormNit(DIAN_CONSUMIDOR_FINAL_NIT)
                    setFormName('Consumidor Final')
                  }
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                {isConsumidorFinal ? 'Consumidor Final activado' : 'Marcar como Consumidor Final'}
              </Button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-nit" className="text-xs font-medium">NIT *</Label>
                  <NITInput
                    id="inv-nit"
                    value={formNit}
                    onChange={(val) => { setFormNit(val); if (val !== DIAN_CONSUMIDOR_FINAL_NIT) setIsConsumidorFinal(false) }}
                    placeholder={DIAN_CONSUMIDOR_FINAL_NIT}
                    disabled={isConsumidorFinal}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-name" className="text-xs font-medium">Nombre / Razón Social *</Label>
                  <Input
                    id="inv-name"
                    value={formName}
                    onChange={(e) => { setFormName(e.target.value); if (e.target.value !== 'Consumidor Final') setIsConsumidorFinal(false) }}
                    placeholder="Consumidor Final"
                    disabled={isConsumidorFinal}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="inv-email" className="text-xs font-medium">Email</Label>
                  <Input id="inv-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="cliente@email.com" />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="inv-address" className="text-xs font-medium flex items-center gap-1.5">
                    Dirección
                    <span className="text-[10px] text-muted-foreground font-normal">Solo requerido si la entrega es fuera de la sede del negocio</span>
                  </Label>
                  <Input id="inv-address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Dirección del cliente (opcional)" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-contingency" className="text-xs font-medium">Tipo de Factura</Label>
                  <Select value={formContingencyType} onValueChange={setFormContingencyType}>
                    <SelectTrigger id="inv-contingency" className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="01">01 — Normal</SelectItem>
                      <SelectItem value="03">03 — Contingencia Facturador</SelectItem>
                      <SelectItem value="04">04 — Contingencia DIAN Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="inv-notes" className="text-xs font-medium">Notas (opcional)</Label>
                  <Textarea id="inv-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Observaciones adicionales..." rows={2} className="text-xs" />
                </div>
              </div>
              {formContingencyType === '03' && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-red-800 dark:text-red-200">
                      <p className="font-medium">Contingencia Tipo 03</p>
                      <p className="text-muted-foreground mt-0.5">Falla tecnológica del facturador. Debe tener factura pre-autorizada en papel y transmitir dentro de las 48 horas.</p>
                    </div>
                  </div>
                </div>
              )}
              {formContingencyType === '04' && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-red-800 dark:text-red-200">
                      <p className="font-medium">Contingencia Tipo 04</p>
                      <p className="text-muted-foreground mt-0.5">Sistema DIAN fuera de línea. Emitir sin validación previa, reintentar cada 30 min, máximo 48h para transmitir.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { if (createStep === 1) { setShowCreateDialog(false) } else { setCreateStep(1) } }}>
              {createStep === 1 ? 'Cancelar' : 'Atrás'}
            </Button>
            {createStep === 2 && (
              <Button onClick={handleCreateInvoice} disabled={creating || !formNit.trim() || !formName.trim()}>
                {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando...</> : <><Plus className="h-4 w-4 mr-2" />Crear Factura</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invoice Detail Dialog ──────────────────────── */}
      <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => { if (!open) { setSelectedInvoiceId(null); setInvoiceDetail(null) } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {invoiceDetail ? invoiceDetail.invoiceNumber : 'Detalle de Factura'}
            </DialogTitle>
            <DialogDescription>
              {invoiceDetail
                ? `Factura electrónica — ${invoiceDetail.testMode ? 'Modo de prueba' : 'Producción'}`
                : 'Cargando...'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4 p-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : invoiceDetail ? (
            <div className="space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Número</Label>
                  <p className="font-mono font-semibold mt-0.5">{invoiceDetail.invoiceNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <div className="mt-0.5"><InvoiceStatusBadge status={invoiceDetail.status} /></div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fecha de Creación</Label>
                  <p className="text-sm mt-0.5 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    {format(new Date(invoiceDetail.createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Método de Pago</Label>
                  <p className="text-sm mt-0.5 flex items-center gap-1">
                    <CreditCard className="h-3 w-3 text-muted-foreground" />
                    {PAYMENT_LABELS[invoiceDetail.paymentMethod || ''] || invoiceDetail.paymentMethod || invoiceDetail.order?.paymentMethod || 'N/A'}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Emisor & Receptor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <Building2 className="h-3.5 w-3.5" /> Emisor
                  </h4>
                  <Card className="bg-muted/30">
                    <CardContent className="p-3 space-y-1">
                      <p className="font-medium text-sm">{invoiceDetail.store.legalName || invoiceDetail.store.name}</p>
                      <p className="text-xs text-muted-foreground">NIT: {invoiceDetail.store.nit || 'No configurado'}</p>
                      {invoiceDetail.store.address && <p className="text-xs text-muted-foreground">{invoiceDetail.store.address}</p>}
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <User className="h-3.5 w-3.5" /> Receptor
                  </h4>
                  <Card className="bg-muted/30">
                    <CardContent className="p-3 space-y-1">
                      <p className="font-medium text-sm">{invoiceDetail.customerName}</p>
                      <p className="text-xs text-muted-foreground">NIT: {invoiceDetail.customerNit} · {invoiceDetail.customerType}</p>
                      <p className="text-xs text-muted-foreground">Régimen: {invoiceDetail.customerRegime}</p>
                      {invoiceDetail.customerAddress && <p className="text-xs text-muted-foreground">{invoiceDetail.customerAddress}</p>}
                      {invoiceDetail.customerPhone && <p className="text-xs text-muted-foreground">Tel: {invoiceDetail.customerPhone}</p>}
                      {invoiceDetail.customerEmail && <p className="text-xs text-muted-foreground">Email: {invoiceDetail.customerEmail}</p>}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Separator />

              {/* Items table */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Package className="h-3.5 w-3.5" /> Detalle de Productos ({invoiceDetail.order?.orderItems?.length || 0})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Descripción</TableHead>
                        <TableHead className="text-center text-xs">Cant.</TableHead>
                        <TableHead className="text-right text-xs">P. Unit.</TableHead>
                        <TableHead className="text-right text-xs">Imp.</TableHead>
                        <TableHead className="text-right text-xs">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceDetail.order?.orderItems?.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-medium">{item.productName}</TableCell>
                          <TableCell className="text-center text-xs">{item.quantity}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{formatCOP(item.unitPrice)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {item.taxRate ? `${item.taxRate}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatCOP(item.totalRow)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Tax breakdown */}
              {invoiceDetail.taxBreakdown && invoiceDetail.taxBreakdown.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <Percent className="h-3.5 w-3.5" /> Desglose de Impuestos
                  </h4>
                  <div className="rounded-lg border divide-y">
                    {invoiceDetail.taxBreakdown.map((tax, i) => (
                      <div key={i} className="flex items-center justify-between p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">{tax.code}</Badge>
                          <span className="text-xs">{tax.name} ({tax.rate}%)</span>
                        </div>
                        <div className="text-right text-xs">
                          <span className="text-muted-foreground">Base: {formatCOP(tax.base)}</span>
                          <span className="ml-3 font-medium">{formatCOP(tax.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal (base gravable)</span><span>{formatCOP(invoiceDetail.subtotalBase)}</span>
                </div>
                {invoiceDetail.taxExemptAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Exento</span><span>{formatCOP(invoiceDetail.taxExemptAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <span>Impuestos</span><span>{formatCOP(invoiceDetail.totalTaxAmount)}</span>
                </div>
                {invoiceDetail.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                    <span>Descuento</span><span>-{formatCOP(invoiceDetail.discountAmount)}</span>
                  </div>
                )}
                {invoiceDetail.tipAmount > 0 && (
                  <div className="flex justify-between text-sm text-pink-600 dark:text-pink-400">
                    <span>Propina</span><span>{formatCOP(invoiceDetail.tipAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total a Pagar</span><span>{formatCOP(invoiceDetail.grandTotal)}</span>
                </div>
              </div>

              <Separator />

              {/* CUFE */}
              {invoiceDetail.cufe && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <Hash className="h-3.5 w-3.5" /> CUFE
                  </h4>
                  <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                    <code className="flex-1 text-[10px] break-all font-mono leading-relaxed">
                      {invoiceDetail.cufe.length > 100
                        ? `${invoiceDetail.cufe.slice(0, 100)}...`
                        : invoiceDetail.cufe}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Copiar CUFE"
                      aria-label="Copiar CUFE"
                      onClick={() => {
                        navigator.clipboard.writeText(invoiceDetail.cufe || '')
                        toast.success('CUFE copiado al portapapeles')
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* QR Code for DIAN verification */}
              {invoiceDetail.qrCode && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <QrCode className="h-3.5 w-3.5" /> Código QR — Verificación DIAN
                  </h4>
                  <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/50 p-4">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(invoiceDetail.qrCode)}`}
                      alt="QR Verificación DIAN"
                      className="w-36 h-36 rounded-lg border border-border/50 bg-white p-1"
                    />
                    <a
                      href={invoiceDetail.qrCode}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Verificar en portal DIAN
                    </a>
                    <p className="text-[10px] text-muted-foreground break-all text-center max-w-full">
                      {invoiceDetail.qrCode}
                    </p>
                  </div>
                </div>
              )}

              {/* Resolution info */}
              {invoiceDetail.resolutionNumber && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <Shield className="h-3.5 w-3.5" /> Resolución
                  </h4>
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <p className="font-mono text-xs">{invoiceDetail.resolutionNumber}</p>
                    {invoiceDetail.resolutionDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Fecha: {format(new Date(invoiceDetail.resolutionDate), 'dd/MM/yyyy', { locale: es })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* DIAN status */}
              {(invoiceDetail.status === 'PENDING_VALIDATE' || invoiceDetail.status === 'VALIDATED' || invoiceDetail.status === 'REJECTED') && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <Info className="h-3.5 w-3.5" /> Estado DIAN
                  </h4>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      {invoiceDetail.status === 'PENDING_VALIDATE' && (
                        <><Clock className="h-4 w-4 text-amber-500" /><span className="text-sm text-amber-600 dark:text-amber-400">En espera de validación por DIAN</span></>
                      )}
                      {invoiceDetail.status === 'VALIDATED' && (
                        <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-sm text-emerald-600 dark:text-emerald-400">Factura validada exitosamente por DIAN</span></>
                      )}
                      {invoiceDetail.status === 'REJECTED' && (
                        <><AlertTriangle className="h-4 w-4 text-red-500" /><span className="text-sm text-red-600 dark:text-red-400">Factura rechazada por DIAN</span></>
                      )}
                    </div>
                    {invoiceDetail.sentAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Enviada: {format(new Date(invoiceDetail.sentAt), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                    )}
                    {invoiceDetail.validatedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Validada: {format(new Date(invoiceDetail.validatedAt), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                    )}
                    {invoiceDetail.dianErrorCode && (
                      <p className="text-xs text-red-500 mt-1">Error: {invoiceDetail.dianErrorCode}</p>
                    )}
                    {invoiceDetail.dianResponse && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">Ver respuesta DIAN</summary>
                        <pre className="mt-1 text-[10px] bg-muted/50 p-2 rounded overflow-auto max-h-24 font-mono">{invoiceDetail.dianResponse}</pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {invoiceDetail.notes && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <FileText className="h-3.5 w-3.5" /> Notas
                  </h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-lg bg-muted/30 p-3">{invoiceDetail.notes}</p>
                </div>
              )}

              {/* Action buttons */}
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => handlePrintInvoice(invoiceDetail.id, invoiceDetail.invoiceNumber)} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Imprimir
                </Button>
                <Button onClick={() => handleAction('pdf', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={actionLoading === `pdf-${invoiceDetail.id}`} variant="outline" className="gap-2">
                  {actionLoading === `pdf-${invoiceDetail.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Descargar PDF
                </Button>
                {(invoiceDetail.status === 'DRAFT' || invoiceDetail.status === 'REJECTED') && (
                  <Button onClick={() => handleAction('send', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={actionLoading === `send-${invoiceDetail.id}`} variant="outline" className="gap-2">
                    {actionLoading === `send-${invoiceDetail.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar a DIAN
                  </Button>
                )}
                {invoiceDetail.customerEmail && (invoiceDetail.status === 'VALIDATED' || invoiceDetail.status === 'DELIVERED') && (
                  <Button onClick={() => handleAction('email', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={actionLoading === `email-${invoiceDetail.id}`} variant="outline" className="gap-2">
                    {actionLoading === `email-${invoiceDetail.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Enviar por Email
                  </Button>
                )}
                {invoiceDetail.status === 'PENDING_VALIDATE' && (
                  <Button onClick={() => handleAction('status', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={actionLoading === `status-${invoiceDetail.id}`} variant="outline" className="gap-2">
                    {actionLoading === `status-${invoiceDetail.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Consultar Estado DIAN
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>No se pudo cargar el detalle de la factura.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGES[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' }
  return <Badge variant="outline" className={`text-xs ${s.className}`}>{s.label}</Badge>
}

function ResolutionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    OK: { label: 'Activa', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    WARNING: { label: 'Por vencer', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    EXPIRED: { label: 'Vencida', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' },
    LOW: { label: 'Bajo stock', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  }
  const s = map[status] || { label: status || 'Desconocido', className: 'bg-muted text-muted-foreground border-border' }
  return <Badge variant="outline" className={`text-xs ${s.className}`}>{s.label}</Badge>
}


