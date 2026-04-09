'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { ProductImage } from '@/components/ui/product-image'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
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
} from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'

// ─── Types ──────────────────────────────────────────────

interface Product {
  id: number
  name: string
  salePrice: number
  currentStock: number
  categoryId: number | null
  imgUrl: string | null
  sku: string | null
  category?: { id: number; name: string } | null
}

interface Service {
  id: number
  name: string
  price: number
  icon: string
  unit: string
  isActive: boolean
}

interface Category {
  id: number
  name: string
}

interface Customer {
  id: number
  name: string
  phone: string | null
}

interface CartItem {
  productId: number | null
  serviceId: number | null
  name: string
  salePrice: number
  quantity: number
  maxStock: number
  isService: boolean
}

type PaymentMethod = 'CASH' | 'DAVIPLATA' | 'NEQUI' | 'CARD' | 'TRANSFER' | 'FIADO'

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

  // ─── UI states ───────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('none')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [notes, setNotes] = useState('')
  const [showChargeDialog, setShowChargeDialog] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderData, setLastOrderData] = useState<any>(null)
  const [tipAmount, setTipAmount] = useState<number>(0)
  const [showTipInput, setShowTipInput] = useState(false)
  const [transferRef, setTransferRef] = useState('')

  // ─── Cart Sheet state ────────────────────────────────
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  // ─── Cart state ──────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([])

  // ─── Fetch products ──────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!storeId) return
    setIsLoadingProducts(true)
    try {
      const res = await fetch(`/api/products?storeId=${storeId}&active=true`)
      if (!res.ok) throw new Error('Error al cargar productos')
      const data = await res.json()
      setProducts(data)
    } catch {
      toast.error('Error al cargar productos')
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
      const res = await fetch(`/api/customers?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar clientes')
      const data = await res.json()
      setCustomers(data)
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
  }, [fetchProducts, fetchServices, fetchCategories, fetchCustomers])

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
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === product.id)
        if (existing) {
          if (existing.quantity >= product.currentStock) {
            toast.warning(`Stock insuficiente para "${product.name}"`)
            return prev
          }
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
          },
        ]
      })
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
      setCart((prev) => {
        const existing = prev.find((item) => item.serviceId === service.id)
        if (existing) {
          return prev.map((item) =>
            item.serviceId === service.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
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

  const clearCart = useCallback(() => {
    setCart([])
    setNotes('')
    setSelectedCustomer('none')
    setLastOrderNumber(null)
    setLastOrderData(null)
    setTipAmount(0)
    setShowTipInput(false)
    setTransferRef('')
    setCartSheetOpen(false)
  }, [])

  // ─── Cart calculations ───────────────────────────────
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0), [cart])
  const total = useMemo(() => subtotal + tipAmount, [subtotal, tipAmount])

  // ─── Submit order ────────────────────────────────────
  const handleSubmitOrder = async () => {
    if (!storeId || cart.length === 0) return

    // Fiado requires a customer
    if (paymentMethod === 'FIADO' && selectedCustomer === 'none') {
      toast.error('Para vender fiado debes seleccionar un cliente')
      setShowChargeDialog(false)
      return
    }

    // Transfer/Nequi/Daviplata require reference number
    if (['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && !transferRef.trim()) {
      toast.error(`Ingresa el número de ${paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod === 'NEQUI' ? 'Nequi' : 'Daviplata'}`)
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
        paymentMethod,
        tipAmount: paymentMethod !== 'FIADO' ? tipAmount : 0,
        notes: [
          notes.trim(),
          transferNote,
        ].filter(Boolean).join(' | ') || undefined,
        items: cart.map((item) => ({
          ...(item.isService ? { serviceId: item.serviceId } : { productId: item.productId }),
          quantity: item.quantity,
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
      toast.success('¡Venta registrada!', {
        description: `Orden ${order.orderNumber}`,
      })
      setLastOrderNumber(order.orderNumber)
      setLastOrderData(order)
      setCart([])
      setNotes('')
      setTipAmount(0)
      setShowTipInput(false)
      setTransferRef('')
      setCartSheetOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar la venta')
    } finally {
      setIsSubmitting(false)
      setShowChargeDialog(false)
    }
  }

  // ─── Cart item key helper ──────────────────────────
  const cartItemKey = (item: CartItem) =>
    item.isService ? `svc-${item.serviceId}` : `prd-${item.productId}`

  // ─── Render: Product Card ────────────────────────────
  const renderProductCard = (product: Product) => {
    const isOutOfStock = product.currentStock <= 0
    const cartItem = cart.find((item) => item.productId === product.id)
    const inCart = !!cartItem

    return (
      <Card
        key={product.id}
        className={`
          cursor-pointer transition-all duration-150 select-none
          hover:shadow-md active:scale-[0.98]
          ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}
          ${inCart ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-background' : ''}
        `}
        onClick={() => !isOutOfStock && addToCart(product)}
      >
        <CardContent className="p-3 sm:p-4 flex flex-col gap-2">
          {/* Product image or placeholder */}
          <div className="aspect-square rounded-md bg-muted flex items-center justify-center overflow-hidden relative">
            <ProductImage
              src={product.imgUrl}
              alt={product.name}
              categoryName={product.category?.name}
              className="w-full h-full object-cover rounded-md"
              fallbackClassName="aspect-square rounded-md bg-muted flex items-center justify-center w-full h-full"
              iconClassName="h-10 w-10 text-muted-foreground/30"
            />
            {isOutOfStock && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Badge variant="secondary" className="text-xs font-medium">
                  Agotado
                </Badge>
              </div>
            )}
            {inCart && !isOutOfStock && (
              <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                {cartItem!.quantity}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{product.name}</p>
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(product.salePrice, currencyCode)}
            </p>
            <p className="text-xs text-muted-foreground">
              Stock: {product.currentStock}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Render: Service Card ────────────────────────────
  const renderServiceCard = (service: Service) => {
    const cartItem = cart.find((item) => item.serviceId === service.id)
    const inCart = !!cartItem

    return (
      <Card
        key={service.id}
        className={`
          cursor-pointer transition-all duration-150 select-none
          hover:shadow-md active:scale-[0.98]
          ${inCart ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-background' : ''}
        `}
        onClick={() => addServiceToCart(service)}
      >
        <CardContent className="p-3 sm:p-4 flex flex-col gap-2">
          <div className="aspect-square rounded-md bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center relative">
            <Star className="h-10 w-10 text-violet-400/50" />
            <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
              Servicio
            </Badge>
            {inCart && (
              <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-violet-500 text-white flex items-center justify-center text-xs font-bold">
                {cartItem!.quantity}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{service.name}</p>
            <p className="text-base font-bold text-violet-600 dark:text-violet-400">
              {formatCurrency(service.price, currencyCode)}
            </p>
            <p className="text-xs text-muted-foreground">
              por {service.unit}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Render: Product Grid (full width) ──────────────
  const renderProductGrid = () => (
    <div className="flex-1 min-h-0">
      {isLoadingProducts ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ))}
        </div>
      ) : selectedCategory === 'servicios' ? (
        filteredServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <PackageSearch className="h-12 w-12 opacity-30" />
            <p className="text-sm">
              {searchQuery ? 'No se encontraron servicios' : 'No hay servicios activos'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredServices.map(renderServiceCard)}
          </div>
        )
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <PackageSearch className="h-12 w-12 opacity-30" />
          <p className="text-sm">
            {searchQuery ? 'No se encontraron productos' : 'No hay productos activos'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredProducts.map(renderProductCard)}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4 relative">
      {/* ═══ HEADER: Search + Category Tabs ═══════════ */}
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar producto por nombre o SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 text-base"
        />
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Button
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          className="shrink-0 h-8"
          onClick={() => setSelectedCategory('all')}
        >
          Todos
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={selectedCategory === String(cat.id) ? 'default' : 'outline'}
            size="sm"
            className="shrink-0 h-8"
            onClick={() => setSelectedCategory(String(cat.id))}
          >
            {cat.name}
          </Button>
        ))}
        {services.length > 0 && (
          <Button
            variant={selectedCategory === 'servicios' ? 'default' : 'outline'}
            size="sm"
            className="shrink-0 h-8 gap-1"
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
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 h-14 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold shadow-xl shadow-emerald-600/30 transition-all duration-200 lg:bottom-8 lg:right-8"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="text-sm">{cartItemCount}</span>
          <span className="hidden sm:inline text-sm">— {formatCurrency(total, currencyCode)}</span>
        </button>
      )}

      {/* ═══ LAST ORDER INFO (when no cart) ═══════════ */}
      {cartItemCount === 0 && lastOrderNumber && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <p className="text-sm text-center text-muted-foreground">
            Última venta: <span className="font-semibold">{lastOrderNumber}</span>
          </p>
          {lastOrderData && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1"
              onClick={() => {
                const items: TicketItem[] = (lastOrderData.orderItems || []).map((item: any) => ({
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
                  orderNumber: lastOrderData.orderNumber,
                  date: lastOrderData.createdAt,
                  customer: lastOrderData.customer?.name,
                  items,
                  subtotal: lastOrderData.subtotal,
                  tipAmount: lastOrderData.tipAmount || 0,
                  total: lastOrderData.total,
                  paymentMethod: lastOrderData.paymentMethod,
                  currencyCode: currencyCode,
                  notes: notes || undefined,
                })
              }}
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </Button>
          )}
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
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
              <ShoppingCart className="h-16 w-16 opacity-15" />
              <p className="text-sm font-medium">Ticket vacío</p>
              <p className="text-xs">Selecciona productos para comenzar</p>
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
                        className="flex items-center gap-2 py-3 border-b last:border-b-0"
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
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.salePrice, currencyCode)} c/u
                          </p>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(itemId, -1, item.isService)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(itemId, 1, item.isService)}
                            disabled={!item.isService && item.quantity >= item.maxStock}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Line total */}
                        <p className="text-sm font-semibold tabular-nums min-w-[80px] text-right shrink-0">
                          {formatCurrency(item.salePrice * item.quantity, currencyCode)}
                        </p>

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removeFromCart(itemId, item.isService)}
                          title="Eliminar producto"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bottom section: summary + options + charge */}
              <div className="shrink-0 border-t bg-background">
                <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
                  {/* Summary */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">
                        {formatCurrency(subtotal, currencyCode)}
                      </span>
                    </div>

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

                    <div className="flex items-center justify-between">
                      <span className="text-xl font-bold">Total</span>
                      <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
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
                      className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={cart.length === 0 || isSubmitting}
                      onClick={() => setShowChargeDialog(true)}
                    >
                      <CreditCard className="h-5 w-5 mr-2" />
                      Cobrar {formatCurrency(total, currencyCode)}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={clearCart}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Vaciar ticket
                    </Button>
                  </div>

                  {/* Last order print */}
                  {lastOrderNumber && (
                    <div className="flex items-center justify-center gap-3 pt-1">
                      <p className="text-xs text-center text-muted-foreground">
                        Última: <span className="font-semibold">{lastOrderNumber}</span>
                      </p>
                      {lastOrderData && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-primary hover:text-primary"
                          onClick={() => {
                            const items: TicketItem[] = (lastOrderData.orderItems || []).map((item: any) => ({
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
                              orderNumber: lastOrderData.orderNumber,
                              date: lastOrderData.createdAt,
                              customer: lastOrderData.customer?.name,
                              items,
                              subtotal: lastOrderData.subtotal,
                              tipAmount: lastOrderData.tipAmount || 0,
                              total: lastOrderData.total,
                              paymentMethod: lastOrderData.paymentMethod,
                              currencyCode: currencyCode,
                              notes: notes || undefined,
                            })
                          }}
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" />
                          Imprimir
                        </Button>
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
      <AlertDialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar venta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>¿Estás seguro de que deseas registrar esta venta?</p>

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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar Venta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
