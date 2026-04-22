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
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { playError } from '@/lib/pos-sounds'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import type { PaymentMethod, InvoiceMode, OrderItemData } from '@/types'
import type { Product } from '@/hooks/pos/use-pos-data'
import type { DiscountType } from '@/hooks/pos/use-pos-cart'
import { usePosData } from '@/hooks/pos/use-pos-data'
import { usePosCart } from '@/hooks/pos/use-pos-cart'
import { POSReturnDialog, type POSReturnDialogRef } from '@/components/pos/pos-return-dialog'
import { POSRecentSales } from '@/components/pos/pos-recent-sales'

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

  // ─── Data hook ──────────────────────────────────────
  const {
    products,
    services,
    categories,
    customers,
    openCashRegisters,
    selectedCashRegisterId,
    setSelectedCashRegisterId,
    isLoadingProducts,
    fetchOpenCashRegisters,
    fetchRecentSales,
    recentOrders,
    loadingRecentSales,
    recentSalesSearch,
    setRecentSalesSearch,
  } = usePosData({ storeId })

  // ─── Cart hook ──────────────────────────────────────
  const cart = usePosCart({
    openCashRegisters,
    selectedCashRegisterId,
    customers,
    fetchOpenCashRegisters,
  })

  // ─── UI states ───────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // ─── Recent sales dialog state ──────────────────────
  const [showRecentSales, setShowRecentSales] = useState(false)

  // ─── Return dialog ref ──────────────────────────────
  const returnDialogRef = useRef<POSReturnDialogRef>(null)

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
        cart.addToCart(product)
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
    [cart, products]
  )

  // ─── Barcode scanner hook ──────────────────────────
  // Enabled only when no dialog is open
  const anyDialogOpen = cart.showChargeDialog || showRecentSales
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

  // ─── Return success handler ────────────────────────
  const handleReturnSuccess = useCallback((returnedOrderId: number) => {
    // Clear last order if it was the returned one
    if (cart.lastOrderData?.id === returnedOrderId) {
      cart.clearLastOrder()
    }
    // Refresh recent sales if open
    if (showRecentSales) fetchRecentSales()
  }, [cart, showRecentSales, fetchRecentSales])

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

  // ─── Cart item key helper ──────────────────────────
  const cartItemKey = (item: { isService: boolean; serviceId: number | null; productId: number | null }) =>
    item.isService ? `svc-${item.serviceId}` : `prd-${item.productId}`

  // ─── Print last order ticket ──────────────────────
  const printLastOrderTicket = useCallback(() => {
    if (!cart.lastOrderData) return
    const items: TicketItem[] = (cart.lastOrderData.orderItems || []).map((item: OrderItemData) => ({
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
      orderNumber: cart.lastInvoiceData?.invoiceNumber || cart.lastOrderData.orderNumber,
      date: cart.lastOrderData.createdAt,
      customer: cart.lastOrderData.customer?.name,
      customerNit: cart.lastInvoiceData?.customerNit,
      items,
      subtotal: cart.lastOrderData.subtotal,
      tipAmount: cart.lastOrderData.tipAmount || 0,
      total: cart.lastOrderData.total,
      taxAmount: cart.lastOrderData.taxAmount || 0,
      taxBreakdown: cart.lastOrderData.taxBreakdown || undefined,
      discountAmount: cart.lastOrderData.discountAmount || 0,
      paymentMethod: cart.lastOrderData.paymentMethod,
      currencyCode: currencyCode,
      notes: cart.lastOrderData.notes ?? undefined,
      cufe: cart.lastInvoiceData?.cufe,
      qrCodeUrl: cart.lastInvoiceData?.qrCode,
      isElectronic: !!cart.lastInvoiceData?.cufe,
      isDocEquivalente: cart.lastDocType === 'DOC_EQUIPOS' && !cart.lastInvoiceData?.cufe,
      resolutionNumber: store?.resolutionNumber || undefined,
      resolutionStart: store?.resolutionStartNumber || undefined,
      resolutionEnd: store?.resolutionEndNumber || undefined,
    })
  }, [cart.lastOrderData, cart.lastInvoiceData, cart.lastDocType, store, currencyCode])

  // ─── Render: Product Card (Vertical Layout) ──────────
  const renderProductCard = (product: Product) => {
    const isOutOfStock = product.currentStock <= 0
    const cartItem = cart.cart.find((item) => item.productId === product.id)
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
        onClick={() => !isOutOfStock && cart.addToCart(product)}
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
  const renderServiceCard = (service: { id: number; name: string; price: number; unit: string }) => {
    const cartItem = cart.cart.find((item) => item.serviceId === service.id)
    const inCart = !!cartItem

    return (
      <Card
        key={service.id}
        className={`
          cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
          hover:shadow-md hover:border-primary/20 active:scale-[0.97]
          ${inCart ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-background shadow-violet-500/10 dark:shadow-violet-900/20' : ''}
        `}
        onClick={() => cart.addServiceToCart(service as any)}
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
      {cart.cartItemCount > 0 && (
        <button
          onClick={() => cart.setCartSheetOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 h-14 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 hover:shadow-2xl hover:shadow-emerald-600/40 active:scale-95 text-white font-bold shadow-xl shadow-emerald-600/30 transition-all duration-200 lg:bottom-8 lg:right-8"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="text-sm">{cart.cartItemCount}</span>
          <span className="text-sm">— {formatCurrency(cart.total, currencyCode)}</span>
        </button>
      )}

      {/* ═══ LAST ORDER INFO (when no cart) ═══════════ */}
      {cart.cartItemCount === 0 && cart.lastOrderNumber && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <p className="text-sm text-center text-muted-foreground">
            Última venta: <span className="font-semibold">{cart.lastOrderNumber}</span>
          </p>
          {cart.lastOrderData && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1"
                onClick={printLastOrderTicket}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir</span>
                {cart.lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/30">FE</Badge>}
                {cart.lastDocType === 'DOC_EQUIPOS' && !cart.lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">Doc.Equi</Badge>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => returnDialogRef.current?.openReturnDialog(cart.lastOrderData!.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Devolver</span>
              </Button>
            </>
          )}
        </div>
      )}

      {/* ═══ RECENT SALES + RETURN FAB (when no cart) ═══ */}
      {cart.cartItemCount === 0 && (
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
      <Sheet open={cart.cartSheetOpen} onOpenChange={cart.setCartSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-600" />
              <SheetTitle>Ticket</SheetTitle>
              {cart.cartItemCount > 0 && (
                <Badge variant="secondary">{cart.cartItemCount}</Badge>
              )}
            </div>
            <SheetDescription>
              {cart.cart.length === 0
                ? 'Haz clic en un producto para agregarlo'
                : `${cart.cart.length} producto${cart.cart.length > 1 ? 's' : ''} en el ticket`}
            </SheetDescription>
          </SheetHeader>

          {cart.cart.length === 0 ? (
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
                  {cart.cart.map((item) => {
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
                                    onChange={(e) => cart.updateItemNotes(itemId, item.isService, e.target.value)}
                                    placeholder="Ej: sin hielo, extra limón..."
                                    className="min-h-[60px] resize-none text-sm"
                                    rows={2}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mt-1.5 h-7 px-2 text-xs text-destructive hover:text-destructive"
                                    onClick={() => cart.updateItemNotes(itemId, item.isService, '')}
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
                                onChange={(e) => cart.updateItemNotes(itemId, item.isService, e.target.value)}
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
                            onClick={() => cart.updateQuantity(itemId, -1, item.isService)}
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
                            onClick={() => cart.updateQuantity(itemId, 1, item.isService)}
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
                          onClick={() => cart.removeFromCart(itemId, item.isService)}
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
                        {formatCurrency(cart.subtotal, currencyCode)}
                      </span>
                    </div>

                    {/* Tax breakdown */}
                    {cart.taxEstimate.breakdown.length > 0 && (
                      <div className="space-y-1 pl-2 border-l-2 border-muted">
                        {cart.taxEstimate.breakdown.map((tax) => (
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
                          cart.setShowDiscountInput(!cart.showDiscountInput)
                          if (cart.showDiscountInput) {
                            // Reset discount when collapsing
                            cart.setDiscountType('NONE')
                            cart.setDiscountValue(0)
                            cart.setDiscountReason('')
                          }
                        }}
                      >
                        <Tag className="h-3.5 w-3.5" />
                        <span>Descuento</span>
                        {cart.discountAmount > 0 && (
                          <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">
                            -{formatCurrency(cart.discountAmount, currencyCode)}
                          </span>
                        )}
                        {!cart.showDiscountInput && cart.discountAmount === 0 && (
                          <span className="ml-auto text-xs opacity-60">agregar</span>
                        )}
                      </button>
                      {cart.showDiscountInput && (
                        <div className="space-y-2 pl-0.5">
                          {/* Discount type selector */}
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={cart.discountType}
                              onValueChange={(v) => {
                                cart.setDiscountType(v as DiscountType)
                                if (v === 'NONE') {
                                  cart.setDiscountValue(0)
                                  cart.setDiscountReason('')
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
                          {cart.discountType !== 'NONE' && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground shrink-0">
                                {cart.discountType === 'PERCENTAGE' ? '%' : '$'}
                              </span>
                              <Input
                                type="number"
                                min="0"
                                max={cart.discountType === 'PERCENTAGE' ? 100 : cart.subtotal}
                                value={cart.discountValue || ''}
                                onChange={(e) => {
                                  const val = Math.max(0, parseFloat(e.target.value) || 0)
                                  if (cart.discountType === 'PERCENTAGE') {
                                    cart.setDiscountValue(Math.min(val, 100))
                                  } else {
                                    cart.setDiscountValue(val)
                                  }
                                }}
                                placeholder={cart.discountType === 'PERCENTAGE' ? '0' : '0'}
                                className="h-8 text-sm tabular-nums w-28"
                              />
                              {cart.discountType === 'PERCENTAGE' && (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                    onClick={() => cart.setDiscountValue(10)}
                                  >
                                    10%
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                    onClick={() => cart.setDiscountValue(15)}
                                  >
                                    15%
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                    onClick={() => cart.setDiscountValue(20)}
                                  >
                                    20%
                                  </Button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Discount reason input */}
                          {cart.discountType !== 'NONE' && (
                            <Input
                              type="text"
                              value={cart.discountReason}
                              onChange={(e) => cart.setDiscountReason(e.target.value)}
                              placeholder="Razón (opcional): Cliente frecuente, Promoción..."
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {cart.discountAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-amber-600 dark:text-amber-400">Descuento</span>
                        <span className="tabular-nums text-amber-600 dark:text-amber-400">
                          -{formatCurrency(cart.discountAmount, currencyCode)}
                        </span>
                      </div>
                    )}

                    {/* Tip section */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => cart.setShowTipInput(!cart.showTipInput)}
                      >
                        <Heart className="h-3.5 w-3.5" />
                        <span>Propina</span>
                        {cart.tipAmount > 0 && (
                          <span className="ml-auto font-medium text-pink-600 dark:text-pink-400">
                            +{formatCurrency(cart.tipAmount, currencyCode)}
                          </span>
                        )}
                        {!cart.showTipInput && cart.tipAmount === 0 && (
                          <span className="ml-auto text-xs opacity-60">agregar</span>
                        )}
                      </button>
                      {cart.showTipInput && cart.paymentMethod !== 'FIADO' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground shrink-0">$</span>
                          <Input
                            type="number"
                            min="0"
                            value={cart.tipAmount || ''}
                            onChange={(e) => cart.setTipAmount(Math.max(0, parseInt(e.target.value) || 0))}
                            placeholder="0"
                            className="h-8 text-sm tabular-nums w-24"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30"
                            onClick={() => cart.setTipAmount(Math.round(cart.subtotal * 0.1))}
                          >
                            10%
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30"
                            onClick={() => cart.setTipAmount(Math.round(cart.subtotal * 0.15))}
                          >
                            15%
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30"
                            onClick={() => cart.setTipAmount(0)}
                          >
                            Quitar
                          </Button>
                        </div>
                      )}
                      {cart.showTipInput && cart.paymentMethod === 'FIADO' && (
                        <p className="text-xs text-muted-foreground italic">No aplica para ventas fiadas</p>
                      )}
                    </div>

                    {cart.tipAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-pink-600 dark:text-pink-400">Propina</span>
                        <span className="tabular-nums text-pink-600 dark:text-pink-400">
                          {formatCurrency(cart.tipAmount, currencyCode)}
                        </span>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center justify-between rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 px-3 py-2 -mx-1">
                      <span className="text-lg font-bold tracking-tight">Total</span>
                      <span className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 tracking-tight">
                        {formatCurrency(cart.total, currencyCode)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  {/* Customer selection */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium">Cliente (opcional)</Label>
                    <Select value={cart.selectedCustomer} onValueChange={cart.setSelectedCustomer}>
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
                      value={cart.paymentMethod}
                      onValueChange={(v) => {
                        cart.setPaymentMethod(v as PaymentMethod)
                        if (!['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(v)) cart.setTransferRef('')
                      }}
                      className="grid grid-cols-3 gap-1.5"
                    >
                      {PAYMENT_METHODS.map((pm) => {
                        const isFiado = pm.value === 'FIADO'
                        const fiadoDisabled = isFiado && cart.selectedCustomer === 'none'
                        const disabled = fiadoDisabled
                        return (
                          <Label
                            key={pm.value}
                            htmlFor={`payment-${pm.value}`}
                            className={`
                              flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors text-xs justify-center text-center
                              ${disabled ? 'opacity-40 cursor-not-allowed border-dashed' :
                                cart.paymentMethod === pm.value
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
                    {cart.paymentMethod === 'FIADO' && cart.selectedCustomer === 'none' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Selecciona un cliente para habilitar el fiado
                      </p>
                    )}
                  </div>

                  {/* Transfer reference number */}
                  {['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(cart.paymentMethod) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Número de {cart.paymentMethod === 'TRANSFER' ? 'transferencia' : cart.paymentMethod}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={cart.transferRef}
                        onChange={(e) => cart.setTransferRef(e.target.value)}
                        placeholder={cart.paymentMethod === 'TRANSFER' ? 'Ej: 000123456789' : 'Ej: 3111234567'}
                        className="text-sm tabular-nums"
                      />
                      <p className="text-xs text-muted-foreground">
                        {cart.paymentMethod === 'TRANSFER'
                          ? 'Número de referencia de la transferencia bancaria'
                          : cart.paymentMethod === 'NEQUI'
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
                      value={cart.notes}
                      onChange={(e) => cart.setNotes(e.target.value)}
                      className="min-h-[60px] resize-none text-sm"
                      rows={2}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30"
                      disabled={cart.cart.length === 0 || cart.isSubmitting || openCashRegisters.length === 0}
                      onClick={() => cart.setShowChargeDialog(true)}
                    >
                      <CreditCard className="h-5 w-5 mr-2" />
                      Cobrar {formatCurrency(cart.total, currencyCode)}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-all duration-150"
                      onClick={cart.clearCart}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Vaciar ticket
                    </Button>
                  </div>

                  {/* Last order actions */}
                  {cart.lastOrderNumber && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <p className="text-xs text-center text-muted-foreground">
                        Última: <span className="font-semibold">{cart.lastOrderNumber}</span>
                      </p>
                      {cart.lastOrderData && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:text-primary"
                            onClick={printLastOrderTicket}
                          >
                            <Printer className="h-3.5 w-3.5 mr-1" />
                            Imprimir
                            {cart.lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/30 ml-1">FE</Badge>}
                            {cart.lastDocType === 'DOC_EQUIPOS' && !cart.lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300 ml-1">Doc.Equi</Badge>}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => returnDialogRef.current?.openReturnDialog(cart.lastOrderData!.id)}
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
      <Dialog open={cart.showChargeDialog} onOpenChange={(open) => {
        if (!open && !cart.isSubmitting) cart.setShowChargeDialog(false)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar venta</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>¿Estás seguro de que deseas registrar esta venta?</p>

                {/* ── Invoice Mode Selector (only when e-invoicing is enabled) ── */}
                {cart.hasStoreNit && (
                  <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Tipo de Comprobante
                    </Label>
                    <div className={`grid gap-2 ${cart.isEInvEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button
                        type="button"
                        onClick={() => cart.setPosInvoiceMode('TIRILLA')}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                          cart.posInvoiceMode === 'TIRILLA'
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
                        onClick={() => cart.setPosInvoiceMode('DOC_EQUIPOS')}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                          cart.posInvoiceMode === 'DOC_EQUIPOS'
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                            : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <MonitorSmartphone className="h-5 w-5" />
                        <span className="text-xs font-semibold">Doc. Equivalente</span>
                        <span className="text-[10px] opacity-70">POS / Resolución</span>
                      </button>
                      {cart.isEInvEnabled && (
                      <button
                        type="button"
                        onClick={() => cart.setPosInvoiceMode('ELECTRONICA')}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                          cart.posInvoiceMode === 'ELECTRONICA'
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
                    {cart.posInvoiceMode === 'ELECTRONICA' && (
                      <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                        <QrCode className="h-3 w-3" />
                        Se generará automáticamente con CUFE y QR DIAN
                      </div>
                    )}
                    {cart.posInvoiceMode === 'DOC_EQUIPOS' && store?.resolutionNumber && (
                      <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                        <Hash className="h-3 w-3" />
                        Resolución: {store.resolutionNumber} — Prefijo: {store.invoicePrefix || 'POS'}
                      </div>
                    )}
                    {/* ── Buyer info fields (Art. 11 DIAN: only name, NIT, email) ── */}
                    {cart.posInvoiceMode === 'ELECTRONICA' && (
                      <div className="space-y-2 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                            <NITInput
                              value={cart.invoiceCustomerNit}
                              onChange={cart.setInvoiceCustomerNit}
                              placeholder={cart.selectedCustomer !== 'none'
                                ? customers.find(c => String(c.id) === cart.selectedCustomer)?.nit || '222222222222'
                                : '222222222222'}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Nombre / Razón social</Label>
                            <Input
                              placeholder={cart.selectedCustomer !== 'none'
                                ? customers.find(c => String(c.id) === cart.selectedCustomer)?.name || 'Consumidor Final'
                                : 'Consumidor Final'}
                              value={cart.invoiceCustomerName}
                              onChange={(e) => cart.setInvoiceCustomerName(e.target.value)}
                              className="h-9 text-sm"
                              maxLength={200}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Email (requerido para DIAN)</Label>
                          <Input
                            type="email"
                            placeholder={cart.selectedCustomer !== 'none'
                              ? customers.find(c => String(c.id) === cart.selectedCustomer)?.phone || ''
                              : ''}
                            value={cart.invoiceCustomerEmail}
                            onChange={(e) => cart.setInvoiceCustomerEmail(e.target.value)}
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
                    <span className="font-medium">{cart.cartItemCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Método de pago</span>
                    <span className="font-medium">
                      {PAYMENT_METHODS.find((pm) => pm.value === cart.paymentMethod)?.label}
                    </span>
                  </div>
                  {cart.selectedCustomer !== 'none' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cliente</span>
                      <span className="font-medium">
                        {customers.find((c) => String(c.id) === cart.selectedCustomer)?.name}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-semibold">Subtotal</span>
                    <span className="font-medium">
                      {formatCurrency(cart.subtotal, currencyCode)}
                    </span>
                  </div>
                  {cart.discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600 dark:text-amber-400">
                        Descuento
                        {cart.discountType === 'PERCENTAGE' && ` (${cart.discountValue}%)`}
                        {cart.discountReason && ` — ${cart.discountReason}`}
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        -{formatCurrency(cart.discountAmount, currencyCode)}
                      </span>
                    </div>
                  )}
                  {/* IVA Breakdown */}
                  {cart.taxEstimate.breakdown.length > 0 && (
                    <div className="space-y-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
                      <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <Percent className="h-3.5 w-3.5" />
                          IVA Incluido
                        </span>
                        <span>{formatCurrency(cart.taxEstimate.totalTax, currencyCode)}</span>
                      </div>
                      {cart.taxEstimate.breakdown.map((tax) => (
                        <div key={tax.code} className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                          <span>{tax.name} ({tax.rate}%) — Base: {formatCurrency(tax.base, currencyCode)}</span>
                          <span>{formatCurrency(tax.amount, currencyCode)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {cart.tipAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-pink-600 dark:text-pink-400">Propina</span>
                      <span className="font-medium text-pink-600 dark:text-pink-400">
                        {formatCurrency(cart.tipAmount, currencyCode)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-bold text-lg">Total</span>
                    <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(cart.total, currencyCode)}
                    </span>
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => cart.setShowChargeDialog(false)} disabled={cart.isSubmitting || cart.creatingInvoice} className="active:scale-[0.98] transition-all duration-150">Cancelar</Button>
            <Button
              onClick={cart.handleSubmitOrder}
              disabled={cart.isSubmitting || cart.creatingInvoice}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-600/20"
            >
              {cart.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {cart.isSubmitting ? 'Procesando...' : cart.posInvoiceMode === 'ELECTRONICA' && cart.isEInvEnabled ? 'Confirmar + Factura Electrónica' : cart.posInvoiceMode === 'DOC_EQUIPOS' ? 'Confirmar + Doc. Equivalente' : 'Confirmar Venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ RETURN DIALOG ═════════════════════════════ */}
      <POSReturnDialog
        ref={returnDialogRef}
        storeId={storeId}
        onReturnSuccess={handleReturnSuccess}
      />

      {/* ═══ RECENT SALES DIALOG ════════════════════════ */}
      <POSRecentSales
        open={showRecentSales}
        onClose={setShowRecentSales}
        recentOrders={recentOrders}
        loading={loadingRecentSales}
        search={recentSalesSearch}
        onSearchChange={setRecentSalesSearch}
        returnDialogRef={returnDialogRef}
        currencyCode={currencyCode}
      />
    </div>
  )
}
