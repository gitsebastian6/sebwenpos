'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryFetch } from '@/hooks/api/query-helpers'
import { useProductScanner } from '@/hooks/use-product-scanner'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ListOrdered,
  Search,
  Armchair,
  Heart,
  PackageX,
} from 'lucide-react'
import type { CashShift, CashShiftSummary } from '@/components/accounting/accounting-types'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  formatCurrency,
  formatTime,
  formatDateShort,
} from '@/components/accounting/accounting-types'

interface ShiftDetailData {
  shift: CashShift
  orderSummary: CashShiftSummary
  aggregatedProducts: Array<{
    productId: number | null
    serviceId: number | null
    name: string
    category: string | null
    sku: string | null
    quantity: number
    total: number
    isService: boolean
  }>
  orders: Array<{
    id: number
    orderNumber: string
    total: number
    subtotal: number
    tipAmount: number
    paymentMethod: string
    status: string
    createdAt: string
    customer: { id: number; name: string; phone: string | null } | null
    tableName: string | null
    items: Array<{
      id: number
      name: string
      sku: string | null
      category: string | null
      quantity: number
      unitPrice: number
      totalRow: number
      isService: boolean
    }>
  }>
}

interface ShiftDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detailShiftId: number | null
  storeId: number | undefined
  currencyCode: string
}

export function ShiftDetailDialog({
  open,
  onOpenChange,
  detailShiftId,
  storeId,
  currencyCode,
}: ShiftDetailDialogProps) {
  const queryClient = useQueryClient()
  const [detailShiftData, setDetailShiftData] = useState<ShiftDetailData | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailSearch, setDetailSearch] = useState('')

  useEffect(() => {
    if (open && detailShiftId) {
      loadDetail(detailShiftId)
    }
    if (!open) {
      setDetailShiftData(null)
      setDetailSearch('')
    }
  }, [open, detailShiftId])

  async function loadDetail(shiftId: number) {
    setDetailSearch('')
    setIsLoadingDetail(true)
    setDetailShiftData(null)
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['cash-register-detail-orders', shiftId],
        queryFn: () =>
          queryFetch(
            `/api/cash-register/${shiftId}?storeId=${storeId}&includeOrders=true`,
          ),
        staleTime: 30_000,
      })
      setDetailShiftData(data as ShiftDetailData)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  function handleOpenChange(value: boolean) {
    onOpenChange(value)
  }

  // Scanner (camera + USB gun) — drops the code into the product/service filter.
  const { scanButton, scannerDialog } = useProductScanner({
    products: detailShiftData?.aggregatedProducts ?? [],
    keyboardEnabled: open,
    size: 'compact',
    label: 'Escanear producto',
    onExactMatch: (_m, code) => setDetailSearch(code),
    onText: (code) => setDetailSearch(code),
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5" />
            Detalle del Turno
          </DialogTitle>
          <DialogDescription>
            Productos y servicios facturados durante este turno de caja
          </DialogDescription>
        </DialogHeader>

        {isLoadingDetail ? (
          <div className="space-y-4 py-4">
            <div className="flex gap-4">
              <Skeleton className="h-20 w-48" />
              <Skeleton className="h-20 w-48" />
              <Skeleton className="h-20 w-48" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : detailShiftData ? (
          <div className="space-y-4">
            {/* Shift Info Header */}
            <div className="rounded-lg bg-muted/50 border p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Responsable
                  </p>
                  <p className="text-sm font-semibold truncate">
                    {detailShiftData.shift.user.fullName || 'Usuario'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Apertura
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatTime(detailShiftData.shift.openedAt)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateShort(detailShiftData.shift.openedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Cierre
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {detailShiftData.shift.closedAt
                      ? formatTime(detailShiftData.shift.closedAt)
                      : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {detailShiftData.shift.closedAt
                      ? formatDateShort(detailShiftData.shift.closedAt)
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Estado
                  </p>
                  <Badge
                    variant="outline"
                    className={
                      detailShiftData.shift.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px]'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 text-[10px]'
                    }
                  >
                    {detailShiftData.shift.status === 'OPEN'
                      ? 'ABIERTA'
                      : 'CERRADA'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Total Órdenes
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {detailShiftData.orderSummary.totalOrders}
                </p>
              </Card>
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Ventas Totales
                </p>
                <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(
                    detailShiftData.orderSummary.totalSales,
                    currencyCode,
                  )}
                </p>
              </Card>
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Propinas
                </p>
                <p className="text-lg font-bold tabular-nums text-pink-600 dark:text-pink-400">
                  {formatCurrency(
                    detailShiftData.orderSummary.totalTips,
                    currencyCode,
                  )}
                </p>
              </Card>
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Efectivo
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {formatCurrency(
                    detailShiftData.orderSummary.cashSales,
                    currencyCode,
                  )}
                </p>
              </Card>
            </div>

            {/* Search */}
            <div className="relative">
              <Input
                placeholder="Buscar o escanear producto / servicio..."
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                className="h-9 pl-8 pr-10"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                {scanButton}
              </div>
            </div>
            {scannerDialog}

            {/* Aggregated Products Table */}
            {(() => {
              const searchLower = detailSearch.toLowerCase().trim()
              const filteredProducts = searchLower
                ? detailShiftData.aggregatedProducts.filter(
                    (p) =>
                      p.name.toLowerCase().includes(searchLower) ||
                      p.category?.toLowerCase().includes(searchLower) ||
                      p.sku?.toLowerCase().includes(searchLower),
                  )
                : detailShiftData.aggregatedProducts

              if (filteredProducts.length === 0) {
                return (
                  <div className="text-center py-8">
                    <PackageX className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchLower
                        ? 'No se encontraron productos'
                        : 'No hay productos facturados en este turno'}
                    </p>
                  </div>
                )
              }

              const totalQty = filteredProducts.reduce(
                (sum, p) => sum + p.quantity,
                0,
              )
              const totalVal = filteredProducts.reduce(
                (sum, p) => sum + p.total,
                0,
              )

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Productos Facturados (A-Z) —{' '}
                      {filteredProducts.length} producto
                      {filteredProducts.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalQty} unidades · Total:{' '}
                      <span className="font-bold text-foreground">
                        {formatCurrency(totalVal, currencyCode)}
                      </span>
                    </p>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-muted/30 transition-colors">
                          <TableHead className="w-[40px] text-center text-[10px]">
                            #
                          </TableHead>
                          <TableHead className="text-[11px]">
                            Producto/Servicio
                          </TableHead>
                          <TableHead className="text-[11px] whitespace-nowrap w-[80px]">
                            Categoría
                          </TableHead>
                          <TableHead className="text-[11px] text-center w-[60px]">
                            Cant.
                          </TableHead>
                          <TableHead className="text-[11px] text-right w-[100px]">
                            Unitario
                          </TableHead>
                          <TableHead className="text-[11px] text-right w-[110px]">
                            Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.map((product, idx) => (
                          <TableRow
                            className="hover:bg-muted/30 transition-colors"
                            key={`${product.productId || 'svc'}-${product.serviceId || 'prd'}-${product.name}`}
                          >
                            <TableCell className="text-center text-[10px] text-muted-foreground tabular-nums">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  {product.isService && (
                                    <Badge
                                      variant="outline"
                                      className="text-[8px] px-1 py-0 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 border-violet-200"
                                    >
                                      Svc
                                    </Badge>
                                  )}
                                  <span className="text-xs font-medium truncate max-w-[180px]">
                                    {product.name}
                                  </span>
                                </div>
                                {product.sku && (
                                  <span className="text-[9px] text-muted-foreground">
                                    SKU: {product.sku}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {product.category ? (
                                <Badge
                                  variant="outline"
                                  className="text-[9px]"
                                >
                                  {product.category}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs font-semibold tabular-nums">
                              {product.quantity}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(
                                Math.round(
                                  product.total / (product.quantity || 1),
                                ),
                                currencyCode,
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold tabular-nums">
                              {formatCurrency(product.total, currencyCode)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            })()}

            {/* Orders Detail */}
            {detailShiftData.orders.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Órdenes del Turno — {detailShiftData.orders.length}
                </p>
                <div className="max-h-[250px] overflow-y-auto rounded-lg border space-y-0">
                  {detailShiftData.orders.map((order) => {
                    const payLabel =
                      PAYMENT_METHOD_LABELS[order.paymentMethod] ||
                      order.paymentMethod
                    const payColor =
                      PAYMENT_METHOD_COLORS[order.paymentMethod] ||
                      'bg-gray-400'
                    return (
                      <div
                        key={order.id}
                        className="border-b last:border-b-0 p-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono font-bold text-muted-foreground">
                              {order.orderNumber}
                            </span>
                            {order.tableName && (
                              <Badge
                                variant="outline"
                                className="text-[8px] px-1 py-0"
                              >
                                <Armchair className="h-2.5 w-2.5 mr-0.5" />
                                {order.tableName}
                              </Badge>
                            )}
                            <div
                              className={`h-2 w-2 rounded-full ${payColor} shrink-0`}
                            />
                            <span className="text-[9px] text-muted-foreground">
                              {payLabel}
                            </span>
                            {order.customer && (
                              <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">
                                · {order.customer.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] text-muted-foreground tabular-nums">
                              {formatTime(order.createdAt)}
                            </span>
                            <span className="text-xs font-bold tabular-nums">
                              {formatCurrency(order.total, currencyCode)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 ml-4 space-y-0.5">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-[10px]"
                            >
                              <div className="flex items-center gap-1 min-w-0">
                                {item.isService && (
                                  <Badge
                                    variant="outline"
                                    className="text-[7px] px-0.5 py-0 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 border-violet-200 leading-none"
                                  >
                                    Svc
                                  </Badge>
                                )}
                                <span className="truncate max-w-[200px]">
                                  {item.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                <span className="text-muted-foreground">
                                  ×{item.quantity}
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(item.totalRow, currencyCode)}
                                </span>
                              </div>
                            </div>
                          ))}
                          {order.tipAmount > 0 && (
                            <div className="flex items-center justify-between text-[10px] text-pink-600 dark:text-pink-400">
                              <div className="flex items-center gap-1">
                                <Heart className="h-2.5 w-2.5" />
                                <span>Propina</span>
                              </div>
                              <span className="font-medium tabular-nums">
                                {formatCurrency(order.tipAmount, currencyCode)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Payment Method Breakdown */}
            {Object.keys(detailShiftData.orderSummary.byPayment).length > 0 && (
              <div className="space-y-2">
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Ventas por Método de Pago
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(detailShiftData.orderSummary.byPayment)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([method, data]) => {
                      const label =
                        PAYMENT_METHOD_LABELS[method] || method
                      const color =
                        PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'
                      return (
                        <div
                          key={method}
                          className="rounded-lg border p-2.5 space-y-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`h-2.5 w-2.5 rounded-full ${color}`}
                            />
                            <span className="text-[10px] font-medium">
                              {label}
                            </span>
                            <span className="text-[9px] text-muted-foreground ml-auto tabular-nums">
                              {data.count}
                            </span>
                          </div>
                          <p className="text-xs font-bold tabular-nums">
                            {formatCurrency(data.total, currencyCode)}
                          </p>
                          {data.tips > 0 && (
                            <p className="text-[9px] text-pink-500 tabular-nums">
                              +{formatCurrency(data.tips, currencyCode)}{' '}
                              propina
                            </p>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No se pudo cargar el detalle
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
