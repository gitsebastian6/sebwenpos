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
import { Package, Tags } from 'lucide-react'
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
import { ProductsTableSection } from './products-table-section'
import { CategoriesSection } from './categories-section'

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
  const kardexQuery = useKardex(traceProductId, store?.id)
  const traceMovements = (kardexQuery.data ?? []) as TraceMovement[]
  const traceLoading = kardexQuery.isLoading

  const [importing, setImporting] = useState(false)

  // ─── TanStack Query — Inventory Mutations ────────────────────────────────
  const adjustStockMut = useInventoryAdjustment()
  const lossMut = useInventoryLoss()
  const returnMut = useInventoryReturn()
  const actionSubmitting = adjustStockMut.isPending || lossMut.isPending || returnMut.isPending

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
          <ProductsTableSection
            products={products}
            filteredProducts={filteredProducts}
            productsLoading={productsLoading}
            categories={categories}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            maxProducts={maxProducts}
            subscriptionLoading={subscriptionLoading}
            onNewProduct={openNewProductDialog}
            onEditProduct={openEditProductDialog}
            onToggleProduct={handleToggleProduct}
            onAdjustStock={openAdjustStockDialog}
            onLoss={openLossDialog}
            onReturn={openReturnDialog}
            onTrace={openTraceDialog}
            onDelete={(p) => setDeleteTarget({ type: 'product', item: p })}
            onPrint={handlePrintProducts}
            onImport={() => setImportDialogOpen(true)}
            onSetView={setView as (view: string) => void}
            currencyCode={store?.currencyCode}
          />
        </TabsContent>

        {/* ─── CATEGORIES TAB ────────────────────────────────────────── */}
        <TabsContent value="categories" className="mt-4 space-y-4">
          <CategoriesSection
            categories={categories}
            categoriesLoading={categoriesLoading}
            onNewCategory={openNewCategoryDialog}
            onEditCategory={openEditCategoryDialog}
            onDeleteCategory={(c) => setDeleteTarget({ type: 'category', item: c })}
          />
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
