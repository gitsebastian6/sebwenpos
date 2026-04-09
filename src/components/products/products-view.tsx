'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
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
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: number
  storeId: number
  categoryId: number | null
  providerId: number | null
  sku: string | null
  name: string
  description: string | null
  imgUrl: string | null
  costPrice: number
  salePrice: number
  currentStock: number
  minStock: number
  isActive: boolean
  category?: { id: number; name: string } | null
  provider?: { id: number; name: string } | null
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
  createdAt: string
  _count?: { products: number }
}

interface ProductFormData {
  name: string
  sku: string
  categoryId: string
  providerId: string
  description: string
  imgUrl: string
  costPrice: string
  salePrice: string
  minStock: string
  isActive: boolean
}

const emptyProductForm: ProductFormData = {
  name: '',
  sku: '',
  categoryId: 'none',
  providerId: 'none',
  description: '',
  imgUrl: '',
  costPrice: '',
  salePrice: '',
  minStock: '5',
  isActive: true,
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProductsView() {
  const { store } = useAuthStore()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  // Products state
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState<ProductFormData>(emptyProductForm)
  const [productSaving, setProductSaving] = useState(false)

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'product' | 'category'; item: Product | Category } | null>(null)
  const [deleting, setDeleting] = useState(false)

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
  }, [fetchCategories, fetchProviders])

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
      description: product.description || '',
      imgUrl: product.imgUrl || '',
      costPrice: product.costPrice ? String(product.costPrice / 100) : '',
      salePrice: String(product.salePrice / 100),
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
        description: productForm.description.trim() || undefined,
        imgUrl: productForm.imgUrl.trim() || undefined,
        costPrice: productForm.costPrice ? Math.round(Number(productForm.costPrice) * 100) : 0,
        salePrice: Math.round(Number(productForm.salePrice) * 100),
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
    setCategoryDialogOpen(true)
  }

  function openEditCategoryDialog(category: Category) {
    setEditingCategory(category)
    setCategoryName(category.name)
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
        ? { name: categoryName.trim() }
        : { storeId: store.id, name: categoryName.trim() }

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

  // ─── Filtered Products ─────────────────────────────────────────────────

  const filteredProducts = products

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs defaultValue="products" className="w-full">
        <TabsList>
          <TabsTrigger value="products" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Productos</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <Tags className="h-4 w-4" />
            <span className="hidden sm:inline">Categorías</span>
          </TabsTrigger>
          <TabsTrigger value="purchases" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Compras</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── PRODUCTS TAB ──────────────────────────────────────────── */}
        <TabsContent value="products" className="mt-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
              {/* Category filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-48">
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
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Activos</SelectItem>
                  <SelectItem value="false">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openNewProductDialog} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Nuevo Producto
            </Button>
          </div>

          {/* Products Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Nombre</TableHead>
                      <TableHead className="hidden sm:table-cell min-w-[100px]">SKU</TableHead>
                      <TableHead className="min-w-[120px]">Proveedor</TableHead>
                      <TableHead className="min-w-[120px]">Categoría</TableHead>
                      <TableHead className="text-right min-w-[110px]">Precio Compra</TableHead>
                      <TableHead className="text-right min-w-[110px]">Precio Venta</TableHead>
                      <TableHead className="text-right min-w-[80px]">Stock</TableHead>
                      <TableHead className="min-w-[100px]">Estado</TableHead>
                      <TableHead className="text-right min-w-[80px]">Acciones</TableHead>
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
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm font-mono">
                            {product.sku || '—'}
                          </TableCell>
                          <TableCell>
                            {product.provider ? (
                              <div className="flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate max-w-[140px]">{product.provider.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sin proveedor</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="secondary">{product.category.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {product.costPrice ? formatCurrency(product.costPrice, store?.currencyCode) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(product.salePrice, store?.currencyCode)}
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
                          <TableCell className="text-right">
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

            {/* Row: Category + Provider */}
            <div className="grid gap-4 sm:grid-cols-2">
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

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="prod-img">URL de Imagen</Label>
              <Input
                id="prod-img"
                placeholder="https://ejemplo.com/imagen.jpg"
                value={productForm.imgUrl}
                onChange={(e) => setProductForm({ ...productForm, imgUrl: e.target.value })}
              />
              {productForm.imgUrl && (
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border">
                  <ProductImage
                    src={productForm.imgUrl}
                    alt={productForm.name || 'Vista previa'}
                    categoryName={
                      productForm.categoryId !== 'none'
                        ? categories.find((c) => String(c.id) === productForm.categoryId)?.name
                        : undefined
                    }
                    className="h-12 w-12 rounded object-cover"
                    fallbackClassName="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0"
                    iconClassName="h-6 w-6 text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground truncate">Vista previa</p>
                </div>
              )}
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
              {editingProduct && (
                <div className="space-y-2">
                  <Label>Stock Actual</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium">
                    <span className={editingProduct.currentStock <= editingProduct.minStock ? 'text-red-600 dark:text-red-400' : ''}>
                      {editingProduct.currentStock} unidades
                    </span>
                  </div>
                </div>
              )}
            </div>
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
                ? 'Modifica el nombre de la categoría.'
                : 'Ingresa el nombre para la nueva categoría.'}
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
    </div>
  )
}
