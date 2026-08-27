'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/auth'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { floorQty, formatQty, isFractionalUnit } from '@/lib/format'
import { AlertTriangle, PackageSearch, RotateCcw, Search, X } from 'lucide-react'
import { useState } from 'react'
import { BarcodeScannerDialog, ScanButton } from '@/components/shared/barcode-scanner-dialog'
import type { Product } from './inventory-types'

interface InventoryProductTableProps {
  products: Product[]
  filteredProducts: Product[]
  isLoading: boolean
  search: string
  onSearchChange: (value: string) => void
  onResetStock: () => void
  currencyCode?: string
}

export function InventoryProductTable({
  products,
  filteredProducts,
  isLoading,
  search,
  onSearchChange,
  onResetStock,
  currencyCode,
}: InventoryProductTableProps) {
  const [cameraScanOpen, setCameraScanOpen] = useState(false)
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Inventario de Productos</CardTitle>
            <CardDescription>Lista completa con stock actual</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 active:scale-[0.98] transition-all"
              onClick={onResetStock}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Resetear Stock
            </Button>
            {!isLoading && (
              <span className="text-sm text-muted-foreground">
                {filteredProducts.length} de {products.length} producto{products.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search bar + camera scanner */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto por nombre, SKU o categoría..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ScanButton onClick={() => setCameraScanOpen(true)} label="Escanear producto" />
        </div>
        <BarcodeScannerDialog
          open={cameraScanOpen}
          onClose={() => setCameraScanOpen(false)}
          onScan={(code) => onSearchChange(code)}
        />

        {/* Product table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <PackageSearch className="h-14 w-14 mb-3 opacity-40 animate-pulse" />
            <p className="text-sm">
              {search ? 'No se encontraron productos' : 'No hay productos registrados'}
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/30 transition-colors">
                  <TableHead>Producto</TableHead>
                  <TableHead className="whitespace-nowrap">Categoría</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right whitespace-nowrap">P. Venta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={product.id}>
                    <TableCell className="font-medium text-xs">
                      <div className="truncate max-w-[120px]" title={product.name}>
                        <span className="truncate">{product.name}</span>
                        {product.sku && (
                          <p className="text-[10px] text-muted-foreground font-mono">{product.sku}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[80px] truncate">
                      {product.category ? (
                        <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={product.currentStock <= product.minStock ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                        {isFractionalUnit(product.unitLabel) ? formatQty(product.currentStock) : Math.floor(product.currentStock)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">{getUnitOfMeasureLabel(product.unitLabel)}</span>
                      {product.currentStock <= product.minStock && product.currentStock > 0 && (
                        <AlertTriangle className="inline-block h-3 w-3 ml-1 text-amber-500" />
                      )}
                      {product.currentStock === 0 && (
                        <AlertTriangle className="inline-block h-3 w-3 ml-1 text-red-500" />
                      )}
                      {product.presentations && product.presentations.filter((p) => p.isActive).length > 0 && (
                        <p
                          className="text-[10px] text-muted-foreground"
                          title={product.presentations
                            .filter((p) => p.isActive)
                            .map((p) => `${isFractionalUnit(p.unitLabel) ? formatQty(floorQty(product.currentStock / p.unitsPerPack)) : Math.floor(floorQty(product.currentStock / p.unitsPerPack))} ${getUnitOfMeasureLabel(p.unitLabel)} (×${p.unitsPerPack})`)
                            .join(' · ')}
                        >
                          {product.presentations
                            .filter((p) => p.isActive)
                            .map((p) => `${isFractionalUnit(p.unitLabel) ? formatQty(floorQty(product.currentStock / p.unitsPerPack)) : Math.floor(floorQty(product.currentStock / p.unitsPerPack))} ${getUnitOfMeasureLabel(p.unitLabel)}`)
                            .join(' · ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {formatCurrency(product.salePrice, currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
