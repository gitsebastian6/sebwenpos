'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import type { TaxBreakdownEntry } from '@/types'
import { formatCOP } from '@/lib/format'
import { toast } from 'sonner'
import {
  Plus, Search, Eye, Pencil, ArrowRightLeft, XCircle, Printer,
  Loader2, ChevronRight, ChevronLeft, Minus, Trash2, User,
  CalendarDays, FileText, Receipt, QrCode, AlertTriangle, ShoppingBag, Check,
  MonitorSmartphone, Hash,
} from 'lucide-react'
import { format, isAfter, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
import { useQuotations, useQuotationDetail, useCreateQuotation, useUpdateQuotation, useConvertQuotation } from '@/hooks/api/use-quotations'
import { useProducts } from '@/hooks/api/use-products'
import { useCreateInvoice } from '@/hooks/api/use-invoices'

// ─── Types ──────────────────────────────────────────────

interface QuotationListItem {
  id: number
  quotationNumber: string
  customerName: string | null
  customerNit: string | null
  total: number
  status: string
  validUntil: string | null
  createdAt: string
  itemCount: number
}

interface QuotationItem {
  id: number
  productId: number | null
  productName: string
  quantity: number
  unitPrice: number
  totalRow: number
  taxCode: string | null
  taxRate: number
  taxAmount: number
  taxBase: number
  notes: string | null
}

// TaxBreakdownItem → TaxBreakdownEntry imported from @/types
type TaxBreakdownItem = TaxBreakdownEntry

interface QuotationDetail extends Omit<QuotationListItem, 'itemCount'> {
  subtotal: number
  taxAmount: number
  taxBreakdown: TaxBreakdownItem[] | null
  discountAmount: number
  discountType: string
  validUntil: string | null
  notes: string | null
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
  convertedToOrderId: number | null
  updatedAt: string
  items: QuotationItem[]
}

interface ProductSearchResult {
  id: number
  name: string
  salePrice: number
  currentStock: number
  sku: string | null
  category: { id: number; name: string; icon: string | null } | null
}

interface CartItem {
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  notes: string
}

// ─── Constants ──────────────────────────────────────────

// cop → formatCOP imported from @/lib/format
const cop = formatCOP

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE: { label: 'Activa', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  CONVERTED: { label: 'Convertida', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800', dot: 'bg-sky-500' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  EXPIRED: { label: 'Vencida', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
}

const STATUS_TABS = [
  { key: 'ALL', label: 'Todas' },
  { key: 'ACTIVE', label: 'Activas' },
  { key: 'CONVERTED', label: 'Convertidas' },
  { key: 'CANCELLED', label: 'Canceladas' },
  { key: 'EXPIRED', label: 'Vencidas' },
]

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'DAVIPLATA', label: 'Daviplata' },
  { value: 'NEQUI', label: 'Nequi' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'FIADO', label: 'Fiado' },
]

// ─── Main Component ─────────────────────────────────────

export function QuotationsView() {
  const store = useAuthStore((s) => s.store)

  // List state
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // ─── TanStack Query hooks ──────────────────────
  const quotationsQuery = useQuotations(store?.id, { q: searchQuery, status: statusFilter })

  // Product search with debounce
  const [productSearch, setProductSearch] = useState('')
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('')
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const productsSearchQuery = useProducts(store?.id, { search: debouncedProductSearch, active: 'true' })

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (productSearch.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        setDebouncedProductSearch(productSearch)
      }, 300)
    } else {
      setDebouncedProductSearch('')
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [productSearch])

  // Detail query
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pendingConvert, setPendingConvert] = useState(false)
  const detailQuery = useQuotationDetail(selectedId, store?.id)

  // Mutation hooks
  const createQuotationMut = useCreateQuotation()
  const updateQuotationMut = useUpdateQuotation()
  const convertQuotationMut = useConvertQuotation()
  const createInvoiceMut = useCreateInvoice()

  // ─── Derived state ──────────────────────────────
  const quotations = useMemo(() => {
    const data = quotationsQuery.data ?? []
    const now = new Date()
    return data.map(q => {
      if (q.status === 'ACTIVE' && q.validUntil && isAfter(now, parseISO(q.validUntil))) {
        return { ...q, status: 'EXPIRED' }
      }
      return q
    })
  }, [quotationsQuery.data])
  const loading = quotationsQuery.isLoading

  const searchResults = useMemo(() => {
    if (!debouncedProductSearch.trim()) return []
    return (productsSearchQuery.data?.data ?? []).slice(0, 15) as ProductSearchResult[]
  }, [debouncedProductSearch, productsSearchQuery.data])
  const searchingProducts = !!debouncedProductSearch.trim() && productsSearchQuery.isFetching

  // Enrich detail with expired check
  const detail = useMemo(() => {
    if (!detailQuery.data) return null
    const d = detailQuery.data
    if (d.status === 'ACTIVE' && d.validUntil && isAfter(new Date(), parseISO(d.validUntil))) {
      return { ...d, status: 'EXPIRED' }
    }
    return d
  }, [detailQuery.data])
  const loadingDetail = detailQuery.isLoading

  const saving = createQuotationMut.isPending
  const converting = convertQuotationMut.isPending
  const creatingInvoice = createInvoiceMut.isPending

  // Detail error handling
  const [showDetail, setShowDetail] = useState(false)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createStep, setCreateStep] = useState(1)
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(true)
  const [customerName, setCustomerName] = useState('')
  const [customerNit, setCustomerNit] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENTAGE' | 'FIXED'>('NONE')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [validUntil, setValidUntil] = useState<Date | undefined>(undefined)
  const [quotationNotes, setQuotationNotes] = useState('')

  // Convert dialog
  const [showConvert, setShowConvert] = useState(false)
  const [convertMethod, setConvertMethod] = useState('')

  // ── Invoice mode ──
  const isEInvEnabled = !!store?.invoiceEnabled && !!store?.nit
  const hasStoreNit = !!store?.nit
  type InvoiceMode = 'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'
  const [convertInvoiceMode, setConvertInvoiceMode] = useState<InvoiceMode>('TIRILLA')
  const [invoiceCustomerNit, setInvoiceCustomerNit] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')
  const [nitDvError, setNitDvError] = useState('')

  // Print ref
  const printRef = useRef<HTMLDivElement>(null)

  // ─── Effects ────────────────────────────────────

  useEffect(() => {
    if (showDetail && detailQuery.isError && !pendingConvert) {
      toast.error('Error al cargar detalle')
      setShowDetail(false)
      setSelectedId(null)
    }
  }, [showDetail, detailQuery.isError, pendingConvert])

  // Auto-open convert dialog when detail loads for pending convert
  useEffect(() => {
    if (pendingConvert && detail && !detailQuery.isLoading) {
      setPendingConvert(false)
      setConvertMethod('')
      setConvertInvoiceMode('TIRILLA')
      setInvoiceCustomerNit('')
      setInvoiceCustomerName('')
      setInvoiceCustomerEmail('')
      setNitDvError('')
      setShowConvert(true)
    }
  }, [pendingConvert, detail, detailQuery.isLoading])

  // ─── Cart operations ─────────────────────────────

  const addToCart = (product: ProductSearchResult) => {
    const existing = cart.find((c) => c.productId === product.id)
    if (existing) {
      setCart(cart.map((c) => c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        unitPrice: product.salePrice,
        quantity: 1,
        notes: '',
      }])
    }
    setProductSearch('')
  }

  const updateCartQty = (productId: number, delta: number) => {
    setCart(cart.map((c) => {
      if (c.productId === productId) {
        const newQty = Math.max(1, c.quantity + delta)
        return { ...c, quantity: newQty }
      }
      return c
    }))
  }

  const updateCartNotes = (productId: number, notes: string) => {
    setCart(cart.map((c) => c.productId === productId ? { ...c, notes } : c))
  }

  const removeFromCart = (productId: number) => {
    setCart(cart.filter((c) => c.productId !== productId))
  }

  // ─── Calculations ────────────────────────────────

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0), [cart])

  const calculatedDiscount = useMemo(() => {
    if (discountType === 'PERCENTAGE') return Math.round(subtotal * (Number(discountAmount) / 100))
    if (discountType === 'FIXED') return Math.min(Number(discountAmount), subtotal)
    return 0
  }, [discountType, discountAmount, subtotal])

  const total = useMemo(() => subtotal - calculatedDiscount, [subtotal, calculatedDiscount])

  // ─── Create quotation ────────────────────────────

  const handleCreateQuotation = async () => {
    if (!store || cart.length === 0) return

    try {
      const body = {
        storeId: store.id,
        customerName: isConsumidorFinal ? 'Consumidor Final' : customerName || undefined,
        customerNit: isConsumidorFinal ? DIAN_CONSUMIDOR_FINAL_NIT : customerNit || undefined,
        customerEmail: customerEmail || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          notes: c.notes || undefined,
        })),
        discountType: discountType === 'NONE' ? 'NONE' : discountType,
        discountAmount: discountType === 'NONE' ? 0 : Number(discountAmount),
        validUntil: validUntil ? validUntil.toISOString() : null,
        notes: quotationNotes || undefined,
      }

      const data = await createQuotationMut.mutateAsync({ body })
      toast.success(`Cotización ${data.quotationNumber} creada exitosamente`)
      resetCreateForm()
      setShowCreate(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear cotización')
    }
  }

  const resetCreateForm = () => {
    setCreateStep(1)
    setIsConsumidorFinal(true)
    setCustomerName('')
    setCustomerNit('')
    setCustomerEmail('')
    setCustomerPhone('')
    setCustomerAddress('')
    setCart([])
    setProductSearch('')
    setDiscountType('NONE')
    setDiscountAmount('0')
    setValidUntil(undefined)
    setQuotationNotes('')
  }

  // ─── Open detail ──────────────────────────────────

  const openDetail = (id: number) => {
    setSelectedId(id)
    setShowDetail(true)
  }

  // ─── Cancel quotation ────────────────────────────

  const handleCancel = async (id: number) => {
    if (!store) return
    try {
      await updateQuotationMut.mutateAsync({ id, body: { storeId: store.id, status: 'CANCELLED' } })
      toast.success('Cotización cancelada')
      setShowDetail(false)
      setSelectedId(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
    }
  }

  // ─── Convert to order ────────────────────────────

  const openConvertDialog = () => {
    setConvertMethod('')
    setConvertInvoiceMode('TIRILLA')
    setInvoiceCustomerNit('')
    setInvoiceCustomerName('')
    setInvoiceCustomerEmail('')
    setNitDvError('')
    setShowConvert(true)
  }

  const handleConvert = async () => {
    if (!store || !detail || !convertMethod) return
    try {
      const convertResult = await convertQuotationMut.mutateAsync({
        id: detail.id,
        body: { storeId: store.id, paymentMethod: convertMethod },
      })
      toast.success(convertResult.message, { description: `Orden: ${convertResult.orderNumber} — ${cop(convertResult.total)}` })

      // ── Auto-create electronic invoice if selected ──
      if (convertInvoiceMode === 'ELECTRONICA' && isEInvEnabled && convertResult?.orderId) {
        try {
          const finalNit = invoiceCustomerNit.trim().replace(/[^0-9]/g, '') || DIAN_CONSUMIDOR_FINAL_NIT
          const finalName = invoiceCustomerName.trim() || 'Consumidor Final'
          const finalEmail = invoiceCustomerEmail.trim() || undefined

          const invBody: Record<string, unknown> = {
            orderId: convertResult.orderId,
            testMode: store?.invoiceTestMode ?? true,
            customerNit: finalNit,
            customerName: finalName,
            autoSend: true,
          }
          if (finalEmail) invBody.customerEmail = finalEmail

          const invoiceData = await createInvoiceMut.mutateAsync({ body: invBody })
          toast.success(`Factura electrónica ${invoiceData.invoiceNumber} generada`, { duration: 5000 })
        } catch (invErr: unknown) {
          const msg = invErr instanceof Error ? invErr.message : 'Error al generar factura'
          toast.error(`Error al generar factura: ${msg}`, { duration: 6000 })
        }
      }

      setShowConvert(false)
      setShowDetail(false)
      setSelectedId(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    }
  }

  // ─── Print ───────────────────────────────────────

  const handlePrint = () => {
    if (!printRef.current) return
    const printContent = printRef.current.innerHTML
    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html><head><title>Imprimir Cotización</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .store-name { font-size: 22px; font-weight: bold; }
        .store-nit { font-size: 13px; color: #555; }
        .doc-title { font-size: 18px; font-weight: bold; margin: 15px 0 5px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; font-size: 13px; }
        .info-label { font-weight: bold; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .totals { display: flex; justify-content: flex-end; }
        .totals-table { width: 250px; }
        .totals-table td { border: none; padding: 3px 8px; }
        .grand-total td { font-weight: bold; font-size: 15px; border-top: 2px solid #333 !important; }
        .notes { margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      ${printContent}
      <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>`)
    win.document.close()
  }

  // ─── Status badge ────────────────────────────────

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status]
    if (!cfg) return <Badge variant="secondary">{status}</Badge>
    return (
      <Badge variant="outline" className={cfg.color}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </Badge>
    )
  }

  // ─── Count by status ─────────────────────────────

  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = { ALL: quotations.length }
    for (const q of quotations) {
      counts[q.status] = (counts[q.status] || 0) + 1
    }
    return counts
  }, [quotations])

  if (!store) return null

  // ─── Render ──────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cotizaciones</h2>
          <p className="text-sm text-muted-foreground">
            Gestiona las cotizaciones y presupuestos para tus clientes
          </p>
        </div>
        <Button onClick={() => { resetCreateForm(); setShowCreate(true) }} className="gap-2 active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" />
          Nueva Cotización
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={statusFilter === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(tab.key)}
            className="gap-1.5"
          >
            {tab.label}
            {countByStatus[tab.key] !== undefined && (
              <span className="ml-0.5 text-xs opacity-70">({countByStatus[tab.key]})</span>
            )}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por número o cliente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : quotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-16 w-16 text-muted-foreground/40 mb-4 animate-bounce" />
              <h3 className="text-base font-medium text-muted-foreground">Sin cotizaciones</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {statusFilter !== 'ALL'
                  ? 'No hay cotizaciones con este estado'
                  : 'Crea tu primera cotización'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden md:table-cell">Fecha</TableHead>
                    <TableHead className="hidden lg:table-cell">Válida Hasta</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations.map((q) => (
                    <TableRow key={q.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-medium">{q.quotationNumber}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{q.customerName || '—'}</div>
                          {q.customerNit && (
                            <div className="text-xs text-muted-foreground">{q.customerNit}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {format(parseISO(q.createdAt), 'dd MMM yyyy', { locale: es })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {q.validUntil
                          ? format(parseISO(q.validUntil), 'dd MMM yyyy', { locale: es })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{cop(q.total)}</TableCell>
                      <TableCell><StatusBadge status={q.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(q.id)} aria-label="Ver detalles">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {q.status === 'ACTIVE' && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(q.id)} aria-label="Editar cotización">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:text-amber-700"
                                onClick={() => {
                                  setSelectedId(q.id)
                                  setPendingConvert(true)
                                }}
                                aria-label="Convertir a venta"
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleCancel(q.id)}
                                aria-label="Cancelar cotización"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════
          CREATE DIALOG (multi-step)
      ════════════════════════════════════════════════ */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open && !saving) { setShowCreate(false); resetCreateForm() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col rounded-xl">
          <DialogHeader>
            <DialogTitle>Nueva Cotización</DialogTitle>
            <DialogDescription>
              Paso {createStep} de 3 — {createStep === 1 ? 'Datos del cliente' : createStep === 2 ? 'Seleccionar productos' : 'Revisión y confirmación'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 py-1">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    step < createStep
                      ? 'bg-emerald-500 text-white'
                      : step === createStep
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step < createStep ? <Check className="h-4 w-4" /> : step}
                </div>
                {step < 3 && <div className={`h-0.5 w-8 ${step < createStep ? 'bg-emerald-500' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>

          <Separator />

          <ScrollArea className="flex-1 -mx-6 px-6">
            {/* ── Step 1: Customer ── */}
            {createStep === 1 && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="consumidor" className="cursor-pointer font-medium">
                      Consumidor Final
                    </Label>
                  </div>
                  <Switch
                    id="consumidor"
                    checked={isConsumidorFinal}
                    onCheckedChange={(checked) => {
                      setIsConsumidorFinal(checked)
                      if (checked) {
                        setCustomerName('')
                        setCustomerNit('')
                      }
                    }}
                  />
                </div>

                {isConsumidorFinal ? (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    Se usará <strong>Consumidor Final</strong> con NIT <strong>{DIAN_CONSUMIDOR_FINAL_NIT}</strong>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Nombre / Razón Social *</Label>
                      <Input
                        placeholder="Nombre del cliente"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>NIT / CC *</Label>
                      <Input
                        placeholder="123456789-0"
                        value={customerNit}
                        onChange={(e) => setCustomerNit(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        placeholder="correo@ejemplo.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Teléfono</Label>
                      <Input
                        placeholder="300 123 4567"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Dirección</Label>
                      <Input
                        placeholder="Dirección del cliente"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Products ── */}
            {createStep === 2 && (
              <div className="space-y-4 py-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto por nombre..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>

                {/* Search results */}
                {searchingProducts && (
                  <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Buscando...</span>
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="rounded-lg border max-h-48 overflow-y-auto">
                    {searchResults.map((p) => {
                      const inCart = cart.find((c) => c.productId === p.id)
                      return (
                        <button
                          key={p.id}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b last:border-b-0"
                          onClick={() => addToCart(p)}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.category?.name}
                              {p.currentStock <= 5 && (
                                <span className="ml-2 text-amber-600">Stock: {p.currentStock}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium text-sm">{cop(p.salePrice)}</div>
                            {inCart && (
                              <div className="text-xs text-emerald-600">×{inCart.quantity} en lista</div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Cart */}
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <ShoppingBag className="h-10 w-10 mb-3 opacity-30 animate-pulse" />
                    <p className="text-sm">Busca y selecciona productos para agregar</p>
                  </div>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-center w-[130px]">Cantidad</TableHead>
                          <TableHead className="text-right">P. Unitario</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cart.map((item) => (
                          <TableRow key={item.productId} className="hover:bg-muted/30">
                            <TableCell className="text-sm">
                              <div>{item.productName}</div>
                              <Input
                                className="mt-1 h-7 text-xs"
                                placeholder="Notas (opcional)"
                                value={item.notes}
                                onChange={(e) => updateCartNotes(item.productId, e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(item.productId, -1)} aria-label="Reducir cantidad">
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center font-mono text-sm font-medium">{item.quantity}</span>
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(item.productId, 1)} aria-label="Aumentar cantidad">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm">{cop(item.unitPrice)}</TableCell>
                            <TableCell className="text-right font-medium text-sm">{cop(item.unitPrice * item.quantity)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.productId)} aria-label="Quitar del carrito">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Running totals */}
                {cart.length > 0 && (
                  <div className="flex justify-end">
                    <div className="w-64 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal ({cart.length} {cart.length === 1 ? 'producto' : 'productos'})</span>
                        <span className="font-medium">{cop(subtotal)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-base">
                        <span>Total</span>
                        <span>{cop(total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Review ── */}
            {createStep === 3 && (
              <div className="space-y-4 py-2">
                {/* Customer summary */}
                <div className="rounded-lg border p-3 space-y-1">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Datos del Cliente
                  </h4>
                  <div className="grid gap-1 text-sm sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Nombre:</span> {isConsumidorFinal ? 'Consumidor Final' : customerName || '—'}</div>
                    <div><span className="text-muted-foreground">NIT:</span> {isConsumidorFinal ? DIAN_CONSUMIDOR_FINAL_NIT : customerNit || '—'}</div>
                    {!isConsumidorFinal && customerEmail && (
                      <div><span className="text-muted-foreground">Email:</span> {customerEmail}</div>
                    )}
                    {!isConsumidorFinal && customerPhone && (
                      <div><span className="text-muted-foreground">Teléfono:</span> {customerPhone}</div>
                    )}
                    {!isConsumidorFinal && customerAddress && (
                      <div className="sm:col-span-2"><span className="text-muted-foreground">Dirección:</span> {customerAddress}</div>
                    )}
                  </div>
                </div>

                {/* Items table */}
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">P. Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((item) => (
                        <TableRow key={item.productId} className="hover:bg-muted/30">
                          <TableCell className="text-sm">
                            {item.productName}
                            {item.notes && (
                              <div className="text-xs text-muted-foreground mt-0.5">📝 {item.notes}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">{cop(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium">{cop(item.unitPrice * item.quantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Discount */}
                <div className="rounded-lg border p-3 space-y-2">
                  <h4 className="font-semibold text-sm">Descuento</h4>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="w-40">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={discountType} onValueChange={(v: 'NONE' | 'PERCENTAGE' | 'FIXED') => { setDiscountType(v); setDiscountAmount('0') }}>
                        <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Sin descuento</SelectItem>
                          <SelectItem value="PERCENTAGE">Porcentaje (%)</SelectItem>
                          <SelectItem value="FIXED">Valor fijo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {discountType !== 'NONE' && (
                      <div className="w-32">
                        <Label className="text-xs">{discountType === 'PERCENTAGE' ? '%' : 'COP'}</Label>
                        <Input
                          type="number"
                          min="0"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Valid Until + Notes */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Válida hasta
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {validUntil ? format(validUntil, 'PPP', { locale: es }) : 'Sin fecha límite'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={validUntil}
                          onSelect={setValidUntil}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Notas
                    </Label>
                    <Textarea
                      placeholder="Notas adicionales..."
                      value={quotationNotes}
                      onChange={(e) => setQuotationNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                {/* Final totals */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-1 text-sm rounded-lg border p-3 bg-muted/30">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{cop(subtotal)}</span>
                    </div>
                    {calculatedDiscount > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>Descuento</span>
                        <span>-{cop(calculatedDiscount)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-emerald-600">{cop(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          <Separator />

          {/* Navigation buttons */}
          <DialogFooter>
            <div className="flex w-full justify-between">
              <div>
                {createStep > 1 && (
                  <Button variant="outline" onClick={() => setCreateStep(createStep - 1)} disabled={saving} className="gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowCreate(false); resetCreateForm() }} disabled={saving}>
                  Cancelar
                </Button>
                {createStep < 3 ? (
                  <Button
                    onClick={() => setCreateStep(createStep + 1)}
                    disabled={
                      createStep === 1
                        ? isConsumidorFinal ? false : !customerName.trim() || !customerNit.trim()
                        : cart.length === 0
                    }
                    className="gap-1"
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={handleCreateQuotation} disabled={saving || total <= 0} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Guardar Cotización
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════
          DETAIL DIALOG
      ════════════════════════════════════════════════ */}
      <Dialog open={showDetail} onOpenChange={(open) => { if (!open) { setShowDetail(false); setDetail(null) } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col rounded-xl">
          {!detail && <DialogTitle className="sr-only">Detalle de cotización</DialogTitle>}
          {loadingDetail ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="font-mono">{detail.quotationNumber}</DialogTitle>
                  <StatusBadge status={detail.status} />
                </div>
                <DialogDescription>
                  Creada el {format(parseISO(detail.createdAt), "dd 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
                  {detail.convertedToOrderId && (
                    <span className="ml-2 text-sky-600">→ Convertida a Orden</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4 py-2">
                  {/* Store header */}
                  <div className="text-center border-b pb-3">
                    <div className="text-lg font-bold">{store.name}</div>
                    {store.nit && <div className="text-sm text-muted-foreground">NIT: {store.nit}</div>}
                  </div>

                  {/* Customer info */}
                  <div className="grid gap-2 text-sm sm:grid-cols-2 rounded-lg border p-3">
                    <div>
                      <span className="text-muted-foreground">Cliente:</span>{' '}
                      <span className="font-medium">{detail.customerName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">NIT:</span>{' '}
                      <span className="font-medium">{detail.customerNit || '—'}</span>
                    </div>
                    {detail.customerPhone && (
                      <div>
                        <span className="text-muted-foreground">Teléfono:</span> {detail.customerPhone}
                      </div>
                    )}
                    {detail.customerEmail && (
                      <div>
                        <span className="text-muted-foreground">Email:</span> {detail.customerEmail}
                      </div>
                    )}
                    {detail.customerAddress && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Dirección:</span> {detail.customerAddress}
                      </div>
                    )}
                  </div>

                  {/* Valid until */}
                  {detail.validUntil && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Válida hasta:</span>
                      <span className={detail.status === 'EXPIRED' ? 'text-amber-600 font-medium' : ''}>
                        {format(parseISO(detail.validUntil), "dd 'de' MMMM yyyy", { locale: es })}
                      </span>
                      {detail.status === 'EXPIRED' && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                          Vencida
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-center">Cant.</TableHead>
                          <TableHead className="text-right">P. Unit.</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Base</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Imp.</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.items.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell className="text-sm">
                              {item.productName}
                              {item.notes && (
                                <div className="text-xs text-muted-foreground mt-0.5">📝 {item.notes}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm">{cop(item.unitPrice)}</TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell">{cop(item.taxBase)}</TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell text-muted-foreground">
                              {item.taxCode ? `${item.taxRate}%` : '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{cop(item.totalRow)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Tax breakdown */}
                  {detail.taxBreakdown && detail.taxBreakdown.length > 0 && (
                    <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-sm">
                      <div className="font-semibold text-xs uppercase text-muted-foreground">Desglose de Impuestos</div>
                      {detail.taxBreakdown.map((tax) => (
                        <div key={tax.code} className="flex justify-between">
                          <span>{tax.name || tax.code} ({tax.rate}%)</span>
                          <span>{cop(tax.base)} → {cop(tax.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-72 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{cop(detail.subtotal)}</span>
                      </div>
                      {detail.discountAmount > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>Descuento{detail.discountType === 'PERCENTAGE' ? ` (%)` : ''}</span>
                          <span>-{cop(detail.discountAmount)}</span>
                        </div>
                      )}
                      {detail.taxAmount > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Incluye IVA</span>
                          <span>{cop(detail.taxAmount)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span className="text-emerald-600">{cop(detail.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {detail.notes && (
                    <div className="rounded-lg bg-muted/30 p-3 text-sm">
                      <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">Notas</div>
                      {detail.notes}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Actions */}
              <Separator />
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {detail.status === 'ACTIVE' && (
                  <>
                    <Button variant="outline" className="gap-2" onClick={handlePrint}>
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => openConvertDialog()}>
                      <ArrowRightLeft className="h-4 w-4" />
                      Convertir a Venta
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => handleCancel(detail.id)}
                    >
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </Button>
                  </>
                )}
                {detail.status === 'CONVERTED' && (
                  <Button variant="outline" className="gap-2" onClick={handlePrint}>
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════
          CONVERT DIALOG
      ════════════════════════════════════════════════ */}
      <Dialog open={showConvert} onOpenChange={(open) => { if (!open) { setShowConvert(false); setSelectedId(null); setConvertMethod('') } }}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Convertir a Venta</DialogTitle>
            <DialogDescription>
              Se creará una orden de venta con los productos de la cotización {detail?.quotationNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>Importante:</strong> Al convertir, se descontará el inventario y la cotización cambiará a estado &quot;Convertida&quot;.
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Total de la cotización</Label>
              <div className="text-2xl font-bold text-emerald-600">
                {detail ? cop(detail.total) : ''}
              </div>
            </div>

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
                    onClick={() => setConvertInvoiceMode('TIRILLA')}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                      convertInvoiceMode === 'TIRILLA'
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
                    onClick={() => setConvertInvoiceMode('DOC_EQUIPOS')}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                      convertInvoiceMode === 'DOC_EQUIPOS'
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
                    onClick={() => setConvertInvoiceMode('ELECTRONICA')}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                      convertInvoiceMode === 'ELECTRONICA'
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
                {convertInvoiceMode === 'ELECTRONICA' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                    <QrCode className="h-3 w-3" />
                    Se generará automáticamente con CUFE y QR DIAN
                  </div>
                )}
                {convertInvoiceMode === 'DOC_EQUIPOS' && store?.resolutionNumber && (
                  <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                    <Hash className="h-3 w-3" />
                    Resolución: {store.resolutionNumber} — Prefijo: {store.invoicePrefix || 'POS'}
                  </div>
                )}
                {convertInvoiceMode === 'ELECTRONICA' && (
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                        <Input
                          placeholder={DIAN_CONSUMIDOR_FINAL_NIT}
                          value={invoiceCustomerNit}
                          onChange={(e) => { setInvoiceCustomerNit(e.target.value); setNitDvError('') }}
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
                          placeholder="Consumidor Final"
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

            <div className="space-y-1.5">
              <Label>Método de pago *</Label>
              <Select value={convertMethod} onValueChange={setConvertMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método de pago" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            {detail && (
              <div className="rounded-lg border p-3 text-sm space-y-1 max-h-40 overflow-y-auto">
                <div className="font-semibold mb-2">Productos ({detail.items.length})</div>
                {detail.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span className="truncate mr-2">
                      {item.productName} ×{item.quantity}
                    </span>
                    <span className="shrink-0">{cop(item.totalRow)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setShowConvert(false); setSelectedId(null); setConvertMethod('') }} disabled={converting || creatingInvoice}>
              Cancelar
            </Button>
            <Button onClick={handleConvert} disabled={!convertMethod || converting || creatingInvoice} className="gap-2">
              {converting || creatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {converting
                ? 'Convirtiendo...'
                : creatingInvoice
                  ? 'Generando factura...'
                  : convertInvoiceMode === 'ELECTRONICA'
                    ? 'Convertir + Factura Electrónica'
                    : convertInvoiceMode === 'DOC_EQUIPOS'
                      ? 'Convertir + Doc. Equivalente'
                      : 'Convertir a Orden'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════
          HIDDEN PRINT TEMPLATE
      ════════════════════════════════════════════════ */}
      {detail && (
        <div ref={printRef} className="hidden" aria-hidden="true">
          <div className="header">
            <div className="store-name">{store.name}</div>
            {store.nit && <div className="store-nit">NIT: {store.nit}</div>}
            {store.address && <div className="store-nit">{store.address}</div>}
            {store.phone && <div className="store-nit">Tel: {store.phone}</div>}
          </div>

          <div className="doc-title">COTIZACIÓN {detail.quotationNumber}</div>

          <div className="info-grid">
            <div><span className="info-label">Fecha:</span> {format(parseISO(detail.createdAt), 'dd/MM/yyyy')}</div>
            <div><span className="info-label">Válida hasta:</span> {detail.validUntil ? format(parseISO(detail.validUntil), 'dd/MM/yyyy') : 'Sin límite'}</div>
            <div><span className="info-label">Cliente:</span> {detail.customerName || '—'}</div>
            <div><span className="info-label">NIT:</span> {detail.customerNit || '—'}</div>
            {detail.customerPhone && <div><span className="info-label">Teléfono:</span> {detail.customerPhone}</div>}
            {detail.customerEmail && <div><span className="info-label">Email:</span> {detail.customerEmail}</div>}
            {detail.customerAddress && <div style={{ gridColumn: '1 / -1' }}><span className="info-label">Dirección:</span> {detail.customerAddress}</div>}
          </div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">P. Unit.</th>
                <th className="text-right">Base</th>
                <th className="text-right">Imp.</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}{item.notes ? ` — ${item.notes}` : ''}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">{cop(item.unitPrice)}</td>
                  <td className="text-right">{cop(item.taxBase)}</td>
                  <td className="text-right">{item.taxCode ? `${item.taxRate}%` : '—'}</td>
                  <td className="text-right">{cop(item.totalRow)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {detail.taxBreakdown && detail.taxBreakdown.length > 0 && (
            <div style={{ marginBottom: '10px', fontSize: '12px' }}>
              <strong>Desglose de Impuestos:</strong><br />
              {detail.taxBreakdown.map((tax) => (
                <span key={tax.code}>
                  {tax.name || tax.code} ({tax.rate}%): Base {cop(tax.base)} / Impuesto {cop(tax.amount)}&nbsp;&nbsp;
                </span>
              ))}
            </div>
          )}

          <div className="totals">
            <table className="totals-table">
              <tbody>
                <tr>
                  <td className="text-right" style={{ paddingRight: '10px' }}>Subtotal:</td>
                  <td className="text-right" style={{ fontWeight: 500 }}>{cop(detail.subtotal)}</td>
                </tr>
                {detail.discountAmount > 0 && (
                  <tr>
                    <td className="text-right" style={{ paddingRight: '10px', color: '#b45309' }}>Descuento:</td>
                    <td className="text-right" style={{ fontWeight: 500, color: '#b45309' }}>-{cop(detail.discountAmount)}</td>
                  </tr>
                )}
                {detail.taxAmount > 0 && (
                  <tr>
                    <td className="text-right" style={{ paddingRight: '10px', color: '#666' }}>Incluye IVA:</td>
                    <td className="text-right" style={{ color: '#666' }}>{cop(detail.taxAmount)}</td>
                  </tr>
                )}
                <tr className="grand-total">
                  <td className="text-right" style={{ paddingRight: '10px' }}>TOTAL:</td>
                  <td className="text-right">{cop(detail.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {detail.notes && (
            <div className="notes">
              <strong>Notas:</strong> {detail.notes}
            </div>
          )}

          <div className="footer">
            {store.name} — Generado el {format(new Date(), "dd/MM/yyyy 'a las' HH:mm")}
          </div>
        </div>
      )}
    </div>
  )
}
