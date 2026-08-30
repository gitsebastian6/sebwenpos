'use client'

import type { Product, Category } from '@/types'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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
import { useProductScanner } from '@/hooks/use-product-scanner'
import {
  PackageSearch,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Package,
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

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ProductsTableSectionProps {
  products: Product[]
  filteredProducts: Product[]
  productsLoading: boolean
  categories: Category[]
  // Filter/sort state
  searchQuery: string
  setSearchQuery: (v: string) => void
  categoryFilter: string
  setCategoryFilter: (v: string) => void
  activeFilter: string
  setActiveFilter: (v: string) => void
  sortOrder: 'default' | 'az' | 'za'
  setSortOrder: (v: 'default' | 'az' | 'za') => void
  // Plan info
  maxProducts: number | null
  subscriptionLoading: boolean
  // Handlers
  onNewProduct: () => void
  onEditProduct: (p: Product) => void
  onToggleProduct: (p: Product) => void
  onInventoryAction: (type: 'adjust' | 'loss' | 'return', product: Product) => void
  onTrace: (id: number, name: string) => void
  onDelete: (p: Product) => void
  onPrint: (thermal: boolean) => void
  onImport: () => void
  onSetView: (view: string) => void
  currencyCode?: string
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ProductsTableSection({
  products,
  filteredProducts,
  productsLoading,
  categories,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  activeFilter,
  setActiveFilter,
  sortOrder,
  setSortOrder,
  maxProducts,
  subscriptionLoading,
  onNewProduct,
  onEditProduct,
  onToggleProduct,
  onInventoryAction,
  onTrace,
  onDelete,
  onPrint,
  onImport,
  onSetView,
  currencyCode,
}: ProductsTableSectionProps) {
  // Scanner (camera + USB gun) — feeds the code into the search box; the
  // catalog search matches name/SKU/barcode (server-side).
  const { scanButton, scannerDialog } = useProductScanner({
    products,
    size: 'compact',
    label: 'Escanear producto',
    onExactMatch: (_m, code) => setSearchQuery(code),
    onText: (code) => setSearchQuery(code),
  })

  return (
    <>
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
              className="pl-9 pr-10 w-full focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              {scanButton}
            </div>
          </div>
          {scannerDialog}
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
              onClick={() => onSetView('purchases')}
            >
              <PackageSearch className="h-3.5 w-3.5" />
              <span>Compras</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:hover:bg-amber-950/40"
              onClick={() => onSetView('inventory')}
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
                <DropdownMenuItem onClick={() => onPrint(false)}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Impresora Normal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPrint(true)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Térmica 80mm
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onImport}
            >
              <Upload className="h-4 w-4" />
              <span>Importar Excel</span>
            </Button>
            <Button onClick={onNewProduct} size="sm" className="gap-1.5 active:scale-[0.98] transition-all">
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
                  <TableHead className="text-center w-[76px] sticky right-0 z-20 bg-background border-l border-border/50">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="bg-background">
                      <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                      <TableCell className="sticky right-0 z-10 bg-inherit border-l border-border/50"><Skeleton className="h-8 w-8 mx-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <Package className="h-16 w-16 text-muted-foreground/30 mb-3 animate-pulse" />
                        <p className="text-muted-foreground font-medium">No se encontraron productos</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">Intenta con otra búsqueda o crea un nuevo producto</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id} className={`${!product.isActive ? 'opacity-60' : ''} bg-background hover:bg-muted/30 transition-colors`}>
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
                        {product.costPrice ? formatCurrency(product.costPrice, currencyCode) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(product.salePrice, currencyCode)}
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
                      <TableCell className="text-center sticky right-0 z-10 bg-inherit border-l border-border/50">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Más opciones">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Acciones</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEditProduct(product)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleProduct(product)}>
                              <Power className="h-4 w-4 mr-2" />
                              {product.isActive ? 'Desactivar' : 'Activar'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onInventoryAction('adjust', product)}>
                              <SlidersHorizontal className="h-4 w-4 mr-2" />
                              Ajustar Stock
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onInventoryAction('loss', product)}>
                              <AlertTriangle className="h-4 w-4 mr-2" />
                              Registrar Pérdida
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onInventoryAction('return', product)}>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Registrar Devolución
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onTrace(product.id, product.name)}>
                              <Route className="h-4 w-4 mr-2" />
                              Ver Trazabilidad
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onDelete(product)}
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
    </>
  )
}
