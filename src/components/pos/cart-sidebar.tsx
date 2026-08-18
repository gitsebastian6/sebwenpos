'use client'

import { useState, useCallback } from 'react'
import { formatCurrency } from '@/lib/auth'
import type { DiscountType } from '@/hooks/pos/use-pos-cart'
import type { OpenCashRegister } from '@/hooks/pos/use-pos-data'
import type { CustomerSummary, PaymentMethod } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  ArrowRightLeft,
  StickyNote,
  X,
  Users,
  Heart,
  Printer,
  AlertTriangle,
  Wallet,
  Percent,
  Tag,
  MessageSquare,
  Pencil,
  RotateCcw,
  Banknote,
  Smartphone,
  Shield,
} from 'lucide-react'
import type { POSReturnDialogRef } from '@/components/pos/pos-return-dialog'
import { PosWompiDialog } from '@/components/pos/pos-wompi-dialog'

// ─── Payment method labels ──────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode; badge?: string }[] = [
  { value: 'CASH', label: 'Efectivo', icon: <Banknote className="h-4 w-4" /> },
  { value: 'DAVIPLATA', label: 'Daviplata', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'NEQUI', label: 'Nequi', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'CARD', label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" /> },
  { value: 'WOMPI', label: 'Wompi', icon: <Shield className="h-4 w-4" />, badge: 'Online' },
  { value: 'TRANSFER', label: 'Transferencia', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { value: 'FIADO', label: 'Fiado', icon: <Users className="h-4 w-4" /> },
]

// ─── Types ──────────────────────────────────────────────

export interface CartSidebarProps {
  // Cart items & counts
  cart: Array<{
    productId: number | null
    serviceId: number | null
    presentationId?: number | null
    presentationName?: string | null
    unitsPerPack?: number
    name: string
    salePrice: number
    quantity: number
    maxStock: number
    isService: boolean
    notes?: string
    taxRate?: { name: string; code: string; rate: number; rateType: string }
  }>
  cartItemCount: number
  subtotal: number
  taxEstimate: { breakdown: Array<{ name: string; code: string; base: number; rate: number; amount: number }>; totalTax: number }
  discountAmount: number
  total: number

  // Cart operations
  updateQuantity: (itemId: number, delta: number, isService: boolean, presentationId?: number | null) => void
  removeFromCart: (itemId: number, isService: boolean, presentationId?: number | null) => void
  updateItemNotes: (itemId: number, isService: boolean, notes: string, presentationId?: number | null) => void
  clearCart: () => void

  // Discount
  discountType: DiscountType
  setDiscountType: (t: DiscountType) => void
  discountValue: number
  setDiscountValue: (v: number) => void
  discountReason: string
  setDiscountReason: (r: string) => void
  showDiscountInput: boolean
  setShowDiscountInput: (v: boolean) => void

  // Tip
  tipAmount: number
  setTipAmount: (v: number) => void
  showTipInput: boolean
  setShowTipInput: (v: boolean) => void

  // Customer, notes, payment
  selectedCustomer: string
  setSelectedCustomer: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  paymentMethod: PaymentMethod
  setPaymentMethod: (m: PaymentMethod) => void
  transferRef: string
  setTransferRef: (r: string) => void

  // UI state
  cartSheetOpen: boolean
  setCartSheetOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  setShowChargeDialog: (v: boolean) => void

  // Last order
  lastOrderNumber: string | null
  lastOrderData: { id: number; orderNumber: string; customer?: { name: string } } | null
  lastInvoiceData: { cufe?: string; invoiceNumber?: string; customerNit?: string; qrCode?: string } | null
  lastDocType: string

  // External data
  customers: CustomerSummary[]
  openCashRegisters: OpenCashRegister[]
  selectedCashRegisterId: string
  setSelectedCashRegisterId: (v: string) => void
  currencyCode: string
  storeId?: number

  // Callbacks
  printLastOrderTicket: () => void
  returnDialogRef: React.RefObject<POSReturnDialogRef | null>
}

// ─── Cart item key helper ──────────────────────────────

function cartItemKey(item: { isService: boolean; serviceId: number | null; productId: number | null; presentationId?: number | null }) {
  return item.isService ? `svc-${item.serviceId}` : `prd-${item.productId}-${item.presentationId ?? 0}`
}

// ─── Component ──────────────────────────────────────────

export function CartSidebar({
  cart,
  cartItemCount,
  subtotal,
  taxEstimate,
  discountAmount,
  total,
  updateQuantity,
  removeFromCart,
  updateItemNotes,
  clearCart,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  discountReason,
  setDiscountReason,
  showDiscountInput,
  setShowDiscountInput,
  tipAmount,
  setTipAmount,
  showTipInput,
  setShowTipInput,
  selectedCustomer,
  setSelectedCustomer,
  notes,
  setNotes,
  paymentMethod,
  setPaymentMethod,
  transferRef,
  setTransferRef,
  cartSheetOpen,
  setCartSheetOpen,
  setShowChargeDialog,
  lastOrderNumber,
  lastOrderData,
  lastInvoiceData,
  lastDocType,
  customers,
  openCashRegisters,
  selectedCashRegisterId,
  setSelectedCashRegisterId,
  currencyCode,
  storeId,
  printLastOrderTicket,
  returnDialogRef,
}: CartSidebarProps) {
  // ── Wompi POS dialog state ──
  const [posWompiDialogOpen, setPosWompiDialogOpen] = useState(false)

  // Handle "Cobrar" button click
  const handleCobrar = useCallback(() => {
    if (paymentMethod === 'WOMPI' && storeId) {
      setPosWompiDialogOpen(true)
    } else {
      setShowChargeDialog(true)
    }
  }, [paymentMethod, storeId, setShowChargeDialog])

  // When Wompi payment is complete, set reference and open charge dialog
  const handleWompiPaymentComplete = useCallback((wompiReference: string) => {
    if (wompiReference) {
      setTransferRef(wompiReference)
    }
    setShowChargeDialog(true)
  }, [setTransferRef, setShowChargeDialog])

  // When Wompi dialog is cancelled
  const handleWompiCancel = useCallback(() => {
    setPosWompiDialogOpen(false)
  }, [])
  return (
    <>
    <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 shrink-0 border-b border-border/40">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            <SheetTitle className="text-lg">Ticket</SheetTitle>
            {cartItemCount > 0 && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 font-bold">{cartItemCount}</Badge>
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
                      className="flex items-center gap-2.5 py-3.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors duration-150"
                    >
                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[15px] font-semibold truncate">
                            {item.name}
                            {item.presentationName && (
                              <span className="text-muted-foreground font-normal"> — {item.presentationName}</span>
                            )}
                          </p>
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
                                  className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors p-0.5"
                                  title={item.notes}
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" align="start">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Nota del artículo</p>
                                <Textarea
                                  value={item.notes}
                                  onChange={(e) => updateItemNotes(itemId, item.isService, e.target.value, item.presentationId)}
                                  placeholder="Ej: sin hielo, extra limón..."
                                  className="min-h-[60px] resize-none text-sm"
                                  rows={2}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-1.5 h-7 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => updateItemNotes(itemId, item.isService, '', item.presentationId)}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Quitar nota
                                </Button>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
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
                              className="h-8 w-8 text-muted-foreground hover:text-amber-600 shrink-0"
                              title="Agregar nota"
                              aria-label="Agregar nota"
                            >
                              <Pencil className="h-3.5 w-3.5" />
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
                      <div className="flex items-center gap-1 shrink-0 bg-muted/50 rounded-lg p-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-md active:scale-90 transition-all duration-150 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
                          onClick={() => updateQuantity(itemId, -1, item.isService, item.presentationId)}
                          disabled={item.quantity <= 1}
                          aria-label="Reducir cantidad"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-9 text-center text-base font-bold tabular-nums text-foreground">
                          {item.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-md active:scale-90 transition-all duration-150 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
                          onClick={() => updateQuantity(itemId, 1, item.isService, item.presentationId)}
                          disabled={!item.isService && item.quantity >= item.maxStock}
                          aria-label="Aumentar cantidad"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Line total */}
                      <p className="text-[15px] font-bold tabular-nums min-w-[92px] text-right shrink-0 text-foreground">
                        {formatCurrency(item.salePrice * item.quantity, currencyCode)}
                      </p>

                      {/* Remove button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 active:scale-90 transition-all duration-150"
                        onClick={() => removeFromCart(itemId, item.isService, item.presentationId)}
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
                      if (!['TRANSFER', 'NEQUI', 'DAVIPLATA', 'WOMPI'].includes(v)) setTransferRef('')
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
                          {pm.badge && (
                            <span className="text-[8px] px-1 py-0.5 rounded-full bg-primary/10 text-primary font-semibold leading-none">{pm.badge}</span>
                          )}
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
                {['TRANSFER', 'NEQUI', 'DAVIPLATA', 'WOMPI'].includes(paymentMethod) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      {paymentMethod === 'WOMPI' ? 'Referencia Wompi' : `Número de ${paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod}`}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={transferRef}
                      onChange={(e) => setTransferRef(e.target.value)}
                      placeholder={paymentMethod === 'WOMPI' ? 'Ej: 31416_10947' : paymentMethod === 'TRANSFER' ? 'Ej: 000123456789' : 'Ej: 3111234567'}
                      className="text-sm tabular-nums"
                    />
                    <p className="text-xs text-muted-foreground">
                      {paymentMethod === 'WOMPI'
                        ? 'Referencia de la transacción Wompi (opcional para verificación)'
                        : paymentMethod === 'TRANSFER'
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
                    disabled={cart.length === 0 || openCashRegisters.length === 0}
                    onClick={handleCobrar}
                  >
                    {paymentMethod === 'WOMPI' ? <Shield className="h-5 w-5 mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
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
                          onClick={printLastOrderTicket}
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
                          onClick={() => returnDialogRef.current?.openReturnDialog(lastOrderData!.id)}
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

    {/* POS Wompi Payment Dialog */}
    {storeId && (
      <PosWompiDialog
        open={posWompiDialogOpen}
        onOpenChange={setPosWompiDialogOpen}
        storeId={storeId}
        amount={total}
        onPaymentComplete={handleWompiPaymentComplete}
        onCancel={handleWompiCancel}
      />
    )}
    </>
  )
}
