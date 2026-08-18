'use client'

import { useState, useMemo } from 'react'
import { formatCOP } from '@/lib/format'
import { toast } from 'sonner'
import {
  Plus, Search, ChevronRight, ChevronLeft, Minus, Trash2, User,
  CalendarDays, FileText, Check, ShoppingBag, Layers, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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
import { useCreateQuotation } from '@/hooks/api/use-quotations'
import { usePurchaseProducts, type ProductOption, type ProductPresentationOption } from '@/hooks/api/use-purchases'
import { buildProductSearchOptions } from '@/lib/product-search'
import { cartItemKey, type CartItem, type DiscountType } from '@/components/quotations/quotation-types'

const cop = formatCOP

interface CreateQuotationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: { id: number }
}

export function CreateQuotationDialog({ open, onOpenChange, store }: CreateQuotationDialogProps) {
  // ─── Step state ────────────────────────────────────
  const [createStep, setCreateStep] = useState(1)
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(true)
  const [customerName, setCustomerName] = useState('')
  const [customerNit, setCustomerNit] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [discountType, setDiscountType] = useState<DiscountType>('NONE')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [validUntil, setValidUntil] = useState<Date | undefined>(undefined)
  const [quotationNotes, setQuotationNotes] = useState('')

  // Product search — fetches the full active catalog once (includes
  // presentations) and filters client-side by name/SKU/barcode, matching the
  // same picker used in Compras. No per-keystroke server round-trip needed.
  const [productSearch, setProductSearch] = useState('')
  const productsQuery = usePurchaseProducts(store?.id)
  const products = productsQuery.data ?? []

  // Mutation
  const createQuotationMut = useCreateQuotation()
  const saving = createQuotationMut.isPending

  // ─── Derived state ────────────────────────────────
  const searchResults = useMemo(() => {
    if (!productSearch.trim()) return []
    return buildProductSearchOptions(products, productSearch).slice(0, 15)
  }, [productSearch, products])
  const searchingProducts = !!productSearch.trim() && productsQuery.isLoading

  // ─── Cart operations ─────────────────────────────
  const addToCart = (product: ProductOption, presentation: ProductPresentationOption | null) => {
    const key = cartItemKey(product.id, presentation?.id ?? null)
    const existing = cart.find((c) => cartItemKey(c.productId, c.presentationId) === key)
    if (existing) {
      setCart(cart.map((c) => cartItemKey(c.productId, c.presentationId) === key ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        presentationId: presentation?.id ?? null,
        presentationName: presentation?.name ?? null,
        unitsPerPack: presentation?.unitsPerPack ?? 1,
        unitPrice: presentation ? presentation.salePrice : product.salePrice,
        quantity: 1,
        notes: '',
      }])
    }
    setProductSearch('')
  }

  const updateCartQty = (productId: number, presentationId: number | null, delta: number) => {
    const key = cartItemKey(productId, presentationId)
    setCart(cart.map((c) => {
      if (cartItemKey(c.productId, c.presentationId) === key) {
        const newQty = Math.max(1, c.quantity + delta)
        return { ...c, quantity: newQty }
      }
      return c
    }))
  }

  const updateCartNotes = (productId: number, presentationId: number | null, notes: string) => {
    const key = cartItemKey(productId, presentationId)
    setCart(cart.map((c) => cartItemKey(c.productId, c.presentationId) === key ? { ...c, notes } : c))
  }

  const removeFromCart = (productId: number, presentationId: number | null) => {
    const key = cartItemKey(productId, presentationId)
    setCart(cart.filter((c) => cartItemKey(c.productId, c.presentationId) !== key))
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
          ...(c.presentationId ? { presentationId: c.presentationId } : {}),
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
      onOpenChange(false)
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

  const handleDialogChange = (open: boolean) => {
    if (!open && !saving) {
      resetCreateForm()
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
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
                  placeholder="Buscar por nombre, SKU o código de barras..."
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
                  {searchResults.map((opt) => {
                    const price = opt.presentation ? opt.presentation.salePrice : opt.product.salePrice
                    const inCart = cart.find((c) => c.productId === opt.product.id && c.presentationId === (opt.presentation?.id ?? null))
                    return (
                      <button
                        key={opt.key}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b last:border-b-0"
                        onClick={() => addToCart(opt.product, opt.presentation)}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate flex items-center gap-1.5">
                            {opt.product.name}
                            {opt.presentation && (
                              <span className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 text-xs font-normal shrink-0">
                                <Layers className="h-3 w-3" />{opt.presentation.name} (×{opt.presentation.unitsPerPack})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {opt.product.category?.name}
                            {opt.product.currentStock <= 5 && (
                              <span className="ml-2 text-amber-600">Stock: {opt.product.currentStock}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-medium text-sm">{cop(price)}</div>
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
                        <TableRow key={cartItemKey(item.productId, item.presentationId)} className="hover:bg-muted/30">
                          <TableCell className="text-sm">
                            <div>
                              {item.productName}
                              {item.presentationName && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 text-xs">
                                  <Layers className="h-3 w-3" />{item.presentationName}
                                </span>
                              )}
                            </div>
                            <Input
                              className="mt-1 h-7 text-xs"
                              placeholder="Notas (opcional)"
                              value={item.notes}
                              onChange={(e) => updateCartNotes(item.productId, item.presentationId, e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(item.productId, item.presentationId, -1)} aria-label="Reducir cantidad">
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center font-mono text-sm font-medium">{item.quantity}</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(item.productId, item.presentationId, 1)} aria-label="Aumentar cantidad">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm">{cop(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium text-sm">{cop(item.unitPrice * item.quantity)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.productId, item.presentationId)} aria-label="Quitar del carrito">
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
                      <TableRow key={cartItemKey(item.productId, item.presentationId)} className="hover:bg-muted/30">
                        <TableCell className="text-sm">
                          {item.productName}
                          {item.presentationName && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 text-xs">
                              <Layers className="h-3 w-3" />{item.presentationName}
                            </span>
                          )}
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
                    <Select value={discountType} onValueChange={(v: DiscountType) => { setDiscountType(v); setDiscountAmount('0') }}>
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
              <Button variant="outline" onClick={() => { onOpenChange(false); resetCreateForm() }} disabled={saving}>
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
  )
}
