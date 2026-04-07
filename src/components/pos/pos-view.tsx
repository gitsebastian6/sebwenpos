'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
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
  Layers,
  StickyNote,
  X,
  PackageSearch,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────

interface Product {
  id: number
  name: string
  salePrice: number
  currentStock: number
  categoryId: number | null
  imgUrl: string | null
  sku: string | null
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
  productId: number
  name: string
  salePrice: number
  quantity: number
  maxStock: number
}

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED'

// ─── Payment method labels ──────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Efectivo', icon: <Banknote className="h-4 w-4" /> },
  { value: 'CARD', label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" /> },
  { value: 'TRANSFER', label: 'Transferencia', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { value: 'MIXED', label: 'Mixto', icon: <Layers className="h-4 w-4" /> },
]

// ─── Main Component ─────────────────────────────────────

export function POSView() {
  const { store } = useAuthStore()
  const storeId = store?.id
  const currencyCode = store?.currencyCode || 'MXN'

  // ─── Data states ─────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
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
    fetchCategories()
    fetchCustomers()
  }, [fetchProducts, fetchCategories, fetchCustomers])

  // ─── Filtered products ───────────────────────────────
  const filteredProducts = useMemo(() => {
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

  // ─── Cart operations ─────────────────────────────────
  const addToCart = useCallback(
    (product: Product) => {
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
            name: product.name,
            salePrice: product.salePrice,
            quantity: 1,
            maxStock: product.currentStock,
          },
        ]
      })
    },
    []
  )

  const updateQuantity = useCallback(
    (productId: number, delta: number) => {
      setCart((prev) =>
        prev
          .map((item) => {
            if (item.productId !== productId) return item
            const newQty = item.quantity + delta
            if (newQty <= 0) return null
            if (newQty > item.maxStock) {
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

  const removeFromCart = useCallback((productId: number) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setNotes('')
    setSelectedCustomer('none')
    setLastOrderNumber(null)
  }, [])

  // ─── Cart calculations ───────────────────────────────
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0), [cart])

  // ─── Submit order ────────────────────────────────────
  const handleSubmitOrder = async () => {
    if (!storeId || cart.length === 0) return
    setIsSubmitting(true)

    try {
      const payload = {
        storeId,
        customerId: selectedCustomer !== 'none' ? Number(selectedCustomer) : null,
        paymentMethod,
        notes: notes.trim() || undefined,
        items: cart.map((item) => ({
          productId: item.productId,
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
      setCart([])
      setNotes('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar la venta')
    } finally {
      setIsSubmitting(false)
      setShowChargeDialog(false)
    }
  }

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
            {product.imgUrl ? (
              <img
                src={product.imgUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <PackageSearch className="h-8 w-8 text-muted-foreground/40" />
            )}
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

  // ─── Render: Cart Item ───────────────────────────────
  const renderCartItem = (item: CartItem) => (
    <div
      key={item.productId}
      className="flex items-center gap-3 py-2.5 px-1 group"
    >
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(item.salePrice, currencyCode)} c/u
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => updateQuantity(item.productId, -1)}
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
          className="h-7 w-7"
          onClick={() => updateQuantity(item.productId, 1)}
          disabled={item.quantity >= item.maxStock}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Line total */}
      <p className="text-sm font-semibold tabular-nums w-20 text-right">
        {formatCurrency(item.salePrice * item.quantity, currencyCode)}
      </p>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => removeFromCart(item.productId)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-[calc(100vh-8rem)]">
      {/* ═══ LEFT PANEL: Products ═════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 lg:min-h-0">
        {/* Search bar */}
        <div className="relative mb-3">
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
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
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
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-hidden">
          {isLoadingProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 h-full">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-square rounded-md" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <PackageSearch className="h-12 w-12 opacity-30" />
              <p className="text-sm">
                {searchQuery ? 'No se encontraron productos' : 'No hay productos activos'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-min overflow-y-auto max-h-[calc(100vh-16rem)] pr-1">
              {filteredProducts.map(renderProductCard)}
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL: Cart / Ticket ════════════════ */}
      <div className="w-full lg:w-[420px] xl:w-[440px] shrink-0 flex flex-col bg-muted/30 rounded-xl border p-4 lg:h-full lg:overflow-hidden">
        {/* Cart header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Ticket</h2>
            {cartItemCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {cartItemCount}
              </Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-8 text-xs"
              onClick={clearCart}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Vaciar
            </Button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-hidden">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-muted-foreground gap-2">
              <ShoppingCart className="h-10 w-10 opacity-20" />
              <p className="text-sm">Ticket vacío</p>
              <p className="text-xs">Haz clic en un producto para agregarlo</p>
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[240px] lg:max-h-none">
              <div className="flex flex-col">
                {cart.map(renderCartItem)}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Separator & Summary */}
        {cart.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatCurrency(subtotal, currencyCode)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold">Total</span>
                <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(subtotal, currencyCode)}
                </span>
              </div>
            </div>
            <Separator className="my-3" />
          </>
        )}

        {/* Order options */}
        <div className="space-y-3 mt-auto">
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
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              className="grid grid-cols-2 gap-2"
            >
              {PAYMENT_METHODS.map((pm) => (
                <Label
                  key={pm.value}
                  htmlFor={`payment-${pm.value}`}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors
                    ${paymentMethod === pm.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-600'
                      : 'border-border hover:bg-muted'
                    }
                  `}
                >
                  <RadioGroupItem value={pm.value} id={`payment-${pm.value}`} className="sr-only" />
                  {pm.icon}
                  <span className="text-sm font-medium">{pm.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

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

          {/* Charge button */}
          <Button
            className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={cart.length === 0 || isSubmitting}
            onClick={() => setShowChargeDialog(true)}
          >
            <CreditCard className="h-5 w-5 mr-2" />
            Cobrar {cart.length > 0 ? formatCurrency(subtotal, currencyCode) : ''}
          </Button>

          {/* Last order number */}
          {lastOrderNumber && (
            <p className="text-xs text-center text-muted-foreground">
              Última venta: <span className="font-semibold">{lastOrderNumber}</span>
            </p>
          )}
        </div>
      </div>

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
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold">Total</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(subtotal, currencyCode)}
                    </span>
                  </div>
                </div>

                {notes.trim() && (
                  <p className="text-sm text-muted-foreground">
                    Notas: {notes.trim()}
                  </p>
                )}
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
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Procesando...
                </>
              ) : (
                'Confirmar venta'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
