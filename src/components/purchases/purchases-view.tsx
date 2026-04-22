'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Plus,
  ShoppingCart,
  CalendarDays,
  Package,
  Ban,
  Eye,
  FileText,
  Printer,
  Download,
  FileSpreadsheet,
  Upload,
  RotateCcw,
  Info,
  Pencil,
  DollarSign,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  MoreVertical,
  TrendingDown,
  TrendingUp,
  Loader2,
  Receipt,
  Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isAfter, isBefore, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { printReport, printThermal80mm } from '@/lib/print-report'

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface ProviderOption {
  id: number
  name: string
  nit?: string | null
  dv?: string | null
  regime: string
  autoretainer: boolean
  paymentTerms: string
  isActive: boolean
}

interface ProductOption {
  id: number
  name: string
  sku?: string | null
  costPrice: number
  currentStock: number
  invima?: string | null
  isActive: boolean
  category?: { id: number; name: string } | null
}

interface PurchaseItemRow {
  id: string
  productId: string
  quantity: string
  unitCost: string
  ivaRate: number
  discountAmount: string
  lotNumber: string
  expiryDate: string
  manufacturingDate: string
}

interface PurchaseItemData {
  id: number
  purchaseId: number
  productId: number
  product: { id: number; name: string; sku?: string | null; costPrice?: number; currentStock?: number; category?: { id: number; name: string } | null } | null
  quantity: number
  returnedQuantity: number
  unitCost: number
  ivaRate: number
  ivaAmount: number
  discountAmount: number
  lotNumber?: string | null
  expiryDate?: string | null
  manufacturingDate?: string | null
  total: number
}

interface PurchasePayment {
  id: number
  amount: number
  paymentMethod: string
  reference?: string | null
  notes?: string | null
  createdBy?: { id: number; fullName: string; cedula?: string | null } | null
  createdAt: string
}

interface Purchase {
  id: number
  storeId: number
  providerId: number | null
  provider: { id: number; name: string; nit?: string | null; regime?: string; paymentTerms?: string; autoretainer?: boolean } | null
  invoiceNumber: string | null
  documentType: string
  consecutiveNumber: string | null
  date: string
  dueDate: string | null
  paymentTerms: string
  paymentStatus: string
  amountPaid: number
  subtotal: number
  totalIva: number
  totalReteFuente: number
  totalReteIca: number
  totalReteIva: number
  totalDiscount: number
  notes: string | null
  total: number
  status: string
  createdById?: number | null
  itemCount: number
  purchaseItems: PurchaseItemData[]
  purchasePayments?: PurchasePayment[]
  _payments?: { count: number; total: number }
  createdAt: string
  updatedAt: string
}

type StatusFilter = 'ALL' | 'COMPLETED' | 'PENDING' | 'CANCELLED'

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const DOC_TYPES = [
  { value: 'FACTURA_COMPRA', label: 'Factura Compra', short: 'FC', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'NOTA_CREDITO', label: 'Nota Crédito', short: 'NC', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'NOTA_DEBITO', label: 'Nota Débito', short: 'ND', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'RECIBO_CAJA', label: 'Recibo Caja', short: 'RC', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
]

const PAYMENT_TERMS = [
  { value: 'CONTADO', label: 'Contado' },
  { value: 'CREDITO_30', label: 'Crédito 30 días' },
  { value: 'CREDITO_60', label: 'Crédito 60 días' },
  { value: 'CREDITO_90', label: 'Crédito 90 días' },
]

const IVA_RATES = [
  { value: 0, label: '0% (Exento)' },
  { value: 5, label: '5%' },
  { value: 19, label: '19%' },
]

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CHECK', label: 'Cheque' },
  { value: 'CARD', label: 'Tarjeta' },
]

function getDocBadge(type: string) {
  return DOC_TYPES.find(d => d.value === type) || DOC_TYPES[0]
}

function getPaymentStatusBadge(status: string) {
  switch (status) {
    case 'PAID': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Pagado</Badge>
    case 'PARTIAL': return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-100"><Clock className="h-3 w-3 mr-1" />Parcial</Badge>
    default: return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100">Completada</Badge>
    case 'PENDING': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100">Pendiente</Badge>
    case 'CANCELLED': return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100">Cancelada</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

const EMPTY_ITEM = (): PurchaseItemRow => ({
  id: crypto.randomUUID(),
  productId: '',
  quantity: '1',
  unitCost: '',
  ivaRate: 19,
  discountAmount: '0',
  lotNumber: '',
  expiryDate: '',
  manufacturingDate: '',
})

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export function PurchasesView() {
  const { store } = useAuthStore()
  const currencyCode = store?.currencyCode || 'COP'

  // ─── List state ───────────────────────────────────────────────────────
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  // ─── Create / Edit dialog state ───────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isEdit, setIsEdit] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [providerSearch, setProviderSearch] = useState('')
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null)
  const [purchaseDocType, setPurchaseDocType] = useState('FACTURA_COMPRA')
  const [purchaseDate, setPurchaseDate] = useState(todayStr())
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('')
  const [purchasePaymentTerms, setPurchasePaymentTerms] = useState('CONTADO')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([EMPTY_ITEM()])
  const [saving, setSaving] = useState(false)

  // Per-item product search state
  const [itemSearches, setItemSearches] = useState<Record<string, string>>({})
  const [itemDropdowns, setItemDropdowns] = useState<Record<string, boolean>>({})

  // ─── Detail dialog state ──────────────────────────────────────────────
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ─── Cancel dialog state ──────────────────────────────────────────────
  const [cancelPurchase, setCancelPurchase] = useState<Purchase | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // ─── Return dialog state ──────────────────────────────────────────────
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning] = useState(false)
  const [returnItems, setReturnItems] = useState<Map<number, number>>(new Map())

  // ─── Payment dialog state ─────────────────────────────────────────────
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paying, setPaying] = useState(false)

  // ─── XML import state ─────────────────────────────────────────────────
  const xmlInputRef = useRef<HTMLInputElement>(null)
  const [xmlUploading, setXmlUploading] = useState(false)
  const [showXmlHelp, setShowXmlHelp] = useState(false)
  const [xmlPreview, setXmlPreview] = useState<{
    fileName: string
    items: { name: string; quantity: number; unitCost: number }[]
    invoiceNumber?: string
    invoiceDate?: string
    providerName?: string
    providerNit?: string
    xmlFormat?: string
  } | null>(null)
  const [xmlNotes, setXmlNotes] = useState('')
  const [xmlProviderId, setXmlProviderId] = useState<string>('none')
  const [xmlProviders, setXmlProviders] = useState<ProviderOption[]>([])

  // ─── Refs for click-outside ───────────────────────────────────────────
  const providerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ══════════════════════════════════════════════════════════════════════
  // COMPUTED KPIs
  // ══════════════════════════════════════════════════════════════════════

  const kpiData = useMemo(() => {
    const active = purchases.filter(p => p.status !== 'CANCELLED')
    const totalCompras = active.reduce((s, p) => s + p.total, 0)
    const totalIva = active.reduce((s, p) => s + p.totalIva, 0)
    const totalRetenciones = active.reduce((s, p) => s + p.totalReteFuente + p.totalReteIca, 0)
    const pendientesPago = purchases.filter(p =>
      p.paymentStatus !== 'PAID' && p.status !== 'CANCELLED'
    ).length
    return { totalCompras, totalIva, totalRetenciones, pendientesPago }
  }, [purchases])

  // ══════════════════════════════════════════════════════════════════════
  // LINE ITEM CALCULATIONS
  // ══════════════════════════════════════════════════════════════════════

  const calcLineSubtotal = (item: PurchaseItemRow) => {
    const qty = Number(item.quantity) || 0
    const cost = Number(item.unitCost) || 0
    return qty * cost
  }

  const calcLineIva = (item: PurchaseItemRow) => {
    return Math.round(calcLineSubtotal(item) * item.ivaRate / 100)
  }

  const calcLineTotal = (item: PurchaseItemRow) => {
    return Math.max(0, calcLineSubtotal(item) + calcLineIva(item) - (Number(item.discountAmount) || 0))
  }

  const formSubtotal = useMemo(() => purchaseItems.reduce((s, i) => s + calcLineSubtotal(i), 0), [purchaseItems])
  const formTotalIva = useMemo(() => purchaseItems.reduce((s, i) => s + calcLineIva(i), 0), [purchaseItems])
  const formTotalDiscount = useMemo(() => purchaseItems.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0), [purchaseItems])

  const formRetenciones = useMemo(() => {
    const regime = selectedProvider?.regime || 'NO_RESPONSABLE'
    let reteFuente = 0
    let reteIca = 0
    if (regime === 'RESPONSABLE' && formSubtotal > 2800000) {
      reteFuente = Math.round(formSubtotal * 0.025)
    }
    reteIca = Math.round(formSubtotal * 0.00966)
    return { reteFuente, reteIca }
  }, [formSubtotal, selectedProvider])

  const formGrandTotal = useMemo(() => {
    return Math.max(0, formSubtotal + formTotalIva - formTotalDiscount - formRetenciones.reteFuente - formRetenciones.reteIca)
  }, [formSubtotal, formTotalIva, formTotalDiscount, formRetenciones])

  // ══════════════════════════════════════════════════════════════════════
  // FETCH
  // ══════════════════════════════════════════════════════════════════════

  const fetchPurchases = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: store.id.toString(), limit: '200' })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/purchases?${params}`)
      if (!res.ok) throw new Error('Error al cargar compras')
      const json = await res.json()
      const data = Array.isArray(json) ? json : (json.data || [])
      setPurchases(data)
    } catch {
      toast.error('Error al cargar compras')
    } finally {
      setLoading(false)
    }
  }, [store?.id, search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => fetchPurchases(), 300)
    return () => clearTimeout(timer)
  }, [fetchPurchases])

  // ─── Click outside handler ────────────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) {
        setProviderDropdownOpen(false)
      }
      for (const [key, ref] of Object.entries(itemRefs.current)) {
        if (ref && !ref.contains(e.target as Node)) {
          setItemDropdowns(prev => ({ ...prev, [key]: false }))
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ══════════════════════════════════════════════════════════════════════
  // DIALOG OPENERS
  // ══════════════════════════════════════════════════════════════════════

  async function openCreateDialog() {
    setIsEdit(false)
    setEditingId(null)
    setSelectedProviderId('')
    setSelectedProvider(null)
    setProviderSearch('')
    setPurchaseDocType('FACTURA_COMPRA')
    setPurchaseDate(todayStr())
    setPurchaseInvoiceNumber('')
    setPurchasePaymentTerms('CONTADO')
    setPurchaseNotes('')
    setPurchaseItems([EMPTY_ITEM()])
    setItemSearches({})
    setItemDropdowns({})
    setCreateOpen(true)

    if (!store?.id) return
    try {
      const res = await fetch(`/api/providers?storeId=${store.id}&active=true`)
      if (res.ok) setProviders(Array.isArray(await res.json()) ? await res.json() : [])
    } catch { /* */ }
    try {
      const res = await fetch(`/api/products?storeId=${store.id}&active=true&limit=500`)
      if (res.ok) {
        const json = await res.json()
        setProducts(Array.isArray(json) ? json : (json.data || []))
      }
    } catch { /* */ }
  }

  async function openEditDialog(purchase: Purchase) {
    setIsEdit(true)
    setEditingId(purchase.id)
    setSelectedProviderId(purchase.providerId ? String(purchase.providerId) : '')
    setSelectedProvider(purchase.provider ? { id: purchase.provider.id, name: purchase.provider.name, nit: purchase.provider.nit, dv: undefined, regime: purchase.provider.regime || 'NO_RESPONSABLE', autoretainer: purchase.provider.autoretainer || false, paymentTerms: purchase.provider.paymentTerms || 'CONTADO', isActive: true } : null)
    setProviderSearch('')
    setPurchaseDocType(purchase.documentType || 'FACTURA_COMPRA')
    setPurchaseDate(format(parseISO(purchase.date), 'yyyy-MM-dd'))
    setPurchaseInvoiceNumber(purchase.invoiceNumber || '')
    setPurchasePaymentTerms(purchase.paymentTerms || 'CONTADO')
    setPurchaseNotes(purchase.notes || '')
    setPurchaseItems(
      purchase.purchaseItems.map(item => ({
        id: crypto.randomUUID(),
        productId: String(item.productId),
        quantity: String(item.quantity),
        unitCost: String(item.unitCost),
        ivaRate: item.ivaRate || 19,
        discountAmount: String(item.discountAmount || 0),
        lotNumber: item.lotNumber || '',
        expiryDate: item.expiryDate ? format(parseISO(item.expiryDate), 'yyyy-MM-dd') : '',
        manufacturingDate: item.manufacturingDate ? format(parseISO(item.manufacturingDate), 'yyyy-MM-dd') : '',
      }))
    )
    if (purchase.purchaseItems.length === 0) setPurchaseItems([EMPTY_ITEM()])
    setItemSearches({})
    setItemDropdowns({})
    setCreateOpen(true)

    if (!store?.id) return
    try {
      const res = await fetch(`/api/providers?storeId=${store.id}`)
      if (res.ok) setProviders(Array.isArray(await res.json()) ? await res.json() : [])
    } catch { /* */ }
    try {
      const res = await fetch(`/api/products?storeId=${store.id}&limit=500`)
      if (res.ok) {
        const json = await res.json()
        setProducts(Array.isArray(json) ? json : (json.data || []))
      }
    } catch { /* */ }
  }

  // ─── Detail ───────────────────────────────────────────────────────────

  async function openDetail(purchase: Purchase) {
    setLoadingDetail(true)
    setDetailPurchase(purchase)
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailPurchase(data)
      }
    } catch { /* use list data */ }
    finally {
      setLoadingDetail(false)
    }
  }

  // ─── Payment dialog ───────────────────────────────────────────────────

  function openPaymentDialog() {
    if (!detailPurchase) return
    setPaymentAmount(String(detailPurchase.total - detailPurchase.amountPaid))
    setPaymentMethod('CASH')
    setPaymentReference('')
    setPaymentNotes('')
    setShowPaymentDialog(true)
  }

  // ══════════════════════════════════════════════════════════════════════
  // ITEM MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════

  function addItem() {
    setPurchaseItems(prev => [...prev, EMPTY_ITEM()])
  }

  function removeItem(itemId: string) {
    if (purchaseItems.length <= 1) {
      toast.error('Debe haber al menos un producto')
      return
    }
    setPurchaseItems(prev => prev.filter(item => item.id !== itemId))
  }

  function updateItem(itemId: string, field: keyof PurchaseItemRow, value: string | number) {
    setPurchaseItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    ))
  }

  function selectProduct(itemId: string, productId: string) {
    const prod = products.find(p => p.id === Number(productId))
    setPurchaseItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        productId: String(prod?.id || productId),
        unitCost: String(prod?.costPrice || item.unitCost),
      }
    }))
    setItemSearches(prev => ({ ...prev, [itemId]: '' }))
    setItemDropdowns(prev => ({ ...prev, [itemId]: false }))
  }

  // ══════════════════════════════════════════════════════════════════════
  // PROVIDER SELECTION
  // ══════════════════════════════════════════════════════════════════════

  function selectProvider(providerId: string) {
    const prov = providers.find(p => p.id === Number(providerId))
    setSelectedProviderId(providerId)
    setSelectedProvider(prov || null)
    setProviderSearch('')
    setProviderDropdownOpen(false)
    // Auto-fill payment terms and IVA rate
    if (prov) {
      setPurchasePaymentTerms(prov.paymentTerms || 'CONTADO')
      // Set IVA rate based on regime
      const defaultIva = prov.regime === 'RESPONSABLE' ? 19 : prov.regime === 'SIMPLIFICADO' ? 0 : 19
      setPurchaseItems(prev => prev.map(item => ({
        ...item,
        ivaRate: item.unitCost ? defaultIva : item.ivaRate,
      })))
    }
  }

  const filteredProviders = useMemo(() => {
    if (!providerSearch.trim()) return providers
    const q = providerSearch.toLowerCase()
    return providers.filter(p =>
      p.name.toLowerCase().includes(q) || (p.nit || '').includes(q)
    )
  }, [providers, providerSearch])

  // ══════════════════════════════════════════════════════════════════════
  // SAVE (CREATE / EDIT)
  // ══════════════════════════════════════════════════════════════════════

  async function handleSavePurchase() {
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }

    const validItems = purchaseItems.filter(item =>
      item.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0
    )

    if (validItems.length === 0) {
      toast.error('Debe agregar al menos un producto con cantidad y costo')
      return
    }

    const productIds = validItems.map(item => item.productId)
    const uniqueIds = new Set(productIds)
    if (uniqueIds.size !== productIds.length) {
      toast.error('No puede agregar el mismo producto más de una vez')
      return
    }

    setSaving(true)
    try {
      if (isEdit && editingId) {
        // ─── EDIT ──────────────────────────────────────────────
        const body: Record<string, unknown> = {
          invoiceNumber: purchaseInvoiceNumber.trim() || null,
          documentType: purchaseDocType,
          date: purchaseDate,
          notes: purchaseNotes.trim() || null,
          providerId: selectedProviderId ? Number(selectedProviderId) : null,
          paymentTerms: purchasePaymentTerms,
          items: validItems.map(item => ({
            productId: Number(item.productId),
            quantity: Number(item.quantity),
            unitCost: Math.round(Number(item.unitCost)),
            ivaRate: item.ivaRate,
            discountAmount: Number(item.discountAmount) || 0,
            lotNumber: item.lotNumber.trim() || null,
            expiryDate: item.expiryDate || null,
            manufacturingDate: item.manufacturingDate || null,
          })),
        }

        const res = await fetch(`/api/purchases/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Error al actualizar compra')
        }

        toast.success('Compra actualizada exitosamente')
      } else {
        // ─── CREATE ────────────────────────────────────────────
        const body = {
          storeId: store.id,
          providerId: selectedProviderId ? Number(selectedProviderId) : undefined,
          invoiceNumber: purchaseInvoiceNumber.trim() || undefined,
          documentType: purchaseDocType,
          date: purchaseDate,
          paymentTerms: purchasePaymentTerms,
          notes: purchaseNotes.trim() || undefined,
          items: validItems.map(item => ({
            productId: Number(item.productId),
            quantity: Number(item.quantity),
            unitCost: Math.round(Number(item.unitCost)),
            ivaRate: item.ivaRate,
            discountAmount: Number(item.discountAmount) || 0,
            lotNumber: item.lotNumber.trim() || undefined,
            expiryDate: item.expiryDate || undefined,
            manufacturingDate: item.manufacturingDate || undefined,
          })),
        }

        const res = await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Error al crear compra')
        }
        toast.success('Compra creada exitosamente')
      }

      setCreateOpen(false)
      setEditingId(null)
      setIsEdit(false)
      fetchPurchases()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PAYMENT
  // ══════════════════════════════════════════════════════════════════════

  async function handlePayment() {
    if (!detailPurchase) return
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingrese un monto válido')
      return
    }
    const remaining = detailPurchase.total - detailPurchase.amountPaid
    if (amount > remaining) {
      toast.error(`El monto excede el saldo pendiente (${formatCurrency(remaining, currencyCode)})`)
      return
    }

    setPaying(true)
    try {
      const res = await fetch(`/api/purchases/${detailPurchase.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethod,
          reference: paymentReference.trim() || undefined,
          notes: paymentNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al registrar pago')
      }
      const data = await res.json()
      toast.success(data.message)
      setShowPaymentDialog(false)
      // Refresh detail
      const detailRes = await fetch(`/api/purchases/${detailPurchase.id}`)
      if (detailRes.ok) setDetailPurchase(await detailRes.json())
      fetchPurchases()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setPaying(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // RETURN
  // ══════════════════════════════════════════════════════════════════════

  function openReturnDialog() {
    if (!detailPurchase) return
    const items = new Map<number, number>()
    for (const item of detailPurchase.purchaseItems) {
      const available = item.quantity - (item.returnedQuantity ?? 0)
      if (available > 0) items.set(item.id, available)
    }
    setReturnItems(items)
    setReturnReason('')
    setShowReturnDialog(true)
  }

  function toggleReturnItem(itemId: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.set(itemId, maxQty)
      return next
    })
  }

  async function handleReturnPurchase() {
    if (!detailPurchase) return
    if (returnItems.size === 0) {
      toast.error('Selecciona al menos un producto para devolver')
      return
    }
    setReturning(true)
    try {
      const items = Array.from(returnItems.entries()).map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity }))
      const res = await fetch(`/api/purchases/${detailPurchase.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason: returnReason.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al procesar devolución')
      }
      const data = await res.json()
      toast.success(data.message)
      setShowReturnDialog(false)
      setReturnItems(new Map())
      setDetailPurchase(null)
      fetchPurchases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al procesar devolución')
    } finally {
      setReturning(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CANCEL
  // ══════════════════════════════════════════════════════════════════════

  async function handleCancel() {
    if (!cancelPurchase) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/purchases/${cancelPurchase.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al cancelar compra')
      }
      toast.success('Compra cancelada exitosamente')
      setCancelPurchase(null)
      fetchPurchases()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCancelling(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // XML IMPORT (existing logic preserved)
  // ══════════════════════════════════════════════════════════════════════

  function parseXmlItems(xmlDoc: Document): { name: string; quantity: number; unitCost: number }[] {
    const xmlItems: { name: string; quantity: number; unitCost: number }[] = []
    const getText = (el: Element | null, selectors: string[]): string => {
      if (!el) return ''
      for (const sel of selectors) { const found = el.querySelector(sel); if (found?.textContent?.trim()) return found.textContent.trim() }
      return ''
    }
    const getNum = (el: Element | null, selectors: string[]): number => { return parseFloat(getText(el, selectors)) || 0 }

    // Strategy 1: UBL 2.1
    const invoiceLines = xmlDoc.querySelectorAll('InvoiceLine')
    if (invoiceLines.length > 0) {
      invoiceLines.forEach(line => {
        const name = getText(line, ['Item Name', 'Item cbc\\:Name', 'cbc\\:Name'])
        const qty = getNum(line, ['InvoicedQuantity', 'cbc\\:InvoicedQuantity'])
        const price = getNum(line, ['PriceAmount', 'Price cbc\\:PriceAmount', 'cbc\\:PriceAmount'])
        if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
      })
    }
    // Strategy 2: FeCo
    if (xmlItems.length === 0) {
      xmlDoc.querySelectorAll('item').forEach(item => {
        const name = getText(item, ['descripcion', 'nombre', 'name'])
        const qty = getNum(item, ['cantidad', 'quantity'])
        const price = getNum(item, ['precioUnitario', 'unitPrice', 'valor', 'precio'])
        if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
      })
    }
    // Strategy 3: generic
    if (xmlItems.length === 0) {
      xmlDoc.querySelectorAll('producto, product').forEach(item => {
        const name = getText(item, ['nombre', 'name', 'descripcion'])
        const qty = getNum(item, ['cantidad', 'quantity'])
        const price = getNum(item, ['precio', 'price', 'costo'])
        if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
      })
    }
    // Strategy 4: repeating element heuristic
    if (xmlItems.length === 0) {
      const root = xmlDoc.documentElement
      const children = Array.from(root.children)
      const counts = new Map<string, number>()
      children.forEach(c => { const t = c.tagName.replace(/.*:/, ''); counts.set(t, (counts.get(t) || 0) + 1) })
      let bestTag = '', bestCount = 1
      counts.forEach((count, tag) => { if (count > bestCount && count >= 2) { bestCount = count; bestTag = tag } })
      if (bestTag) {
        xmlDoc.querySelectorAll(bestTag).forEach(item => {
          let name = '', qty = 0, price = 0
          Array.from(item.children).forEach(child => {
            const tag = child.tagName.replace(/.*:/, '').toLowerCase()
            const val = child.textContent?.trim() || ''
            if (!name && val && (isNaN(parseFloat(val)) || val.length > 5)) name = val
            if (/cant|qty|quantity|cantidad/.test(tag)) qty = parseFloat(val) || 0
            if (/prec|price|cost|valor|amount/.test(tag)) { const p = parseFloat(val) || 0; if (price === 0 || p < price) price = p }
          })
          if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
        })
      }
    }
    return xmlItems
  }

  function parseXmlMetadata(xmlDoc: Document) {
    const root = xmlDoc.documentElement
    const gt = (selectors: string[]): string => { for (const s of selectors) { const f = root.querySelector(s); if (f?.textContent?.trim()) return f.textContent.trim() }; return '' }
    const invoiceNumber = gt(['ID', 'cbc\\:ID', 'Numero', 'numero', 'consecutivo', 'number', 'invoiceNumber'])
    const providerName = gt(['RegistrationName', 'cbc\\:RegistrationName', 'nombre', 'razSocial', 'razonSocial', 'name'])
    const providerNit = gt(['CompanyID', 'cbc\\:CompanyID', 'nit', 'NIT', 'numeroIdentificacion'])
    const invoiceDate = gt(['IssueDate', 'cbc\\:IssueDate', 'fecha', 'Fecha', 'date', 'fechaEmision'])
    let xmlFormat = 'Desconocido'
    if (root.querySelectorAll('InvoiceLine').length > 0) xmlFormat = 'UBL 2.1 DIAN'
    else if (root.querySelectorAll('item').length > 0) xmlFormat = 'FeCo'
    else if (root.querySelectorAll('producto, product').length > 0) xmlFormat = 'Genérico'
    else if (invoiceNumber || providerName) xmlFormat = 'Formato libre'
    return { invoiceNumber, providerName, providerNit, invoiceDate, xmlFormat }
  }

  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !store?.id) return
    if (!file.name.endsWith('.xml')) { toast.error('Solo se permiten archivos XML'); return }
    setXmlUploading(true)
    try {
      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'text/xml')
      if (xmlDoc.querySelector('parsererror')) { toast.error('Error al leer el archivo XML'); return }
      const xmlItems = parseXmlItems(xmlDoc)
      const metadata = parseXmlMetadata(xmlDoc)
      if (xmlItems.length === 0) { toast.error('No se pudieron extraer productos del XML.'); return }
      try {
        const res = await fetch(`/api/providers?storeId=${store.id}&active=true`)
        if (res.ok) {
          const data = await res.json()
          setXmlProviders(Array.isArray(data) ? data : [])
          if (metadata.providerNit) {
            const nit = metadata.providerNit.replace(/[^0-9kK]/g, '').toLowerCase()
            const match = (Array.isArray(data) ? data : []).find((p: ProviderOption) => (p.nit || '').replace(/[^0-9kK]/g, '').toLowerCase() === nit)
            if (match) setXmlProviderId(String(match.id))
          } else if (metadata.providerName) {
            const name = metadata.providerName.toLowerCase().trim()
            const match = (Array.isArray(data) ? data : []).find((p: ProviderOption) => p.name.toLowerCase().includes(name))
            if (match) setXmlProviderId(String(match.id))
          }
        }
      } catch { /* */ }
      setXmlNotes(`Importado desde XML: ${file.name}`)
      setXmlPreview({ fileName: file.name, items: xmlItems, invoiceNumber: metadata.invoiceNumber || undefined, invoiceDate: metadata.invoiceDate || undefined, providerName: metadata.providerName || undefined, providerNit: metadata.providerNit || undefined, xmlFormat: metadata.xmlFormat })
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error al procesar XML') }
    finally { setXmlUploading(false); if (xmlInputRef.current) xmlInputRef.current.value = '' }
  }

  async function confirmXmlImport() {
    if (!xmlPreview || !store?.id) return
    setXmlUploading(true)
    try {
      const res = await fetch('/api/purchases/xml-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          providerId: xmlProviderId !== 'none' ? Number(xmlProviderId) : undefined,
          invoiceNumber: xmlPreview.invoiceNumber || undefined,
          invoiceDate: xmlPreview.invoiceDate || undefined,
          providerName: xmlPreview.providerName || undefined,
          providerNit: xmlPreview.providerNit || undefined,
          notes: xmlNotes.trim() || undefined,
          items: xmlPreview.items.map(item => ({ productId: 0, quantity: item.quantity, unitCost: item.unitCost, name: item.name })),
        }),
      })
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Error al importar') }
      const result = await res.json()
      toast.success(`Factura importada: ${result.itemsCreated} producto(s)`)
      setXmlPreview(null)
      fetchPurchases()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error al importar XML') }
    finally { setXmlUploading(false) }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRINT
  // ══════════════════════════════════════════════════════════════════════

  function handlePrintPurchases(thermal = false) {
    const filterLabel = statusFilter === 'ALL' ? 'Todas' : statusFilter === 'COMPLETED' ? 'Completadas' : statusFilter === 'PENDING' ? 'Pendientes' : 'Canceladas'
    const subtitle = search || statusFilter !== 'ALL' ? `${search ? `"${search}" · ` : ''}${filterLabel}` : 'Todas las compras'
    if (thermal) {
      const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
      lines.push({ left: subtitle, separator: true })
      purchases.forEach(p => {
        const doc = getDocBadge(p.documentType)
        lines.push({ left: `${p.consecutiveNumber || `#${p.id}`} [${doc.short}] ${p.provider?.name || 'Sin prov.'}`, right: formatCurrency(p.total, currencyCode), bold: true, separator: true })
        lines.push({ left: `${format(new Date(p.date), 'dd/MM/yy', { locale: es })} · ${p.itemCount} prod. · IVA: ${formatCurrency(p.totalIva, currencyCode)}` })
        lines.push({ left: p.paymentStatus === 'PAID' ? '✓ Pagado' : p.paymentStatus === 'PARTIAL' ? '◐ Parcial' : '○ Pendiente', separator: true })
      })
      printThermal80mm({ title: 'COMPRAS', lines, footer: `Total: ${purchases.length}` })
    } else {
      printReport({
        title: 'Reporte de Compras', subtitle,
        headers: ['#', 'Consecutivo', 'Tipo', 'Fecha', 'Vencimiento', 'Proveedor', 'Total', 'IVA', 'Pago', 'Estado'],
        columnAligns: ['center', 'center', 'center', 'center', 'center', 'left', 'right', 'right', 'center', 'center'],
        columnWidths: ['25px', '70px', '35px', '70px', '70px', '1fr', '80px', '70px', '60px', '70px'],
        rows: purchases.map((p, i) => [
          i + 1,
          p.consecutiveNumber || `#${p.id}`,
          getDocBadge(p.documentType).short,
          format(new Date(p.date), 'd MMM yy', { locale: es }),
          p.dueDate ? format(new Date(p.dueDate), 'd MMM yy', { locale: es }) : '—',
          p.provider?.name || 'Sin proveedor',
          formatCurrency(p.total, currencyCode),
          formatCurrency(p.totalIva, currencyCode),
          p.paymentStatus === 'PAID' ? 'Pagado' : p.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Pendiente',
          p.status === 'COMPLETED' ? 'Completada' : p.status === 'PENDING' ? 'Pendiente' : 'Cancelada',
        ]),
        footer: `Total compras: ${purchases.length} · Valor total: ${formatCurrency(purchases.filter(p => p.status !== 'CANCELLED').reduce((s, p) => s + p.total, 0), currencyCode)}`,
        orientation: 'landscape',
      })
    }
  }

  function handlePrintPurchaseDetail(purchase: Purchase) {
    const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
    const doc = getDocBadge(purchase.documentType)
    lines.push({ left: `${purchase.consecutiveNumber || `#${purchase.id}`} [${doc.short}]`, bold: true, separator: true })
    lines.push({ left: `Fecha: ${format(new Date(purchase.date), 'dd/MM/yyyy', { locale: es })}` })
    if (purchase.dueDate) lines.push({ left: `Vencimiento: ${format(new Date(purchase.dueDate), 'dd/MM/yyyy', { locale: es })}` })
    lines.push({ left: `Proveedor: ${purchase.provider?.name || 'Sin proveedor'}` })
    if (purchase.invoiceNumber) lines.push({ left: `Factura: ${purchase.invoiceNumber}` })
    if (purchase.notes) lines.push({ left: `Notas: ${purchase.notes}` })
    lines.push({ separator: true })
    lines.push({ left: 'PRODUCTO', right: 'IVA', bold: true, separator: true })
    purchase.purchaseItems.forEach(item => {
      const name = (item.product?.name || 'Producto').slice(0, 22)
      lines.push({ left: `${item.quantity}x ${name}`, right: `${formatCurrency(item.ivaAmount, currencyCode)}` })
    })
    lines.push({ left: '────────────────────────────────' })
    lines.push({ left: `Subtotal:`, right: formatCurrency(purchase.subtotal, currencyCode) })
    lines.push({ left: `IVA:`, right: formatCurrency(purchase.totalIva, currencyCode) })
    if (purchase.totalReteFuente > 0) lines.push({ left: `ReteFuente:`, right: formatCurrency(purchase.totalReteFuente, currencyCode) })
    if (purchase.totalReteIca > 0) lines.push({ left: `ReteICA:`, right: formatCurrency(purchase.totalReteIca, currencyCode) })
    if (purchase.totalDiscount > 0) lines.push({ left: `Descuento:`, right: formatCurrency(purchase.totalDiscount, currencyCode) })
    lines.push({ left: `TOTAL:`, right: formatCurrency(purchase.total, currencyCode), bold: true, separator: true })
    lines.push({ left: `Pagado: ${formatCurrency(purchase.amountPaid, currencyCode)} / ${formatCurrency(purchase.total, currencyCode)}`, separator: true })
    printThermal80mm({ title: 'COMPRA DETALLE', lines, footer: `Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}` })
  }

  // ══════════════════════════════════════════════════════════════════════
  // EXCEL EXPORT
  // ══════════════════════════════════════════════════════════════════════

  function handleExportExcel() {
    const rows = purchases.map((p, i) => ({
      '#': i + 1,
      'Consecutivo': p.consecutiveNumber || '',
      'Tipo Doc': getDocBadge(p.documentType).short,
      'Fecha': format(new Date(p.date), 'yyyy-MM-dd'),
      'Vencimiento': p.dueDate ? format(new Date(p.dueDate), 'yyyy-MM-dd') : '',
      'Factura': p.invoiceNumber || '',
      'Proveedor': p.provider?.name || 'Sin proveedor',
      'N° Productos': p.itemCount,
      'Subtotal': p.subtotal,
      'IVA': p.totalIva,
      'ReteFuente': p.totalReteFuente,
      'ReteICA': p.totalReteIca,
      'Descuento': p.totalDiscount,
      'Total': p.total,
      'Pagado': p.amountPaid,
      'Estado Pago': p.paymentStatus === 'PAID' ? 'Pagado' : p.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Pendiente',
      'Forma Pago': PAYMENT_TERMS.find(t => t.value === p.paymentTerms)?.label || p.paymentTerms,
      'Estado': p.status === 'COMPLETED' ? 'Completada' : p.status === 'CANCELLED' ? 'Cancelada' : 'Pendiente',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Array(19).fill({ wch: 14 })
    ws['!cols'][0] = { wch: 5 }
    ws['!cols'][7] = { wch: 22 }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    const fileName = `Compras_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`Archivo ${fileName} descargado`)
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPER: is overdue
  // ══════════════════════════════════════════════════════════════════════

  function isOverdue(purchase: Purchase): boolean {
    if (!purchase.dueDate) return false
    if (purchase.paymentStatus === 'PAID') return false
    if (purchase.status === 'CANCELLED') return false
    return isBefore(parseISO(purchase.dueDate), new Date())
  }

  // ══════════════════════════════════════════════════════════════════════
  // COUNTS
  // ══════════════════════════════════════════════════════════════════════

  const completedCount = purchases.filter(p => p.status === 'COMPLETED').length
  const pendingCount = purchases.filter(p => p.status === 'PENDING').length
  const cancelledCount = purchases.filter(p => p.status === 'CANCELLED').length

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Compras</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : `${completedCount} completada${completedCount !== 1 ? 's' : ''}, ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}, ${cancelledCount} cancelada${cancelledCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="hidden sm:block flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading || purchases.length === 0} className="gap-1.5">
                <Printer className="h-4 w-4" /><span className="text-xs hidden sm:inline">Imprimir</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePrintPurchases(false)}><FileSpreadsheet className="h-4 w-4 mr-2" />Impresora Normal</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrintPurchases(true)}><Printer className="h-4 w-4 mr-2" />Térmica 80mm</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={loading || purchases.length === 0} className="gap-1.5">
            <Download className="h-4 w-4" /><span className="text-xs hidden sm:inline">Excel</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => xmlInputRef.current?.click()} disabled={xmlUploading} className="gap-1.5">
            <Upload className="h-4 w-4" /><span className="text-xs hidden sm:inline">XML</span>
          </Button>
          <input ref={xmlInputRef} type="file" accept=".xml" className="hidden" onChange={handleXmlUpload} />
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ayuda XML" onClick={() => setShowXmlHelp(true)} aria-label="Ayuda XML">
            <Info className="h-4 w-4" />
          </Button>
          <Button onClick={openCreateDialog} size="sm"><Plus className="h-4 w-4" />Nueva Compra</Button>
        </div>
      </div>

      {/* ═══ KPI BAR ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Total Compras
          </div>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(kpiData.totalCompras, currencyCode)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Receipt className="h-3.5 w-3.5 text-blue-500" />IVA Descontable
          </div>
          <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(kpiData.totalIva, currencyCode)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-orange-500" />Retenciones
          </div>
          <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(kpiData.totalRetenciones, currencyCode)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Clock className="h-3.5 w-3.5 text-amber-500" />Pendientes de Pago
          </div>
          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{kpiData.pendientesPago}</p>
        </Card>
      </div>

      {/* ═══ SEARCH + FILTER ════════════════════════════════════════════ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por factura, proveedor, notas..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'ALL' as const, label: 'TODAS' },
                { key: 'COMPLETED' as const, label: 'COMPLETADAS' },
                { key: 'PENDING' as const, label: 'PENDIENTES' },
                { key: 'CANCELLED' as const, label: 'CANCELADAS' },
              ]).map(f => (
                <Button key={f.key} variant={statusFilter === f.key ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(f.key)} className="text-xs h-8">
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ PURCHASES LIST ═════════════════════════════════════════════ */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}</div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No se encontraron compras</p>
              <p className="text-sm text-muted-foreground/70">{search || statusFilter !== 'ALL' ? 'Intenta con otra búsqueda o filtro' : 'Registra tu primera compra de inventario'}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Consecutivo</TableHead>
                      <TableHead className="w-[50px]">Tipo</TableHead>
                      <TableHead className="w-[95px]">Fecha</TableHead>
                      <TableHead className="w-[95px]">Vencimiento</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right w-[100px]">Total</TableHead>
                      <TableHead className="text-center w-[80px]">Pago</TableHead>
                      <TableHead className="text-center w-[80px]">Estado</TableHead>
                      <TableHead className="text-center w-[120px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map(purchase => {
                      const doc = getDocBadge(purchase.documentType)
                      const overdue = isOverdue(purchase)
                      return (
                        <TableRow key={purchase.id} className={purchase.status === 'CANCELLED' ? 'opacity-60' : ''}>
                          <TableCell className="font-mono text-xs font-medium">
                            {purchase.consecutiveNumber || `#${purchase.id}`}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${doc.color}`}>{doc.short}</span>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(purchase.date), 'd MMM yy', { locale: es })}</TableCell>
                          <TableCell className="text-xs">
                            {purchase.dueDate ? (
                              <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                                {format(new Date(purchase.dueDate), 'd MMM yy', { locale: es })}
                                {overdue && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{purchase.provider?.name || <span className="text-muted-foreground">Sin proveedor</span>}</TableCell>
                          <TableCell className="text-right font-semibold text-sm">{formatCurrency(purchase.total, currencyCode)}</TableCell>
                          <TableCell className="text-center">{getPaymentStatusBadge(purchase.paymentStatus)}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(purchase.status)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalle" onClick={() => openDetail(purchase)} aria-label="Ver detalles"><Eye className="h-3.5 w-3.5" /></Button>
                              {(purchase.status === 'PENDING' || purchase.status === 'COMPLETED') && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => openEditDialog(purchase)} aria-label="Editar compra"><Pencil className="h-3.5 w-3.5" /></Button>
                              )}
                              {purchase.paymentStatus !== 'PAID' && purchase.status !== 'CANCELLED' && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Pagar" onClick={() => openDetail(purchase)} aria-label="Registrar pago"><DollarSign className="h-3.5 w-3.5" /></Button>
                              )}
                              {purchase.status === 'COMPLETED' && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Devolver" onClick={() => { openDetail(purchase) }} aria-label="Devolver compra"><RotateCcw className="h-3.5 w-3.5" /></Button>
                              )}
                              {purchase.status !== 'CANCELLED' && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" title="Cancelar" onClick={() => setCancelPurchase(purchase)} aria-label="Cancelar compra"><Ban className="h-3.5 w-3.5" /></Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Imprimir" onClick={() => handlePrintPurchaseDetail(purchase)} aria-label="Imprimir compra"><Printer className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden divide-y">
                {purchases.map(purchase => {
                  const doc = getDocBadge(purchase.documentType)
                  const overdue = isOverdue(purchase)
                  return (
                    <div key={purchase.id} className={`p-4 space-y-2 ${purchase.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-sm font-semibold">{purchase.consecutiveNumber || `#${purchase.id}`}</span>
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${doc.color}`}>{doc.short}</span>
                          </div>
                          <p className="text-sm font-medium">{purchase.provider?.name || 'Sin proveedor'}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}
                            {purchase.dueDate && (
                              <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold ml-2' : ' ml-2'}>
                                · Vence: {format(new Date(purchase.dueDate), 'd MMM yy', { locale: es })}{overdue && ' ⚠'}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(purchase.total, currencyCode)}</p>
                          <div className="flex flex-col items-end gap-0.5 mt-1">
                            {getStatusBadge(purchase.status)}
                            {getPaymentStatusBadge(purchase.paymentStatus)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(purchase)}><Eye className="h-3 w-3 mr-1" />Ver</Button>
                        {(purchase.status === 'PENDING' || purchase.status === 'COMPLETED') && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditDialog(purchase)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                        )}
                        {purchase.paymentStatus !== 'PAID' && purchase.status !== 'CANCELLED' && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => openDetail(purchase)}><DollarSign className="h-3 w-3 mr-1" />Pagar</Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handlePrintPurchaseDetail(purchase)}><Printer className="h-3 w-3 mr-1" /></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE / EDIT DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={open => { if (!open) { setCreateOpen(false); setIsEdit(false); setEditingId(null) } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Compra' : 'Nueva Compra'}</DialogTitle>
            <DialogDescription>
              {isEdit ? `Editando compra ${editingId ? `#${editingId}` : ''}` : 'Registra una nueva compra de inventario'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Edit warning */}
            {isEdit && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Editando compra existente. Los cambios se reflejarán en el inventario.
              </div>
            )}

            {/* Row 1: Document type + Date + Invoice */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Documento</Label>
                <Select value={purchaseDocType} onValueChange={setPurchaseDocType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(dt => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha de Compra</Label>
                <Input type="date" className="h-9" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">N° Factura Proveedor</Label>
                <Input className="h-9" placeholder="Ej: 990001234" value={purchaseInvoiceNumber} onChange={e => setPurchaseInvoiceNumber(e.target.value)} />
              </div>
            </div>

            {/* Row 2: Provider (searchable combobox) + Payment Terms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Proveedor</Label>
                <div className="relative" ref={providerRef}>
                  <Input
                    className="h-9"
                    placeholder="Buscar proveedor por nombre o NIT..."
                    value={providerDropdownOpen ? providerSearch : (selectedProvider?.name || '')}
                    onChange={e => { setProviderSearch(e.target.value); setProviderDropdownOpen(true) }}
                    onFocus={() => { setProviderDropdownOpen(true); setProviderSearch('') }}
                  />
                  {providerDropdownOpen && filteredProviders.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                      {filteredProviders.slice(0, 20).map(prov => (
                        <button
                          key={prov.id}
                          className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-accent text-sm"
                          onClick={() => selectProvider(String(prov.id))}
                        >
                          <span className="font-medium">{prov.name}</span>
                          {prov.nit && <span className="text-muted-foreground ml-2 text-xs">{prov.nit}{prov.dv ? `-${prov.dv}` : ''}</span>}
                          <span className="text-xs text-muted-foreground ml-2">({prov.regime === 'RESPONSABLE' ? 'Resp' : prov.regime === 'SIMPLIFICADO' ? 'Simpl' : 'NR'})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedProviderId && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar selección de proveedor" onClick={() => { setSelectedProviderId(''); setSelectedProvider(null); setProviderSearch('') }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {selectedProvider && (
                  <p className="text-[10px] text-muted-foreground">
                    Régimen: {selectedProvider.regime} · Autoretenedor: {selectedProvider.autoretainer ? 'Sí' : 'No'} · Deuda: {formatCurrency(selectedProvider.totalDebt, currencyCode)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pago</Label>
                <Select value={purchasePaymentTerms} onValueChange={setPurchasePaymentTerms}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {purchasePaymentTerms !== 'CONTADO' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    Vencimiento automático: {purchasePaymentTerms === 'CREDITO_30' ? '30' : purchasePaymentTerms === 'CREDITO_60' ? '60' : '90'} días
                  </p>
                )}
              </div>
            </div>

            {/* Row 3: Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea className="text-sm min-h-[60px]" placeholder="Notas opcionales..." value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} />
            </div>

            <Separator />

            {/* ═══ LINE ITEMS ═══════════════════════════════════════════ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Productos ({purchaseItems.length})</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {purchaseItems.map((item, idx) => {
                  const prod = products.find(p => p.id === Number(item.productId))
                  const filteredProducts = products.filter(p =>
                    p.name.toLowerCase().includes((itemSearches[item.id] || '').toLowerCase()) ||
                    (p.sku || '').toLowerCase().includes((itemSearches[item.id] || '').toLowerCase())
                  )

                  return (
                    <Card key={item.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                        {purchaseItems.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removeItem(item.id)} aria-label="Quitar producto"><X className="h-3 w-3" /></Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-1">
                        {/* Product search */}
                        <div className="sm:col-span-2 space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Producto</Label>
                          <div className="relative" ref={el => { itemRefs.current[item.id] = el }}>
                            <Input
                              className="h-8 text-sm"
                              placeholder="Buscar producto..."
                              value={itemDropdowns[item.id] ? (itemSearches[item.id] || '') : (prod?.name || '')}
                              onChange={e => { setItemSearches(prev => ({ ...prev, [item.id]: e.target.value })); setItemDropdowns(prev => ({ ...prev, [item.id]: true })) }}
                              onFocus={() => { setItemSearches(prev => ({ ...prev, [item.id]: '' })); setItemDropdowns(prev => ({ ...prev, [item.id]: true })) }}
                            />
                            {itemDropdowns[item.id] && filteredProducts.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                                {filteredProducts.slice(0, 15).map(p => (
                                  <button key={p.id} className="w-full text-left px-2 py-1 rounded-sm hover:bg-accent text-xs" onClick={() => selectProduct(item.id, String(p.id))}>
                                    <span className="font-medium">{p.name}</span>
                                    {p.sku && <span className="text-muted-foreground ml-1">({p.sku})</span>}
                                    <span className="text-muted-foreground ml-1">· Costo: {formatCurrency(p.costPrice, currencyCode)} · Stock: {p.currentStock}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quantity */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
                          <Input type="number" min="1" className="h-8 text-sm" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} />
                        </div>

                        {/* Unit Cost */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Costo Unit. (COP)</Label>
                          <Input type="number" min="0" className="h-8 text-sm" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', e.target.value)} placeholder="0" />
                        </div>
                      </div>

                      {/* Second row: IVA + Discount + Lot + Dates */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">IVA</Label>
                          <Select value={String(item.ivaRate)} onValueChange={v => updateItem(item.id, 'ivaRate', Number(v))}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {IVA_RATES.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Descuento (COP)</Label>
                          <Input type="number" min="0" className="h-7 text-xs" value={item.discountAmount} onChange={e => updateItem(item.id, 'discountAmount', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Lote</Label>
                          <Input className="h-7 text-xs" value={item.lotNumber} onChange={e => updateItem(item.id, 'lotNumber', e.target.value)} placeholder="Opcional" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Vencimiento</Label>
                          <Input type="date" className="h-7 text-xs" value={item.expiryDate} onChange={e => updateItem(item.id, 'expiryDate', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Fabricación</Label>
                          <Input type="date" className="h-7 text-xs" value={item.manufacturingDate} onChange={e => updateItem(item.id, 'manufacturingDate', e.target.value)} />
                        </div>
                      </div>

                      {/* Line total */}
                      <div className="flex justify-end mt-2">
                        <span className="text-xs text-muted-foreground">
                          Sub: {formatCurrency(calcLineSubtotal(item), currencyCode)} + IVA: {formatCurrency(calcLineIva(item), currencyCode)} - Desc: {formatCurrency(Number(item.discountAmount) || 0, currencyCode)} = <span className="font-semibold text-foreground">{formatCurrency(calcLineTotal(item), currencyCode)}</span>
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* ═══ SUMMARY ═══════════════════════════════════════════════ */}
            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(formSubtotal, currencyCode)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">IVA Descontable</span><span className="text-blue-600 dark:text-blue-400">{formatCurrency(formTotalIva, currencyCode)}</span></div>
              {formTotalDiscount > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Descuento Total</span><span className="text-red-500">-{formatCurrency(formTotalDiscount, currencyCode)}</span></div>
              )}
              {formRetenciones.reteFuente > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Retención en la Fuente (2.5%)</span><span className="text-orange-600 dark:text-orange-400">-{formatCurrency(formRetenciones.reteFuente, currencyCode)}</span></div>
              )}
              {formRetenciones.reteIca > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Retención ICA (9.66‰)</span><span className="text-orange-600 dark:text-orange-400">-{formatCurrency(formRetenciones.reteIca, currencyCode)}</span></div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL A PAGAR</span>
                <span className="text-primary">{formatCurrency(formGrandTotal, currencyCode)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setIsEdit(false); setEditingId(null) }}>Cancelar</Button>
            <Button onClick={handleSavePurchase} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? 'Guardar Cambios' : 'Crear Compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          DETAIL DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailPurchase} onOpenChange={open => { if (!open) setDetailPurchase(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailPurchase && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>{detailPurchase.consecutiveNumber || `Compra #${detailPurchase.id}`}</DialogTitle>
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${getDocBadge(detailPurchase.documentType).color}`}>
                    {getDocBadge(detailPurchase.documentType).short}
                  </span>
                </div>
                <DialogDescription>Detalle de la compra</DialogDescription>
              </DialogHeader>

              {loadingDetail ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="space-y-4">
                  {/* Purchase info */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha</p>
                      <p className="font-medium">{format(new Date(detailPurchase.date), 'd MMM yyyy', { locale: es })}</p>
                    </div>
                    {detailPurchase.dueDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">Vencimiento</p>
                        <p className={`font-medium ${isOverdue(detailPurchase) ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {format(new Date(detailPurchase.dueDate), 'd MMM yyyy', { locale: es })}
                          {isOverdue(detailPurchase) && ' ⚠ Vencida'}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Forma de Pago</p>
                      <p className="font-medium">{PAYMENT_TERMS.find(t => t.value === detailPurchase.paymentTerms)?.label || detailPurchase.paymentTerms}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Proveedor</p>
                      <p className="font-medium">{detailPurchase.provider?.name || 'Sin proveedor'}</p>
                    </div>
                    {detailPurchase.invoiceNumber && (
                      <div>
                        <p className="text-xs text-muted-foreground">Factura</p>
                        <p className="font-mono">{detailPurchase.invoiceNumber}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Estado</p>
                      <div className="flex items-center gap-1.5">{getStatusBadge(detailPurchase.status)} {getPaymentStatusBadge(detailPurchase.paymentStatus)}</div>
                    </div>
                  </div>

                  {detailPurchase.notes && (
                    <div className="text-sm">
                      <p className="text-xs text-muted-foreground">Notas</p>
                      <p>{detailPurchase.notes}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Items table */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Productos ({detailPurchase.purchaseItems.length})</h4>
                    <div className="rounded border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Producto</TableHead>
                            <TableHead className="text-xs text-center">Cant</TableHead>
                            <TableHead className="text-xs text-right">Costo</TableHead>
                            <TableHead className="text-xs text-center">IVA%</TableHead>
                            <TableHead className="text-xs text-right">IVA</TableHead>
                            <TableHead className="text-xs text-right">Desc</TableHead>
                            <TableHead className="text-xs text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailPurchase.purchaseItems.map(item => (
                            <TableRow key={item.id}>
                              <TableCell className="text-xs">
                                {item.product?.name || 'Producto eliminado'}
                                {item.lotNumber && <span className="text-[10px] text-muted-foreground block">Lote: {item.lotNumber}</span>}
                              </TableCell>
                              <TableCell className="text-xs text-center">
                                {item.quantity}
                                {item.returnedQuantity > 0 && <span className="text-red-500 text-[10px] block">- {item.returnedQuantity} dev.</span>}
                              </TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(item.unitCost, currencyCode)}</TableCell>
                              <TableCell className="text-xs text-center">{item.ivaRate}%</TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(item.ivaAmount, currencyCode)}</TableCell>
                              <TableCell className="text-xs text-right">{item.discountAmount > 0 ? formatCurrency(item.discountAmount, currencyCode) : '—'}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{formatCurrency(item.total, currencyCode)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Tax breakdown */}
                  <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/20">
                    <h4 className="text-sm font-semibold mb-2">Desglose de Impuestos</h4>
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(detailPurchase.subtotal, currencyCode)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IVA Descontable</span><span className="text-blue-600">{formatCurrency(detailPurchase.totalIva, currencyCode)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Retención en la Fuente</span><span className="text-orange-600">-{formatCurrency(detailPurchase.totalReteFuente, currencyCode)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Retención ICA</span><span className="text-orange-600">-{formatCurrency(detailPurchase.totalReteIca, currencyCode)}</span></div>
                    {detailPurchase.totalReteIva > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Retención IVA</span><span className="text-orange-600">-{formatCurrency(detailPurchase.totalReteIva, currencyCode)}</span></div>
                    )}
                    {detailPurchase.totalDiscount > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Descuentos</span><span className="text-red-500">-{formatCurrency(detailPurchase.totalDiscount, currencyCode)}</span></div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span className="text-primary">{formatCurrency(detailPurchase.total, currencyCode)}</span></div>
                  </div>

                  {/* Payment progress */}
                  {detailPurchase.paymentTerms !== 'CONTADO' && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Estado de Pago</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pagado: {formatCurrency(detailPurchase.amountPaid, currencyCode)}</span>
                          <span className="text-muted-foreground">Pendiente: {formatCurrency(detailPurchase.total - detailPurchase.amountPaid, currencyCode)}</span>
                        </div>
                        <Progress value={detailPurchase.total > 0 ? Math.min(100, (detailPurchase.amountPaid / detailPurchase.total) * 100) : 0} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0%</span>
                          <span>{detailPurchase.total > 0 ? Math.round((detailPurchase.amountPaid / detailPurchase.total) * 100) : 0}%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Payment history */}
                      {detailPurchase.purchasePayments && detailPurchase.purchasePayments.length > 0 && (
                        <div className="mt-2 rounded border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs">Método</TableHead>
                                <TableHead className="text-xs text-right">Monto</TableHead>
                                <TableHead className="text-xs">Ref</TableHead>
                                <TableHead className="text-xs">Por</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detailPurchase.purchasePayments.map(pp => (
                                <TableRow key={pp.id}>
                                  <TableCell className="text-xs">{format(new Date(pp.createdAt), 'd MMM yy HH:mm', { locale: es })}</TableCell>
                                  <TableCell className="text-xs">{PAYMENT_METHODS.find(m => m.value === pp.paymentMethod)?.label || pp.paymentMethod}</TableCell>
                                  <TableCell className="text-xs text-right font-medium">{formatCurrency(pp.amount, currencyCode)}</TableCell>
                                  <TableCell className="text-xs">{pp.reference || '—'}</TableCell>
                                  <TableCell className="text-xs">{pp.createdBy?.fullName || '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(detailPurchase.status === 'PENDING' || detailPurchase.status === 'COMPLETED') && (
                      <Button variant="outline" size="sm" onClick={() => { setDetailPurchase(null); openEditDialog(detailPurchase) }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                      </Button>
                    )}
                    {detailPurchase.paymentStatus !== 'PAID' && detailPurchase.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-600" onClick={openPaymentDialog}>
                        <DollarSign className="h-3.5 w-3.5 mr-1" />Pagar
                      </Button>
                    )}
                    {detailPurchase.status === 'COMPLETED' && (
                      <Button variant="outline" size="sm" onClick={openReturnDialog}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />Devolver
                      </Button>
                    )}
                    {detailPurchase.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-red-300 text-red-600" onClick={() => { setDetailPurchase(null); setCancelPurchase(detailPurchase) }}>
                        <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                      </Button>
                    )}
                    <div className="flex-1" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm"><Printer className="h-3.5 w-3.5 mr-1" />Imprimir</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePrintPurchaseDetail(detailPurchase)}><FileSpreadsheet className="h-4 w-4 mr-2" />Impresora Normal</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { const p = detailPurchase; /* thermal with full detail */ const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []; const doc = getDocBadge(p.documentType); lines.push({ left: `${p.consecutiveNumber || `#${p.id}`} [${doc.short}]`, bold: true, separator: true }); lines.push({ left: `Fecha: ${format(new Date(p.date), 'dd/MM/yyyy')}` }); if (p.dueDate) lines.push({ left: `Vence: ${format(new Date(p.dueDate), 'dd/MM/yyyy')}` }); lines.push({ left: `Prov: ${p.provider?.name || 'N/A'}` }); if (p.invoiceNumber) lines.push({ left: `Factura: ${p.invoiceNumber}` }); lines.push({ separator: true }); p.purchaseItems.forEach(item => { const n = (item.product?.name || 'Prod').slice(0, 22); lines.push({ left: `${item.quantity}x ${n}`, right: formatCurrency(item.total, currencyCode) }) }); lines.push({ left: '────────────────────────────────' }); lines.push({ left: 'Subtotal:', right: formatCurrency(p.subtotal, currencyCode) }); lines.push({ left: 'IVA:', right: formatCurrency(p.totalIva, currencyCode) }); if (p.totalReteFuente > 0) lines.push({ left: 'ReteFuente:', right: `-${formatCurrency(p.totalReteFuente, currencyCode)}` }); if (p.totalReteIca > 0) lines.push({ left: 'ReteICA:', right: `-${formatCurrency(p.totalReteIca, currencyCode)}` }); if (p.totalDiscount > 0) lines.push({ left: 'Desc:', right: `-${formatCurrency(p.totalDiscount, currencyCode)}` }); lines.push({ left: 'TOTAL:', right: formatCurrency(p.total, currencyCode), bold: true, separator: true }); lines.push({ left: `Pagado: ${formatCurrency(p.amountPaid, currencyCode)}/${formatCurrency(p.total, currencyCode)}` }); printThermal80mm({ title: 'COMPRA DETALLE', lines, footer: `${format(new Date(), 'dd/MM/yyyy HH:mm')}` }) }}><Printer className="h-4 w-4 mr-2" />Térmica 80mm</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          PAYMENT DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showPaymentDialog} onOpenChange={open => { if (!open) setShowPaymentDialog(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Registrar Abono</DialogTitle>
            <DialogDescription>Pago a compra {detailPurchase?.consecutiveNumber || ''}</DialogDescription>
          </DialogHeader>

          {detailPurchase && (
            <div className="space-y-4">
              {/* Purchase info */}
              <div className="rounded-lg border p-3 space-y-1 text-sm bg-muted/20">
                <div className="flex justify-between"><span className="text-muted-foreground">Proveedor</span><span className="font-medium">{detailPurchase.provider?.name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Compra</span><span>{formatCurrency(detailPurchase.total, currencyCode)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ya Pagado</span><span className="text-emerald-600">{formatCurrency(detailPurchase.amountPaid, currencyCode)}</span></div>
                <Separator />
                <div className="flex justify-between font-semibold"><span>Saldo Pendiente</span><span className="text-red-600">{formatCurrency(detailPurchase.total - detailPurchase.amountPaid, currencyCode)}</span></div>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-xs">Monto del Abono (COP)</Label>
                <Input type="number" min="1" className="h-10 text-lg font-semibold" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0" />
              </div>

              {/* Payment method */}
              <div className="space-y-1.5">
                <Label className="text-xs">Método de Pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <Label className="text-xs">Número de Referencia (opcional)</Label>
                <Input placeholder="Ej: transacción bancaria" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea className="text-sm" placeholder="Notas del pago..." value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handlePayment} disabled={paying} className="bg-emerald-600 hover:bg-emerald-700">
              {paying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <DollarSign className="h-4 w-4 mr-1" />Registrar Abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          RETURN DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showReturnDialog} onOpenChange={open => { if (!open) setShowReturnDialog(false) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><RotateCcw className="h-5 w-5" />Devolver Compra</DialogTitle>
            <DialogDescription>Selecciona los productos y cantidades a devolver</DialogDescription>
          </DialogHeader>

          {detailPurchase && (
            <div className="space-y-3">
              <div className="flex gap-2 mb-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => detailPurchase && (() => { const items = new Map<number, number>(); for (const i of detailPurchase.purchaseItems) { const a = i.quantity - (i.returnedQuantity ?? 0); if (a > 0) items.set(i.id, a) }; setReturnItems(items) })()}>Seleccionar Todos</Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setReturnItems(new Map())}>Deseleccionar</Button>
              </div>

              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {detailPurchase.purchaseItems.map(item => {
                  const available = item.quantity - (item.returnedQuantity ?? 0)
                  if (available <= 0) return null
                  const isSelected = returnItems.has(item.id)
                  const qty = returnItems.get(item.id) || 0
                  return (
                    <Card key={item.id} className="p-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleReturnItem(item.id, available)} className="rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.product?.name || 'Producto'}</p>
                          <p className="text-xs text-muted-foreground">
                            Disponible: {available} · Costo: {formatCurrency(item.unitCost, currencyCode)} · IVA: {formatCurrency(item.ivaAmount, currencyCode)}
                          </p>
                        </div>
                        {isSelected && (
                          <Input
                            type="number" min="1" max={available} className="w-20 h-8 text-sm text-right"
                            value={qty}
                            onChange={e => setReturnItemQty(item.id, Number(e.target.value) || 1, available)}
                          />
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>

              {returnItems.size > 0 && (
                <div className="text-sm font-medium text-muted-foreground">
                  {returnItems.size} producto(s) seleccionado(s) · Total: {formatCurrency(
                    Array.from(returnItems.entries()).reduce((sum, [id, qty]) => {
                      const item = detailPurchase.purchaseItems.find(i => i.id === id)
                      return sum + (item ? Math.round(item.unitCost * qty) : 0)
                    }, 0), currencyCode
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Motivo de Devolución (opcional)</Label>
                <Textarea className="text-sm" placeholder="Describe el motivo..." value={returnReason} onChange={e => setReturnReason(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReturnPurchase} disabled={returning}>
              {returning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <RotateCcw className="h-4 w-4 mr-1" />Confirmar Devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          CANCEL DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!cancelPurchase} onOpenChange={open => { if (!open) setCancelPurchase(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar Compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancelará la compra {cancelPurchase?.consecutiveNumber || `#${cancelPurchase?.id}`} y reducirá el inventario de los productos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>No, mantener</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-red-600 hover:bg-red-700">
              {cancelling && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Sí, cancelar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════
          XML HELP DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showXmlHelp} onOpenChange={setShowXmlHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Factura XML</DialogTitle>
            <DialogDescription>Formatos soportados para importar facturas electrónicas</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border p-3 bg-muted/30">
              <p className="font-semibold mb-1">Formatos soportados:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
                <li>UBL 2.1 DIAN (estándar colombiano)</li>
                <li>FeCo (factura electrónica)</li>
                <li>Formato genérico (producto/product)</li>
                <li>Formato libre (detección automática)</li>
              </ul>
            </div>
            <div className="rounded border p-3 bg-muted/30">
              <p className="font-semibold mb-1">Datos que se extraen:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
                <li>Número de factura y fecha</li>
                <li>Nombre y NIT del proveedor</li>
                <li>Lista de productos con cantidades y precios</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">Los productos se vincularán automáticamente si coinciden por nombre. Se crearán nuevos productos para los que no existan.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          XML PREVIEW DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!xmlPreview} onOpenChange={open => { if (!open) setXmlPreview(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa de Importación</DialogTitle>
            <DialogDescription>{xmlPreview?.fileName} · {xmlPreview?.xmlFormat}</DialogDescription>
          </DialogHeader>

          {xmlPreview && (
            <div className="space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {xmlPreview.invoiceNumber && <div><span className="text-xs text-muted-foreground">Factura:</span><p className="font-mono">{xmlPreview.invoiceNumber}</p></div>}
                {xmlPreview.invoiceDate && <div><span className="text-xs text-muted-foreground">Fecha:</span><p>{xmlPreview.invoiceDate}</p></div>}
                {xmlPreview.providerName && <div><span className="text-xs text-muted-foreground">Proveedor:</span><p>{xmlPreview.providerName}</p></div>}
                {xmlPreview.providerNit && <div><span className="text-xs text-muted-foreground">NIT:</span><p className="font-mono">{xmlPreview.providerNit}</p></div>}
              </div>

              {/* Provider selector */}
              <div className="space-y-1.5">
                <Label className="text-xs">Vincular a Proveedor</Label>
                <Select value={xmlProviderId} onValueChange={setXmlProviderId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {xmlProviders.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.nit ? ` (${p.nit})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Notas</Label>
                <Input value={xmlNotes} onChange={e => setXmlNotes(e.target.value)} />
              </div>

              {/* Items table */}
              <div className="rounded border overflow-hidden max-h-[200px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Producto</TableHead>
                      <TableHead className="text-xs text-center">Cant</TableHead>
                      <TableHead className="text-xs text-right">Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {xmlPreview.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{item.name}</TableCell>
                        <TableCell className="text-xs text-center">{item.quantity}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(item.unitCost, currencyCode)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setXmlPreview(null)}>Cancelar</Button>
            <Button onClick={confirmXmlImport} disabled={xmlUploading}>
              {xmlUploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Upload className="h-4 w-4 mr-1" />Importar Factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
