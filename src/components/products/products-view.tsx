'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useProducts } from '@/hooks/api/use-products'
import { useCategories } from '@/hooks/api/use-categories'
import { useAppStore } from '@/stores/app-store'
import { formatCurrency } from '@/lib/auth'
import type { Product, Category, Provider, TaxRate, TraceMovement } from '@/types'
import { formatCOP } from '@/lib/format'
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
import { CategoryIconPicker, getCategoryIconByName } from '@/components/ui/category-icon-picker'
import { printReport, printThermal80mm } from '@/lib/print-report'
import { KPIBar } from '@/components/shared/kpi-bar'
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
  Tag,
  AlertTriangle,
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
  Upload,
  Info,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
// Product, Category, Provider, TaxRate, TraceMovement imported from @/types

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
  { value: 'VENCIDO', label: 'Producto vencido' },
  { value: 'DANADO', label: 'Producto dañado' },
  { value: 'ROBO', label: 'Robo o hurto' },
  { value: 'DERRAME', label: 'Derrame o rotura' },
  { value: 'INVENTARIO', label: 'Diferencia de inventario' },
  { value: 'OTRO', label: 'Otro motivo' },
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
  const queryClient = useQueryClient()

  const [maxProducts, setMaxProducts] = useState<number | null>(null) // Plan limit (null = unlimited)
  const [planName, setPlanName] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)

  // Products state (declared before hooks so they can be used as dependencies)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default')

  // ─── TanStack Query hooks ──────────────────────────────────────────────
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
  const [traceMovements, setTraceMovements] = useState<TraceMovement[]>([])
  const [traceLoading, setTraceLoading] = useState(false)

  // Import dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean
    imported: number
    created: string[]
    skipped: { row: number; name: string; reason: string }[]
    totalInFile: number
    createdCategories?: string[]
    createdProviders?: string[]
    subscription?: {
      planName: string | null
      planLimit: number | null
      currentCount: number
      newTotal: number
      remainingSlots: number | null
      limitReached: boolean
    }
  } | null>(null)

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

  // ─── Fetch subscription plan limits ──────────────────────────────────────
  const fetchSubscriptionLimits = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/subscription/current?storeId=${store.id}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.planName) setPlanName(data.planName)
      if (data.planLimits?.maxProducts != null && data.planLimits.maxProducts !== -1) {
        setMaxProducts(data.planLimits.maxProducts)
      }
    } catch {
      // If subscription check fails, no limit applied
    } finally {
      setSubscriptionLoading(false)
    }
  }, [store?.id])

  useEffect(() => {
    fetchProviders()
    fetchTaxRates()
    fetchSubscriptionLimits()
  }, [fetchProviders, fetchTaxRates, fetchSubscriptionLimits])

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
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
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
      queryClient.invalidateQueries({ queryKey: ['products'] })
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
      queryClient.invalidateQueries({ queryKey: ['categories'] })
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
      if (deleteTarget.type === 'product') queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
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
    setLossReason('VENCIDO')
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
      queryClient.invalidateQueries({ queryKey: ['products'] })
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
      queryClient.invalidateQueries({ queryKey: ['products'] })
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
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch { toast.error('Error al registrar devolución') }
    finally { setActionSubmitting(false) }
  }

  // ─── Excel Import Handler ──────────────────────────────────────────
  async function handleImportProducts() {
    if (!store?.id || !importFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al importar productos')
      }
      setImportResult(data)
      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['products'] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        fetchProviders()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar productos')
    } finally {
      setImporting(false)
    }
  }

  function handleImportDialogClose() {
    setImportDialogOpen(false)
    setImportFile(null)
    setImportResult(null)
    // Refresh all lists when closing — import may have created new categories/providers
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    fetchProviders()
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
                  onClick={() => { setImportResult(null); setImportFile(null); setImportDialogOpen(true) }}
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

      {/* ─── PRODUCT DIALOG ──────────────────────────────────────────── */}
      <Dialog open={productDialogOpen} onOpenChange={(open) => {
        if (!open) setProductDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
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
                    aria-label="Quitar imagen"
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
        <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
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
        <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
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
        <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
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
        <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
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
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl backdrop-blur-sm">
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
              <Route className="h-14 w-14 mb-3 text-muted-foreground/30 animate-pulse" />
              <p className="text-sm text-muted-foreground/70">No hay movimientos registrados</p>
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
                  {traceMovements.map((mov: TraceMovement, idx: number) => (
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

      {/* ─── IMPORT EXCEL DIALOG ───────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        if (!open) handleImportDialogClose()
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Productos desde Excel
            </DialogTitle>
            <DialogDescription>
              Carga un archivo Excel (.xlsx/.xls) o CSV con tus productos para crearlos en lote.
            </DialogDescription>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-5 py-2">
              {/* Subscription Limit Info */}
              {!subscriptionLoading && maxProducts !== null && (
                <div className={`rounded-lg border p-3 flex items-start gap-3 ${
                  products.length >= maxProducts
                    ? 'border-red-500/30 bg-red-500/[0.06]'
                    : products.length >= maxProducts * 0.8
                      ? 'border-amber-500/30 bg-amber-500/[0.06]'
                      : 'border-sky-500/20 bg-sky-500/[0.04]'
                }`}>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    products.length >= maxProducts
                      ? 'bg-red-500/15'
                      : products.length >= maxProducts * 0.8
                        ? 'bg-amber-500/15'
                        : 'bg-sky-500/15'
                  }`}>
                    <Info className={`h-4 w-4 ${
                      products.length >= maxProducts
                        ? 'text-red-400'
                        : products.length >= maxProducts * 0.8
                          ? 'text-amber-400'
                          : 'text-sky-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${
                      products.length >= maxProducts
                        ? 'text-red-400'
                        : products.length >= maxProducts * 0.8
                          ? 'text-amber-400'
                          : 'text-sky-400'
                    }`}>
                      {products.length >= maxProducts
                        ? `Límite del plan alcanzado`
                        : `Límite de productos — Plan ${planName || ''}`
                      }
                    </p>
                    {products.length >= maxProducts ? (
                      <p className="text-[11px] text-red-300/60 mt-0.5">
                        Tu plan permite máximo {maxProducts} productos y ya tienes {products.length}. No se pueden importar más productos. Actualiza tu plan para agregar más.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        Tu plan ({planName}) permite hasta <strong>{maxProducts}</strong> productos. Actualmente tienes <strong>{products.length}</strong>. Puedes importar hasta <strong>{maxProducts - products.length}</strong> productos más. Los que excedan este límite serán omitidos automáticamente.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Instructions */}
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <h4 className="font-semibold text-sm">Formato del Excel</h4>
                  <p className="text-xs text-muted-foreground">
                    La primera fila debe contener los nombres de las columnas (encabezados). Las columnas se mapean automáticamente:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-emerald-600">Obligatoria:</span>
                      <p className="font-mono mt-0.5">Nombre</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-emerald-600">Obligatoria:</span>
                      <p className="font-mono mt-0.5">Precio Venta</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">SKU</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Categoría</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Proveedor</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Impuesto</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">INVIMA</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Precio Compra</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Comisión</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Stock</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Stock Mínimo</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <span className="font-medium text-muted-foreground">Opcional:</span>
                      <p className="font-mono mt-0.5">Activo (Sí/No)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <ul className="space-y-1 list-disc ml-1">
                      <li>La columna <strong>Categoría</strong>, <strong>Proveedor</strong> e <strong>Impuesto</strong> se resuelven por nombre (deben existir previamente)</li>
                      <li>Los precios van en pesos colombianos (sin símbolo $, solo el número)</li>
                      <li>Máximo 1,000 productos por archivo, tamaño máximo 5MB</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* File Drop Zone */}
              <div className="space-y-2">
                <Label>Archivo Excel o CSV</Label>
                <div
                  className={`
                    relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8
                    transition-colors cursor-pointer hover:bg-muted/50
                    ${importFile ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-muted-foreground/25'}
                  `}
                  onClick={() => document.getElementById('import-file-input')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const file = e.dataTransfer.files[0]
                    if (file) setImportFile(file)
                  }}
                >
                  <input
                    id="import-file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setImportFile(file)
                    }}
                  />
                  {importFile ? (
                    <>
                      <FileSpreadsheet className="h-10 w-10 text-emerald-600 mb-2" />
                      <p className="text-sm font-medium">{importFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(importFile.size / 1024).toFixed(1)} KB — Click para cambiar
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Arrastra un archivo aquí o <span className="text-primary font-medium underline">haz click para seleccionar</span>
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls o .csv — máx. 5MB</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Results */
            <div className="space-y-4 py-2">
              {/* Subscription Info Banner */}
              {importResult.subscription && (
                <div className={`rounded-lg border p-3 flex items-start gap-3 ${
                  importResult.subscription.limitReached
                    ? 'border-amber-500/30 bg-amber-500/[0.06]'
                    : 'border-sky-500/20 bg-sky-500/[0.04]'
                }`}>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    importResult.subscription.limitReached
                      ? 'bg-amber-500/15'
                      : 'bg-sky-500/15'
                  }`}>
                    <Info className={`h-4 w-4 ${
                      importResult.subscription.limitReached
                        ? 'text-amber-400'
                        : 'text-sky-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${
                      importResult.subscription.limitReached
                        ? 'text-amber-400'
                        : 'text-sky-400'
                    }`}>
                      {importResult.subscription.limitReached
                        ? `Límite del plan alcanzado (${importResult.subscription.planName})`
                        : `Capacidad del plan — ${importResult.subscription.planName}`
                      }
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {importResult.subscription.limitReached
                        ? <>
                            Tu plan permite máximo <strong>{importResult.subscription.planLimit}</strong> productos.
                            Tenías {importResult.subscription.currentCount}, se importaron {importResult.imported} y ahora tienes <strong>{importResult.subscription.newTotal}/{importResult.subscription.planLimit}</strong>.
                            Algunos productos del archivo fueron omitidos por alcanzar el límite.
                            {importResult.skipped.some(s => s.reason.includes('Límite del plan')) && (
                              <span className="text-amber-500"> Los productos restantes fueron omitidos por límite del plan.</span>
                            )}
                          </>
                        : <>
                            Tu plan ({importResult.subscription.planName}) permite hasta <strong>{importResult.subscription.planLimit}</strong> productos.
                            Tenías {importResult.subscription.currentCount}, se importaron {importResult.imported} y ahora tienes <strong>{importResult.subscription.newTotal}</strong>.
                            Quedan <strong>{importResult.subscription.remainingSlots}</strong> cupos disponibles.
                          </>
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{importResult.totalInFile}</p>
                  <p className="text-xs text-muted-foreground">En archivo</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.imported}</p>
                  <p className="text-xs text-muted-foreground">Importados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.skipped.length}</p>
                  <p className="text-xs text-muted-foreground">Omitidos</p>
                </div>
              </div>

              {/* Skipped details */}
              {importResult.skipped.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">Productos omitidos:</p>
                  <div className="space-y-1">
                    {importResult.skipped.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
                        <Badge variant="outline" className="shrink-0 font-mono">Fila {s.row}</Badge>
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="text-muted-foreground truncate">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.imported > 0 && (
                <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 rounded-md p-3">
                  Se importaron {importResult.imported} producto{importResult.imported !== 1 ? 's' : ''} exitosamente.
                  {importResult.subscription && (
                    <span className="text-xs block mt-1 text-muted-foreground">
                      Total en el sistema: {importResult.subscription.newTotal}{importResult.subscription.planLimit ? `/${importResult.subscription.planLimit}` : ''} productos
                      {importResult.subscription.limitReached && ' — Límite alcanzado'}
                    </span>
                  )}
                </div>
              )}

              {(importResult.createdCategories && importResult.createdCategories.length > 0) && (
                <div className="text-sm bg-sky-50 dark:bg-sky-950/20 rounded-md p-3">
                  <p className="font-medium text-sky-700 dark:text-sky-400 mb-1">
                    <Tag className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                    {importResult.createdCategories.length} categoría{importResult.createdCategories.length !== 1 ? 's' : ''} creada{importResult.createdCategories.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {importResult.createdCategories.map(cat => (
                      <Badge key={cat} variant="secondary" className="text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800">{cat}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {(importResult.createdProviders && importResult.createdProviders.length > 0) && (
                <div className="text-sm bg-violet-50 dark:bg-violet-950/20 rounded-md p-3">
                  <p className="font-medium text-violet-700 dark:text-violet-400 mb-1">
                    <Truck className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                    {importResult.createdProviders.length} proveedor{importResult.createdProviders.length !== 1 ? 'es' : ''} creado{importResult.createdProviders.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {importResult.createdProviders.map(prov => (
                      <Badge key={prov} variant="secondary" className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">{prov}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {importResult ? (
              <Button onClick={handleImportDialogClose}>
                Cerrar
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleImportDialogClose} disabled={importing}>
                  Cancelar
                </Button>
                <Button onClick={handleImportProducts} disabled={!importFile || importing || (maxProducts !== null && products.length >= maxProducts)}>
                  {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {importing ? 'Importando...' : (maxProducts !== null && products.length >= maxProducts) ? 'Límite alcanzado' : `Importar ${importFile ? importFile.name : ''}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
