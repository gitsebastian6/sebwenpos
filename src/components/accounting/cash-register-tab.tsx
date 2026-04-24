'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryFetch } from '@/hooks/api/query-helpers'
import { toast } from 'sonner'
import { useCashRegisterOperations } from '@/hooks/accounting/use-cash-register-operations'
import { OpenCashDialog } from '@/components/accounting/dialogs/open-cash-dialog'
import { CloseCashDialog } from '@/components/accounting/dialogs/close-cash-dialog'
import { ShiftDetailDialog } from '@/components/accounting/dialogs/shift-detail-dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import {
  Wallet,
  TrendingUp,
  CircleDollarSign,
  Heart,
  FileText,
  Receipt,
  Loader2,
  Printer,
  RotateCcw,
  Trash2,
  ListOrdered,
  Search,
} from 'lucide-react'
import {
  printDailySummary,
  printProductCatalog,
  type DailySummaryData,
  type ProductCatalogData,
} from '@/lib/print-ticket'

interface DailyReportResponse {
  date: string
  orders: { total: number; completed: number; cancelled: number }
  sales: { total: number; subtotal: number; tips: number }
  byPayment: Record<string, { count: number; total: number; tips: number }>
  topProducts: Array<{ name: string; quantity: number; total: number }>
  cash: { openingBalance: number; expectedCash: number }
  services: number
}

interface ProductsCatalogResponse {
  data?: Array<{ name: string; category: { name: string } | null; salePrice: number; currentStock: number; sku: string | null }>
  [key: number]: unknown
}
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  formatCurrency,
  formatTime,
  formatDateShort,
} from '@/components/accounting/accounting-types'

interface CashRegisterTabProps {
  currencyCode: string
}

export function CashRegisterTab({ currencyCode }: CashRegisterTabProps) {
  const {
    openShifts,
    shiftHistory,
    isLoadingCash,
    lastClosedShift,
    selectedShiftId,
    setSelectedShiftId,
    deleteShiftId,
    setDeleteShiftId,
    handleOpenShift,
    handleCloseShift,
    handleReopenShift,
    handleDeleteShift,
    handlePrintShiftFromHistory,
    handlePrintClose,
    refetchCurrentShift,
    refetchHistory,
    isSavingShift,
    historyFrom,
    setHistoryFrom,
    historyTo,
    setHistoryTo,
    queryClient,
    store,
  } = useCashRegisterOperations(currencyCode)

  // Dialog open states
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailShiftId, setDetailShiftId] = useState<number | null>(null)

  function openDetailDialog(shiftId: number) {
    setDetailShiftId(shiftId)
    setShowDetailDialog(true)
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Current Shift Status Card(s) ──────────────────────────── */}
      {openShifts.length > 0 ? (
        <>
        {openShifts.map((shiftData, shiftIndex) => (
          <div key={shiftData.shift.id} className="space-y-4">
            {/* ─── Unified Turno Card ────────────────────────────────── */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Turno #{shiftIndex + 1}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {shiftData.shift.user.fullName || 'Usuario'} · Apertura: {formatDateShort(shiftData.shift.openedAt)} {formatTime(shiftData.shift.openedAt)}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 font-semibold">
                      ABIERTA
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => refetchCurrentShift()} className="gap-1 h-8 active:scale-[0.98] transition-all">
                      <Loader2 className="h-3 w-3" />
                      <span className="">Actualizar</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* ─── Saldo Inicial + Saldo al Momento ─────────────────── */}
              <div className="px-6 pb-3">
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 border p-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-medium">Saldo Inicial</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(shiftData.shift.openingBalance, currencyCode)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Fondo de apertura</p>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-medium">Saldo al Momento</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(shiftData.expectedCash, currencyCode)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Apertura + Efectivo recibido</p>
                  </div>
                </div>
              </div>

              <Separator className="mx-6" />

              {/* ─── Resumen del Turno ────────────────────────────────── */}
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-900 p-3">
                    <p className="text-[10px] text-muted-foreground font-medium">Ventas Totales</p>
                    <p className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      {formatCurrency(shiftData.totalSales, currencyCode)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{shiftData.orderCount} órdenes</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 p-3">
                    <p className="text-[10px] text-muted-foreground font-medium">Efectivo</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(shiftData.cashSales, currencyCode)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-violet-50 dark:bg-violet-950/50 border border-violet-100 dark:border-violet-900 p-3">
                    <p className="text-[10px] text-muted-foreground font-medium">Otros Métodos</p>
                    <p className="text-lg font-bold tabular-nums text-violet-700 dark:text-violet-400">
                      {formatCurrency(shiftData.otherSales, currencyCode)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 p-3">
                    <p className="text-[10px] text-muted-foreground font-medium">Fiado</p>
                    <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {formatCurrency(shiftData.creditSales, currencyCode)}
                    </p>
                  </div>
                </div>

                {shiftData.totalTips > 0 && (
                  <div className="flex items-center gap-2 bg-pink-50 dark:bg-pink-950 rounded-lg px-3 py-2 border border-pink-100 dark:border-pink-900">
                    <Heart className="h-4 w-4 text-pink-500" />
                    <span className="text-xs text-pink-700 dark:text-pink-300">Propinas:</span>
                    <span className="text-sm font-bold text-pink-700 dark:text-pink-300 tabular-nums">
                      {formatCurrency(shiftData.totalTips, currencyCode)}
                    </span>
                  </div>
                )}

                {Object.keys(shiftData.byPayment).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Desglose por Método de Pago</p>
                    <div className="space-y-1">
                      {Object.entries(shiftData.byPayment).map(([method, data]) => (
                        <div key={method} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`} />
                            <span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[method] || method}</span>
                            <span className="text-muted-foreground">({data.count})</span>
                          </div>
                          <span className="font-semibold tabular-nums">{formatCurrency(data.total, currencyCode)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => { setSelectedShiftId(shiftData.shift.id); setShowCloseDialog(true) }} variant="destructive" size="sm">
                    <Wallet className="h-3.5 w-3.5" />
                    Cerrar Caja
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ─── Últimas Ventas ────────────────────────────────────── */}
            {shiftData.recentOrders.length > 0 && (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Últimas Ventas del Turno #{shiftIndex + 1}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{shiftData.orderCount} total</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-muted/30 transition-colors">
                          <TableHead className="w-[100px]">Hora</TableHead>
                          <TableHead>Orden</TableHead>
                          <TableHead className="whitespace-nowrap text-xs">Método</TableHead>
                          <TableHead className="text-right w-[110px]">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shiftData.recentOrders.map((order) => (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={order.id}>
                            <TableCell>
                              <span className="text-xs tabular-nums">{formatTime(order.createdAt)}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-medium">{order.orderNumber}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className={`h-2 w-2 rounded-full ${PAYMENT_METHOD_COLORS[order.paymentMethod] || 'bg-gray-400'}`} />
                                <span className="text-xs">{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-semibold tabular-nums">
                                {formatCurrency(order.total, currencyCode)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ))}
        </>
      ) : (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardHeader className="pb-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <CardDescription className="text-xs">Caja Cerrada</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">No hay un turno abierto. Abre la caja para registrar ventas en efectivo.</p>
            <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => setShowOpenDialog(true)}>
              <Wallet className="h-4 w-4" />
              Abrir Caja
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Last Closed Difference ────────────────────────────────── */}
      {lastClosedShift && (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Último Cierre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Efectivo Esperado</span>
              <span className="text-sm font-bold tabular-nums">
                {formatCurrency(lastClosedShift.shift.expectedCash || 0, currencyCode)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Efectivo Real</span>
              <span className="text-sm font-bold tabular-nums">
                {formatCurrency(lastClosedShift.shift.closingBalance || 0, currencyCode)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Diferencia</span>
              <span className={`text-base font-bold tabular-nums ${
                (lastClosedShift.shift.difference || 0) >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {(lastClosedShift.shift.difference || 0) >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(lastClosedShift.shift.difference || 0), currencyCode)}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handlePrintClose} className="gap-1.5 mt-2 active:scale-[0.98] transition-all">
              <Printer className="h-3.5 w-3.5" />
              Imprimir Cierre
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Print Actions ──────────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Acciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              if (!store?.id) return
              try {
                const data = await queryClient.fetchQuery<DailyReportResponse>({
                  queryKey: ['daily-report-cash', store.id],
                  queryFn: () => queryFetch<DailyReportResponse>(`/api/reports/daily?storeId=${store.id}`),
                  staleTime: 60_000,
                })
                const printData: DailySummaryData = {
                  storeName: store.name,
                  storeNIT: store.nit || undefined,
                  date: data.date,
                  totalOrders: data.orders.total,
                  completedOrders: data.orders.completed,
                  cancelledOrders: data.orders.cancelled,
                  totalSales: data.sales.total,
                  subtotal: data.sales.subtotal,
                  tips: data.sales.tips,
                  paymentBreakdown: Object.entries(data.byPayment).map(([method, d]: [string, any]) => ({
                    method, count: d.count, total: d.total, tips: d.tips,
                  })),
                  topProducts: data.topProducts.map((p: { name: string; quantity: number; total: number }) => p),
                  openingBalance: data.cash.openingBalance,
                  expectedCash: data.cash.expectedCash,
                  services: data.services,
                  currencyCode,
                }
                printDailySummary(printData)
              } catch { toast.error('Error al generar corte Z') }
            }} className="gap-1.5 active:scale-[0.98] transition-all">
              <FileText className="h-3.5 w-3.5" />
              Corte Z del Día
            </Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!store?.id) return
              try {
                const data = await queryClient.fetchQuery<ProductsCatalogResponse>({
                  queryKey: ['products-catalog-cash', store.id],
                  queryFn: () => queryFetch<ProductsCatalogResponse>(`/api/products?storeId=${store.id}&active=true&limit=500`),
                  staleTime: 120_000,
                })
                const rawProducts = Array.isArray(data) ? data : (data.data || [])
                const products = rawProducts.map((p: { name: string; category: { name: string } | null; salePrice: number; currentStock: number; sku: string | null }) => ({
                  name: p.name, category: p.category?.name || 'Sin Categoría', price: p.salePrice, stock: p.currentStock, sku: p.sku,
                }))
                const printData: ProductCatalogData = { storeName: store.name, storeNIT: store.nit || undefined, products, currencyCode }
                printProductCatalog(printData)
              } catch { toast.error('Error al generar catálogo') }
            }} className="gap-1.5 active:scale-[0.98] transition-all">
              <Receipt className="h-3.5 w-3.5" />
              Imprimir Catálogo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Shift History ──────────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Historial de Turnos</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setHistoryFrom(''); setHistoryTo('') }}
                className="gap-1.5 text-xs"
              >
                <Search className="h-3.5 w-3.5" />
                Limpiar
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetchCurrentShift()} className="gap-1.5 active:scale-[0.98] transition-all">
                <Loader2 className="h-3.5 w-3.5" />
                Actualizar
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Desde</Label>
              <Input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Hasta</Label>
              <Input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex items-end">
              <Button size="sm" onClick={() => refetchHistory()} className="h-8 gap-1.5 active:scale-[0.98] transition-all">
                <Search className="h-3.5 w-3.5" />
                Filtrar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/30 transition-colors">
                  <TableHead className="w-[80px]">Responsable</TableHead>
                  <TableHead className="w-[85px]">Hora Apertura</TableHead>
                  <TableHead className="w-[85px]">Hora Cierre</TableHead>
                  <TableHead className="text-right w-[110px]">Saldo Inicial</TableHead>
                  <TableHead className="text-right w-[110px]">Saldo Final</TableHead>
                  <TableHead className="text-right w-[90px]">Diferencia</TableHead>
                  <TableHead className="w-[65px]">Estado</TableHead>
                  <TableHead className="w-[90px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingCash ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow className="hover:bg-muted/30 transition-colors" key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : shiftHistory.length === 0 ? (
                  <TableRow className="hover:bg-muted/30 transition-colors">
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      No hay turnos registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  shiftHistory.map((shift) => (
                    <TableRow className="hover:bg-muted/30 transition-colors" key={shift.id}>
                      <TableCell>
                        <span className="text-xs font-medium truncate max-w-[90px] block">
                          {shift.user.fullName || 'Usuario'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium tabular-nums">{formatTime(shift.openedAt)}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDateShort(shift.openedAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {shift.closedAt ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium tabular-nums">{formatTime(shift.closedAt)}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDateShort(shift.closedAt)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs font-semibold tabular-nums">
                          {formatCurrency(shift.openingBalance, currencyCode)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs font-semibold tabular-nums">
                          {shift.closingBalance !== null ? formatCurrency(shift.closingBalance, currencyCode) : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {shift.difference !== null ? (
                          <span className={`text-xs font-bold tabular-nums ${
                            shift.difference >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {shift.difference >= 0 ? '+' : '-'}{formatCurrency(Math.abs(shift.difference), currencyCode)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={shift.status === 'OPEN'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[9px]'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 text-[9px]'
                          }
                        >
                          {shift.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 active:scale-[0.98] transition-all"
                            title="Ver detalles" onClick={() => openDetailDialog(shift.id)}>
                            <ListOrdered className="h-3.5 w-3.5" />
                          </Button>
                          {shift.status === 'CLOSED' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 active:scale-[0.98] transition-all"
                              title="Imprimir informe" onClick={() => handlePrintShiftFromHistory(shift.id)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {shift.status === 'CLOSED' && (
                            <Button variant="ghost" size="icon"
                              className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50 active:scale-[0.98] transition-all"
                              title="Reabrir turno" onClick={() => handleReopenShift(shift.id)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {shift.status === 'OPEN' && (
                            <Button variant="ghost" size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 active:scale-[0.98] transition-all"
                              title="Eliminar turno" onClick={() => setDeleteShiftId(shift.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Dialogs ──────────────────────────────────────────────────── */}
      <OpenCashDialog
        open={showOpenDialog}
        onOpenChange={setShowOpenDialog}
        onOpen={(balance, notes) => {
          handleOpenShift(balance, notes)
          setShowOpenDialog(false)
        }}
        isPending={isSavingShift}
      />

      <CloseCashDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        onClose={(openShiftsData, shiftId, closeCount, closeNotes) => {
          handleCloseShift(openShiftsData, shiftId, closeCount, closeNotes)
          setShowCloseDialog(false)
          setSelectedShiftId(null)
        }}
        openShifts={openShifts}
        selectedShiftId={selectedShiftId}
        currencyCode={currencyCode}
        isPending={isSavingShift}
      />

      <ShiftDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        detailShiftId={detailShiftId}
        storeId={store?.id}
        currencyCode={currencyCode}
      />

      {/* ─── AlertDialog: Delete Shift ────────────────────────────────── */}
      <AlertDialog open={deleteShiftId !== null} onOpenChange={(open) => { if (!open) setDeleteShiftId(null) }}>
        <AlertDialogContent className="backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar turno?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el registro del turno.
              Solo se pueden eliminar turnos que no tengan ventas asociadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteShiftId) { handleDeleteShift(deleteShiftId); setDeleteShiftId(null) } }}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
