'use client'

import { useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryFetch } from '@/hooks/api/query-helpers'
import { useResetCustomerDebts } from '@/hooks/api/use-customers'
import { useDailyReport } from '@/hooks/api/use-reports'
import { toast } from 'sonner'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  CalendarDays,
  FileText,
  DollarSign,
  ShoppingCart,
  Heart,
  Users,
  Wallet,
  BarChart3,
  TrendingUp,
  HandCoins,
  PackageX,
  AlertTriangle,
  Scale,
  BookOpen,
  Armchair,
  Monitor,
  Receipt,
  Printer,
  RotateCcw,
  ShieldAlert,
  Loader2,
} from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'
import {
  printDailySummary,
  type DailySummaryData,
  printProductCatalog,
  type ProductCatalogData,
  printKardex,
  type KardexData,
} from '@/lib/print-ticket'
import type { LedgerAccount, ReportData } from './accounting-types'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  CATEGORY_COLORS,
  formatCurrency,
  formatTime,
  formatDateShort,
  formatBalance,
  getBalanceColor,
  formatDayLabel,
} from './accounting-types'

interface ReportsTabProps {
  accounts: LedgerAccount[]
  currencyCode: string
  onAccountsChanged: () => void
}

export function ReportsTab({ accounts, currencyCode, onAccountsChanged }: ReportsTabProps) {
  const store = useAuthStore((s) => s.store)
  const queryClient = useQueryClient()

  // Report state
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')

  // Reset debts state
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetNote, setResetNote] = useState('')
  const [showResetFinalConfirm, setShowResetFinalConfirm] = useState(false)
  const resetDebtsMut = useResetCustomerDebts()
  const isResetting = resetDebtsMut.isPending

  // ─── TanStack Query for reports ─────────────────────────────────────────

  const reportEnabled = !!store?.id && !!reportFrom && !!reportTo
  const { data: reportData, isLoading: isLoadingReport, refetch: fetchReports } = useQuery<ReportData>({
    queryKey: ['accounting-reports', store?.id, reportFrom, reportTo],
    queryFn: () => {
      let url = `/api/reports?storeId=${store!.id}`
      if (reportFrom) url += `&from=${reportFrom}`
      if (reportTo) url += `&to=${reportTo}`
      return queryFetch<ReportData>(url)
    },
    enabled: reportEnabled,
    staleTime: 30_000,
  })

  const dailyReportQuery = useDailyReport(store?.id)

  // ─── Reset debts handler ──────────────────────────────────────────────────

  async function handleResetDebts() {
    if (!store?.id) return
    try {
      const data = await resetDebtsMut.mutateAsync({ body: { storeId: store.id, note: resetNote.trim() || undefined } })
      toast.success(data.message)
      setShowResetDialog(false)
      setResetNote('')
      fetchReports()
      onAccountsChanged()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo resetear saldos')
    }
  }

  // ─── Print handlers ────────────────────────────────────────────────────────

  async function handlePrintDailySummary() {
    if (!store?.id) return
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['daily-report', store.id],
        queryFn: () => queryFetch(`/api/reports/daily?storeId=${store.id}`),
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
          method,
          count: d.count,
          total: d.total,
          tips: d.tips,
        })),
        topProducts: data.topProducts.map((p: { name: string; quantity: number; total: number }) => p),
        openingBalance: data.cash.openingBalance,
        expectedCash: data.cash.expectedCash,
        services: data.services,
        currencyCode,
      }
      printDailySummary(printData)
    } catch { toast.error('Error al generar corte Z') }
  }

  async function handlePrintCatalog() {
    if (!store?.id) return
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['products-catalog', store.id],
        queryFn: () => queryFetch(`/api/products?storeId=${store.id}&active=true&limit=500`),
        staleTime: 120_000,
      })
      const rawProducts = Array.isArray(data) ? data : (data.data || [])
      const products = rawProducts.map((p: { name: string; category: { name: string } | null; salePrice: number; currentStock: number; sku: string | null }) => ({
        name: p.name,
        category: p.category?.name || 'Sin Categoría',
        price: p.salePrice,
        stock: p.currentStock,
        sku: p.sku,
      }))
      const printData: ProductCatalogData = {
        storeName: store.name,
        storeNIT: store.nit || undefined,
        products,
        currencyCode,
      }
      printProductCatalog(printData)
    } catch { toast.error('Error al generar catálogo') }
  }

  async function handlePrintKardex(productId: number, productName: string, category: string, sku?: string | null) {
    if (!store?.id) return
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['kardex-print', productId, store.id],
        queryFn: () => queryFetch(`/api/inventory/kardex?storeId=${store.id}&productId=${productId}`),
        staleTime: 30_000,
      })
      const printData: KardexData = {
        storeName: store.name,
        productName,
        category,
        sku,
        movements: data.movements,
        currencyCode,
      }
      printKardex(printData)
    } catch { toast.error('Error al generar kardex') }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Date Range Filter ─────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                <CalendarDays className="h-3 w-3 inline mr-1" />
                Desde
              </Label>
              <Input
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                <CalendarDays className="h-3 w-3 inline mr-1" />
                Hasta
              </Label>
              <Input
                type="date"
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                className="h-9"
              />
            </div>
            <Button className="h-9 gap-1.5 active:scale-[0.98] transition-all" onClick={fetchReports}
              disabled={isLoadingReport}
            >
              {isLoadingReport ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              Generar Informe
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoadingReport ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-0">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mt-2" />
                <Skeleton className="h-3 w-20 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reportData ? (
        <>
          {/* ─── KPI Cards Row ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Ventas */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <CardDescription className="text-xs">Total Ventas</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                  {formatCurrency(reportData.sales.total, currencyCode)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {reportData.sales.orderCount} órdenes · Ticket prom: {formatCurrency(reportData.sales.avgTicket, currencyCode)}
                </p>
              </CardContent>
            </Card>

            {/* Contado vs Fiado */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                    <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <CardDescription className="text-xs">Contado vs Fiado</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(reportData.sales.completed, currencyCode)}
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  Fiado: {formatCurrency(reportData.sales.credit, currencyCode)}
                </p>
              </CardContent>
            </Card>

            {/* Propinas */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-pink-100 dark:bg-pink-950 flex items-center justify-center">
                    <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  </div>
                  <CardDescription className="text-xs">Propinas</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-pink-700 dark:text-pink-400 tabular-nums">
                  {formatCurrency(reportData.sales.tips, currencyCode)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {reportData.sales.tipsOrderCount} órdenes con propina
                </p>
              </CardContent>
            </Card>

            {/* Mesas Abiertas */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                    <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <CardDescription className="text-xs">Mesas Abiertas</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {reportData.openTables.count}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Consumo: {formatCurrency(reportData.openTables.consumption, currencyCode)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Ventas por Método de Pago ──────────────────────────── */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Ventas por Método de Pago</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.keys(reportData.salesByPayment).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
              ) : (
                (() => {
                  const methods = reportData.salesByPayment
                  const maxPayment = Math.max(...Object.values(methods).map((m) => m.total), 1)
                  return Object.entries(methods)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([method, data]) => (
                      <div key={method} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`h-3 w-3 rounded-full ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`} />
                            <span className="text-sm font-medium">
                              {PAYMENT_METHOD_LABELS[method] || method}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              ({data.count})
                            </span>
                          </div>
                          <span className="text-sm font-bold tabular-nums">
                            {formatCurrency(data.total, currencyCode)}
                          </span>
                        </div>
                        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`}
                            style={{ width: `${(data.total / maxPayment) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                })()
              )}
            </CardContent>
          </Card>

          {/* ─── Ventas por Categoría + Top Productos ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas por Categoría */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Ventas por Categoría</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {Object.keys(reportData.salesByCategory).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                    {Object.entries(reportData.salesByCategory)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([cat, data], idx) => {
                        const totalAllSales = Object.values(reportData.salesByCategory).reduce(
                          (s, d) => s + d.total,
                          0
                        )
                        const pct = totalAllSales > 0 ? ((data.total / totalAllSales) * 100).toFixed(1) : '0'
                        return (
                          <div
                            key={cat}
                            className={`p-3 rounded-lg border ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                          >
                            <p className="text-xs font-semibold truncate">{cat}</p>
                            <p className="text-sm font-bold tabular-nums mt-1">
                              {formatCurrency(data.total, currencyCode)}
                            </p>
                            <p className="text-[10px] opacity-70 mt-0.5">
                              {data.quantity} uds · {pct}%
                            </p>
                          </div>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Productos */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Top 10 Productos</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right w-16">Uds</TableHead>
                        <TableHead className="text-right w-28">Ingreso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.topProducts.slice(0, 10).map((product, idx) => {
                        const maxProductTotal = reportData.topProducts[0]?.total || 1
                        return (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={product.productId}>
                            <TableCell className="text-xs font-bold text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <span className="text-sm font-medium truncate block max-w-[150px]">
                                  {product.name}
                                </span>
                                <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-teal-500 rounded-full transition-all duration-500"
                                    style={{ width: `${(product.total / maxProductTotal) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {product.quantity}
                            </TableCell>
                            <TableCell className="text-right text-sm font-bold tabular-nums text-teal-700 dark:text-teal-400">
                              {formatCurrency(product.total, currencyCode)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Cuentas por Cobrar ─────────────────────────────────── */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HandCoins className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Cuentas por Cobrar</CardTitle>
                    <CardDescription className="text-xs">
                      {reportData.customerDebts.length} cliente{reportData.customerDebts.length !== 1 ? 's' : ''} con deuda
                    </CardDescription>
                  </div>
                </div>
                <Button variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 active:scale-[0.98] transition-all"
                  onClick={() => setShowResetDialog(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Resetear Saldos
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reportData.customerDebts.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <HandCoins className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No hay deudas pendientes</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead>Cliente</TableHead>
                        <TableHead className="whitespace-nowrap text-xs">Teléfono</TableHead>
                        <TableHead className="text-right w-32">Deuda</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.customerDebts.map((c) => (
                        <TableRow className="hover:bg-muted/30 transition-colors" key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.phone || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className="text-xs font-bold text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                            >
                              {formatCurrency(c.totalDebt, currencyCode)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Productos con Stock Bajo ───────────────────────────── */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PackageX className="h-5 w-5 text-red-500" />
                <CardTitle className="text-base">Productos con Stock Bajo</CardTitle>
              </div>
              <CardDescription>
                {reportData.lowStockProducts.length} producto{reportData.lowStockProducts.length !== 1 ? 's' : ''} con stock ≤ 5 unidades
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {reportData.lowStockProducts.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <PackageX className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Todo el inventario está en buen nivel</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead>Producto</TableHead>
                        <TableHead className="whitespace-nowrap text-xs">Categoría</TableHead>
                        <TableHead className="text-center w-20">Stock</TableHead>
                        <TableHead className="text-center w-16 text-xs">Mín.</TableHead>
                        <TableHead className="text-right w-28">Precio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.lowStockProducts.map((p) => (
                        <TableRow className="hover:bg-muted/30 transition-colors" key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.category?.name || '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs font-bold ${
                                p.currentStock === 0
                                  ? 'text-red-700 dark:text-red-400 border-red-300 dark:border-red-700'
                                  : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700'
                              }`}
                            >
                              {p.currentStock === 0 ? (
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  0
                                </span>
                              ) : (
                                p.currentStock
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {p.minStock}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(p.salePrice, currencyCode)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Inventario Valorizado + Balance Cuentas ────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventario Valorizado */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Inventario Valorizado</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <p className="text-xs text-muted-foreground">Valor al Costo</p>
                  <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(reportData.inventory.totalCostValue, currencyCode)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <p className="text-xs text-muted-foreground">Valor al Público (Retail)</p>
                  <p className="text-xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                    {formatCurrency(reportData.inventory.totalRetailValue, currencyCode)}
                  </p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Margen estimado</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(
                      reportData.inventory.totalRetailValue - reportData.inventory.totalCostValue,
                      currencyCode
                    )}
                  </span>
                </div>
                {reportData.inventory.lowStockCount > 0 && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">
                      {reportData.inventory.lowStockCount} producto{reportData.inventory.lowStockCount !== 1 ? 's' : ''} con stock bajo
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Balance de Cuentas Contables */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Balance de Cuentas</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead>Cuenta</TableHead>
                        <TableHead className="text-right w-28">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(reportData.accountBalances).map(([name, balance]) => {
                        const acc = accounts.find((a) => a.name === name)
                        const type = acc?.type || ''
                        return (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={name}>
                            <TableCell className="text-sm font-medium">{name}</TableCell>
                            <TableCell className="text-right">
                              <span
                                className={`text-sm font-bold tabular-nums ${getBalanceColor(balance, type)}`}
                              >
                                {formatBalance(balance, type, currencyCode)}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Últimos 7 Días ─────────────────────────────────────── */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Ventas de los Últimos 7 Días</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const maxDay = Math.max(...reportData.dailySales.map((d) => d.sales), 1)
                return reportData.dailySales.map((day) => (
                  <div key={day.date} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{formatDayLabel(day.date)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">{day.orders} ord.</span>
                        <span className="text-sm font-bold tabular-nums">
                          {formatCurrency(day.sales, currencyCode)}
                        </span>
                      </div>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${(day.sales / maxDay) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              })()}
              <Separator />
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">Utilidad Estimada</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(reportData.profit, currencyCode)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ─── Ventas por Origen ──────────────────────────────── */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Ventas por Origen</CardTitle>
              </div>
              <CardDescription>¿De dónde salen las ventas?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const src = reportData.salesBySource
                const totalAll = (src.MESA.total || 0) + (src.POS.total || 0) || 1
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Armchair className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-sm font-semibold">Mesas</span>
                        </div>
                        <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                          {formatCurrency(src.MESA.total, currencyCode)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {src.MESA.count} ventas · {totalAll > 0 ? ((src.MESA.total / totalAll) * 100).toFixed(0) : 0}%
                        </p>
                        <div className="h-2 w-full bg-amber-100 dark:bg-amber-900 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-500"
                            style={{ width: `${(src.MESA.total / totalAll) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Monitor className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                          <span className="text-sm font-semibold">Punto de Venta</span>
                        </div>
                        <p className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
                          {formatCurrency(src.POS.total, currencyCode)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {src.POS.count} ventas · {totalAll > 0 ? ((src.POS.total / totalAll) * 100).toFixed(0) : 0}%
                        </p>
                        <div className="h-2 w-full bg-sky-100 dark:bg-sky-900 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-sky-500 rounded-full transition-all duration-500"
                            style={{ width: `${(src.POS.total / totalAll) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )
              })()}
            </CardContent>
          </Card>

          {/* ─── Detalle de Ventas ──────────────────────────────── */}
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Informe Detallado de Ventas</CardTitle>
              </div>
              <CardDescription>
                {reportData.recentOrders.length} ordenes con origen, productos y método de pago
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {reportData.recentOrders.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No hay ventas en este periodo</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead className="w-[120px]">Fecha</TableHead>
                        <TableHead className="w-[90px]">Orden</TableHead>
                        <TableHead className="w-[100px]">Origen</TableHead>
                        <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead className="text-right w-[110px]">Total</TableHead>
                        <TableHead className="text-left whitespace-nowrap text-xs">Productos</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.recentOrders.map((order) => (
                        <TableRow className="hover:bg-muted/30 transition-colors" key={order.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-medium">
                                {formatDateShort(order.createdAt)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(order.createdAt)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {order.orderNumber}
                          </TableCell>
                          <TableCell>
                            {order.source === 'MESA' ? (
                              <Badge
                                variant="outline"
                                className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px] whitespace-nowrap"
                              >
                                <Armchair className="h-3 w-3 mr-1 inline" />
                                {order.tableName || 'Mesa'}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800 text-[10px] whitespace-nowrap"
                              >
                                <Monitor className="h-3 w-3 mr-1 inline" />
                                POS
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="truncate max-w-[80px] block" title={order.customer}>{order.customer}</span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] whitespace-nowrap ${
                                order.paymentMethod === 'CREDIT'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                  : order.paymentMethod === 'CASH'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800'
                              }`}
                            >
                              {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-sm font-bold tabular-nums">
                                {formatCurrency(order.total, currencyCode)}
                              </span>
                              {order.tipAmount > 0 && (
                                <span className="text-[10px] text-pink-600 dark:text-pink-400 font-medium">
                                  +Propina {formatCurrency(order.tipAmount, currencyCode)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[200px]">
                              {order.items.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="text-xs text-muted-foreground truncate">
                                  {item.quantity}x {item.name}
                                  <span className="text-[10px] ml-1 opacity-60">
                                    ({formatCurrency(item.totalRow, currencyCode)})
                                  </span>
                                </div>
                              ))}
                              {order.items.length > 3 && (
                                <p className="text-[10px] text-muted-foreground/60">
                                  +{order.items.length - 3} más...
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost"
                              size="icon"
                              className="h-7 w-7 active:scale-[0.98] transition-all"
                              title="Imprimir factura"
                              onClick={() => {
                                const items: TicketItem[] = order.items.map((item) => ({
                                  name: item.name,
                                  quantity: item.quantity,
                                  unitPrice: item.unitPrice,
                                  total: item.totalRow,
                                }))
                                printTicket({
                                  storeName: store?.name || '',
                                  orderNumber: order.orderNumber,
                                  date: order.createdAt,
                                  customer: order.customer || undefined,
                                  tableName: order.tableName || undefined,
                                  items,
                                  subtotal: order.subtotal,
                                  tipAmount: order.tipAmount || 0,
                                  total: order.total,
                                  paymentMethod: order.paymentMethod,
                                  currencyCode,
                                })
                              }}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {/* Summary footer */}
              <Separator />
              <div className="flex items-center justify-between p-4 bg-muted/30">
                <span className="text-sm font-medium text-muted-foreground">
                  Total: {reportData.recentOrders.length} ordenes
                </span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Armchair className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs text-muted-foreground">Mesas:</span>
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                      {formatCurrency(reportData.salesBySource.MESA.total, currencyCode)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Monitor className="h-3.5 w-3.5 text-sky-500" />
                    <span className="text-xs text-muted-foreground">POS:</span>
                    <span className="text-sm font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                      {formatCurrency(reportData.salesBySource.POS.total, currencyCode)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ─── Dialog: Resetear Saldos ─────────────────────────────────── */}
      <Dialog open={showResetDialog} onOpenChange={(open) => { if (!open) { setShowResetDialog(false); setResetNote('') } }}>
        <DialogContent className="max-w-sm backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Resetear Saldos
            </DialogTitle>
            <DialogDescription>
              Condona todas las deudas pendientes de los clientes. Las órdenes fiadas quedarán marcadas como saldadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Esta acción registra las deudas como <strong>condonaciones</strong> en contabilidad (cuenta Concesiones y Castigos). No se puede deshacer.
                </p>
              </div>
            </div>
            {reportData && reportData.customerDebts.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Deudas actuales:</p>
                {reportData.customerDebts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span>{c.name}</span>
                    <span className="font-semibold">{formatCurrency(c.totalDebt, currencyCode)}</span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Total a condonar</span>
                  <span className="text-destructive">
                    {formatCurrency(reportData?.customerDebts?.reduce((s, c) => s + c.totalDebt, 0) || 0, currencyCode)}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs">Nota (opcional)</Label>
              <Input
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value)}
                placeholder="Ej: Condonación inicio de mes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowResetDialog(false); setResetNote('') }}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => setShowResetFinalConfirm(true)}
              disabled={isResetting || !reportData?.customerDebts?.length}
            >
              {isResetting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Resetear Todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Confirmación FINAL: Resetear Saldos ─────────────────────── */}
      <AlertDialog open={showResetFinalConfirm} onOpenChange={(open) => { if (!open) setShowResetFinalConfirm(false) }}>
        <AlertDialogContent className="max-w-sm backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              Última Confirmación
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30 p-3">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  ¿Estás ABSOLUTAMENTE seguro?
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Vas a condonar las deudas de <strong>{reportData?.customerDebts?.length || 0} cliente{(reportData?.customerDebts?.length || 0) !== 1 ? 's' : ''}</strong> por un total de:
                </p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300 mt-1">
                  {formatCurrency(reportData?.customerDebts?.reduce((s, c) => s + c.totalDebt, 0) || 0, currencyCode)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Esta acción <strong className="text-destructive">NO se puede deshacer</strong>. Se registrarán como condonaciones en la contabilidad y las órdenes fiadas quedarán saldadas.
              </p>
              {resetNote && (
                <p className="text-xs text-muted-foreground">
                  Nota: <em>{resetNote}</em>
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="mt-0">Volver Atrás</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowResetFinalConfirm(false); handleResetDebts() }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isResetting ? 'Procesando...' : 'Sí, Resetear Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
