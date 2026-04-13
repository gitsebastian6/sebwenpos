'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { formatCurrency } from '@/lib/auth'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { ProductImage } from '@/components/ui/product-image'
import { CategoryIconPicker } from '@/components/ui/category-icon-picker'
import { printReport, printThermal80mm } from '@/lib/print-report'
import { KPIBar } from '@/components/shared/kpi-bar'
import dynamic from 'next/dynamic'

const PurchasesView = dynamic(() => import('@/components/purchases/purchases-view').then(m => ({ default: m.PurchasesView })), { ssr: false })

import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Package,
  Tags,
  AlertTriangle,
  ShoppingCart,
  Truck,
  Printer,
  FileSpreadsheet,
  SlidersHorizontal,
  RotateCcw,
  Route,
  Calculator,
  Loader2,
  TrendingUp,
  Percent,
  X,
  Shield,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaxRate {
  id: number
  name: string
  code: string
  rate: number
  rateType: string
  applyTo: string
  category: string
  isActive: boolean
  isDefault: boolean
  _count?: { products: number }
}

interface Product {
  id: number
  storeId: number
  categoryId: number | null
  providerId: number | null
  taxRateId: number | null
  sku: string | null
  name: string
  description: string | null
  imgUrl: string | null
  invima: string | null
  costPrice: number
  salePrice: number
  commission: number
  currentStock: number
  minStock: number
  isActive: boolean
  category?: { id: number; name: string; icon: string | null } | null
  provider?: { id: number; name: string } | null
  taxRate?: { id: number; name: string; code: string; rate: number; rateType: string } | null
  _count?: { orderItems: number }
}

interface Provider {
  id: number
  name: string
  isActive: boolean
}

interface Category {
  id: number
  storeId: number
  name: string
  icon: string | null
  createdAt: string
  _count?: { products: number }
}

interface ProductFormData {
  name: string
  sku: string
  categoryId: string
  providerId: string
  taxRateId: string
  description: string
  imgUrl: string
  invima: string
  costPrice: string
  salePrice: string
  commission: string
  minStock: string
  isActive: boolean
}

const emptyProductForm: ProductFormData = {
  name: '',
  sku: '',
  categoryId: 'none',
  providerId: 'none',
  taxRateId: 'none',
  description: '',
  imgUrl: '',
  invima: '',
  costPrice: '',
  salePrice: '',
  commission: '0',
  minStock: '5',
  isActive: true,
}

// ─── Loss Reason Labels ────────────────────────────────────────────────────

const LOSS_REASONS = [
  { value: 'EXPIRED', label: 'Vencido' },
  { value: 'DAMAGED', label: 'Dañado' },
  { value: 'THEFT', label: 'Robo' },
  { value: 'SPILL', label: 'Derrame' },
  { value: 'COUNT_DIFF', label: 'Diferencia de inventario' },
  { value: 'OTHER', label: 'Otro' },
]

const MOV_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  LOSS: 'Pérdida',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProductsView() {
  const { store } = useAuthStore()
  const { setView } = useAppStore()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  // Products state
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default')

  // Product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState<ProductFormData>(emptyProductForm)
  const [productSaving, setProductSaving] = useState(false)

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryIcon, setCategoryIcon] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'product' | 'category'; item: Product | Category } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Quick action dialogs
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [lossDialogOpen, setLossDialogOpen] = useState(false)
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [traceDialogOpen, setTraceDialogOpen] = useState(false)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // Adjust form
  const [adjustProductId, setAdjustProductId] = useState<number | null>(null)
  const [adjustProductName, setAdjustProductName] = useState('')
  const [adjustCurrentStock, setAdjustCurrentStock] = useState(0)
  const [adjustNewStock, setAdjustNewStock] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')

  // Loss form
  const [lossProductId, setLossProductId] = useState<number | null>(null)
  const [lossProductName, setLossProductName] = useState('')
  const [lossQuantity, setLossQuantity] = useState('')
  const [lossReason, setLossReason] = useState('EXPIRED')
  const [lossNotes, setLossNotes] = useState('')

  // Return form
  const [returnProductId, setReturnProductId] = useState<number | null>(null)
  const [returnProductName, setReturnProductName] = useState('')
  const [returnQuantity, setReturnQuantity] = useState('')
  const [returnNotes, setReturnNotes] = useState('')

  // Trace data
  const [traceProductId, setTraceProductId] = useState<number | null>(null)
  const [traceProductName, setTraceProductName] = useState('')
  const [traceMovements, setTraceMovements] = useState<any[]>([])
  const [traceLoading, setTraceLoading] = useState(false)

  // ─── Commission Auto-Calculation ─────────────────────────────────────────

  const suggestedPrice = useMemo(() => {
    const cost = Number(productForm.costPrice)
    const commission = Number(productForm.commission || 0)
    if (!cost || cost <= 0 || commission <= 0) return null
    return Math.round(cost * (1 + commission / 100))
  }, [productForm.costPrice, productForm.commission])

  const profitMargin = useMemo(() => {
    const cost = Number(productForm.costPrice)
    const sale = Number(productForm.salePrice)
    if (!cost || cost <= 0 || !sale || sale <= 0) return null
    return ((sale - cost) / sale) * 100
  }, [productForm.costPrice, productForm.salePrice])

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/categories?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error cargando categorías')
      const data = await res.json()
      setCategories(data)
    } catch {
      toast.error('Error al cargar categorías')
    } finally {
      setCategoriesLoading(false)
    }
  }, [store?.id])

  const fetchProviders = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/providers?storeId=${store.id}&active=true`)
      if (!res.ok) throw new Error('Error cargando proveedores')
      const data = await res.json()
      setProviders(data)
    } catch {
      // Silent fail - providers are optional
    }
  }, [store?.id])

  const fetchTaxRates = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/taxes?storeId=${store.id}&isActive=true`)
      if (!res.ok) throw new Error('Error cargando impuestos')
      const data = await res.json()
      setTaxRates(data)
    } catch {
      // Silent fail - tax rates are optional
    }
  }, [store?.id])

  const fetchProducts = useCallback(async () => {
    if (!store?.id) return
    setProductsLoading(true)
    try {
      const params = new URLSearchParams({ storeId: String(store.id) })
      if (searchQuery) params.set('q', searchQuery)
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter)
      if (activeFilter !== 'all') params.set('active', activeFilter)

      const res = await fetch(`/api/products?${params.toString()}`)
      if (!res.ok) throw new Error('Error cargando productos')
      const data = await res.json()
      setProducts(data)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setProductsLoading(false)
    }
  }, [store?.id, searchQuery, categoryFilter, activeFilter])

  useEffect(() => {
    fetchCategories()
    fetchProviders()
    fetchTaxRates()
  }, [fetchCategories, fetchProviders, fetchTaxRates])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // ─── Product Handlers ──────────────────────────────────────────────────

  function openNewProductDialog() {
    setEditingProduct(null)
    setProductForm(emptyProductForm)
    setProductDialogOpen(true)
  }

  function openEditProductDialog(product: Product) {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      sku: product.sku || '',
      categoryId: product.categoryId ? String(product.categoryId) : 'none',
      providerId: product.providerId ? String(product.providerId) : 'none',
      taxRateId: product.taxRateId ? String(product.taxRateId) : 'none',
      description: product.description || '',
      imgUrl: product.imgUrl || '',
      invima: product.invima || '',
      costPrice: product.costPrice ? String(product.costPrice) : '',
      salePrice: String(product.salePrice),
      commission: String(product.commission ?? 0),
      minStock: String(product.minStock),
      isActive: product.isActive,
    })
    setProductDialogOpen(true)
  }

  async function handleSaveProduct() {
    if (!store?.id) return
    if (!productForm.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!productForm.salePrice || Number(productForm.salePrice) <= 0) {
      toast.error('El precio de venta es obligatorio y debe ser mayor a 0')
      return
    }

    setProductSaving(true)
    try {
      const body = {
        storeId: store.id,
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || undefined,
        categoryId: productForm.categoryId !== 'none' ? Number(productForm.categoryId) : undefined,
        providerId: productForm.providerId !== 'none' ? Number(productForm.providerId) : undefined,
        taxRateId: productForm.taxRateId !== 'none' ? Number(productForm.taxRateId) : undefined,
        description: productForm.description.trim() || undefined,
        imgUrl: productForm.imgUrl.trim() || null,
        invima: productForm.invima.trim() || null,
        costPrice: productForm.costPrice ? Math.round(Number(productForm.costPrice)) : 0,
        salePrice: Math.round(Number(productForm.salePrice)),
        commission: Math.max(0, Math.min(100, Math.round(Number(productForm.commission || 0)))),
        minStock: productForm.minStock ? Number(productForm.minStock) : 5,
        isActive: productForm.isActive,
      }

      const isEditing = !!editingProduct
      const url = isEditing ? `/api/products/${editingProduct.id}` : '/api/products'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar producto')
      }

      toast.success(isEditing ? 'Producto actualizado' : 'Producto creado')
      setProductDialogOpen(false)
      fetchProducts()
      fetchCategories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar producto')
    } finally {
      setProductSaving(false)
    }
  }

  async function handleToggleProduct(product: Product) {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !product.isActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(product.isActive ? 'Producto desactivado' : 'Producto activado')
      fetchProducts()
    } catch {
      toast.error('Error al cambiar estado del producto')
    }
  }

  // ─── Category Handlers ─────────────────────────────────────────────────

  function openNewCategoryDialog() {
    setEditingCategory(null)
    setCategoryName('')
    setCategoryIcon('')
    setCategoryDialogOpen(true)
  }

  function openEditCategoryDialog(category: Category) {
    setEditingCategory(category)
    setCategoryName(category.name)
    setCategoryIcon(category.icon || '')
    setCategoryDialogOpen(true)
  }

  async function handleSaveCategory() {
    if (!store?.id) return
    if (!categoryName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    setCategorySaving(true)
    try {
      const isEditing = !!editingCategory
      const url = isEditing ? `/api/categories/${editingCategory.id}` : '/api/categories'
      const method = isEditing ? 'PUT' : 'POST'
      const body = isEditing
        ? { name: categoryName.trim(), icon: categoryIcon || null }
        : { storeId: store.id, name: categoryName.trim(), icon: categoryIcon || null }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar categoría')
      }

      toast.success(isEditing ? 'Categoría actualizada' : 'Categoría creada')
      setCategoryDialogOpen(false)
      fetchCategories()
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
      const url = deleteTarget.type === 'product'
        ? `/api/products/${deleteTarget.item.id}`
        : `/api/categories/${deleteTarget.item.id}`

      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al eliminar')
      }

      toast.success(
        deleteTarget.type === 'product'
          ? 'Producto eliminado'
          : 'Categoría eliminada'
      )
      setDeleteTarget(null)
      if (deleteTarget.type === 'product') fetchProducts()
      fetchCategories()
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
    setAdjustNewStock(String(currentStock))
    setAdjustNotes('')
    setAdjustDialogOpen(true)
  }

  function openLossDialog(productId: number, name: string) {
    setLossProductId(productId)
    setLossProductName(name)
    setLossQuantity('')
    setLossReason('EXPIRED')
    setLossNotes('')
    setLossDialogOpen(true)
  }

  function openReturnDialog(productId: number, name: string) {
    setReturnProductId(productId)
    setReturnProductName(name)
    setReturnQuantity('')
    setReturnNotes('')
    setReturnDialogOpen(true)
  }

  async function openTraceDialog(productId: number, name: string) {
    setTraceProductId(productId)
    setTraceProductName(name)
    setTraceMovements([])
    setTraceLoading(true)
    setTraceDialogOpen(true)
    try {
      const res = await fetch(`/api/inventory/kardex?productId=${productId}&storeId=${store?.id}`)
      if (res.ok) {
        const data = await res.json()
        setTraceMovements(data.movements || [])
      }
    } catch { /* ignore */ }
    finally { setTraceLoading(false) }
  }

  async function handleAdjustStock() {
    if (!store?.id || !adjustProductId) return
    const newStock = parseInt(adjustNewStock, 10)
    if (isNaN(newStock) || newStock < 0) { toast.error('Cantidad inválida'); return }
    const diff = newStock - adjustCurrentStock
    if (diff === 0) { toast.info('Sin cambios'); return }
    setActionSubmitting(true)
    try {
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, productId: adjustProductId, quantity: diff, notes: adjustNotes || undefined })
      })
      if (!res.ok) throw new Error()
      toast.success('Stock ajustado')
      setAdjustDialogOpen(false)
      fetchProducts()
    } catch { toast.error('Error al ajustar stock') }
    finally { setActionSubmitting(false) }
  }

  async function handleLoss() {
    if (!store?.id || !lossProductId) return
    const qty = parseInt(lossQuantity, 10)
    if (isNaN(qty) || qty <= 0) { toast.error('Cantidad inválida'); return }
    setActionSubmitting(true)
    try {
      const res = await fetch('/api/inventory/losses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, productId: lossProductId, quantity: qty, reason: lossReason, notes: lossNotes || undefined })
      })
      if (!res.ok) throw new Error()
      toast.success('Pérdida registrada')
      setLossDialogOpen(false)
      fetchProducts()
    } catch { toast.error('Error al registrar pérdida') }
    finally { setActionSubmitting(false) }
  }

  async function handleReturn() {
    if (!store?.id || !returnProductId) return
    const qty = parseInt(returnQuantity, 10)
    if (isNaN(qty) || qty <= 0) { toast.error('Cantidad inválida'); return }
    setActionSubmitting(true)
    try {
      const res = await fetch('/api/inventory/returns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, productId: returnProductId, quantity: qty, notes: returnNotes || undefined })
      })
      if (!res.ok) throw new Error()
      toast.success('Devolución registrada')
      setReturnDialogOpen(false)
      fetchProducts()
    } catch { toast.error('Error al registrar devolución') }
    finally { setActionSubmitting(false) }
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
        ]),
        footer: `Total: ${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''}`,
        orientation: 'landscape',
      })
    }
  }

  // ─── Filtered & Sorted Products ──────────────────────────────────────────

  const filteredProducts = (() => {
    let result = products
    if (sortOrder === 'az') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'es-CO'))
    } else if (sortOrder === 'za') {
      result = [...result].sort((a, b) => b.name.localeCompare(a.name, 'es-CO'))
    }
    return result
  })()

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
          <TabsTrigger value="purchases" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span>Compras</span>
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
                  className="pl-9 w-full"
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
              {/* Quick inventory actions */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950/40"
                  onClick={() => { setView('inventory'); toast.info('Ve a Inventario para registrar pérdidas, devoluciones y ajustes') }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Pérdida</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-sky-600 border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-sky-800 dark:hover:bg-sky-950/40"
                  onClick={() => { setView('inventory'); toast.info('Ve a Inventario para registrar devoluciones y ajustes') }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Devolución</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:hover:bg-amber-950/40"
                  onClick={() => { setView('inventory'); toast.info('Ve a Inventario para registrar ajustes de stock') }}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Ajuste</span>
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
                <Button onClick={openNewProductDialog} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  <span>Nuevo Producto</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <Card>
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
                        <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                          No se encontraron productos
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => (
                        <TableRow key={product.id} className={!product.isActive ? 'opacity-60' : ''}>
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
                                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-xs'
                                    : product.taxRate.code === '05'
                                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 text-xs'
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs'
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
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                              }
                              variant="outline"
                            >
                              {product.isActive ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center sticky right-0 bg-background">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
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

          {/* Product count */}
          {!productsLoading && (
            <p className="text-sm text-muted-foreground text-right">
              {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}
            </p>
          )}
        </TabsContent>

        {/* ─── CATEGORIES TAB ────────────────────────────────────────── */}
        <TabsContent value="categories" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {categories.length} categor{categories.length !== 1 ? 'ías' : 'ía'}
            </p>
            <Button onClick={openNewCategoryDialog} className="gap-2">
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
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Tags className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No hay categorías creadas</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Crea una categoría para organizar tus productos
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Card key={category.id} className="group transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <CardTitle className="text-base font-medium">{category.name}</CardTitle>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditCategoryDialog(category)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ type: 'category', item: category })}
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

        {/* ─── PURCHASES TAB ─────────────────────────────────────────── */}
        <TabsContent value="purchases" className="mt-4">
          <PurchasesView />
        </TabsContent>
      </Tabs>

      {/* ─── PRODUCT DIALOG ──────────────────────────────────────────── */}
      <Dialog open={productDialogOpen} onOpenChange={(open) => {
        if (!open) setProductDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? 'Modifica los campos que desees actualizar.'
                : 'Completa los datos para registrar un nuevo producto.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Row: Name + SKU */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-name">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="prod-name"
                  placeholder="Nombre del producto"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-sku">SKU</Label>
                <Input
                  id="prod-sku"
                  placeholder="Código SKU"
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            {/* Row: Category + Provider + Tax Rate */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="prod-category">Categoría</Label>
                <Select
                  value={productForm.categoryId}
                  onValueChange={(val) => setProductForm({ ...productForm, categoryId: val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-provider">Proveedor</Label>
                <Select
                  value={productForm.providerId}
                  onValueChange={(val) => setProductForm({ ...productForm, providerId: val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {providers.map((prov) => (
                      <SelectItem key={prov.id} value={String(prov.id)}>
                        {prov.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-tax">
                  <span className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5" />
                    Impuesto (IVA)
                  </span>
                </Label>
                <Select
                  value={productForm.taxRateId}
                  onValueChange={(val) => setProductForm({ ...productForm, taxRateId: val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin impuesto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin impuesto</SelectItem>
                    {taxRates.map((tax) => (
                      <SelectItem key={tax.id} value={String(tax.id)}>
                        <span className="flex items-center gap-2">
                          {tax.name}
                          <span className="text-muted-foreground text-xs">
                            ({tax.rateType === 'PERCENTAGE' ? `${tax.rate}%` : `$${tax.rate}`})
                          </span>
                          {tax.isDefault && (
                            <span className="text-xs text-amber-600">⭐</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {productForm.taxRateId !== 'none'
                    ? (() => {
                        const tax = taxRates.find(t => String(t.id) === productForm.taxRateId)
                        return tax
                          ? tax.rate === 0
                            ? 'Exento / Excluido de IVA'
                            : `IVA ${tax.rate}% incluido en el precio de venta`
                          : ''
                      })()
                    : 'Precio de venta sin impuesto'}
                </p>
              </div>
            </div>

            {/* Row: Active */}
            <div className="flex items-center gap-3">
              <Switch
                id="prod-active"
                checked={productForm.isActive}
                onCheckedChange={(checked) => setProductForm({ ...productForm, isActive: checked })}
              />
              <Label htmlFor="prod-active" className="text-sm">
                {productForm.isActive ? 'Activo' : 'Inactivo'}
              </Label>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="prod-desc">Descripción</Label>
              <Textarea
                id="prod-desc"
                placeholder="Descripción del producto (opcional)"
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                rows={3}
              />
            </div>

            {/* INVIMA */}
            <div className="space-y-2">
              <Label htmlFor="prod-invima">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Registro INVIMA
                </span>
              </Label>
              <Input
                id="prod-invima"
                placeholder="Ej: RSA-000123-2024 (opcional)"
                value={productForm.invima}
                onChange={(e) => setProductForm({ ...productForm, invima: e.target.value })}
                className="uppercase"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Registro sanitario del INVIMA (solo si aplica). Ej: RSA, NSO, RNE, etc.
              </p>
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="prod-img">URL de Imagen</Label>
              <div className="flex gap-2">
                <Input
                  id="prod-img"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={productForm.imgUrl}
                  onChange={(e) => setProductForm({ ...productForm, imgUrl: e.target.value })}
                  className="flex-1"
                />
                {productForm.imgUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setProductForm({ ...productForm, imgUrl: '' })}
                    title="Quitar imagen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {/* Preview */}
              {productForm.imgUrl ? (
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border">
                  <ProductImage
                    src={productForm.imgUrl}
                    alt={productForm.name || 'Vista previa'}
                    categoryName={
                      productForm.categoryId !== 'none'
                        ? categories.find((c) => String(c.id) === productForm.categoryId)?.name
                        : undefined
                    }
                    categoryIcon={
                      productForm.categoryId !== 'none'
                        ? categories.find((c) => String(c.id) === productForm.categoryId)?.icon
                        : undefined
                    }
                    className="h-12 w-12 rounded object-cover"
                    fallbackClassName="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0"
                    iconClassName="h-6 w-6 text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground truncate">Vista previa de imagen</p>
                </div>
              ) : productForm.categoryId !== 'none' ? (
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border">
                  <ProductImage
                    categoryName={categories.find((c) => String(c.id) === productForm.categoryId)?.name}
                    categoryIcon={categories.find((c) => String(c.id) === productForm.categoryId)?.icon}
                    alt={productForm.name || 'Producto'}
                    className="h-12 w-12 rounded object-cover"
                    fallbackClassName="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0"
                    iconClassName="h-6 w-6 text-muted-foreground"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">
                      Ícono por categoría:{' '}
                      <span className="font-medium text-foreground">
                        {categories.find((c) => String(c.id) === productForm.categoryId)?.name}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Si no asignas una imagen, se usará este ícono automáticamente.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Row: Prices */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-cost">Precio de Compra</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="prod-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={productForm.costPrice}
                    onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Costo de adquisición en pesos</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-sale">
                  Precio de Venta <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="prod-sale"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={productForm.salePrice}
                    onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value })}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Precio al público en pesos</p>
              </div>
            </div>

            {/* Commission + Commission Calculator */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-commission">Comisión %</Label>
                <Input
                  id="prod-commission"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={productForm.commission}
                  onChange={(e) => setProductForm({ ...productForm, commission: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Porcentaje de comisión del producto (ej: 10)
                </p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  Cálculo Automático
                </Label>
                {suggestedPrice !== null ? (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Precio sugerido:</span>
                      <span className="font-semibold">
                        {formatCurrency(suggestedPrice, store?.currencyCode)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8"
                      onClick={() => setProductForm({ ...productForm, salePrice: String(suggestedPrice) })}
                    >
                      Aplicar precio sugerido
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[68px] rounded-md border border-dashed text-xs text-muted-foreground">
                    Ingresa precio de compra y comisión para calcular
                  </div>
                )}
              </div>
            </div>

            {/* Profit Margin Indicator */}
            {profitMargin !== null && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className={`h-4 w-4 ${
                      profitMargin > 40
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : profitMargin > 20
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`} />
                    <span className="text-muted-foreground">Margen de ganancia:</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    profitMargin > 40
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : profitMargin > 20
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}>
                    {profitMargin.toFixed(1)}%
                  </span>
                </div>
                <p className={`text-xs mt-1 ${
                  profitMargin > 40
                    ? 'text-emerald-600/70 dark:text-emerald-400/70'
                    : profitMargin > 20
                      ? 'text-amber-600/70 dark:text-amber-400/70'
                      : 'text-red-600/70 dark:text-red-400/70'
                }`}>
                  {profitMargin > 40
                    ? '✓ Margen saludable'
                    : profitMargin > 20
                      ? '⚠ Margen aceptable'
                      : '✗ Margen bajo — revisa tus precios'}
                </p>
              </div>
            )}

            {/* Row: Min Stock */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-minstock">Stock Mínimo</Label>
                <Input
                  id="prod-minstock"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={productForm.minStock}
                  onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Alerta cuando el stock esté por debajo de este valor
                </p>
              </div>
            </div>

            {/* Row: Stock Actual (edit only) */}
            {editingProduct && (
              <div className="space-y-2">
                <Label>Stock Actual</Label>
                <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium w-fit">
                  <span className={editingProduct.currentStock <= editingProduct.minStock ? 'text-red-600 dark:text-red-400' : ''}>
                    {editingProduct.currentStock} unidades
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProductDialogOpen(false)}
              disabled={productSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveProduct} disabled={productSaving}>
              {productSaving ? 'Guardando...' : editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CATEGORY DIALOG ─────────────────────────────────────────── */}
      <Dialog open={categoryDialogOpen} onOpenChange={(open) => {
        if (!open) setCategoryDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? 'Modifica el nombre e ícono de la categoría.'
                : 'Ingresa el nombre y escoge un ícono para la nueva categoría.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cat-name"
                placeholder="Nombre de la categoría"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCategory()
                }}
                autoFocus
              />
            </div>
            <CategoryIconPicker value={categoryIcon} onChange={setCategoryIcon} />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
              disabled={categorySaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveCategory} disabled={categorySaving}>
              {categorySaving ? 'Guardando...' : editingCategory ? 'Guardar' : 'Crear Categoría'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DELETE CONFIRMATION ─────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => {
        if (!open) setDeleteTarget(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'product'
                ? `Se eliminará el producto "${(deleteTarget?.item as Product | null)?.name ?? ''}". Esta acción no se puede deshacer.`
                : `Se eliminará la categoría "${(deleteTarget?.item as Category | null)?.name ?? ''}". Los productos en esta categoría no se eliminarán.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── ADJUST STOCK DIALOG ─────────────────────────────────────── */}
      <Dialog open={adjustDialogOpen} onOpenChange={(open) => {
        if (!open) setAdjustDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Stock</DialogTitle>
            <DialogDescription>
              Modifica el stock actual de <span className="font-semibold">{adjustProductName}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Stock Actual</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium">
                {adjustCurrentStock} unidades
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-new-stock">
                Nuevo Stock <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adjust-new-stock"
                type="number"
                min="0"
                placeholder="0"
                value={adjustNewStock}
                onChange={(e) => setAdjustNewStock(e.target.value)}
                autoFocus
              />
              {adjustNewStock && !isNaN(Number(adjustNewStock)) && Number(adjustNewStock) !== adjustCurrentStock && (
                <p className={`text-xs ${
                  Number(adjustNewStock) > adjustCurrentStock
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {Number(adjustNewStock) > adjustCurrentStock ? '+' : ''}
                  {Number(adjustNewStock) - adjustCurrentStock} unidades
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-notes">Notas</Label>
              <Textarea
                id="adjust-notes"
                placeholder="Motivo del ajuste (opcional)"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} disabled={actionSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleAdjustStock} disabled={actionSubmitting}>
              {actionSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── LOSS DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={lossDialogOpen} onOpenChange={(open) => {
        if (!open) setLossDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pérdida</DialogTitle>
            <DialogDescription>
              Registra una pérdida de <span className="font-semibold">{lossProductName}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="loss-quantity">
                Cantidad <span className="text-destructive">*</span>
              </Label>
              <Input
                id="loss-quantity"
                type="number"
                min="1"
                placeholder="0"
                value={lossQuantity}
                onChange={(e) => setLossQuantity(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loss-reason">Motivo</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger className="w-full">
                  <SelectValue />
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
              <Label htmlFor="loss-notes">Notas</Label>
              <Textarea
                id="loss-notes"
                placeholder="Detalles adicionales (opcional)"
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossDialogOpen(false)} disabled={actionSubmitting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleLoss} disabled={actionSubmitting}>
              {actionSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Pérdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── RETURN DIALOG ───────────────────────────────────────────── */}
      <Dialog open={returnDialogOpen} onOpenChange={(open) => {
        if (!open) setReturnDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Devolución</DialogTitle>
            <DialogDescription>
              Registra la devolución de <span className="font-semibold">{returnProductName}</span> al inventario
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="return-quantity">
                Cantidad <span className="text-destructive">*</span>
              </Label>
              <Input
                id="return-quantity"
                type="number"
                min="1"
                placeholder="0"
                value={returnQuantity}
                onChange={(e) => setReturnQuantity(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="return-notes">Notas</Label>
              <Textarea
                id="return-notes"
                placeholder="Motivo de la devolución (opcional)"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)} disabled={actionSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleReturn} disabled={actionSubmitting}>
              {actionSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── TRACEABILITY DIALOG ─────────────────────────────────────── */}
      <Dialog open={traceDialogOpen} onOpenChange={(open) => {
        if (!open) setTraceDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trazabilidad</DialogTitle>
            <DialogDescription>
              Historial de movimientos de <span className="font-semibold">{traceProductName}</span>
            </DialogDescription>
          </DialogHeader>

          {traceLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Cargando movimientos...</span>
            </div>
          ) : traceMovements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Route className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No hay movimientos registrados</p>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Fecha</TableHead>
                    <TableHead className="min-w-[100px]">Tipo</TableHead>
                    <TableHead className="text-right min-w-[80px]">Cantidad</TableHead>
                    <TableHead className="min-w-[200px]">Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traceMovements.map((mov: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm text-muted-foreground">
                        {mov.date
                          ? new Date(mov.date).toLocaleString('es-CO', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            mov.type === 'SALE'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : mov.type === 'PURCHASE'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : mov.type === 'RETURN'
                                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                  : mov.type === 'LOSS'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }
                        >
                          {MOV_TYPE_LABELS[mov.type] || mov.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        <span className={
                          mov.quantity > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }>
                          {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                        </span>
                        {mov.balance !== undefined && (
                          <span className="text-[10px] text-muted-foreground ml-1.5">
                            → {mov.balance}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[250px]">
                        {mov.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">
                {traceMovements.length} movimiento{traceMovements.length !== 1 ? 's' : ''} encontrado{traceMovements.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
