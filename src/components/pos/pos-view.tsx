'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { ProductImage } from '@/components/ui/product-image'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { NITInput } from '@/components/ui/nit-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  StickyNote,
  X,
  PackageSearch,
  Smartphone,
  Users,
  Star,
  Heart,
  Printer,
  AlertTriangle,
  Wallet,
  Loader2,
  Percent,
  Tag,
  MessageSquare,
  Pencil,
  RotateCcw,
  Clock,
  FileText,
  Receipt,
  QrCode,
  MonitorSmartphone,
  Hash,
  ScanBarcode,
} from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'
import { KPIBar } from '@/components/shared/kpi-bar'
import { useAppStore } from '@/stores/app-store'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { playCartAdd, playSaleSuccess, playError } from '@/lib/pos-sounds'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import type { ProductSummary, Service, CategorySummary, CustomerSummary, CartItem, PaymentMethod, InvoiceMode, LastOrderData, LastInvoiceData, ReturnOrderDetail, OrderItemData } from '@/types'

// ─── Types ──────────────────────────────────────────────

// NOTE: local Product alias intentionally kept — uses `categoryId` and `currentStock` (non-optional) which differ from ProductSummary
type Product = ProductSummary & { currentStock: number; categoryId: number | null }

// Service imported from @/types

// Category → CategorySummary imported from @/types

// Customer → CustomerSummary imported from @/types

// CartItem imported from @/types

// PaymentMethod imported from @/types
type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED'

// ─── Payment method labels ──────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Efectivo', icon: <Banknote className="h-4 w-4" /> },
  { value: 'DAVIPLATA', label: 'Daviplata', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'NEQUI', label: 'Nequi', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'CARD', label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" /> },
  { value: 'TRANSFER', label: 'Transferencia', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { value: 'FIADO', label: 'Fiado', icon: <Users className="h-4 w-4" /> },
]

// ─── Main Component ─────────────────────────────────────

export function POSView() {
  const { store } = useAuthStore()
  const storeId = store?.id
  const currencyCode = store?.currencyCode || 'COP'

  // ─── Data states ─────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openCashRegisters, setOpenCashRegisters] = useState<Array<{ id: number; user: { fullName: string | null }; openedAt: string; openingBalance: number }>>([])
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('auto')

  // ─── UI states ───────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('none')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [notes, setNotes] = useState('')
  const [showChargeDialog, setShowChargeDialog] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderData, setLastOrderData] = useState<LastOrderData | null>(null)
  const [tipAmount, setTipAmount] = useState<number>(0)
  const [showTipInput, setShowTipInput] = useState(false)
  const [transferRef, setTransferRef] = useState('')

  // ─── Discount states ─────────────────────────────────
  const [discountType, setDiscountType] = useState<DiscountType>('NONE')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState('')
  const [showDiscountInput, setShowDiscountInput] = useState(false)

  // ─── Invoice mode: TIRILLA (default), DOC_EQUIPOS (equivalente POS), or ELECTRONICA (when e-invoicing enabled) ──
  // InvoiceMode imported from @/types
  const isEInvEnabled = !!store?.invoiceEnabled && !!store?.nit
  const hasStoreNit = !!store?.nit
  const [posInvoiceMode, setPosInvoiceMode] = useState<InvoiceMode>('TIRILLA')
  const [lastInvoiceData, setLastInvoiceData] = useState<LastInvoiceData | null>(null)
  const [lastDocType, setLastDocType] = useState<'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'>('TIRILLA')
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  // ─── Invoice buyer info (Art. 11 DIAN — only name, NIT, email required) ──
  const [invoiceCustomerNit, setInvoiceCustomerNit] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')

  // ─── Cart Sheet state ────────────────────────────────
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  // ─── Return states ──────────────────────────────────
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning] = useState(false)
  const [returningOrderId, setReturningOrderId] = useState<number | null>(null)
  const [returnOrderDetail, setReturnOrderDetail] = useState<ReturnOrderDetail | null>(null)
  const [returnItems, setReturnItems] = useState<Map<number, number>>(new Map())
  const [loadingReturnDetail, setLoadingReturnDetail] = useState(false)

  // ─── Recent sales dialog state ──────────────────────
  const [showRecentSales, setShowRecentSales] = useState(false)
  const [recentOrders, setRecentOrders] = useState<Array<{
    id: number
    orderNumber: string
    customerName: string | null
    status: string
    total: number
    createdAt: string
    orderItems: Array<{ productName: string; quantity: number; totalRow: number }>
  }>>([])
  const [loadingRecentSales, setLoadingRecentSales] = useState(false)
  const [recentSalesSearch, setRecentSalesSearch] = useState('')

  // ─── Cart state ──────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([])

  // ─── Barcode scanner state ──────────────────────────
  const [barcodeFlash, setBarcodeFlash] = useState<'success' | 'error' | null>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // ─── Barcode scan handler ──────────────────────────
  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      // Search products for exact barcode match (case insensitive)
      const product = products.find(
        (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
      )
      if (product) {
        addToCart(product)
        toast.success(`Escaneado: ${product.name}`)
        setBarcodeFlash('success')
      } else {
        playError()
        toast.error(`Producto no encontrado: ${barcode}`)
        setBarcodeFlash('error')
      }
      // Clear flash after 1.5s
      setTimeout(() => setBarcodeFlash(null), 1500)
    },
    [products, addToCart]
  )

  // ─── Barcode scanner hook ──────────────────────────
  // Enabled only when no dialog is open
  const anyDialogOpen = showChargeDialog || showReturnDialog || showRecentSales
  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: !anyDialogOpen })

  // ─── Dedicated barcode input handler ──────────────
  const handleBarcodeInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const value = (e.target as HTMLInputElement).value.trim()
        if (value.length >= 4) {
          handleBarcodeScan(value)
          ;(e.target as HTMLInputElement).value = ''
        }
      }
    },
    [handleBarcodeScan]
  )

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

  useEffect(() => {
    fetchProducts()
    fetchServices()
    fetchCategories()
    fetchCustomers()
    fetchOpenCashRegisters()
  }, [fetchProducts, fetchServices, fetchCategories, fetchCustomers, fetchOpenCashRegisters])

  // ─── Filtered products ───────────────────────────────
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'servicios') return []
    let filtered = products

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.categoryId === Number(selectedCategory))
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.sku && p.sku.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [products, selectedCategory, searchQuery])

  // ─── Filtered services ───────────────────────────────
  const filteredServices = useMemo(() => {
    if (selectedCategory !== 'servicios') return []
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      return services.filter((s) => s.name.toLowerCase().includes(query))
    }
    return services
  }, [services, selectedCategory, searchQuery])

  // ─── Cart operations ─────────────────────────────────
  const addToCart = useCallback(
    (product: Product) => {
      const wasEmpty = cart.length === 0
      let didAdd = false
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === product.id)
        if (existing) {
          if (existing.quantity >= product.currentStock) {
            toast.warning(`Stock insuficiente para "${product.name}"`)
            return prev
          }
          didAdd = true
          return prev.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
        if (product.currentStock <= 0) {
          toast.warning(`Sin stock para "${product.name}"`)
          return prev
        }
        didAdd = true
        return [
          ...prev,
          {
            productId: product.id,
            serviceId: null,
            name: product.name,
            salePrice: product.salePrice,
            quantity: 1,
            maxStock: product.currentStock,
            isService: false,
            taxRate: product.taxRate || undefined,
          },
        ]
      })
      if (didAdd) {
        playCartAdd()
      }
      // Auto-open cart sheet when first product is added
      if (wasEmpty) {
        setCartSheetOpen(true)
      }
    },
    [cart.length]
  )

  const addServiceToCart = useCallback(
    (service: Service) => {
      const wasEmpty = cart.length === 0
      let didAdd = false
      setCart((prev) => {
        const existing = prev.find((item) => item.serviceId === service.id)
        if (existing) {
          didAdd = true
          return prev.map((item) =>
            item.serviceId === service.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
        didAdd = true
        return [
          ...prev,
          {
            productId: null,
            serviceId: service.id,
            name: service.name,
            salePrice: service.price,
            quantity: 1,
            maxStock: 999999,
            isService: true,
          },
        ]
      })
      if (didAdd) {
        playCartAdd()
      }
      if (wasEmpty) {
        setCartSheetOpen(true)
      }
    },
    [cart.length]
  )

  const updateQuantity = useCallback(
    (itemId: number, delta: number, isService: boolean) => {
      setCart((prev) =>
        prev
          .map((item) => {
            const match = isService ? item.serviceId === itemId : item.productId === itemId
            if (!match) return item
            const newQty = item.quantity + delta
            if (newQty <= 0) return null
            if (!item.isService && newQty > item.maxStock) {
              toast.warning('Stock insuficiente')
              return item
            }
            return { ...item, quantity: newQty }
          })
          .filter(Boolean) as CartItem[]
      )
    },
    []
  )

  const removeFromCart = useCallback((itemId: number, isService: boolean) => {
    setCart((prev) =>
      prev.filter((item) =>
        isService ? item.serviceId !== itemId : item.productId !== itemId
      )
    )
  }, [])

  // ─── Update per-item notes ───────────────────────────
  const updateItemNotes = useCallback((itemId: number, isService: boolean, itemNotes: string) => {
    setCart((prev) =>
      prev.map((item) => {
        const match = isService ? item.serviceId === itemId : item.productId === itemId
        if (!match) return item
        return { ...item, notes: itemNotes.trim() || undefined }
      })
    )
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setNotes('')
    setSelectedCustomer('none')
    setLastOrderNumber(null)
    setLastOrderData(null)
    setTipAmount(0)
    setShowTipInput(false)
    setTransferRef('')
    setDiscountType('NONE')
    setDiscountValue(0)
    setDiscountReason('')
    setShowDiscountInput(false)
    setCartSheetOpen(false)
    setInvoiceCustomerNit('')
    setInvoiceCustomerName('')
    setInvoiceCustomerEmail('')
  }, [])

  // ─── Return last order ─────────────────────────────
  async function openReturnDialog(orderId: number) {
    if (!storeId) return
    setReturningOrderId(orderId)
    setReturnReason('')
    setReturnItems(new Map())
    setReturnOrderDetail(null)
    setLoadingReturnDetail(true)
    setShowReturnDialog(true)
    try {
      const res = await fetch(`/api/orders/${orderId}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setReturnOrderDetail(data)
      // Pre-select all returnable items
      const items = new Map<number, number>()
      for (const item of data.orderItems || []) {
        if (item.productId && item.quantity > (item.returnedQuantity || 0)) {
          items.set(item.id, item.quantity - (item.returnedQuantity || 0))
        }
      }
      setReturnItems(items)
    } catch {
      toast.error('Error al cargar detalle de la venta')
      setShowReturnDialog(false)
    } finally {
      setLoadingReturnDetail(false)
    }
  }

  function toggleReturnItem(itemId: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.set(itemId, maxQty)
      }
      return next
    })
  }

  function setReturnItemQty(itemId: number, qty: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      const clamped = Math.max(1, Math.min(qty, maxQty))
      next.set(itemId, clamped)
      return next
    })
  }

  async function handleReturnOrder() {
    if (!returningOrderId || !storeId || returnItems.size === 0) {
      toast.error('Selecciona al menos un producto para devolver')
      return
    }
    setReturning(true)
    try {
      const items = Array.from(returnItems.entries()).map(([orderItemId, quantity]) => ({
        orderItemId,
        quantity,
      }))
      const res = await fetch(`/api/orders/${returningOrderId}/return`, {
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
      // Show credit note notification if auto-generated
      if (data.creditNote) {
        toast.success(`Nota Crédito ${data.creditNote.noteNumber} generada automáticamente`, {
          description: `${data.creditNote.concept} por $${data.creditNote.grandTotal.toLocaleString('es-CO')}`,
          duration: 6000,
        })
      }
      setShowReturnDialog(false)
      setReturningOrderId(null)
      setReturnOrderDetail(null)
      setReturnItems(new Map())
      setReturnReason('')
      // Clear last order if it was the returned one
      if (lastOrderData?.id === returningOrderId) {
        setLastOrderNumber(null)
        setLastOrderData(null)
      }
      // Refresh recent sales if open
      if (showRecentSales) fetchRecentSales()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al procesar devolución')
    } finally {
      setReturning(false)
    }
  }

  // ─── Fetch recent sales ──────────────────────────────
  async function fetchRecentSales() {
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
  }

  // ─── Cart calculations ───────────────────────────────
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0), [cart])

  // Estimated tax breakdown (prices in Colombia are tax-inclusive)
  const taxEstimate = useMemo(() => {
    const breakdown: Record<string, { name: string; code: string; base: number; rate: number; amount: number }> = {}
    let totalTax = 0
    for (const item of cart) {
      const tr = item.taxRate
      if (!tr || tr.rate === 0 || tr.rateType !== 'PERCENTAGE') continue
      const totalRow = item.salePrice * item.quantity
      const base = Math.round(totalRow / (1 + tr.rate / 100))
      const tax = totalRow - base
      if (breakdown[tr.code]) {
        breakdown[tr.code].base += base
        breakdown[tr.code].amount += tax
      } else {
        breakdown[tr.code] = { name: tr.name, code: tr.code, base, rate: tr.rate, amount: tax }
      }
      totalTax += tax
    }
    return { breakdown: Object.values(breakdown), totalTax }
  }, [cart])
  const discountAmount = useMemo(() => {
    if (discountType === 'PERCENTAGE') {
      return Math.round(subtotal * discountValue / 100)
    }
    if (discountType === 'FIXED') {
      return Math.min(discountValue, subtotal)
    }
    return 0
  }, [discountType, discountValue, subtotal])
  const total = useMemo(() => subtotal - discountAmount + tipAmount, [subtotal, discountAmount, tipAmount])

  // ─── Submit order ────────────────────────────────────
  const handleSubmitOrder = async () => {
    if (!storeId || cart.length === 0) return

    // Block if no cash register is open — backend also validates, but catch early on frontend
    if (openCashRegisters.length === 0) {
      toast.error('Debes abrir la caja antes de registrar una venta. Ve a Contabilidad → Caja.')
      playError()
      setShowChargeDialog(false)
      return
    }

    // Fiado requires a customer
    if (paymentMethod === 'FIADO' && selectedCustomer === 'none') {
      toast.error('Para vender fiado debes seleccionar un cliente')
      playError()
      setShowChargeDialog(false)
      return
    }

    // Transfer/Nequi/Daviplata require reference number
    if (['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && !transferRef.trim()) {
      toast.error(`Ingresa el número de ${paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod === 'NEQUI' ? 'Nequi' : 'Daviplata'}`)
      playError()
      setShowChargeDialog(false)
      return
    }

    setIsSubmitting(true)

    // Transfer/Nequi/Daviplata: append reference to notes
    const isTransferMethod = ['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod)
    const transferNote = isTransferMethod && transferRef.trim() ? `Ref: ${transferRef.trim()}` : ''

    try {
      const payload = {
        storeId,
        customerId: selectedCustomer !== 'none' ? Number(selectedCustomer) : null,
        cashRegisterId: selectedCashRegisterId !== 'auto' ? Number(selectedCashRegisterId) : undefined,
        paymentMethod,
        tipAmount: paymentMethod !== 'FIADO' ? tipAmount : 0,
        discountType,
        discountAmount,
        discountReason: discountReason.trim() || undefined,
        notes: [
          notes.trim(),
          transferNote,
        ].filter(Boolean).join(' | ') || undefined,
        items: cart.map((item) => ({
          ...(item.isService ? { serviceId: item.serviceId } : { productId: item.productId }),
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Error al registrar la venta')
      }

      const order = await res.json()
      playSaleSuccess()
      toast.success('¡Venta registrada!', {
        description: `Orden ${order.orderNumber}`,
      })

      // Refresh open cash registers after sale
      fetchOpenCashRegisters()

      setLastOrderNumber(order.orderNumber)
      setLastOrderData(order)
      setLastDocType(posInvoiceMode)
      setCart([])
      setNotes('')
      setTipAmount(0)
      setShowTipInput(false)
      setTransferRef('')
      setDiscountType('NONE')
      setDiscountValue(0)
      setDiscountReason('')
      setShowDiscountInput(false)
      setCartSheetOpen(false)

      // ── Auto-create electronic invoice if selected ──
      if (posInvoiceMode === 'ELECTRONICA' && isEInvEnabled && order.id) {
        try {
          setCreatingInvoice(true)
          // Determine NIT: manual input > selected customer > consumidor final
          const finalNit = invoiceCustomerNit.trim()
            ? invoiceCustomerNit.trim().replace(/[^0-9]/g, '')
            : (selectedCustomer !== 'none'
                ? (customers.find(c => String(c.id) === selectedCustomer)?.nit?.replace(/[^0-9]/g, '') || DIAN_CONSUMIDOR_FINAL_NIT)
                : DIAN_CONSUMIDOR_FINAL_NIT)
          const finalName = invoiceCustomerName.trim()
            || (selectedCustomer !== 'none'
              ? customers.find(c => String(c.id) === selectedCustomer)?.name
              : undefined)
          const finalEmail = invoiceCustomerEmail.trim() || undefined

          const invBody: { orderId: number; testMode: boolean; customerNit: string; customerName: string; autoSend: boolean; customerEmail?: string } = {
            orderId: order.id,
            testMode: store?.invoiceTestMode ?? true,
            customerNit: finalNit,
            customerName: finalName || 'Consumidor Final',
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
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al registrar la venta')
    } finally {
      setIsSubmitting(false)
      setShowChargeDialog(false)
    }
  }

  // ─── Cart item key helper ──────────────────────────
  const cartItemKey = (item: CartItem) =>
    item.isService ? `svc-${item.serviceId}` : `prd-${item.productId}`

  // ─── Render: Product Card (Vertical Layout) ──────────
  const renderProductCard = (product: Product) => {
    const isOutOfStock = product.currentStock <= 0
    const cartItem = cart.find((item) => item.productId === product.id)
    const inCart = !!cartItem

    return (
      <Card
        key={product.id}
        className={`
          cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
          hover:shadow-md hover:border-primary/20 active:scale-[0.97]
          ${isOutOfStock ? 'opacity-50 grayscale cursor-not-allowed' : ''}
          ${inCart ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-background shadow-emerald-500/10 dark:shadow-emerald-900/20' : ''}
        `}
        onClick={() => !isOutOfStock && addToCart(product)}
      >
        <CardContent className="p-0">
          {/* Image area — 4:3 aspect ratio for better density */}
          <div className="relative w-full aspect-[4/3] bg-muted">
            <ProductImage
              src={product.imgUrl}
              alt={product.name}
              categoryName={product.category?.name}
              className="w-full h-full object-cover"
              fallbackClassName="w-full h-full bg-muted flex items-center justify-center"
              iconClassName="h-10 w-10 text-muted-foreground/30"
            />

            {/* Cart quantity badge — top right */}
            {inCart && !isOutOfStock && (
              <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
                {cartItem!.quantity}
              </div>
            )}

            {/* Stock badge — bottom right (only when low or out) */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                <Badge variant="secondary" className="text-xs px-2 py-0.5 font-medium">Agotado</Badge>
              </div>
            )}
            {!isOutOfStock && product.currentStock <= 5 && (
              <div className="absolute bottom-1.5 right-1.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-300">
                  {product.currentStock}
                </Badge>
              </div>
            )}
          </div>

          {/* Product info — below image */}
          <div className="p-2 sm:p-2.5 space-y-0.5">
            <p className="text-xs sm:text-sm font-medium leading-snug line-clamp-2">
              {product.name}
            </p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(product.salePrice, currencyCode)}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Render: Service Card (Vertical Layout) ──────────
  const renderServiceCard = (service: Service) => {
    const cartItem = cart.find((item) => item.serviceId === service.id)
    const inCart = !!cartItem

    return (
      <Card
        key={service.id}
        className={`
          cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
          hover:shadow-md hover:border-primary/20 active:scale-[0.97]
          ${inCart ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-background shadow-violet-500/10 dark:shadow-violet-900/20' : ''}
        `}
        onClick={() => addServiceToCart(service)}
      >
        <CardContent className="p-0">
          {/* Image area — violet themed icon */}
          <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/40 dark:to-violet-950/20 flex items-center justify-center">
            <Star className="h-10 w-10 text-violet-300 dark:text-violet-700" />

            {/* Svc badge — top left */}
            <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
              Svc
            </Badge>

            {/* Cart quantity badge — top right */}
            {inCart && (
              <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-violet-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
                {cartItem!.quantity}
              </div>
            )}
          </div>

          {/* Service info — below icon */}
          <div className="p-2 sm:p-2.5 space-y-0.5">
            <p className="text-xs sm:text-sm font-medium leading-snug line-clamp-2">
              {service.name}
            </p>
            <p className="text-sm font-bold text-violet-600 dark:text-violet-400">
              {formatCurrency(service.price, currencyCode)}
              <span className="text-xs font-normal text-muted-foreground ml-0.5">/{service.unit}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Render: Product Grid (full width) ──────────────
  const renderProductGrid = () => (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {isLoadingProducts ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl">
              <Skeleton className="w-full aspect-[4/3] rounded-none" />
              <div className="p-2 sm:p-2.5 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-3.5 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : selectedCategory === 'servicios' ? (
        filteredServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <PackageSearch className="h-16 w-16 opacity-20 animate-[pulse_3s_ease-in-out_infinite]" />
            <p className="text-sm font-medium">
              {searchQuery ? 'No se encontraron servicios' : 'No hay servicios activos'}
            </p>
            <p className="text-xs opacity-60">Intenta con otra categoría o término de búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {filteredServices.map(renderServiceCard)}
          </div>
        )
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <PackageSearch className="h-16 w-16 opacity-20 animate-[pulse_3s_ease-in-out_infinite]" />
          <p className="text-sm font-medium">
            {searchQuery ? 'No se encontraron productos' : 'No hay productos activos'}
          </p>
          <p className="text-xs opacity-60">Intenta con otra categoría o término de búsqueda</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {filteredProducts.map(renderProductCard)}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3 h-full relative min-w-0 overflow-x-hidden">
      <KPIBar context="pos" />

      {/* ═══ HEADER: Barcode Input + Search + Category Tabs ═══════════ */}
      {/* Barcode scanner input + search row */}
      <div className="flex items-center gap-2">
        {/* Dedicated barcode input */}
        <div className="relative shrink-0 w-44 sm:w-52">
          <ScanBarcode
            className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-300 ${
              barcodeFlash === 'success'
                ? 'text-emerald-500'
                : barcodeFlash === 'error'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }`}
          />
          <Input
            ref={barcodeInputRef}
            data-barcode-input
            type="text"
            placeholder="Escanear código..."
            onKeyDown={handleBarcodeInputKeyDown}
            className={`pl-9 pr-2 h-11 text-sm bg-background/80 backdrop-blur-sm transition-all duration-300 ${
              barcodeFlash === 'success'
                ? 'ring-2 ring-emerald-500/50 border-emerald-500/50'
                : barcodeFlash === 'error'
                  ? 'ring-2 ring-red-500/50 border-red-500/50'
                  : 'focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50'
            }`}
          />
        </div>

        {/* Search bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar producto por nombre o SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 text-base bg-background/80 backdrop-blur-sm focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50 focus-visible:shadow-[0_0_20px_rgba(16,185,129,0.12)] transition-all duration-200"
          />
          {/* Barcode scanner active indicator */}
          {!anyDialogOpen && (
            <div
              className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 transition-all duration-300 ${
                barcodeFlash === 'success'
                  ? 'opacity-100'
                  : barcodeFlash === 'error'
                    ? 'opacity-100'
                    : 'opacity-50'
              }`}
            >
              <div
                className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                  barcodeFlash === 'success'
                    ? 'bg-emerald-500'
                    : barcodeFlash === 'error'
                      ? 'bg-red-500'
                      : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-[11px] text-muted-foreground hidden sm:inline whitespace-nowrap">
                Escáner activo
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Category tabs - wrap so all categories are visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className={`shrink-0 h-8 transition-all duration-200 ${selectedCategory === 'all' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 shadow-sm shadow-emerald-500/10' : 'hover:bg-muted/80'}`}
          onClick={() => setSelectedCategory('all')}
        >
          Todos
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant="outline"
            size="sm"
            className={`shrink-0 h-8 transition-all duration-200 ${selectedCategory === String(cat.id) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 shadow-sm shadow-emerald-500/10' : 'hover:bg-muted/80'}`}
            onClick={() => setSelectedCategory(String(cat.id))}
          >
            {cat.name}
          </Button>
        ))}
        {services.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className={`shrink-0 h-8 gap-1 transition-all duration-200 ${selectedCategory === 'servicios' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 shadow-sm shadow-emerald-500/10' : 'hover:bg-muted/80'}`}
            onClick={() => setSelectedCategory('servicios')}
          >
            <Star className="h-3.5 w-3.5" />
            Servicios
          </Button>
        )}
      </div>

      {/* ═══ PRODUCT GRID (Full Width) ═══════════════ */}
      {renderProductGrid()}

      {/* ═══ FLOATING CART FAB ═══════════════════════ */}
      {cartItemCount > 0 && (
        <button
          onClick={() => setCartSheetOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 h-14 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 hover:shadow-2xl hover:shadow-emerald-600/40 active:scale-95 text-white font-bold shadow-xl shadow-emerald-600/30 transition-all duration-200 lg:bottom-8 lg:right-8"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="text-sm">{cartItemCount}</span>
          <span className="text-sm">— {formatCurrency(total, currencyCode)}</span>
        </button>
      )}

      {/* ═══ LAST ORDER INFO (when no cart) ═══════════ */}
      {cartItemCount === 0 && lastOrderNumber && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <p className="text-sm text-center text-muted-foreground">
            Última venta: <span className="font-semibold">{lastOrderNumber}</span>
          </p>
          {lastOrderData && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1"
                onClick={() => {
                  const items: TicketItem[] = (lastOrderData.orderItems || []).map((item: OrderItemData) => ({
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
                    orderNumber: lastInvoiceData?.invoiceNumber || lastOrderData.orderNumber,
                    date: lastOrderData.createdAt,
                    customer: lastOrderData.customer?.name,
                    customerNit: lastInvoiceData?.customerNit,
                    items,
                    subtotal: lastOrderData.subtotal,
                    tipAmount: lastOrderData.tipAmount || 0,
                    total: lastOrderData.total,
                    taxAmount: lastOrderData.taxAmount || 0,
                    taxBreakdown: lastOrderData.taxBreakdown || undefined,
                    discountAmount: lastOrderData.discountAmount || 0,
                    paymentMethod: lastOrderData.paymentMethod,
                    currencyCode: currencyCode,
                    notes: lastOrderData.notes ?? undefined,
                    cufe: lastInvoiceData?.cufe,
                    qrCodeUrl: lastInvoiceData?.qrCode,
                    isElectronic: !!lastInvoiceData?.cufe,
                    isDocEquivalente: lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe,
                    resolutionNumber: store?.resolutionNumber || undefined,
                    resolutionStart: store?.resolutionStartNumber || undefined,
                    resolutionEnd: store?.resolutionEndNumber || undefined,
                  })
                }}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir</span>
                {lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/30">FE</Badge>}
                {lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">Doc.Equi</Badge>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => openReturnDialog(lastOrderData.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Devolver</span>
              </Button>
            </>
          )}
        </div>
      )}

      {/* ═══ RECENT SALES + RETURN FAB (when no cart) ═══ */}
      {cartItemCount === 0 && (
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => {
              setShowRecentSales(true)
              fetchRecentSales()
            }}
          >
            <Clock className="h-3.5 w-3.5" />
            Ventas recientes / Devoluciones
          </Button>
        </div>
      )}

      {/* ═══ CART SHEET ═══════════════════════════════ */}
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-600" />
              <SheetTitle>Ticket</SheetTitle>
              {cartItemCount > 0 && (
                <Badge variant="secondary">{cartItemCount}</Badge>
              )}
            </div>
            <SheetDescription>
              {cart.length === 0
                ? 'Haz clic en un producto para agregarlo'
                : `${cart.length} producto${cart.length > 1 ? 's' : ''} en el ticket`}
            </SheetDescription>
          </SheetHeader>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 px-4">
              <div className="relative">
                <ShoppingCart className="h-20 w-20 opacity-15" />
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center">
                  <Plus className="h-3.5 w-3.5 opacity-40" />
                </div>
              </div>
              <p className="text-sm font-medium">Ticket vacío</p>
              <p className="text-xs opacity-60">Selecciona productos para comenzar</p>
            </div>
          ) : (
            <>
              {/* Cart items - scrollable */}
              <div className="flex-1 overflow-y-auto px-4">
                <div className="flex flex-col">
                  {cart.map((item) => {
                    const itemId = item.isService ? item.serviceId! : item.productId!
                    return (
                      <div
                        key={cartItemKey(item)}
                        className="flex items-center gap-2 py-3 border-b border-border/40 last:border-b-0 hover:bg-muted/40 rounded-lg px-1.5 -mx-1.5 transition-colors duration-150"
                      >
                        {/* Item info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            {item.isService && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0 bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                                Svc
                              </Badge>
                            )}
                            {/* Per-item notes indicator */}
                            {item.notes && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                                    title={item.notes}
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3" align="start">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Nota del artículo</p>
                                  <Textarea
                                    value={item.notes}
                                    onChange={(e) => updateItemNotes(itemId, item.isService, e.target.value)}
                                    placeholder="Ej: sin hielo, extra limón..."
                                    className="min-h-[60px] resize-none text-sm"
                                    rows={2}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mt-1.5 h-7 px-2 text-xs text-destructive hover:text-destructive"
                                    onClick={() => updateItemNotes(itemId, item.isService, '')}
                                  >
                                    <X className="h-3 w-3 mr-1" />
                                    Quitar nota
                                  </Button>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.salePrice, currencyCode)} c/u
                          </p>
                          {item.notes && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">{item.notes}</p>
                          )}
                        </div>

                        {/* Per-item notes button (when no notes yet) */}
                        {!item.notes && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-600 shrink-0"
                                title="Agregar nota"
                                aria-label="Agregar nota"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Nota del artículo</p>
                              <Textarea
                                value={item.notes || ''}
                                onChange={(e) => updateItemNotes(itemId, item.isService, e.target.value)}
                                placeholder="Ej: sin hielo, extra limón..."
                                className="min-h-[60px] resize-none text-sm"
                                rows={2}
                                autoFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}

                        {/* Quantity controls */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 active:scale-90 transition-all duration-150 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-800 hover:shadow-sm hover:shadow-emerald-500/10"
                            onClick={() => updateQuantity(itemId, -1, item.isService)}
                            disabled={item.quantity <= 1}
                            aria-label="Reducir cantidad"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-bold tabular-nums text-foreground bg-muted/60 rounded-md py-1">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 active:scale-90 transition-all duration-150 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-800 hover:shadow-sm hover:shadow-emerald-500/10"
                            onClick={() => updateQuantity(itemId, 1, item.isService)}
                            disabled={!item.isService && item.quantity >= item.maxStock}
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Line total */}
                        <p className="text-sm font-bold tabular-nums min-w-[80px] text-right shrink-0 text-foreground">
                          {formatCurrency(item.salePrice * item.quantity, currencyCode)}
                        </p>

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 active:scale-90 transition-all duration-150 hover:shadow-sm"
                          onClick={() => removeFromCart(itemId, item.isService)}
                          title="Eliminar producto"
                          aria-label="Eliminar producto del carrito"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bottom section: summary + options + charge */}
              <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
                <div className="px-4 py-4 space-y-3.5 max-h-[60vh] overflow-y-auto">
                  {/* Summary */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">
                        {formatCurrency(subtotal, currencyCode)}
                      </span>
                    </div>

                    {/* Tax breakdown */}
                    {taxEstimate.breakdown.length > 0 && (
                      <div className="space-y-1 pl-2 border-l-2 border-muted">
                        {taxEstimate.breakdown.map((tax) => (
                          <div key={tax.code} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Percent className="h-3 w-3" />
                              {tax.name} ({tax.rate}%)
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {formatCurrency(tax.amount, currencyCode)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Discount section */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => {
                          setShowDiscountInput(!showDiscountInput)
                          if (showDiscountInput) {
                            // Reset discount when collapsing
                            setDiscountType('NONE')
                            setDiscountValue(0)
                            setDiscountReason('')
                          }
                        }}
                      >
                        <Tag className="h-3.5 w-3.5" />
                        <span>Descuento</span>
                        {discountAmount > 0 && (
                          <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">
                            -{formatCurrency(discountAmount, currencyCode)}
                          </span>
                        )}
                        {!showDiscountInput && discountAmount === 0 && (
                          <span className="ml-auto text-xs opacity-60">agregar</span>
                        )}
                      </button>
                      {showDiscountInput && (
                        <div className="space-y-2 pl-0.5">
                          {/* Discount type selector */}
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={discountType}
                              onValueChange={(v) => {
                                setDiscountType(v as DiscountType)
                                if (v === 'NONE') {
                                  setDiscountValue(0)
                                  setDiscountReason('')
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NONE">Sin descuento</SelectItem>
                                <SelectItem value="PERCENTAGE">
                                  <span className="flex items-center gap-1">
                                    <Percent className="h-3 w-3" />
                                    Porcentaje %
                                  </span>
                                </SelectItem>
                                <SelectItem value="FIXED">
                                  <span className="flex items-center gap-1">
                                    <Tag className="h-3 w-3" />
                                    Valor fijo $
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Discount value input */}
                          {discountType !== 'NONE' && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground shrink-0">
                                {discountType === 'PERCENTAGE' ? '%' : '$'}
                              </span>
                              <Input
                                type="number"
                                min="0"
                                max={discountType === 'PERCENTAGE' ? 100 : subtotal}
                                value={discountValue || ''}
                                onChange={(e) => {
                                  const val = Math.max(0, parseFloat(e.target.value) || 0)
                                  if (discountType === 'PERCENTAGE') {
                                    setDiscountValue(Math.min(val, 100))
                                  } else {
                                    setDiscountValue(val)
                                  }
                                }}
                                placeholder={discountType === 'PERCENTAGE' ? '0' : '0'}
                                className="h-8 text-sm tabular-nums w-28"
                              />
                              {discountType === 'PERCENTAGE' && (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                    onClick={() => setDiscountValue(10)}
                                  >
                                    10%
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                    onClick={() => setDiscountValue(15)}
                                  >
                                    15%
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                    onClick={() => setDiscountValue(20)}
                                  >
                                    20%
                                  </Button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Discount reason input */}
                          {discountType !== 'NONE' && (
                            <Input
                              type="text"
                              value={discountReason}
                              onChange={(e) => setDiscountReason(e.target.value)}
                              placeholder="Razón (opcional): Cliente frecuente, Promoción..."
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-amber-600 dark:text-amber-400">Descuento</span>
                        <span className="tabular-nums text-amber-600 dark:text-amber-400">
                          -{formatCurrency(discountAmount, currencyCode)}
                        </span>
                      </div>
                    )}

                    {/* Tip section */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => setShowTipInput(!showTipInput)}
                      >
                        <Heart className="h-3.5 w-3.5" />
                        <span>Propina</span>
                        {tipAmount > 0 && (
                          <span className="ml-auto font-medium text-pink-600 dark:text-pink-400">
                            +{formatCurrency(tipAmount, currencyCode)}
                          </span>
                        )}
                        {!showTipInput && tipAmount === 0 && (
                          <span className="ml-auto text-xs opacity-60">agregar</span>
                        )}
                      </button>
                      {showTipInput && paymentMethod !== 'FIADO' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground shrink-0">$</span>
                          <Input
                            type="number"
                            min="0"
                            value={tipAmount || ''}
                            onChange={(e) => setTipAmount(Math.max(0, parseInt(e.target.value) || 0))}
                            placeholder="0"
                            className="h-8 text-sm tabular-nums w-24"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30"
                            onClick={() => setTipAmount(Math.round(subtotal * 0.1))}
                          >
                            10%
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30"
                            onClick={() => setTipAmount(Math.round(subtotal * 0.15))}
                          >
                            15%
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30"
                            onClick={() => setTipAmount(0)}
                          >
                            Quitar
                          </Button>
                        </div>
                      )}
                      {showTipInput && paymentMethod === 'FIADO' && (
                        <p className="text-xs text-muted-foreground italic">No aplica para ventas fiadas</p>
                      )}
                    </div>

                    {tipAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-pink-600 dark:text-pink-400">Propina</span>
                        <span className="tabular-nums text-pink-600 dark:text-pink-400">
                          {formatCurrency(tipAmount, currencyCode)}
                        </span>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center justify-between rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 px-3 py-2 -mx-1">
                      <span className="text-lg font-bold tracking-tight">Total</span>
                      <span className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 tracking-tight">
                        {formatCurrency(total, currencyCode)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  {/* Customer selection */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium">Cliente (opcional)</Label>
                    <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sin cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">Sin cliente</span>
                        </SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                            {c.phone ? ` — ${c.phone}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Caja selector */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      Caja
                      {openCashRegisters.length === 0 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    {openCashRegisters.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        No hay cajas abiertas. Abre una en Contabilidad → Caja.
                      </div>
                    ) : (
                      <Select value={selectedCashRegisterId} onValueChange={setSelectedCashRegisterId}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            <span className="text-muted-foreground">Automática</span>
                          </SelectItem>
                          {openCashRegisters.map((cr) => (
                            <SelectItem key={cr.id} value={String(cr.id)}>
                              Caja #{cr.id} — {cr.user.fullName || 'Usuario'} (${cr.openingBalance.toLocaleString()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Payment method */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground font-medium">Método de pago</Label>
                    <RadioGroup
                      value={paymentMethod}
                      onValueChange={(v) => {
                        setPaymentMethod(v as PaymentMethod)
                        if (!['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(v)) setTransferRef('')
                      }}
                      className="grid grid-cols-3 gap-1.5"
                    >
                      {PAYMENT_METHODS.map((pm) => {
                        const isFiado = pm.value === 'FIADO'
                        const fiadoDisabled = isFiado && selectedCustomer === 'none'
                        const disabled = fiadoDisabled
                        return (
                          <Label
                            key={pm.value}
                            htmlFor={`payment-${pm.value}`}
                            className={`
                              flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors text-xs justify-center text-center
                              ${disabled ? 'opacity-40 cursor-not-allowed border-dashed' :
                                paymentMethod === pm.value
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-600'
                                  : 'border-border hover:bg-muted'
                              }
                            `}
                          >
                            <RadioGroupItem value={pm.value} id={`payment-${pm.value}`} className="sr-only" disabled={disabled} />
                            <span className="shrink-0">{pm.icon}</span>
                            <span className="font-medium truncate">{pm.label}</span>
                          </Label>
                        )
                      })}
                    </RadioGroup>
                    {paymentMethod === 'FIADO' && selectedCustomer === 'none' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Selecciona un cliente para habilitar el fiado
                      </p>
                    )}
                  </div>

                  {/* Transfer reference number */}
                  {['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
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

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-xs text-muted-foreground font-medium">Notas</Label>
                    </div>
                    <Textarea
                      placeholder="Notas de la orden (opcional)..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[60px] resize-none text-sm"
                      rows={2}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30"
                      disabled={cart.length === 0 || isSubmitting || openCashRegisters.length === 0}
                      onClick={() => setShowChargeDialog(true)}
                    >
                      <CreditCard className="h-5 w-5 mr-2" />
                      Cobrar {formatCurrency(total, currencyCode)}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-all duration-150"
                      onClick={clearCart}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Vaciar ticket
                    </Button>
                  </div>

                  {/* Last order actions */}
                  {lastOrderNumber && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <p className="text-xs text-center text-muted-foreground">
                        Última: <span className="font-semibold">{lastOrderNumber}</span>
                      </p>
                      {lastOrderData && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:text-primary"
                            onClick={() => {
                              const items: TicketItem[] = (lastOrderData.orderItems || []).map((item: OrderItemData) => ({
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
                                orderNumber: lastInvoiceData?.invoiceNumber || lastOrderData.orderNumber,
                                date: lastOrderData.createdAt,
                                customer: lastOrderData.customer?.name,
                                customerNit: lastInvoiceData?.customerNit,
                                items,
                                subtotal: lastOrderData.subtotal,
                                tipAmount: lastOrderData.tipAmount || 0,
                                total: lastOrderData.total,
                                taxAmount: lastOrderData.taxAmount || 0,
                                taxBreakdown: lastOrderData.taxBreakdown || undefined,
                                discountAmount: lastOrderData.discountAmount || 0,
                                paymentMethod: lastOrderData.paymentMethod,
                                currencyCode: currencyCode,
                                notes: lastOrderData.notes ?? undefined,
                                cufe: lastInvoiceData?.cufe,
                                qrCodeUrl: lastInvoiceData?.qrCode,
                                isElectronic: !!lastInvoiceData?.cufe,
                                isDocEquivalente: lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe,
                                resolutionNumber: store?.resolutionNumber || undefined,
                                resolutionStart: store?.resolutionStartNumber || undefined,
                                resolutionEnd: store?.resolutionEndNumber || undefined,
                              })
                            }}
                          >
                            <Printer className="h-3.5 w-3.5 mr-1" />
                            Imprimir
                            {lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/30 ml-1">FE</Badge>}
                            {lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300 ml-1">Doc.Equi</Badge>}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => openReturnDialog(lastOrderData.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Devolver
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ═══ CHARGE CONFIRMATION DIALOG ═══════════════ */}
      <Dialog open={showChargeDialog} onOpenChange={(open) => {
        if (!open && !isSubmitting) setShowChargeDialog(false)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar venta</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>¿Estás seguro de que deseas registrar esta venta?</p>

                {/* ── Invoice Mode Selector (only when e-invoicing is enabled) ── */}
                {hasStoreNit && (
                  <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Tipo de Comprobante
                    </Label>
                    <div className={`grid gap-2 ${isEInvEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button
                        type="button"
                        onClick={() => setPosInvoiceMode('TIRILLA')}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                          posInvoiceMode === 'TIRILLA'
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
                        onClick={() => setPosInvoiceMode('DOC_EQUIPOS')}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                          posInvoiceMode === 'DOC_EQUIPOS'
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
                        onClick={() => setPosInvoiceMode('ELECTRONICA')}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                          posInvoiceMode === 'ELECTRONICA'
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
                    {posInvoiceMode === 'ELECTRONICA' && (
                      <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                        <QrCode className="h-3 w-3" />
                        Se generará automáticamente con CUFE y QR DIAN
                      </div>
                    )}
                    {posInvoiceMode === 'DOC_EQUIPOS' && store?.resolutionNumber && (
                      <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                        <Hash className="h-3 w-3" />
                        Resolución: {store.resolutionNumber} — Prefijo: {store.invoicePrefix || 'POS'}
                      </div>
                    )}
                    {/* ── Buyer info fields (Art. 11 DIAN: only name, NIT, email) ── */}
                    {posInvoiceMode === 'ELECTRONICA' && (
                      <div className="space-y-2 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                            <NITInput
                              value={invoiceCustomerNit}
                              onChange={setInvoiceCustomerNit}
                              placeholder={selectedCustomer !== 'none'
                                ? customers.find(c => String(c.id) === selectedCustomer)?.nit || DIAN_CONSUMIDOR_FINAL_NIT
                                : DIAN_CONSUMIDOR_FINAL_NIT}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Nombre / Razón social</Label>
                            <Input
                              placeholder={selectedCustomer !== 'none'
                                ? customers.find(c => String(c.id) === selectedCustomer)?.name || 'Consumidor Final'
                                : 'Consumidor Final'}
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
                            placeholder={selectedCustomer !== 'none'
                              ? customers.find(c => String(c.id) === selectedCustomer)?.phone || ''
                              : ''}
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

                <div className="bg-muted rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Artículos</span>
                    <span className="font-medium">{cartItemCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Método de pago</span>
                    <span className="font-medium">
                      {PAYMENT_METHODS.find((pm) => pm.value === paymentMethod)?.label}
                    </span>
                  </div>
                  {selectedCustomer !== 'none' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cliente</span>
                      <span className="font-medium">
                        {customers.find((c) => String(c.id) === selectedCustomer)?.name}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-semibold">Subtotal</span>
                    <span className="font-medium">
                      {formatCurrency(subtotal, currencyCode)}
                    </span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600 dark:text-amber-400">
                        Descuento
                        {discountType === 'PERCENTAGE' && ` (${discountValue}%)`}
                        {discountReason && ` — ${discountReason}`}
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        -{formatCurrency(discountAmount, currencyCode)}
                      </span>
                    </div>
                  )}
                  {/* IVA Breakdown */}
                  {taxEstimate.breakdown.length > 0 && (
                    <div className="space-y-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
                      <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <Percent className="h-3.5 w-3.5" />
                          IVA Incluido
                        </span>
                        <span>{formatCurrency(taxEstimate.totalTax, currencyCode)}</span>
                      </div>
                      {taxEstimate.breakdown.map((tax) => (
                        <div key={tax.code} className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                          <span>{tax.name} ({tax.rate}%) — Base: {formatCurrency(tax.base, currencyCode)}</span>
                          <span>{formatCurrency(tax.amount, currencyCode)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tipAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-pink-600 dark:text-pink-400">Propina</span>
                      <span className="font-medium text-pink-600 dark:text-pink-400">
                        {formatCurrency(tipAmount, currencyCode)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-bold text-lg">Total</span>
                    <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(total, currencyCode)}
                    </span>
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChargeDialog(false)} disabled={isSubmitting || creatingInvoice} className="active:scale-[0.98] transition-all duration-150">Cancelar</Button>
            <Button
              onClick={handleSubmitOrder}
              disabled={isSubmitting || creatingInvoice}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-600/20"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Procesando...' : posInvoiceMode === 'ELECTRONICA' && isEInvEnabled ? 'Confirmar + Factura Electrónica' : posInvoiceMode === 'DOC_EQUIPOS' ? 'Confirmar + Doc. Equivalente' : 'Confirmar Venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ RETURN DIALOG (PARTIAL SELECTION) ════════════ */}
      <Dialog open={showReturnDialog} onOpenChange={(open) => { if (!open) { setShowReturnDialog(false); setReturnOrderDetail(null); setReturnItems(new Map()) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Devolver Venta {returnOrderDetail?.orderNumber || ''}
            </DialogTitle>
            <DialogDescription>
              Selecciona los productos y cantidades que deseas devolver al inventario.
            </DialogDescription>
          </DialogHeader>

          {loadingReturnDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : returnOrderDetail ? (
            <div className="space-y-4">
              {/* Items list */}
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {returnOrderDetail.orderItems?.filter((i) => i.productId && i.quantity > (i.returnedQuantity || 0)).length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay productos devolvibles en esta venta.
                  </div>
                ) : (
                  returnOrderDetail.orderItems?.map((item) => {
                    if (!item.productId) return null
                    const available = item.quantity - (item.returnedQuantity || 0)
                    if (available <= 0) return null
                    const isSelected = returnItems.has(item.id)
                    const returnQty = returnItems.get(item.id) || 0

                    return (
                      <div key={item.id} className={`flex items-center gap-3 p-3 ${isSelected ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReturnItem(item.id, available)}
                          className="h-4 w-4 rounded border-gray-300 text-destructive focus:ring-destructive"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            Vendido: {item.quantity}{item.returnedQuantity > 0 ? ` · Devuelto: ${item.returnedQuantity}` : ''} · Disponible: {available}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setReturnItemQty(item.id, returnQty - 1, available)}
                              disabled={returnQty <= 1}
                              className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50"
                            >
                              −
                            </button>
                            <Input
                              type="number"
                              min={1}
                              max={available}
                              value={returnQty}
                              onChange={(e) => setReturnItemQty(item.id, Number(e.target.value) || 1, available)}
                              className="h-7 w-14 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => setReturnItemQty(item.id, returnQty + 1, available)}
                              disabled={returnQty >= available}
                              className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Services note */}
              {returnOrderDetail.orderItems?.some((i) => !i.productId) && (
                <p className="text-xs text-muted-foreground italic">
                  Los servicios no se pueden devolver al inventario.
                </p>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="pos-return-reason" className="text-xs font-medium">Motivo de la devolución (opcional)</Label>
                <Textarea
                  id="pos-return-reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Ej: Error en el pedido, producto defectuoso..."
                  rows={2}
                  className="text-xs min-h-[60px]"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowReturnDialog(false); setReturnOrderDetail(null); setReturnItems(new Map()) }}
                  disabled={returning}
                  className="active:scale-[0.98] transition-all duration-150"
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReturnOrder}
                  disabled={returning || returnItems.size === 0}
                  className="active:scale-[0.98] transition-all duration-150"
                >
                  {returning ? 'Procesando...' : `Devolver ${returnItems.size > 0 ? `(${returnItems.size} producto${returnItems.size > 1 ? 's' : ''})` : ''}`}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ═══ RECENT SALES DIALOG ════════════════════════ */}
      <Dialog open={showRecentSales} onOpenChange={setShowRecentSales}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Ventas Recientes del Día
            </DialogTitle>
            <DialogDescription>
              Busca y devuelve ventas realizadas hoy desde el Punto de Venta
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número de orden, cliente o producto..."
              className="pl-9 bg-background/80 backdrop-blur-sm focus-visible:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all duration-200"
              value={recentSalesSearch}
              onChange={(e) => setRecentSalesSearch(e.target.value)}
            />
          </div>

          {loadingRecentSales ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="mb-3 h-14 w-14 text-muted-foreground/25 animate-[pulse_3s_ease-in-out_infinite]" />
              <p className="text-muted-foreground font-medium text-sm">
                No hay ventas completadas hoy
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Las ventas del día aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {recentOrders
                .filter((order) => {
                  if (!recentSalesSearch.trim()) return true
                  const q = recentSalesSearch.toLowerCase().trim()
                  return (
                    order.orderNumber.toLowerCase().includes(q) ||
                    (order.customerName || '').toLowerCase().includes(q) ||
                    order.orderItems.some((item) =>
                      item.productName.toLowerCase().includes(q)
                    )
                  )
                })
                .map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {order.orderNumber}
                        </span>
                        {order.customerName && (
                          <span className="text-xs text-muted-foreground truncate">
                            — {order.customerName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(order.createdAt), 'HH:mm', { locale: es })}
                        {' · '}
                        {order.orderItems.length} producto{order.orderItems.length !== 1 ? 's' : ''}
                        {order.orderItems.length <= 3
                          ? ` (${order.orderItems.map((i) => i.productName).join(', ')})`
                          : ` (${order.orderItems.slice(0, 3).map((i) => i.productName).join(', ')}...)`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">
                        {formatCurrency(order.total, currencyCode)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs shrink-0 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => openReturnDialog(order.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
