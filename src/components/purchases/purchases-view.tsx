'use client'

import { useEffect, useState, useCallback } from 'react'
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
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  CalendarDays,
  Package,
  Ban,
  Eye,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProviderOption {
  id: number
  name: string
  isActive: boolean
}

interface ProductOption {
  id: number
  name: string
  isActive: boolean
  currentStock: number
}

interface PurchaseItemRow {
  id: string
  productId: string
  quantity: string
  unitCost: string // in pesos (will convert to cents on save)
}

interface PurchaseItemData {
  id: number
  purchaseId: number
  productId: number
  product: { id: number; name: string }
  quantity: number
  unitCost: number // in centavos
  total: number
}

interface Purchase {
  id: number
  storeId: number
  providerId: number | null
  provider: { id: number; name: string } | null
  invoiceNumber: string | null
  date: string
  notes: string | null
  total: number // in centavos
  status: string
  itemCount: number
  purchaseItems: PurchaseItemData[]
  createdAt: string
  updatedAt: string
}

type StatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED'

// ── Helper ────────────────────────────────────────────────────────────────

function centsToPesos(cents: number): number {
  return Math.round(cents / 100)
}

function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100)
}

// ── Component ──────────────────────────────────────────────────────────────

export function PurchasesView() {
  const { store } = useAuthStore()
  const currencyCode = store?.currencyCode || 'COP'

  // List state
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('none')
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([
    { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' },
  ])
  const [saving, setSaving] = useState(false)

  // Detail dialog state
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null)

  // Cancel dialog state
  const [cancelPurchase, setCancelPurchase] = useState<Purchase | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // ─── Fetch purchases ──────────────────────────────────────────────────

  const fetchPurchases = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: store.id.toString() })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/purchases?${params}`)
      if (!res.ok) throw new Error('Error al cargar compras')
      const data = await res.json()
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

  // ─── Fetch providers and products for create dialog ──────────────────

  async function openCreateDialog() {
    setSelectedProviderId('none')
    setPurchaseInvoiceNumber('')
    setPurchaseNotes('')
    setPurchaseItems([
      { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' },
    ])
    setCreateOpen(true)

    if (!store?.id) return

    // Fetch active providers
    try {
      const res = await fetch(`/api/providers?storeId=${store.id}&active=true`)
      if (res.ok) {
        const data = await res.json()
        setProviders(data)
      }
    } catch {
      // Silently fail
    }

    // Fetch active products
    try {
      const res = await fetch(`/api/products?storeId=${store.id}&active=true`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      }
    } catch {
      // Silently fail
    }
  }

  // ─── Purchase items management ───────────────────────────────────────

  function addItem() {
    setPurchaseItems([
      ...purchaseItems,
      { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' },
    ])
  }

  function removeItem(itemId: string) {
    if (purchaseItems.length <= 1) {
      toast.error('Debe haber al menos un producto')
      return
    }
    setPurchaseItems(purchaseItems.filter((item) => item.id !== itemId))
  }

  function updateItem(itemId: string, field: keyof PurchaseItemRow, value: string) {
    setPurchaseItems(
      purchaseItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    )
  }

  function getLineTotal(item: PurchaseItemRow): number {
    const qty = Number(item.quantity) || 0
    const cost = Number(item.unitCost) || 0
    return qty * cost // in pesos
  }

  function getGrandTotal(): number {
    return purchaseItems.reduce((sum, item) => sum + getLineTotal(item), 0) // in pesos
  }

  // ─── Save purchase ──────────────────────────────────────────────────

  async function handleSavePurchase() {
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }

    // Validate items
    const validItems = purchaseItems.filter((item) => item.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0)

    if (validItems.length === 0) {
      toast.error('Debe agregar al menos un producto con cantidad y costo')
      return
    }

    // Check for duplicate products
    const productIds = validItems.map((item) => item.productId)
    const uniqueIds = new Set(productIds)
    if (uniqueIds.size !== productIds.length) {
      toast.error('No puede agregar el mismo producto más de una vez')
      return
    }

    setSaving(true)
    try {
      const body = {
        storeId: store.id,
        providerId: selectedProviderId !== 'none' ? Number(selectedProviderId) : undefined,
        invoiceNumber: purchaseInvoiceNumber.trim() || undefined,
        notes: purchaseNotes.trim() || undefined,
        items: validItems.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          unitCost: pesosToCents(Number(item.unitCost)),
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
      setCreateOpen(false)
      fetchPurchases()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  // ─── View purchase detail ───────────────────────────────────────────

  async function openDetail(purchase: Purchase) {
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailPurchase(data)
      }
    } catch {
      setDetailPurchase(purchase)
    }
  }

  // ─── Cancel purchase ───────────────────────────────────────────────

  async function handleCancel() {
    if (!cancelPurchase) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/purchases/${cancelPurchase.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al cancelar compra')
      }
      toast.success('Compra cancelada exitosamente')
      setCancelPurchase(null)
      fetchPurchases()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setCancelling(false)
    }
  }

  // ─── Counts ─────────────────────────────────────────────────────────

  const completedCount = purchases.filter((p) => p.status === 'COMPLETED').length
  const cancelledCount = purchases.filter((p) => p.status === 'CANCELLED').length

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header + Action ───────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Compras</h2>
            <p className="text-sm text-muted-foreground">
              {loading
                ? '...'
                : `${completedCount} completada${completedCount !== 1 ? 's' : ''}, ${cancelledCount} cancelada${cancelledCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4" />
          Nueva Compra
        </Button>
      </div>

      {/* ── Search + Filter Bar ────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por notas o proveedor..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {(
                [
                  { key: 'ALL', label: 'Todas' },
                  { key: 'COMPLETED', label: 'Completadas' },
                  { key: 'CANCELLED', label: 'Canceladas' },
                ] as const
              ).map((filter) => (
                <Button
                  key={filter.key}
                  variant={statusFilter === filter.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(filter.key)}
                  className="text-xs"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Purchases Table ────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No se encontraron compras</p>
              <p className="text-sm text-muted-foreground/70">
                {search || statusFilter !== 'ALL'
                  ? 'Intenta con otra búsqueda o filtro'
                  : 'Registra tu primera compra de inventario'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-center">Productos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((purchase) => (
                      <TableRow
                        key={purchase.id}
                        className={purchase.status === 'CANCELLED' ? 'opacity-60' : ''}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {purchase.invoiceNumber ? (
                            <span className="inline-flex items-center gap-1 text-sm font-mono">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {purchase.invoiceNumber}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {purchase.provider?.name || (
                            <span className="text-muted-foreground">Sin proveedor</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            {purchase.itemCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(centsToPesos(purchase.total), currencyCode)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={purchase.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Ver detalle"
                              onClick={() => openDetail(purchase)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {purchase.status === 'COMPLETED' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title="Cancelar compra"
                                onClick={() => setCancelPurchase(purchase)}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {purchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className={`p-4 space-y-3 ${purchase.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">
                          {purchase.provider?.name || 'Sin proveedor'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}
                          {purchase.invoiceNumber && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <FileText className="h-3 w-3" />
                              <span className="font-mono">{purchase.invoiceNumber}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={purchase.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {purchase.itemCount} producto{purchase.itemCount !== 1 ? 's' : ''}
                      </span>
                      <span className="font-semibold text-sm">
                        {formatCurrency(centsToPesos(purchase.total), currencyCode)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => openDetail(purchase)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver detalle
                      </Button>
                      {purchase.status === 'COMPLETED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                          onClick={() => setCancelPurchase(purchase)}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Purchase count ─────────────────────────────────────────── */}
      {!loading && purchases.length > 0 && (
        <p className="text-sm text-muted-foreground text-right">
          {purchases.length} compra{purchases.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CREATE PURCHASE DIALOG                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Compra</DialogTitle>
            <DialogDescription>
              Registra una compra de inventario. Los productos se agregarán al stock automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Provider + Invoice Number row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="purchase-provider">Proveedor</Label>
                <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar proveedor (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-invoice" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  N° Factura
                </Label>
                <Input
                  id="purchase-invoice"
                  placeholder="Ej: FAC-2025-001"
                  value={purchaseInvoiceNumber}
                  onChange={(e) => setPurchaseInvoiceNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Número de factura del proveedor</p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="purchase-notes">Notas</Label>
              <Textarea
                id="purchase-notes"
                placeholder="Notas adicionales sobre la compra..."
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* Items header */}
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Productos</Label>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar producto
              </Button>
            </div>

            {/* Items list */}
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {purchaseItems.map((item, index) => (
                <Card key={item.id} className="p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px_140px_auto] items-end">
                    {/* Product select */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Producto {index + 1} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={item.productId}
                        onValueChange={(val) => updateItem(item.id, 'productId', val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products
                            .filter(
                              (p) =>
                                !purchaseItems.some(
                                  (pi) => pi.id !== item.id && pi.productId === String(p.id),
                                ),
                            )
                            .map((product) => (
                              <SelectItem key={product.id} value={String(product.id)}>
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{product.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    (Stock: {product.currentStock})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quantity */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Cantidad *</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        className="text-center"
                      />
                    </div>

                    {/* Unit cost */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Costo Unit. ($) *</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                          $
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={item.unitCost}
                          onChange={(e) => updateItem(item.id, 'unitCost', e.target.value)}
                          className="pl-6"
                        />
                      </div>
                    </div>

                    {/* Line total + Remove */}
                    <div className="flex items-center gap-2 pb-0.5">
                      <span className="text-sm font-medium whitespace-nowrap min-w-[80px] text-right">
                        {getLineTotal(item) > 0
                          ? formatCurrency(getLineTotal(item), currencyCode)
                          : '—'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeItem(item.id)}
                        disabled={purchaseItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Separator />

            {/* Grand total */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="font-semibold">Total de la Compra</span>
              <span className="text-xl font-bold">
                {formatCurrency(getGrandTotal(), currencyCode)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSavePurchase} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar Compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DETAIL DIALOG                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailPurchase} onOpenChange={(open) => !open && setDetailPurchase(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Compra #{detailPurchase?.id}</DialogTitle>
            <DialogDescription>
              {detailPurchase
                ? format(new Date(detailPurchase.date), "EEEE d 'de' MMMM, yyyy", {
                    locale: es,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>

          {detailPurchase && (
            <div className="space-y-4">
              {/* Info row */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Proveedor</p>
                  <p className="font-medium">
                    {detailPurchase.provider?.name || 'Sin proveedor'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  <StatusBadge status={detailPurchase.status} />
                </div>
              </div>

              {/* Invoice + Notes row */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    N° Factura
                  </p>
                  <p className="font-medium font-mono">
                    {detailPurchase.invoiceNumber || 'Sin factura'}
                  </p>
                </div>
                {detailPurchase.notes ? (
                  <div>
                    <p className="text-muted-foreground">Notas</p>
                    <p className="text-sm">{detailPurchase.notes}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground">Notas</p>
                    <p className="text-sm text-muted-foreground/50">Sin notas</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Items table */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailPurchase.purchaseItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-medium">{item.product.name}</TableCell>
                        <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(centsToPesos(item.unitCost), currencyCode)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(centsToPesos(item.total), currencyCode)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold">
                  {formatCurrency(centsToPesos(detailPurchase.total), currencyCode)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CANCEL CONFIRMATION                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AlertDialog
        open={!!cancelPurchase}
        onOpenChange={(open) => !open && setCancelPurchase(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar compra #{cancelPurchase?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará la compra por{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(
                  centsToPesos(cancelPurchase?.total || 0),
                  currencyCode,
                )}
              </span>{' '}
              {cancelPurchase?.provider?.name
                ? `del proveedor "${cancelPurchase.provider.name}"`
                : ''}
              {cancelPurchase?.invoiceNumber
                ? ` (Factura: ${cancelPurchase.invoiceNumber})`
                : ''}
              . El stock de los productos se reducirá automáticamente. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelando...' : 'Sí, cancelar compra'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
      >
        Completada
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800"
    >
      Cancelada
    </Badge>
  )
}
