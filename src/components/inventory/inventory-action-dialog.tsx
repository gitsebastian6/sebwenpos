'use client'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useInventoryAdjustment, useInventoryLoss, useInventoryReturn } from '@/hooks/api/use-inventory'
import { formatCurrency } from '@/lib/auth'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { floorQty, formatQty, parseQtyInput, roundQty } from '@/lib/format'
import { useQueryClient } from '@tanstack/react-query'
import {
    AlertTriangle,
    Loader2,
    RotateCcw,
    Search,
    SlidersHorizontal,
    X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ActionType, Product } from './inventory-types'
import { LOSS_REASONS } from './inventory-types'

// ─── Props ────────────────────────────────────────────────────

interface InventoryActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  actionType: ActionType
  storeId: number | undefined
  products: Product[]
  currencyCode?: string
}

// ─── Action config ────────────────────────────────────────────

const ACTION_CONFIG = {
  loss: {
    title: 'Registrar Pérdida de Producto',
    description: 'Registra productos que se vencieron, dañaron, robaron o perdieron por cualquier motivo.',
    icon: <AlertTriangle className="h-5 w-5" />,
    submitLabel: 'Registrar Pérdida',
    submitVariant: 'destructive' as const,
    color: 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20',
    titleColor: 'text-red-600 dark:text-red-400',
  },
  return: {
    title: 'Registrar Devolución de Producto',
    description: 'Registra productos que vuelven al inventario (devoluciones de clientes o proveedores).',
    icon: <RotateCcw className="h-5 w-5" />,
    submitLabel: 'Registrar Devolución',
    submitVariant: 'default' as const,
    color: 'border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20',
    titleColor: 'text-sky-600 dark:text-sky-400',
  },
  adjust: {
    title: 'Ajustar Inventario',
    description: 'Corrige el stock de un producto. Puedes establecer una cantidad exacta o agregar/quitar unidades.',
    icon: <SlidersHorizontal className="h-5 w-5" />,
    submitLabel: 'Ajustar Stock',
    submitVariant: 'default' as const,
    color: 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20',
    titleColor: 'text-amber-600 dark:text-amber-400',
  },
}

// ─── Component ────────────────────────────────────────────────

export function InventoryActionDialog({
  open,
  onOpenChange,
  actionType,
  storeId,
  products,
  currencyCode,
}: InventoryActionDialogProps) {
  const queryClient = useQueryClient()

  // Internal state (reset on every open via key prop from parent)
  const [dialogProductSearch, setDialogProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedPresentationId, setSelectedPresentationId] = useState<number | null>(null)

  const selectedPresentation = selectedProduct?.presentations?.find((p) => p.id === selectedPresentationId) ?? null
  const unitsPerPack = selectedPresentation?.unitsPerPack ?? 1
  // floorQty: piso a 3 decimales (no a entero) — un producto con 0.5 KG de
  // stock en presentación UND no debe mostrar "0".
  const maxInPresentation = selectedProduct ? floorQty(selectedProduct.currentStock / unitsPerPack) : 0

  // Adjust form
  const [adjustMode, setAdjustMode] = useState<'set' | 'add'>('set')
  const [adjustQuantity, setAdjustQuantity] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')

  // Return form
  const [returnQuantity, setReturnQuantity] = useState('')
  const [returnNotes, setReturnNotes] = useState('')

  // Loss form
  const [lossQuantity, setLossQuantity] = useState('')
  const [lossReason, setLossReason] = useState('VENCIDO')
  const [lossNotes, setLossNotes] = useState('')

  // Mutation hooks
  const adjustment = useInventoryAdjustment()
  const invReturn = useInventoryReturn()
  const invLoss = useInventoryLoss()
  const actionSubmitting = adjustment.isPending || invReturn.isPending || invLoss.isPending

  // Filtered products for dialog search
  const dialogFilteredProducts = useMemo(() => {
    if (!dialogProductSearch.trim()) return products
    const q = dialogProductSearch.toLowerCase().trim()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category?.name && p.category.name.toLowerCase().includes(q))
    )
  }, [products, dialogProductSearch])

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['inventory'] })
  }

  function selectProductForAction(product: Product) {
    setSelectedProduct(product)
    setSelectedPresentationId(null)
    setDialogProductSearch('')
    if (actionType === 'adjust') {
      setAdjustQuantity(String(product.currentStock))
    }
  }

  function clearSelectedProduct() {
    setSelectedProduct(null)
    setSelectedPresentationId(null)
  }

  // Switching presentation changes what a "unit" means (e.g. Unidad → Caja x24),
  // so any quantity already typed is stale — reset it rather than silently
  // reinterpreting it in the new unit.
  function handlePresentationChange(id: number | null) {
    setSelectedPresentationId(id)
    if (!selectedProduct) return
    const upp = id ? (selectedProduct.presentations?.find((p) => p.id === id)?.unitsPerPack ?? 1) : 1
    if (actionType === 'adjust' && adjustMode === 'set') {
      setAdjustQuantity(String(floorQty(selectedProduct.currentStock / upp)))
    } else {
      setAdjustQuantity('')
      setReturnQuantity('')
      setLossQuantity('')
    }
  }

  // ─── Submit handlers ──────────────────────────────────

  async function handleAdjustStock() {
    if (!storeId || !selectedProduct) return
    const qty = parseQtyInput(adjustQuantity)
    if (isNaN(qty) || qty < 0) {
      toast.error('La cantidad debe ser un número positivo')
      return
    }

    const currentStock = selectedProduct.currentStock
    let finalQuantity: number
    if (adjustMode === 'set') {
      finalQuantity = roundQty((qty * unitsPerPack) - currentStock)
    } else {
      finalQuantity = roundQty(qty * unitsPerPack)
    }

    if (finalQuantity === 0) {
      toast.info('No hay cambio en el stock')
      return
    }

    try {
      await adjustment.mutateAsync({
        body: {
          storeId,
          productId: selectedProduct.id,
          presentationId: selectedPresentation?.id,
          quantity: finalQuantity,
          notes: adjustNotes || undefined,
        },
      })
      toast.success('Stock ajustado correctamente')
      onOpenChange(false)
      invalidateAfterMutation()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al ajustar stock')
    }
  }

  async function handleReturn() {
    if (!storeId || !selectedProduct) return
    const qty = parseQtyInput(returnQuantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    try {
      await invReturn.mutateAsync({
        body: {
          storeId,
          productId: selectedProduct.id,
          presentationId: selectedPresentation?.id,
          quantity: roundQty(qty * unitsPerPack),
          notes: returnNotes || undefined,
        },
      })
      toast.success('Devolución registrada correctamente')
      onOpenChange(false)
      invalidateAfterMutation()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar devolución')
    }
  }

  async function handleLoss() {
    if (!storeId || !selectedProduct) return
    const qty = parseQtyInput(lossQuantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    if (!lossReason) {
      toast.error('Selecciona el motivo de la pérdida')
      return
    }

    try {
      await invLoss.mutateAsync({
        body: {
          storeId,
          productId: selectedProduct.id,
          presentationId: selectedPresentation?.id,
          quantity: qty * unitsPerPack,
          reason: lossReason,
          notes: lossNotes || undefined,
        },
      })
      toast.success('Pérdida registrada correctamente')
      onOpenChange(false)
      invalidateAfterMutation()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar pérdida')
    }
  }

  function handleActionSubmit() {
    if (actionType === 'adjust') handleAdjustStock()
    else if (actionType === 'return') handleReturn()
    else if (actionType === 'loss') handleLoss()
  }

  // ─── Render ──────────────────────────────────────────

  const config = ACTION_CONFIG[actionType]
  const isDisabled = actionType === 'loss'
    ? !lossQuantity || !lossReason
    : actionType === 'return'
      ? !returnQuantity
      : !adjustQuantity

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-lg backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${config.titleColor}`}>
            {config.icon}
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedProduct ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary'}`}>
              {selectedProduct ? '✓' : '1'}
            </div>
            <span className={selectedProduct ? 'text-foreground font-medium' : ''}>Buscar producto</span>
            <div className="h-px flex-1 bg-border" />
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedProduct ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              2
            </div>
            <span className={selectedProduct ? 'text-foreground font-medium' : ''}>
              {actionType === 'loss' ? 'Datos de la pérdida' : actionType === 'return' ? 'Datos de la devolución' : 'Datos del ajuste'}
            </span>
          </div>

          {/* ─── STEP 1: Product Search ────────────────────── */}
          {!selectedProduct ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Paso 1: Busca y selecciona el producto
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Escribe el nombre del producto..."
                  value={dialogProductSearch}
                  onChange={(e) => setDialogProductSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              {/* Product search results */}
              <div className="max-h-[240px] overflow-y-auto rounded-md border">
                {products.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No hay productos registrados
                  </div>
                ) : dialogFilteredProducts.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No se encontró ningún producto
                  </div>
                ) : (
                  dialogFilteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => selectProductForAction(product)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/80 transition-colors border-b last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {product.category && <span>{product.category.name}</span>}
                          <span className={product.currentStock <= product.minStock ? 'text-red-500 font-medium' : ''}>
                            Stock: {formatQty(product.currentStock)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{formatCurrency(product.salePrice, currencyCode)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ─── STEP 2: Action Form ────────────────────── */
            <div className="space-y-4">
              {/* Selected product info */}
              <div className={`rounded-lg border p-3 ${config.color}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{selectedProduct.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedProduct.category?.name || 'Sin categoría'} &middot; Stock actual: <span className="font-semibold text-foreground">
                        {selectedPresentation ? `${maxInPresentation} ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)}(s)` : `${selectedProduct.currentStock} uds`}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 active:scale-[0.98] transition-all"
                    onClick={clearSelectedProduct}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Presentation selector — only shown when the product has extra presentations */}
              {(selectedProduct.presentations?.filter((p) => p.isActive).length ?? 0) > 0 && (
                <div className="space-y-2">
                  <Label>Presentación</Label>
                  <Select
                    value={selectedPresentationId === null ? 'base' : String(selectedPresentationId)}
                    onValueChange={(v) => handlePresentationChange(v === 'base' ? null : Number(v))}
                  >
                    <SelectTrigger className="h-9 focus-visible:ring-primary/20 focus-visible:border-primary/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">{getUnitOfMeasureLabel(selectedProduct.unitLabel)}</SelectItem>
                      {selectedProduct.presentations!.filter((p) => p.isActive).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {getUnitOfMeasureLabel(p.unitLabel)} ×{p.unitsPerPack}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPresentation && (
                    <p className="text-xs text-muted-foreground">
                      1 {getUnitOfMeasureLabel(selectedPresentation.unitLabel)} = {selectedPresentation.unitsPerPack} unidades base &middot; disponibles: {maxInPresentation}
                    </p>
                  )}
                </div>
              )}

              {/* ─── LOSS FORM ──────────────────────────────── */}
              {actionType === 'loss' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="loss-qty">¿Cuántas unidades se perdieron? *</Label>
                    <Input
                      id="loss-qty"
                      type="number"
                      min="1"
                      step="0.001"
                      max={maxInPresentation}
                      placeholder="Ej: 3"
                      value={lossQuantity}
                      onChange={(e) => setLossQuantity(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Máximo disponible: {maxInPresentation} {selectedPresentation ? `${getUnitOfMeasureLabel(selectedPresentation.unitLabel)}(s)` : 'unidades'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>¿Por qué se perdió? *</Label>
                    <Select value={lossReason} onValueChange={setLossReason}>
                      <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40">
                        <SelectValue placeholder="Selecciona el motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOSS_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loss-notes">Notas adicionales</Label>
                    <Textarea
                      id="loss-notes"
                      placeholder="Ej: Se cayó una botella del estante..."
                      value={lossNotes}
                      onChange={(e) => setLossNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}

              {/* ─── RETURN FORM ─────────────────────────────── */}
              {actionType === 'return' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="return-qty">¿Cuántas unidades se devuelven? *</Label>
                    <Input
                      id="return-qty"
                      type="number"
                      min="1"
                      step="0.001"
                      placeholder="Ej: 5"
                      value={returnQuantity}
                      onChange={(e) => setReturnQuantity(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedPresentation
                        ? `Estas ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)}(s) se SUMARÁN al stock actual (${selectedProduct.currentStock} unidades base)`
                        : `Estas unidades se SUMARÁN al stock actual (${selectedProduct.currentStock})`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="return-notes">¿Por qué se devuelve? (opcional)</Label>
                    <Textarea
                      id="return-notes"
                      placeholder="Ej: El cliente no lo quería, estaba vencido..."
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}

              {/* ─── ADJUST FORM ─────────────────────────────── */}
              {actionType === 'adjust' && (
                <>
                  <div className="space-y-2">
                    <Label>¿Cómo quieres ajustar?</Label>
                    <Select value={adjustMode} onValueChange={(v: 'set' | 'add') => {
                      setAdjustMode(v)
                      if (v === 'set') {
                        setAdjustQuantity(String(maxInPresentation))
                      } else {
                        setAdjustQuantity('')
                      }
                    }}>
                      <SelectTrigger className="h-9 focus-visible:ring-primary/20 focus-visible:border-primary/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="set">Establecer cantidad exacta</SelectItem>
                        <SelectItem value="add">Agregar o quitar (+/-)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjust-qty">
                      {adjustMode === 'set' ? 'Nueva cantidad total' : 'Cantidad a agregar o quitar'}
                      {selectedPresentation ? ` (en ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)})` : ''} *
                    </Label>
                    <Input
                      id="adjust-qty"
                      type="number"
                      min={adjustMode === 'set' ? '0' : undefined}
                      step="0.001"
                      placeholder={adjustMode === 'set' ? 'Ej: 50' : 'Ej: 10 para agregar, -5 para quitar'}
                      value={adjustQuantity}
                      onChange={(e) => setAdjustQuantity(e.target.value)}
                    />
                    {adjustMode === 'set' && adjustQuantity && !isNaN(parseQtyInput(adjustQuantity)) && (
                      <p className="text-xs text-muted-foreground">
                        Cambio: <span className={roundQty((parseQtyInput(adjustQuantity) * unitsPerPack) - selectedProduct.currentStock) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {roundQty((parseQtyInput(adjustQuantity) * unitsPerPack) - selectedProduct.currentStock) >= 0 ? '+' : ''}
                          {roundQty((parseQtyInput(adjustQuantity) * unitsPerPack) - selectedProduct.currentStock)} unidades base
                        </span>
                      </p>
                    )}
                    {adjustMode === 'add' && (
                      <p className="text-xs text-muted-foreground">
                        Usa valores positivos para agregar o negativos para quitar
                        {selectedPresentation ? ` (en ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)})` : ''}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjust-notes">¿Por qué haces este ajuste? (opcional)</Label>
                    <Textarea
                      id="adjust-notes"
                      placeholder="Ej: Conteo físico, error en el sistema..."
                      value={adjustNotes}
                      onChange={(e) => setAdjustNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}

              {/* Submit */}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={clearSelectedProduct}
                  disabled={actionSubmitting}
                >
                  Cambiar producto
                </Button>
                <Button
                  variant={config.submitVariant}
                  onClick={handleActionSubmit}
                  disabled={actionSubmitting || isDisabled}
                >
                  {actionSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      {config.icon}
                      <span className="ml-2">{config.submitLabel}</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
