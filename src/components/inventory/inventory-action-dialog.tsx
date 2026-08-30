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
import { useInventoryAdjustment, useInventoryLoss, useInventoryReturn, useProductBatches } from '@/hooks/api/use-inventory'
import { formatCurrency } from '@/lib/auth'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { formatQty, parseQtyInput, qtyStepFor } from '@/lib/format'
import { currentInPresentation, resolveBaseDelta, validateAdjust } from '@/lib/inventory-adjust-math'
import { sortPresentationOptions } from '@/lib/product-presentations'
import { useProductScanner } from '@/hooks/use-product-scanner'
import { useQueryClient } from '@tanstack/react-query'
import {
    AlertTriangle,
    Loader2,
    Package,
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
  /** Catálogo para el buscador (módulo Inventario). Opcional si se pasa `product`. */
  products?: Product[]
  /** Producto ya elegido (menú de fila en Productos / Reportes) → salta el Paso 1. */
  product?: Product
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
  product,
  currencyCode,
}: InventoryActionDialogProps) {
  const queryClient = useQueryClient()
  const productList = useMemo(() => products ?? [], [products])
  const preselected = !!product

  // Internal state (reset on every open via key prop from parent)
  const [dialogProductSearch, setDialogProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(product ?? null)
  const [selectedPresentationId, setSelectedPresentationId] = useState<number | null>(
    product ? (sortPresentationOptions(product)[0].presentation?.id ?? null) : null
  )

  const selectedPresentation = selectedProduct?.presentations?.find((p) => p.id === selectedPresentationId) ?? null
  // Prisma puede serializar Decimal como string en el JSON de la API.
  const unitsPerPack = Number(selectedPresentation?.unitsPerPack ?? 1) || 1
  // Stock actual expresado en la unidad elegida, SIN piso: 25 uds base en un
  // six-pack (×6) = 4,167, no "4". El servidor hace la conversión definitiva.
  const currentInSelectedUnit = selectedProduct
    ? currentInPresentation(selectedProduct.currentStock, unitsPerPack)
    : 0
  const lineUnitLabel = selectedPresentation?.unitLabel ?? selectedProduct?.unitLabel
  const qtyStep = qtyStepFor(lineUnitLabel)

  // Adjust form
  const [adjustMode, setAdjustMode] = useState<'set' | 'add'>('set')
  const [adjustQuantity, setAdjustQuantity] = useState(
    product && actionType === 'adjust' ? String(product.currentStock) : ''
  )
  const [adjustNotes, setAdjustNotes] = useState('')

  // Lote (solo productos con trackExpiration)
  // Entrada de stock: se escribe el N.º de lote libremente — si coincide con uno
  // existente se suma a ese, si no se crea. Salida de stock: se elige de qué
  // lote descontar ('auto' = FEFO).
  const [newLotNumber, setNewLotNumber] = useState('')
  const [newLotExpiry, setNewLotExpiry] = useState('')
  const [newLotMfg, setNewLotMfg] = useState('')
  const [affectedLot, setAffectedLot] = useState<string>('auto') // 'auto' | '<batchId>'

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
    if (!dialogProductSearch.trim()) return productList
    const q = dialogProductSearch.toLowerCase().trim()
    return productList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category?.name && p.category.name.toLowerCase().includes(q))
    )
  }, [productList, dialogProductSearch])

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['inventory'] })
    queryClient.invalidateQueries({ queryKey: ['product-batches'] })
  }

  // Scanner (camera + USB gun) for step 1 — exact barcode/SKU picks the
  // product; anything else fills the search box.
  const { scanButton, scannerDialog } = useProductScanner({
    products: productList,
    keyboardEnabled: open && !selectedProduct && !preselected,
    size: 'compact',
    label: 'Escanear producto',
    onExactMatch: (m) => selectProductForAction(m.product),
    onText: (code) => setDialogProductSearch(code),
  })

  // ─── Lote ────────────────────────────────────────────────────
  const tracksExpiration = !!selectedProduct?.trackExpiration
  const { data: productBatches = [] } = useProductBatches(
    tracksExpiration ? selectedProduct?.id : undefined,
    storeId
  )

  // Delta base del ajuste (para saber si el movimiento suma o resta stock).
  const adjQty = parseQtyInput(adjustQuantity)
  const adjustDelta = selectedProduct
    ? resolveBaseDelta({
        mode: adjustMode === 'set' ? 'absolute' : 'delta',
        qty: adjQty,
        unitsPerPack: adjustMode === 'set' ? 1 : unitsPerPack,
        currentStock: selectedProduct.currentStock,
      })
    : 0

  // ¿Se indica el lote como ENTRADA (campo de texto libre: agrega a uno igual o
  // crea) o como SALIDA (selector: de qué lote descontar)?
  //   - devolución            → entrada
  //   - ajuste con delta >= 0  → entrada (incluye "sin decidir")
  //   - pérdida / ajuste < 0   → salida
  const lotAsEntry =
    actionType === 'return' || (actionType === 'adjust' && adjustDelta >= 0)

  // ¿El N.º de lote escrito coincide (exacto, sin distinguir mayúsculas) con un
  // lote ya existente? → el servidor suma a ese mismo lote.
  const matchedBatch = productBatches.find(
    (b) => b.lotNumber.trim().toLowerCase() === newLotNumber.trim().toLowerCase()
  )
  const affectedLotValid = productBatches.some((b) => String(b.id) === affectedLot)
  const effectiveAffectedLot = affectedLotValid ? affectedLot : 'auto'

  // Cuerpo de lote para el request: batchId | {lotNumber, expiryDate, manufacturingDate}
  function lotBody(): Record<string, unknown> {
    if (!tracksExpiration) return {}
    if (lotAsEntry) {
      // Lote libre: si coincide con uno existente, upsertBatch lo consolida;
      // si no, lo crea. Las fechas solo aplican a un lote nuevo.
      const lot = newLotNumber.trim()
      if (!lot) return {}
      return {
        lotNumber: lot,
        ...(matchedBatch
          ? {}
          : { expiryDate: newLotExpiry || undefined, manufacturingDate: newLotMfg || undefined }),
      }
    }
    // Salida: lote afectado opcional (auto = FEFO).
    return effectiveAffectedLot !== 'auto' ? { batchId: Number(effectiveAffectedLot) } : {}
  }

  function selectProductForAction(product: Product) {
    setSelectedProduct(product)
    // Default: la unidad más pequeña — en el orden de menor a mayor precio la
    // primera fila es la más económica (0.25, 0.5, Unidad…). Si la base
    // "Unidad" es la más barata, el id queda null.
    const defaultId = sortPresentationOptions(product)[0].presentation?.id ?? null
    setSelectedPresentationId(defaultId)
    setDialogProductSearch('')
    if (actionType === 'adjust') {
      // El modo por defecto es "establecer" y se cuenta en unidades base:
      // precargamos el stock actual exacto → "enviar sin tocar" es un no-op real.
      setAdjustQuantity(String(product.currentStock))
    }
  }

  function clearSelectedProduct() {
    setSelectedProduct(null)
    setSelectedPresentationId(null)
  }

  // Switching presentation changes what a "unit" means (e.g. Unidad → Caja x24),
  // so any quantity already typed is stale — reset it rather than silently
  // reinterpreting it in the new unit. (Excepto el modo "establecer", que
  // siempre se cuenta en unidades base y no depende de la presentación.)
  function handlePresentationChange(id: number | null) {
    setSelectedPresentationId(id)
    if (!selectedProduct) return
    if (actionType === 'adjust' && adjustMode === 'set') return
    setAdjustQuantity('')
    setReturnQuantity('')
    setLossQuantity('')
  }

  // ─── Submit handlers ──────────────────────────────────

  async function handleAdjustStock() {
    if (!storeId || !selectedProduct) return
    const qty = parseQtyInput(adjustQuantity)
    const mode = adjustMode === 'set' ? 'absolute' : 'delta'
    // 'set' (absolute) SIEMPRE se cuenta en unidades base: un total exacto
    // expresado en una presentación no puede representar cantidades que no sean
    // múltiplo de unitsPerPack. 'add' (delta) sí acepta la presentación elegida.
    const effectiveUpp = mode === 'absolute' ? 1 : unitsPerPack
    const err = validateAdjust({ mode, qty, unitsPerPack: effectiveUpp, currentStock: selectedProduct.currentStock })
    if (err) {
      if (err === 'No hay cambio en el stock') toast.info(err)
      else toast.error(err)
      return
    }

    try {
      // El servidor resuelve el delta base (en 'absolute' con el currentStock
      // fresco de la transacción) — el cliente NO resta contra currentStock.
      await adjustment.mutateAsync({
        body: {
          storeId,
          productId: selectedProduct.id,
          presentationId: mode === 'delta' ? selectedPresentation?.id : undefined,
          mode,
          quantity: qty,
          notes: adjustNotes || undefined,
          ...lotBody(),
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
          quantity: qty, // en la unidad elegida — el servidor convierte a base
          notes: returnNotes || undefined,
          ...lotBody(),
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
          quantity: qty, // en la unidad elegida — el servidor convierte a base
          reason: lossReason,
          notes: lossNotes || undefined,
          ...lotBody(),
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
      <DialogContent mobileFullscreen className="sm:max-w-lg backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${config.titleColor}`}>
            {config.icon}
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Step indicator — solo en el flujo con buscador (módulo Inventario) */}
          {!preselected && (
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
          )}

          {/* ─── STEP 1: Product Search ────────────────────── */}
          {!selectedProduct ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Paso 1: Busca y selecciona el producto
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Escribe o escanea el producto..."
                  value={dialogProductSearch}
                  onChange={(e) => setDialogProductSearch(e.target.value)}
                  className="pl-9 pr-10"
                  autoFocus
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  {scanButton}
                </div>
              </div>
              {scannerDialog}

              {/* Product search results */}
              <div className="max-h-[240px] overflow-y-auto rounded-md border">
                {productList.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No hay productos registrados
                  </div>
                ) : dialogFilteredProducts.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No se encontró ningún producto
                  </div>
                ) : (
                  dialogFilteredProducts.map((prod) => (
                    <button
                      key={prod.id}
                      onClick={() => selectProductForAction(prod)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/80 transition-colors border-b last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{prod.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {prod.category && <span>{prod.category.name}</span>}
                          <span className={prod.currentStock <= prod.minStock ? 'text-red-500 font-medium' : ''}>
                            Stock: {formatQty(prod.currentStock)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{formatCurrency(prod.salePrice, currencyCode)}</p>
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
                        {formatQty(selectedProduct.currentStock)} {getUnitOfMeasureLabel(selectedProduct.unitLabel)}(s)
                        {selectedPresentation ? ` · ≈ ${formatQty(currentInSelectedUnit)} ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)}(s)` : ''}
                      </span>
                    </p>
                  </div>
                  {!preselected && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 active:scale-[0.98] transition-all"
                      onClick={clearSelectedProduct}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
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
                      {sortPresentationOptions(selectedProduct).map((option) => {
                        const p = option.presentation
                        return (
                          <SelectItem key={p?.id ?? 'base'} value={p ? String(p.id) : 'base'}>
                            {p ? `${getUnitOfMeasureLabel(p.unitLabel)} ×${option.unitsPerPack}` : getUnitOfMeasureLabel(selectedProduct.unitLabel)}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {selectedPresentation && (
                    <p className="text-xs text-muted-foreground">
                      1 {getUnitOfMeasureLabel(selectedPresentation.unitLabel)} = {selectedPresentation.unitsPerPack} unidades base &middot; disponibles: ≈ {formatQty(currentInSelectedUnit)}
                    </p>
                  )}
                </div>
              )}

              {/* ─── LOTE — SIEMPRE que el producto maneje vencimiento ────── */}
              {tracksExpiration && (
                <div className="space-y-2 rounded-lg border border-amber-300/60 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/10 p-3">
                  <Label className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <Package className="h-3.5 w-3.5" />
                    {lotAsEntry ? 'Lote' : 'Lote afectado'}
                  </Label>

                  {lotAsEntry ? (
                    /* ENTRADA: se escribe el lote. Si coincide con uno existente
                       se suma a ese (y se muestra su vencimiento); si no, se crea
                       con las fechas indicadas. */
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">N.º de lote</Label>
                        <Input
                          className="h-9"
                          list="lot-suggestions"
                          placeholder="Ej: L-2026-014"
                          value={newLotNumber}
                          onChange={(e) => setNewLotNumber(e.target.value)}
                        />
                        <datalist id="lot-suggestions">
                          {productBatches.map((b) => (
                            <option key={b.id} value={b.lotNumber}>
                              {b.expiryDate ? `vence ${new Date(b.expiryDate).toLocaleDateString('es-CO')} · ` : ''}
                              {formatQty(b.quantity)} uds
                            </option>
                          ))}
                        </datalist>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Fecha de vencimiento</Label>
                        <Input
                          type="date"
                          className="h-9"
                          value={matchedBatch?.expiryDate ? matchedBatch.expiryDate.slice(0, 10) : newLotExpiry}
                          onChange={(e) => setNewLotExpiry(e.target.value)}
                          disabled={!!matchedBatch}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fecha de fabricación</Label>
                        <Input
                          type="date"
                          className="h-9"
                          value={matchedBatch?.manufacturingDate ? matchedBatch.manufacturingDate.slice(0, 10) : newLotMfg}
                          onChange={(e) => setNewLotMfg(e.target.value)}
                          disabled={!!matchedBatch}
                        />
                      </div>

                      <p
                        className={`col-span-2 text-[11px] ${
                          matchedBatch
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : newLotNumber.trim()
                              ? 'text-muted-foreground'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {matchedBatch
                          ? `Se sumará al lote «${matchedBatch.lotNumber}» existente — el vencimiento se toma de ese lote.`
                          : newLotNumber.trim()
                            ? `Se creará el lote «${newLotNumber.trim()}».`
                            : 'Opcional. Sin número de lote el stock entra sin trazabilidad por lote.'}
                      </p>
                    </div>
                  ) : (
                    /* SALIDA: de qué lote descontar (auto = el que vence primero) */
                    <Select value={effectiveAffectedLot} onValueChange={setAffectedLot}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automático (el que vence primero)</SelectItem>
                        {productBatches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.lotNumber}
                            {b.expiryDate ? ` · vence ${new Date(b.expiryDate).toLocaleDateString('es-CO')}` : ''}
                            {` · ${formatQty(b.quantity)} uds`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      min={qtyStep}
                      step={qtyStep}
                      max={currentInSelectedUnit}
                      placeholder="Ej: 3"
                      value={lossQuantity}
                      onChange={(e) => setLossQuantity(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Máximo disponible: ≈ {formatQty(currentInSelectedUnit)} {selectedPresentation ? `${getUnitOfMeasureLabel(selectedPresentation.unitLabel)}(s)` : 'unidades'}
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
                      min={qtyStep}
                      step={qtyStep}
                      placeholder="Ej: 5"
                      value={returnQuantity}
                      onChange={(e) => setReturnQuantity(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedPresentation
                        ? `Estas ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)}(s) se SUMARÁN al stock actual (${formatQty(selectedProduct.currentStock)} unidades base)`
                        : `Estas unidades se SUMARÁN al stock actual (${formatQty(selectedProduct.currentStock)})`}
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
                      // "establecer" se cuenta en unidades base → precarga el stock exacto.
                      setAdjustQuantity(v === 'set' ? String(selectedProduct.currentStock) : '')
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
                      {adjustMode === 'set'
                        ? 'Nuevo total (en unidades base)'
                        : `Cantidad a agregar o quitar${selectedPresentation ? ` (en ${getUnitOfMeasureLabel(selectedPresentation.unitLabel)})` : ''}`} *
                    </Label>
                    <Input
                      id="adjust-qty"
                      type="number"
                      min={adjustMode === 'set' ? '0' : undefined}
                      step={adjustMode === 'set' ? qtyStepFor(selectedProduct.unitLabel) : qtyStep}
                      placeholder={adjustMode === 'set' ? 'Ej: 50' : 'Ej: 10 para agregar, -5 para quitar'}
                      value={adjustQuantity}
                      onChange={(e) => setAdjustQuantity(e.target.value)}
                    />
                    {adjustMode === 'set' && adjustQuantity && !isNaN(parseQtyInput(adjustQuantity)) && (() => {
                      const delta = resolveBaseDelta({
                        mode: 'absolute',
                        qty: parseQtyInput(adjustQuantity),
                        unitsPerPack: 1,
                        currentStock: selectedProduct.currentStock,
                      })
                      return (
                        <p className="text-xs text-muted-foreground">
                          Cambio: <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {delta >= 0 ? '+' : ''}{formatQty(delta)} unidades base
                          </span>
                        </p>
                      )
                    })()}
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
                  onClick={() => (preselected ? onOpenChange(false) : clearSelectedProduct())}
                  disabled={actionSubmitting}
                >
                  {preselected ? 'Cancelar' : 'Cambiar producto'}
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
