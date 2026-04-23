'use client'

import { PackageSearch, Filter, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_ICONS } from './inventory-types'
import type { InventoryMovement, Product } from './inventory-types'

interface InventoryMovementsSectionProps {
  movements: InventoryMovement[]
  isLoading: boolean
  products: Product[]
  filterType: string
  filterProduct: string
  onFilterTypeChange: (value: string) => void
  onFilterProductChange: (value: string) => void
  onExportExcel: () => void
  formatDate: (dateStr: string) => string
}

export function InventoryMovementsSection({
  movements,
  isLoading,
  products,
  filterType,
  filterProduct,
  onFilterTypeChange,
  onFilterProductChange,
  onExportExcel,
  formatDate,
}: InventoryMovementsSectionProps) {
  return (
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
            onClick={onExportExcel}
            disabled={isLoading || movements.length === 0}
            className="gap-2 active:scale-[0.98] transition-all"
          >
            <Download className="h-4 w-4" />
            <span className="text-xs">Excel</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-wrap items-end gap-2 flex-1">
              <Filter className="h-4 w-4 text-muted-foreground mb-2.5" />
              <div className="flex-1 min-w-[140px] space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={filterType} onValueChange={onFilterTypeChange}>
                  <SelectTrigger className="h-9 focus-visible:ring-primary/20 focus-visible:border-primary/40">
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
                <Select value={filterProduct} onValueChange={onFilterProductChange}>
                  <SelectTrigger className="h-9 focus-visible:ring-primary/20 focus-visible:border-primary/40">
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
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <PackageSearch className="h-14 w-14 mb-3 opacity-40 animate-pulse" />
              <p className="text-sm">No hay movimientos registrados</p>
              <p className="text-xs">Los movimientos aparecerán aquí cuando registres pérdidas, devoluciones o ajustes</p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-muted/30 transition-colors">
                    <TableHead className="w-[120px] whitespace-nowrap">Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-[80px] whitespace-nowrap">Tipo</TableHead>
                    <TableHead className="w-[70px] text-right whitespace-nowrap">Cantidad</TableHead>
                    <TableHead className="whitespace-nowrap">Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow className="hover:bg-muted/30 transition-colors" key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(m.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        <span className="truncate max-w-[120px] block" title={m.productName}>{m.productName}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1.5 text-xs capitalize">
                          {MOVEMENT_TYPE_ICONS[m.movementType] || null}
                          {MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-xs font-semibold ${m.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={m.notes || ''}>
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
  )
}
