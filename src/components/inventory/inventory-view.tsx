'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  Plus,
  PackageSearch,
  ArrowDownToLine,
  ArrowUpDown,
  RotateCcw,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ───────────────────────────────────────────────────────

interface Product {
  id: number
  name: string
  sku: string | null
  currentStock: number
  minStock: number
  salePrice: number
  category: { id: number; name: string } | null
}

interface InventoryMovement {
  id: number
  productId: number
  productName: string
  quantity: number
  movementType: string
  notes: string | null
  createdAt: string
}

interface LowStockAlert {
  id: number
  name: string
  currentStock: number
  minStock: number
  salePrice: number
  category: string | null
}

// ─── Constants ───────────────────────────────────────────────────

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
}

const MOVEMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  PURCHASE: <ArrowDownToLine className="h-3.5 w-3.5" />,
  ADJUSTMENT: <ArrowUpDown className="h-3.5 w-3.5" />,
  RETURN: <RotateCcw className="h-3.5 w-3.5" />,
}

// ─── Component ───────────────────────────────────────────────────

export function InventoryView() {
  const { store } = useAuthStore()
  const storeId = store?.id

  // Data state
  const [lowStockProducts, setLowStockProducts] = useState<LowStockAlert[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoadingMovements, setIsLoadingMovements] = useState(true)
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [formProductId, setFormProductId] = useState('')
  const [formMovementType, setFormMovementType] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // Filter state
  const [filterType, setFilterType] = useState<string>('ALL')
  const [filterProduct, setFilterProduct] = useState<string>('ALL')

  // ─── Fetch functions ──────────────────────────────────────

  const fetchLowStock = useCallback(async () => {
    if (!storeId) return
    setIsLoadingAlerts(true)
    try {
      const res = await fetch(`/api/products?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar productos')
      const data: Product[] = await res.json()
      const alerts: LowStockAlert[] = data
        .filter((p) => p.currentStock <= p.minStock)
        .map((p) => ({
          id: p.id,
          name: p.name,
          currentStock: p.currentStock,
          minStock: p.minStock,
          salePrice: p.salePrice,
          category: p.category?.name ?? null,
        }))
      setLowStockProducts(alerts)
    } catch {
      toast.error('Error al cargar alertas de stock')
    } finally {
      setIsLoadingAlerts(false)
    }
  }, [storeId])

  const fetchMovements = useCallback(async () => {
    if (!storeId) return
    setIsLoadingMovements(true)
    try {
      const params = new URLSearchParams({ storeId: String(storeId) })
      if (filterType !== 'ALL') params.set('type', filterType)
      if (filterProduct !== 'ALL') params.set('productId', filterProduct)
      const res = await fetch(`/api/inventory?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar movimientos')
      const data = await res.json()
      setMovements(data)
    } catch {
      toast.error('Error al cargar movimientos')
    } finally {
      setIsLoadingMovements(false)
    }
  }, [storeId, filterType, filterProduct])

  const fetchProducts = useCallback(async () => {
    if (!storeId) return
    setIsLoadingProducts(true)
    try {
      const res = await fetch(`/api/products?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar productos')
      const data = await res.json()
      setProducts(data)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setIsLoadingProducts(false)
    }
  }, [storeId])

  // ─── Effects ──────────────────────────────────────────────

  useEffect(() => {
    fetchLowStock()
    fetchMovements()
    fetchProducts()
  }, [fetchLowStock, fetchMovements, fetchProducts])

  // ─── Handlers ─────────────────────────────────────────────

  function openNewMovementDialog() {
    setFormProductId('')
    setFormMovementType('')
    setFormQuantity('')
    setFormNotes('')
    fetchProducts()
    setDialogOpen(true)
  }

  async function handleSubmitMovement() {
    if (!storeId || !formProductId || !formMovementType || !formQuantity) {
      toast.error('Completa todos los campos requeridos')
      return
    }

    const quantity = parseInt(formQuantity, 10)
    if (isNaN(quantity) || quantity === 0) {
      toast.error('La cantidad debe ser un número mayor a 0')
      return
    }

    // For adjustments, quantity sign determines direction
    // (positive = increase stock, negative = decrease stock)

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId: parseInt(formProductId, 10),
          movementType: formMovementType,
          quantity,
          notes: formNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al registrar movimiento')
      }
      toast.success('Movimiento registrado correctamente')
      setDialogOpen(false)
      fetchMovements()
      fetchLowStock()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar movimiento')
    } finally {
      setIsSubmitting(false)
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return {
      date: format(d, "d MMM yyyy", { locale: es }),
      time: format(d, "HH:mm:ss"),
      full: format(d, "d MMM yyyy, HH:mm", { locale: es }),
    }
  }

  // ─── Filtered movements ──────────────────────────────────

  const filteredMovements = movements

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Section 1: Stock Alerts */}
      <Card className="border-amber-300/50 dark:border-amber-600/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">Alertas de Stock Bajo</CardTitle>
              <CardDescription>Productos que necesitan reabastecimiento</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingAlerts ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : lowStockProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <PackageSearch className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No hay alertas de stock bajo</p>
              <p className="text-xs">Todos los productos tienen stock suficiente</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lowStockProducts.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800/50 dark:bg-amber-950/20"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {item.currentStock} uds
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        min: {item.minStock}
                      </span>
                      {item.category && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {item.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Section 2: Inventory Movements */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Movimientos de Inventario</h2>
            <p className="text-sm text-muted-foreground">Registro de entradas y salidas de productos</p>
          </div>
          <Button onClick={openNewMovementDialog} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Movimiento
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex items-end gap-2 flex-1">
                <Filter className="h-4 w-4 text-muted-foreground mb-2.5" />
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="PURCHASE">Compra</SelectItem>
                      <SelectItem value="ADJUSTMENT">Ajuste</SelectItem>
                      <SelectItem value="RETURN">Devolución</SelectItem>
                      <SelectItem value="SALE">Venta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Producto</Label>
                  <Select value={filterProduct} onValueChange={setFilterProduct}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Movements Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoadingMovements ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <PackageSearch className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No hay movimientos registrados</p>
                <p className="text-xs">Los movimientos aparecerán aquí cuando se registren</p>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Fecha</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-[140px]">Tipo</TableHead>
                      <TableHead className="w-[100px] text-right">Cantidad</TableHead>
                      <TableHead className="hidden md:table-cell">Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.map((m) => {
                      const { full } = formatDate(m.createdAt)
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {full}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {m.productName}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="gap-1.5 text-xs capitalize"
                            >
                              {MOVEMENT_TYPE_ICONS[m.movementType] || null}
                              {MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`text-sm font-semibold ${
                                m.quantity > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {m.quantity > 0 ? '+' : ''}
                              {m.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                            {m.notes || '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Movement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nuevo Movimiento de Inventario
            </DialogTitle>
            <DialogDescription>
              Registra una entrada o salida de producto en el inventario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Product Select */}
            <div className="space-y-2">
              <Label htmlFor="product-select">Producto *</Label>
              <Select value={formProductId} onValueChange={setFormProductId}>
                <SelectTrigger id="product-select">
                  <SelectValue placeholder="Selecciona un producto" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingProducts ? (
                    <SelectItem value="_loading" disabled>Cargando...</SelectItem>
                  ) : (
                    products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} (Stock: {p.currentStock})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Movement Type */}
            <div className="space-y-2">
              <Label htmlFor="movement-type">Tipo de Movimiento *</Label>
              <Select value={formMovementType} onValueChange={setFormMovementType}>
                <SelectTrigger id="movement-type">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASE">
                    <span className="flex items-center gap-2">
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      Compra (entrada)
                    </span>
                  </SelectItem>
                  <SelectItem value="ADJUSTMENT">
                    <span className="flex items-center gap-2">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      Ajuste (+/-)
                    </span>
                  </SelectItem>
                  <SelectItem value="RETURN">
                    <span className="flex items-center gap-2">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Devolución (entrada)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="movement-quantity">Cantidad *</Label>
              <Input
                id="movement-quantity"
                type="number"
                placeholder="Ej: 10 o -5 para ajustes"
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
              />
              {formMovementType === 'ADJUSTMENT' && (
                <p className="text-xs text-muted-foreground">
                  Para ajustes negativos usa un signo menos (ej: -5)
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="movement-notes">Notas (opcional)</Label>
              <Textarea
                id="movement-notes"
                placeholder="Notas adicionales..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmitMovement}
                disabled={isSubmitting || !formProductId || !formMovementType || !formQuantity}
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Registrando...
                  </>
                ) : (
                  'Registrar Movimiento'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
