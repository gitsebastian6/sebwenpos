'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
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
  Download,
  SlidersHorizontal,
  Search,
  X,
  Loader2,
  TrendingDown,
  ArrowLeftRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { KPIBar } from '@/components/shared/kpi-bar'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────

interface Product {
  id: number
  name: string
  sku: string | null
  currentStock: number
  minStock: number
  salePrice: number
  costPrice: number
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
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  LOSS: 'Pérdida',
}

const MOVEMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  PURCHASE: <ArrowDownToLine className="h-3.5 w-3.5" />,
  SALE: <TrendingDown className="h-3.5 w-3.5" />,
  ADJUSTMENT: <ArrowUpDown className="h-3.5 w-3.5" />,
  RETURN: <RotateCcw className="h-3.5 w-3.5" />,
  LOSS: <AlertTriangle className="h-3.5 w-3.5" />,
}

const LOSS_REASONS = [
  { value: 'VENCIDO', label: 'Producto vencido' },
  { value: 'DANADO', label: 'Producto dañado' },
  { value: 'ROBO', label: 'Robo o hurto' },
  { value: 'DERRAME', label: 'Derrame o rotura' },
  { value: 'INVENTARIO', label: 'Diferencia de inventario' },
  { value: 'OTRO', label: 'Otro motivo' },
]

type ActionType = 'loss' | 'return' | 'adjust'

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

  // Search & filter for product list
  const [productSearch, setProductSearch] = useState('')

  // Filter state for movements
  const [filterType, setFilterType] = useState<string>('ALL')
  const [filterProduct, setFilterProduct] = useState<string>('ALL')

  // ─── Action Dialog State ────────────────────────────
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<ActionType>('loss')
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // Product search inside dialog
  const [dialogProductSearch, setDialogProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

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

  // ─── Computed: filtered products for list ──────────────────────
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products
    const q = productSearch.toLowerCase().trim()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category?.name && p.category.name.toLowerCase().includes(q))
    )
  }, [products, productSearch])

  // ─── Computed: filtered products for dialog search ─────────────
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

  // ─── Fetch functions ──────────────────────────────────────

  const fetchLowStock = useCallback(async () => {
    if (!storeId) return
    setIsLoadingAlerts(true)
    try {
      const res = await fetch(`/api/products?storeId=${storeId}`)
      if (!res.ok) throw new Error()
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
      if (!res.ok) throw new Error()
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
      if (!res.ok) throw new Error()
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

  // ─── Helpers ────────────────────────────────────────────

  function refreshAll() {
    fetchLowStock()
    fetchMovements()
    fetchProducts()
  }

  // ─── Open Action Dialog ─────────────────────────────────

  function openActionDialog(type: ActionType) {
    setActionType(type)
    setSelectedProduct(null)
    setDialogProductSearch('')
    setAdjustMode('set')
    setAdjustQuantity('')
    setAdjustNotes('')
    setReturnQuantity('')
    setReturnNotes('')
    setLossQuantity('')
    setLossReason('VENCIDO')
    setLossNotes('')
    setActionDialogOpen(true)
  }

  function selectProductForAction(product: Product) {
    setSelectedProduct(product)
    setDialogProductSearch('')
    if (actionType === 'adjust') {
      setAdjustQuantity(String(product.currentStock))
    }
  }

  function clearSelectedProduct() {
    setSelectedProduct(null)
  }

  // ─── Submit Handlers ────────────────────────────────────

  async function handleAdjustStock() {
    if (!storeId || !selectedProduct) return
    const qty = parseInt(adjustQuantity, 10)
    if (isNaN(qty) || qty < 0) {
      toast.error('La cantidad debe ser un número positivo')
      return
    }

    const currentStock = selectedProduct.currentStock
    let finalQuantity: number
    if (adjustMode === 'set') {
      finalQuantity = qty - currentStock
    } else {
      finalQuantity = qty
    }

    if (finalQuantity === 0) {
      toast.info('No hay cambio en el stock')
      return
    }

    setActionSubmitting(true)
    try {
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId: selectedProduct.id,
          quantity: finalQuantity,
          notes: adjustNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al ajustar stock')
      }
      toast.success('Stock ajustado correctamente')
      setActionDialogOpen(false)
      refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al ajustar stock')
    } finally {
      setActionSubmitting(false)
    }
  }

  async function handleReturn() {
    if (!storeId || !selectedProduct) return
    const qty = parseInt(returnQuantity, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    setActionSubmitting(true)
    try {
      const res = await fetch('/api/inventory/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId: selectedProduct.id,
          quantity: qty,
          notes: returnNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al registrar devolución')
      }
      toast.success('Devolución registrada correctamente')
      setActionDialogOpen(false)
      refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar devolución')
    } finally {
      setActionSubmitting(false)
    }
  }

  async function handleLoss() {
    if (!storeId || !selectedProduct) return
    const qty = parseInt(lossQuantity, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    if (!lossReason) {
      toast.error('Selecciona el motivo de la pérdida')
      return
    }

    setActionSubmitting(true)
    try {
      const res = await fetch('/api/inventory/losses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId: selectedProduct.id,
          quantity: qty,
          reason: lossReason,
          notes: lossNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al registrar pérdida')
      }
      toast.success('Pérdida registrada correctamente')
      setActionDialogOpen(false)
      refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar pérdida')
    } finally {
      setActionSubmitting(false)
    }
  }

  function handleActionSubmit() {
    if (actionType === 'adjust') handleAdjustStock()
    else if (actionType === 'return') handleReturn()
    else if (actionType === 'loss') handleLoss()
  }

  // ─── Excel Export ───────────────────────────────────────

  function handleExportMovementsExcel() {
    if (movements.length === 0) {
      toast.error('No hay movimientos para exportar')
      return
    }
    const rows = movements.map((m, i) => ({
      '#': i + 1,
      'Fecha': format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      'Producto': m.productName,
      'Tipo': MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType,
      'Cantidad': m.quantity,
      'Notas': m.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
    const fileName = `Movimientos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`Archivo ${fileName} descargado`)
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return format(d, "d MMM yyyy, HH:mm", { locale: es })
  }

  // ─── Action dialog config ──────────────────────────────

  const actionConfig = {
    loss: {
      title: 'Registrar Pérdida de Producto',
      description: 'Registra productos que se vencieron, dañaron, robaron o perdieron por cualquier motivo.',
      icon: <AlertTriangle className="h-5 w-5" />,
      submitLabel: 'Registrar Pérdida',
      submitVariant: 'destructive' as const,
      color: 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20',
    },
    return: {
      title: 'Registrar Devolución de Producto',
      description: 'Registra productos que vuelven al inventario (devoluciones de clientes o proveedores).',
      icon: <RotateCcw className="h-5 w-5" />,
      submitLabel: 'Registrar Devolución',
      submitVariant: 'default' as const,
      color: 'border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20',
    },
    adjust: {
      title: 'Ajustar Inventario',
      description: 'Corrige el stock de un producto. Puedes establecer una cantidad exacta o agregar/quitar unidades.',
      icon: <SlidersHorizontal className="h-5 w-5" />,
      submitLabel: 'Ajustar Stock',
      submitVariant: 'default' as const,
      color: 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20',
    },
  }

  // ─── Render ───────────────────────────────────────────────

  const config = actionConfig[actionType]

  return (
    <div className="space-y-6">
      <KPIBar context="inventory" />

      {/* ═══════════════════════════════════════════════════════════
          SECTION: ACCIONES RÁPIDAS - 3 BIG VISIBLE CARDS
          ═══════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Acciones de Inventario</h2>
        <p className="text-sm text-muted-foreground mb-4">
          ¿Qué necesitas hacer? Selecciona una opción:
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* LOSS CARD */}
          <button
            onClick={() => openActionDialog('loss')}
            className="group relative flex flex-col items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 p-6 text-center transition-all hover:border-red-400 hover:bg-red-100/70 dark:border-red-900/60 dark:bg-red-950/30 dark:hover:border-red-700 dark:hover:bg-red-950/50"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/60 transition-transform group-hover:scale-110">
              <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-red-700 dark:text-red-300">Registrar Pérdida</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
                Vencido, dañado, robo, derrame...
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
              Haz clic aquí
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </span>
          </button>

          {/* RETURN CARD */}
          <button
            onClick={() => openActionDialog('return')}
            className="group relative flex flex-col items-center gap-3 rounded-xl border-2 border-sky-200 bg-sky-50 p-6 text-center transition-all hover:border-sky-400 hover:bg-sky-100/70 dark:border-sky-900/60 dark:bg-sky-950/30 dark:hover:border-sky-700 dark:hover:bg-sky-950/50"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/60 transition-transform group-hover:scale-110">
              <RotateCcw className="h-7 w-7 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="font-semibold text-sky-700 dark:text-sky-300">Registrar Devolución</p>
              <p className="text-xs text-sky-600/70 dark:text-sky-400/70 mt-1">
                Devoluciones de clientes o proveedores
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400">
              Haz clic aquí
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </span>
          </button>

          {/* ADJUST CARD */}
          <button
            onClick={() => openActionDialog('adjust')}
            className="group relative flex flex-col items-center gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-6 text-center transition-all hover:border-amber-400 hover:bg-amber-100/70 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:border-amber-700 dark:hover:bg-amber-950/50"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60 transition-transform group-hover:scale-110">
              <SlidersHorizontal className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-300">Ajustar Inventario</p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                Corregir stock, conteo físico...
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              Haz clic aquí
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </span>
          </button>
        </div>
      </div>

      <Separator />

      {/* ═══════════════════════════════════════════════════════════
          SECTION: ALERTAS DE STOCK BAJO
          ═══════════════════════════════════════════════════════════ */}
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
                      <span className="text-xs text-muted-foreground">min: {item.minStock}</span>
                      {item.category && (
                        <>
                          <span className="text-xs text-muted-foreground">&middot;</span>
                          <span className="text-xs text-muted-foreground truncate">{item.category}</span>
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

      {/* ═══════════════════════════════════════════════════════════
          SECTION: INVENTARIO DE PRODUCTOS (with search bar)
          ═══════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Inventario de Productos</CardTitle>
              <CardDescription>Lista completa con stock actual</CardDescription>
            </div>
            {!isLoadingProducts && (
              <span className="text-sm text-muted-foreground">
                {filteredProducts.length} de {products.length} producto{products.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto por nombre, SKU o categoría..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9"
            />
            {productSearch && (
              <button
                onClick={() => setProductSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Product table */}
          {isLoadingProducts ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <PackageSearch className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">
                {productSearch ? 'No se encontraron productos' : 'No hay productos registrados'}
              </p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right hidden md:table-cell">P. Venta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium text-sm">
                        <div>
                          <span className="truncate">{product.name}</span>
                          {product.sku && (
                            <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {product.category ? (
                          <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={product.currentStock <= product.minStock ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                          {product.currentStock}
                        </span>
                        {product.currentStock <= product.minStock && product.currentStock > 0 && (
                          <AlertTriangle className="inline-block h-3 w-3 ml-1 text-amber-500" />
                        )}
                        {product.currentStock === 0 && (
                          <AlertTriangle className="inline-block h-3 w-3 ml-1 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell text-sm">
                        {formatCurrency(product.salePrice, store?.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ═══════════════════════════════════════════════════════════
          SECTION: MOVIMIENTOS DE INVENTARIO
          ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">Movimientos de Inventario</h2>
            <p className="text-sm text-muted-foreground">Historial de entradas y salidas</p>
          </div>
          <div className="hidden sm:block flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportMovementsExcel}
              disabled={isLoadingMovements || movements.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-wrap items-end gap-2 flex-1">
                <Filter className="h-4 w-4 text-muted-foreground mb-2.5" />
                <div className="flex-1 min-w-[140px] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="PURCHASE">Compra</SelectItem>
                      <SelectItem value="SALE">Venta</SelectItem>
                      <SelectItem value="ADJUSTMENT">Ajuste</SelectItem>
                      <SelectItem value="RETURN">Devolución</SelectItem>
                      <SelectItem value="LOSS">Pérdida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px] space-y-1.5">
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
            ) : movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <PackageSearch className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No hay movimientos registrados</p>
                <p className="text-xs">Los movimientos aparecerán aquí cuando registres pérdidas, devoluciones o ajustes</p>
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
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(m.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {m.productName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1.5 text-xs capitalize">
                            {MOVEMENT_TYPE_ICONS[m.movementType] || null}
                            {MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-semibold ${m.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {m.quantity > 0 ? '+' : ''}{m.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                          {m.notes || '\u2014'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DIALOG: ACCIÓN (Pérdida / Devolución / Ajuste)
          Step 1: Buscar producto
          Step 2: Completar formulario
          ═══════════════════════════════════════════════════════════ */}
      <Dialog open={actionDialogOpen} onOpenChange={(open) => { if (!open) setActionDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${actionType === 'loss' ? 'text-red-600 dark:text-red-400' : actionType === 'return' ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
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
                              Stock: {product.currentStock}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">{formatCurrency(product.salePrice, store?.currencyCode)}</p>
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
                        {selectedProduct.category?.name || 'Sin categoría'} &middot; Stock actual: <span className="font-semibold text-foreground">{selectedProduct.currentStock} uds</span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={clearSelectedProduct}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* ─── LOSS FORM ──────────────────────────────── */}
                {actionType === 'loss' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="loss-qty">¿Cuántas unidades se perdieron? *</Label>
                      <Input
                        id="loss-qty"
                        type="number"
                        min="1"
                        max={selectedProduct.currentStock}
                        placeholder="Ej: 3"
                        value={lossQuantity}
                        onChange={(e) => setLossQuantity(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Máximo disponible: {selectedProduct.currentStock} unidades
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>¿Por qué se perdió? *</Label>
                      <Select value={lossReason} onValueChange={setLossReason}>
                        <SelectTrigger>
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
                        placeholder="Ej: 5"
                        value={returnQuantity}
                        onChange={(e) => setReturnQuantity(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Estas unidades se SUMARÁN al stock actual ({selectedProduct.currentStock})
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
                          setAdjustQuantity(String(selectedProduct.currentStock))
                        } else {
                          setAdjustQuantity('')
                        }
                      }}>
                        <SelectTrigger className="h-9">
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
                        {adjustMode === 'set' ? 'Nueva cantidad total' : 'Cantidad a agregar o quitar'} *
                      </Label>
                      <Input
                        id="adjust-qty"
                        type="number"
                        min={adjustMode === 'set' ? '0' : undefined}
                        placeholder={adjustMode === 'set' ? 'Ej: 50' : 'Ej: 10 para agregar, -5 para quitar'}
                        value={adjustQuantity}
                        onChange={(e) => setAdjustQuantity(e.target.value)}
                      />
                      {adjustMode === 'set' && adjustQuantity && (
                        <p className="text-xs text-muted-foreground">
                          Cambio: <span className={parseInt(adjustQuantity) - selectedProduct.currentStock >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {parseInt(adjustQuantity) - selectedProduct.currentStock >= 0 ? '+' : ''}
                            {parseInt(adjustQuantity) - selectedProduct.currentStock} unidades
                          </span>
                        </p>
                      )}
                      {adjustMode === 'add' && (
                        <p className="text-xs text-muted-foreground">
                          Usa valores positivos para agregar o negativos para quitar
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
                    disabled={actionSubmitting || (actionType === 'loss' ? !lossQuantity || !lossReason : actionType === 'return' ? !returnQuantity : !adjustQuantity)}
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
    </div>
  )
}
