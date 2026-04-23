'use client'

import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useImportProducts } from '@/hooks/api/use-products'
import { useProviders } from '@/hooks/api/use-providers'
import { useTaxes } from '@/hooks/api/use-taxes'
import { useCurrentSubscription } from '@/hooks/api/use-subscription'
import { useKardex, useInventoryAdjustment, useInventoryLoss, useInventoryReturn } from '@/hooks/api/use-inventory'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/api/use-categories'
import { useAppStore } from '@/stores/app-store'
import { formatCurrency } from '@/lib/auth'
import type { Product, Category, TraceMovement } from '@/types'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ProductImage } from '@/components/ui/product-image'
import { getCategoryIconByName } from '@/components/ui/category-icon-picker'
import { printReport, printThermal80mm } from '@/lib/print-report'
import { KPIBar } from '@/components/shared/kpi-bar'
import { ProductFormDialog } from './product-form-dialog'
import { ImportProductsDialog } from './import-products-dialog'
import type { ImportResult } from './import-products-dialog'
import {
  AdjustStockDialog,
  LossDialog,
  ReturnDialog,
  TraceDialog,
  CategoryFormDialog,
  DeleteConfirmDialog,
} from './products-action-dialogs'
import {
  PackageSearch,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Package,
  Tags,
  AlertTriangle,
  Truck,
  Printer,
  FileSpreadsheet,
  SlidersHorizontal,
  RotateCcw,
  Route,
  Percent,
  Shield,
  Upload,
} from 'lucide-react'

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProductsView() {
  const { store } = useAuthStore()
  const { setView } = useAppStore()

  // ─── Mutation hooks ──────────────────────────────────────────────────
  const createProductMut = useCreateProduct()
  const updateProductMut = useUpdateProduct()
  const deleteProductMut = useDeleteProduct()
  const createCategoryMut = useCreateCategory()
  const updateCategoryMut = useUpdateCategory()
  const deleteCategoryMut = useDeleteCategory()
  const importProductsMut = useImportProducts()

  // ─── TanStack Query — Support Data ─────────────────────────────────────
  const providersQuery = useProviders(store?.id, { active: true })
  const taxesQuery = useTaxes(store?.id, { isActive: true })
  const subscriptionQuery = useCurrentSubscription(store?.id)

  const providers = providersQuery.data ?? []
  const taxRates = taxesQuery.data ?? []
  const subscriptionLoading = subscriptionQuery.isLoading
  const planName = subscriptionQuery.data?.planName ?? null
  const maxProducts = useMemo(() => {
    const limit = subscriptionQuery.data?.planLimits?.maxProducts
    if (limit != null && limit !== -1) return limit
    return null
  }, [subscriptionQuery.data?.planLimits?.maxProducts])

  // ─── Filter / Sort State ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default')

  // ─── TanStack Query Hooks ───────────────────────────────────────────────
  const productsQuery = useProducts(store?.id, {
    search: searchQuery || undefined,
    categoryId: categoryFilter,
    active: activeFilter,
  })
  const categoriesQuery = useCategories(store?.id)

  const products = productsQuery.data?.data ?? []
  const productsLoading = productsQuery.isLoading
  const categories = categoriesQuery.data ?? []
  const categoriesLoading = categoriesQuery.isLoading

  // ─── Dialog Visibility ─────────────────────────────────────────────────
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categorySaving, setCategorySaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'product' | 'category'; item: Product | Category } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [lossDialogOpen, setLossDialogOpen] = useState(false)
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [traceDialogOpen, setTraceDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // ─── Action Dialog Props ───────────────────────────────────────────────
  const [adjustProductId, setAdjustProductId] = useState<number | null>(null)
  const [adjustProductName, setAdjustProductName] = useState('')
  const [adjustCurrentStock, setAdjustCurrentStock] = useState(0)

  const [lossProductId, setLossProductId] = useState<number | null>(null)
  const [lossProductName, setLossProductName] = useState('')

  const [returnProductId, setReturnProductId] = useState<number | null>(null)
  const [returnProductName, setReturnProductName] = useState('')

  const [traceProductId, setTraceProductId] = useState<number | null>(null)
  const [traceProductName, setTraceProductName] = useState('')
  const traceMovements = (kardexQuery.data ?? []) as TraceMovement[]
  const traceLoading = kardexQuery.isLoading

  const [importing, setImporting] = useState(false)

  // ─── TanStack Query — Inventory Mutations ────────────────────────────────
  const adjustStockMut = useInventoryAdjustment()
  const lossMut = useInventoryLoss()
  const returnMut = useInventoryReturn()
  const actionSubmitting = adjustStockMut.isPending || lossMut.isPending || returnMut.isPending

  // ─── TanStack Query — Kardex (trace) ────────────────────────────────────
  const kardexQuery = useKardex(traceProductId, store?.id)

  // ─── Product Handlers ──────────────────────────────────────────────────

  function openNewProductDialog() {
    setEditingProduct(null)
    setProductDialogOpen(true)
  }

  function openEditProductDialog(product: Product) {
    setEditingProduct(product)
    setProductDialogOpen(true)
  }

  async function handleSaveProduct(body: Record<string, unknown>, isEditing: boolean) {
    if (!store?.id) return
    if (isEditing && editingProduct) {
      await updateProductMut.mutateAsync({ id: editingProduct.id, body })
    } else {
      await createProductMut.mutateAsync({ body })
    }
    toast.success(isEditing ? 'Producto actualizado' : 'Producto creado')
  }

  async function handleToggleProduct(product: Product) {
    try {
      await updateProductMut.mutateAsync({ id: product.id, body: { isActive: !product.isActive } })
      toast.success(product.isActive ? 'Producto desactivado' : 'Producto activado')
    } catch {
      toast.error('Error al cambiar estado del producto')
    }
  }

  // ─── Category Handlers ─────────────────────────────────────────────────

  function openNewCategoryDialog() {
    setEditingCategory(null)
    setCategoryDialogOpen(true)
  }

  function openEditCategoryDialog(category: Category) {
    setEditingCategory(category)
    setCategoryDialogOpen(true)
  }

  async function handleSaveCategory(name: string, icon: string, isEditing: boolean) {
    if (!store?.id) return
    setCategorySaving(true)
    try {
      if (isEditing && editingCategory) {
        await updateCategoryMut.mutateAsync({ id: editingCategory.id, body: { name, icon: icon || null } })
      } else {
        await createCategoryMut.mutateAsync({ body: { storeId: store.id, name, icon: icon || null } })
      }
      toast.success(isEditing ? 'Categoría actualizada' : 'Categoría creada')
      setCategoryDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar categoría')
    } finally {
      setCategorySaving(false)
    }
  }

  // ─── Delete Handler ────────────────────────────────────────────────────

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'product') {
        await deleteProductMut.mutateAsync({ id: deleteTarget.item.id })
      } else {
        await deleteCategoryMut.mutateAsync({ id: deleteTarget.item.id })
      }
      toast.success(
        deleteTarget.type === 'product'
          ? 'Producto eliminado'
          : 'Categoría eliminada'
      )
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Quick Action Handlers ────────────────────────────────────────────

  function openAdjustStockDialog(productId: number, name: string, currentStock: number) {
    setAdjustProductId(productId)
    setAdjustProductName(name)
    setAdjustCurrentStock(currentStock)
    setAdjustDialogOpen(true)
  }

  function openLossDialog(productId: number, name: string) {
    setLossProductId(productId)
    setLossProductName(name)
    setLossDialogOpen(true)
  }

  function openReturnDialog(productId: number, name: string) {
    setReturnProductId(productId)
    setReturnProductName(name)
    setReturnDialogOpen(true)
  }

  function openTraceDialog(productId: number, name: string) {
    setTraceProductName(name)
    setTraceProductId(productId)
    setTraceDialogOpen(true)
  }

  async function handleAdjustStock(newStock: number, notes: string) {
    if (!store?.id || !adjustProductId) return
    const diff = newStock - adjustCurrentStock
    if (diff === 0) { toast.info('Sin cambios'); return }
    try {
      await adjustStockMut.mutateAsync({ body: { storeId: store.id, productId: adjustProductId, quantity: diff, notes: notes || undefined } })
      toast.success('Stock ajustado')
      setAdjustDialogOpen(false)
    } catch { toast.error('Error al ajustar stock') }
  }

  async function handleLoss(quantity: number, reason: string, notes: string) {
    if (!store?.id || !lossProductId) return
    try {
      await lossMut.mutateAsync({ body: { storeId: store.id, productId: lossProductId, quantity, reason, notes: notes || undefined } })
      toast.success('Pérdida registrada')
      setLossDialogOpen(false)
    } catch { toast.error('Error al registrar pérdida') }
  }

  async function handleReturn(quantity: number, notes: string) {
    if (!store?.id || !returnProductId) return
    try {
      await returnMut.mutateAsync({ body: { storeId: store.id, productId: returnProductId, quantity, notes: notes || undefined } })
      toast.success('Devolución registrada')
      setReturnDialogOpen(false)
    } catch { toast.error('Error al registrar devolución') }
  }

  // ─── Import Handler ────────────────────────────────────────────────────

  async function handleImportProducts(file: File): Promise<ImportResult | null> {
    if (!store?.id) return null
    setImporting(true)
    try {
      const data = await importProductsMut.mutateAsync({ file })
      if (data.imported > 0) {
        providersQuery.refetch()
      }
      return data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar productos')
      return null
    } finally {
      setImporting(false)
    }
  }

  function handleImportDialogOpenChange(open: boolean) {
    setImportDialogOpen(open)
    if (!open) {
      // Refresh providers when closing — import may have created new providers
      providersQuery.refetch()
    }
  }

  // ─── Print Products ──────────────────────────────────────────────────

  function handlePrintProducts(thermal = false) {
    const currencyCode = store?.currencyCode || 'COP'
    const activeFilterLabel = activeFilter === 'all' ? 'Todos' : activeFilter === 'true' ? 'Activos' : 'Inactivos'
    const categoryLabel = categoryFilter === 'all' ? 'Todas las categorías' : categories.find(c => String(c.id) === categoryFilter)?.name || ''
    const subtitle = searchQuery || categoryFilter !== 'all' || activeFilter !== 'all'
      ? `${searchQuery ? `"${searchQuery}" · ` : ''}${categoryFilter !== 'all' ? `${categoryLabel} · ` : ''}${activeFilterLabel}`
      : 'Todos los productos'

    if (thermal) {
      const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
      lines.push({ left: subtitle, separator: true })
      lines.push({ left: 'SKU  PRODUCTO', right: 'P.VTA', bold: true, separator: true })
      filteredProducts.forEach(p => {
        const sku = (p.sku || '---').padEnd(6, ' ').slice(0, 6)
        const name = p.name.length > 16 ? p.name.slice(0, 16) + '..' : p.name.padEnd(18, ' ')
        lines.push({
          left: `${sku} ${name} (${p.currentStock})`,
          right: formatCurrency(p.salePrice, currencyCode),
        })
      })
      lines.push({ left: '────────────────────────────────', separator: false })
      lines.push({ left: `TOTAL: ${filteredProducts.length} productos`, bold: true })
      printThermal80mm({
        title: 'LISTADO DE PRODUCTOS',
        lines,
        footer: `Generado: ${new Date().toLocaleDateString('es-CO')}`,
      })
    } else {
      printReport({
        title: 'Reporte de Productos',
        subtitle: `Filtros: ${subtitle}`,
        headers: ['#', 'Nombre', 'SKU', 'Proveedor', 'Categoría', 'P. Compra', 'P. Venta', 'Stock', 'Estado'],
        columnAligns: ['center', 'left', 'center', 'left', 'left', 'right', 'right', 'center', 'center'],
        columnWidths: ['30px', '1fr', '70px', '120px', '100px', '90px', '90px', '50px', '70px'],
        rows: filteredProducts.map((p, i) => [
          i + 1,
          p.name,
          p.sku || '—',
          p.provider?.name || '—',
          p.category?.name || '—',
          p.costPrice ? formatCurrency(p.costPrice, currencyCode) : '—',
          formatCurrency(p.salePrice, currencyCode),
          p.currentStock,
          p.isActive ? 'Activo' : 'Inactivo',
        ]) as unknown as { [key: string]: string | number | null | undefined }[][],
        footer: `Total: ${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''}`,
        orientation: 'landscape',
      })
    }
  }

  // ─── Filtered & Sorted Products ──────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    if (!Array.isArray(products)) return []
    let result = products
    // Apply plan limit: only show maxProducts items
    if (maxProducts !== null && result.length > maxProducts) {
      result = result.slice(0, maxProducts)
    }
    if (sortOrder === 'az') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'es-CO'))
    } else if (sortOrder === 'za') {
      result = [...result].sort((a, b) => b.name.localeCompare(a.name, 'es-CO'))
    }
    return result
  }, [products, maxProducts, sortOrder])

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <KPIBar context="products" />

      <Tabs defaultValue="products" className="w-full">
        <TabsList>
          <TabsTrigger value="products" className="gap-2">
            <Package className="h-4 w-4" />
            <span>Productos</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <Tags className="h-4 w-4" />
            <span>Categorías</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── PRODUCTS TAB ──────────────────────────────────────────── */}
        <TabsContent value="products" className="mt-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] sm:min-w-0 sm:flex-none sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
                />
              </div>
              {/* Category filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.filter(c => c.id && c.name).map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Active filter */}
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[120px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Activos</SelectItem>
                  <SelectItem value="false">Inactivos</SelectItem>
                </SelectContent>
              </Select>
              {/* Sort toggle */}
              <div className="flex items-center gap-1">
                <Button
                  variant={sortOrder === 'default' ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 px-2.5 text-xs"
                  onClick={() => setSortOrder('default')}
                >
                  Recientes
                </Button>
                <Button
                  variant={sortOrder === 'az' ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 px-2.5 text-xs"
                  onClick={() => setSortOrder('az')}
                >
                  A→Z
                </Button>
                <Button
                  variant={sortOrder === 'za' ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 px-2.5 text-xs"
                  onClick={() => setSortOrder('za')}
                >
                  Z→A
                </Button>
              </div>
              {/* Quick module shortcuts */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:hover:bg-emerald-950/40"
                  onClick={() => setView('purchases')}
                >
                  <PackageSearch className="h-3.5 w-3.5" />
                  <span>Compras</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:hover:bg-amber-950/40"
                  onClick={() => setView('inventory')}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Inventario</span>
                </Button>
              </div>
              {/* Spacer */}
              <div className="hidden sm:block flex-1" />
              {/* Actions */}
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={productsLoading || filteredProducts.length === 0}
                      className="gap-1.5"
                    >
                      <Printer className="h-4 w-4" />
                      <span>Imprimir</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handlePrintProducts(false)}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Impresora Normal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrintProducts(true)}>
                      <Printer className="h-4 w-4 mr-2" />
                      Térmica 80mm
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setImportDialogOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  <span>Importar Excel</span>
                </Button>
                <Button onClick={openNewProductDialog} size="sm" className="gap-1.5 active:scale-[0.98] transition-all">
                  <Plus className="h-4 w-4" />
                  <span>Nuevo Producto</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Nombre</TableHead>
                      <TableHead className="min-w-[80px]">SKU</TableHead>
                      <TableHead className="min-w-[100px]">INVIMA</TableHead>
                      <TableHead className="min-w-[80px]">Proveedor</TableHead>
                      <TableHead className="min-w-[80px]">Categoría</TableHead>
                      <TableHead className="text-right min-w-[80px]">P. Compra</TableHead>
                      <TableHead className="text-right min-w-[80px]">P. Venta</TableHead>
                      <TableHead className="min-w-[60px]">IVA</TableHead>
                      <TableHead className="text-right min-w-[60px]">Comisión</TableHead>
                      <TableHead className="text-right min-w-[50px]">Stock</TableHead>
                      <TableHead className="min-w-[60px]">Estado</TableHead>
                      <TableHead className="text-center w-[50px] sticky right-0 bg-background z-10">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-48 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <Package className="h-16 w-16 text-muted-foreground/30 mb-3 animate-pulse" />
                            <p className="text-muted-foreground font-medium">No se encontraron productos</p>
                            <p className="text-sm text-muted-foreground/60 mt-1">Intenta con otra búsqueda o crea un nuevo producto</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => (
                        <TableRow key={product.id} className={`${!product.isActive ? 'opacity-60' : ''} hover:bg-muted/30 transition-colors`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <ProductImage
                                src={product.imgUrl}
                                alt={product.name}
                                categoryName={product.category?.name}
                                categoryIcon={product.category?.icon}
                              />
                              <div className="min-w-0">
                                <p className="truncate">{product.name}</p>
                                {product.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {product.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">
                            {product.sku || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">
                            {product.invima ? (
                              <span className="flex items-center gap-1">
                                <Shield className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[90px]" title={product.invima}>{product.invima}</span>
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {product.provider ? (
                              <div className="flex items-center gap-1">
                                <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-xs truncate max-w-[100px]" title={product.provider.name}>{product.provider.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {product.costPrice ? formatCurrency(product.costPrice, store?.currencyCode) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(product.salePrice, store?.currencyCode)}
                          </TableCell>
                          <TableCell>
                            {product.taxRate ? (
                              <Badge
                                variant="outline"
                                className={
                                  product.taxRate.rate === 0
                                    ? 'bg-gray-500/15 text-gray-400 dark:bg-gray-500/15 dark:text-gray-400 border-gray-500/20 dark:border-gray-500/20 text-xs'
                                    : product.taxRate.code === '05'
                                      ? 'bg-orange-500/15 text-orange-400 dark:bg-orange-500/15 dark:text-orange-400 border-orange-500/20 dark:border-orange-500/20 text-xs'
                                      : 'bg-emerald-500/15 text-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/20 text-xs'
                                }
                              >
                                <Percent className="h-2.5 w-2.5 mr-0.5" />
                                {product.taxRate.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">Sin imp.</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.commission > 0 ? (
                              <span className="text-xs">{product.commission}%</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                product.currentStock <= product.minStock
                                  ? 'text-red-600 dark:text-red-400 font-semibold'
                                  : ''
                              }
                            >
                              {product.currentStock}
                            </span>
                            {product.currentStock <= product.minStock && product.currentStock > 0 && (
                              <AlertTriangle className="inline-block h-3.5 w-3.5 ml-1 text-amber-500" />
                            )}
                            {product.currentStock === 0 && (
                              <AlertTriangle className="inline-block h-3.5 w-3.5 ml-1 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                product.isActive
                                  ? 'bg-emerald-500/15 text-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/20'
                                  : 'bg-gray-500/15 text-gray-400 dark:bg-gray-500/15 dark:text-gray-400 border-gray-500/20 dark:border-gray-500/20'
                              }
                              variant="outline"
                            >
                              {product.isActive ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center sticky right-0 bg-background">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Más opciones">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Acciones</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditProductDialog(product)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleProduct(product)}>
                                  <Power className="h-4 w-4 mr-2" />
                                  {product.isActive ? 'Desactivar' : 'Activar'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openAdjustStockDialog(product.id, product.name, product.currentStock)}>
                                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                                  Ajustar Stock
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openLossDialog(product.id, product.name)}>
                                  <AlertTriangle className="h-4 w-4 mr-2" />
                                  Registrar Pérdida
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openReturnDialog(product.id, product.name)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Registrar Devolución
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openTraceDialog(product.id, product.name)}>
                                  <Route className="h-4 w-4 mr-2" />
                                  Ver Trazabilidad
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTarget({ type: 'product', item: product })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Plan limit banner */}
          {!subscriptionLoading && maxProducts !== null && (
            <div className={`rounded-lg border p-3 flex items-center gap-3 ${
              products.length >= maxProducts
                ? 'border-amber-500/30 bg-amber-500/[0.06]'
                : products.length >= maxProducts * 0.8
                  ? 'border-sky-500/20 bg-sky-500/[0.04]'
                  : 'border-emerald-500/20 bg-emerald-500/[0.04]'
            }`}>
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                products.length >= maxProducts
                  ? 'bg-amber-500/15'
                  : products.length >= maxProducts * 0.8
                    ? 'bg-sky-500/15'
                    : 'bg-emerald-500/15'
              }`}>
                <AlertTriangle className={`h-4 w-4 ${
                  products.length >= maxProducts
                    ? 'text-amber-400'
                    : products.length >= maxProducts * 0.8
                      ? 'text-sky-400'
                      : 'text-emerald-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${
                  products.length >= maxProducts
                    ? 'text-amber-400'
                    : products.length >= maxProducts * 0.8
                      ? 'text-sky-400'
                      : 'text-emerald-400'
                }`}>
                  {products.length >= maxProducts
                    ? `Límite del plan alcanzado: ${maxProducts} productos`
                    : `Plan: ${products.length}/${maxProducts} productos`
                  }
                </p>
                {products.length >= maxProducts && (
                  <p className="text-[11px] text-amber-300/60 mt-0.5">
                    Actualiza tu plan para agregar más productos
                  </p>
                )}
              </div>
              {products.length < maxProducts && (
                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0 hidden sm:block">
                  <div
                    className={`h-full rounded-full transition-all ${
                      products.length >= maxProducts * 0.8 ? 'bg-sky-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, (products.length / maxProducts) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Product count */}
          {!productsLoading && (
            <p className="text-sm text-muted-foreground text-right">
              {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}
              {maxProducts !== null && (
                <span className="text-xs text-muted-foreground/60 ml-2">
                  (límite: {maxProducts})
                </span>
              )}
            </p>
          )}
        </TabsContent>

        {/* ─── CATEGORIES TAB ────────────────────────────────────────── */}
        <TabsContent value="categories" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {categories.length} categor{categories.length !== 1 ? 'ías' : 'ía'}
            </p>
            <Button onClick={openNewCategoryDialog} className="gap-2 active:scale-[0.98] transition-all">
              <Plus className="h-4 w-4" />
              Nueva Categoría
            </Button>
          </div>

          {categoriesLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-5 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Tags className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
                <p className="text-muted-foreground font-medium">No hay categorías creadas</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Crea una categoría para organizar tus productos
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Card key={category.id} className="group hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div className="flex items-center gap-2.5">
                      {(() => {
                        const IconComp = getCategoryIconByName(category.icon)
                        return IconComp ? (
                          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
                            <IconComp className="h-4.5 w-4.5 text-primary" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0">
                            <Tags className="h-4.5 w-4.5 text-muted-foreground" />
                          </div>
                        )
                      })()}
                      <CardTitle className="text-base font-medium">{category.name}</CardTitle>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditCategoryDialog(category)}
                        aria-label="Editar categoría"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ type: 'category', item: category })}
                        aria-label="Eliminar categoría"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Eliminar</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4" />
                      <span>
                        {category._count?.products || 0} producto
                        {(category._count?.products || 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ─── Extracted Sub-Component Dialogs ──────────────────────────── */}
      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        editingProduct={editingProduct}
        providers={providers}
        taxRates={taxRates}
        categories={categories}
        onSave={handleSaveProduct}
        onToggle={handleToggleProduct}
      />
      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        editingCategory={editingCategory}
        onSave={handleSaveCategory}
        saving={categorySaving}
      />
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        target={deleteTarget}
        onConfirm={handleConfirmDelete}
        deleting={deleting}
      />
      <AdjustStockDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        productName={adjustProductName}
        currentStock={adjustCurrentStock}
        onSubmit={handleAdjustStock}
        submitting={actionSubmitting}
      />
      <LossDialog
        open={lossDialogOpen}
        onOpenChange={setLossDialogOpen}
        productName={lossProductName}
        onSubmit={handleLoss}
        submitting={actionSubmitting}
      />
      <ReturnDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        productName={returnProductName}
        onSubmit={handleReturn}
        submitting={actionSubmitting}
      />
      <TraceDialog
        open={traceDialogOpen}
        onOpenChange={(open) => { if (!open) setTraceProductId(null); setTraceDialogOpen(open) }}
        productName={traceProductName}
        movements={traceMovements}
        loading={traceLoading}
      />
      <ImportProductsDialog
        open={importDialogOpen}
        onOpenChange={handleImportDialogOpenChange}
        onImport={handleImportProducts}
        importing={importing}
        subscriptionLoading={subscriptionLoading}
        maxProducts={maxProducts}
        planName={planName}
        currentProductCount={products.length}
      />
    </div>
  )
}
