'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  useCurrentCashRegister,
  useCashRegisters,
  useCashRegister,
  useOpenCashRegister,
  useUpdateCashRegister,
  useDeleteCashRegister,
} from '@/hooks/api/use-cash-register'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  Wallet,
  TrendingUp,
  CircleDollarSign,
  Heart,
  Scale,
  FileText,
  Receipt,
  Loader2,
  Printer,
  RotateCcw,
  Trash2,
  ListOrdered,
  Search,
  Armchair,
  PackageX,
} from 'lucide-react'
import {
  printCashRegisterClose,
  printDailySummary,
  printProductCatalog,
  type CashRegisterCloseData,
  type DailySummaryData,
  type ProductCatalogData,
} from '@/lib/print-ticket'
import type { CashShift, CashShiftSummary } from './accounting-types'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  getCanonicalMethods,
  getExpectedForCanonical,
  formatCurrency,
  formatTime,
  formatDateShort,
} from './accounting-types'

interface CashRegisterTabProps {
  currencyCode: string
}

export function CashRegisterTab({ currencyCode }: CashRegisterTabProps) {
  const store = useAuthStore((s) => s.store)

  // ─── State ────────────────────────────────────────────────────────────
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [openBalance, setOpenBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')
  const [closeCount, setCloseCount] = useState<Record<string, string>>({})
  const [closeNotes, setCloseNotes] = useState('')
  const [lastClosedShift, setLastClosedShift] = useState<{ shift: CashShift; summary: CashShiftSummary } | null>(null)
  const [deleteShiftId, setDeleteShiftId] = useState<number | null>(null)

  // ─── Shift Detail state ───────────────────────────────────────────────
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailShiftId, setDetailShiftId] = useState<number | null>(null)
  const [detailShiftData, setDetailShiftData] = useState<{
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
  } | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailSearch, setDetailSearch] = useState('')

  // History filter
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')

  const queryClient = useQueryClient()

  // ─── Query hooks ─────────────────────────────────────────────────────
  const { data: openShifts = [], refetch: refetchCurrentShift } = useCurrentCashRegister(store?.id)
  const { data: shiftHistory = [], isLoading: isLoadingCash, refetch: refetchHistory } = useCashRegisters(store?.id, {
    limit: 50,
    from: historyFrom || undefined,
    to: historyTo || undefined,
  })

  // ─── Mutation hooks ─────────────────────────────────────────────────
  const openCashRegister = useOpenCashRegister()
  const updateCashRegister = useUpdateCashRegister()
  const deleteCashRegister = useDeleteCashRegister()
  const isSavingShift = openCashRegister.isPending || updateCashRegister.isPending || deleteCashRegister.isPending

  // ─── Handlers ──────────────────────────────────────────────────────────

  async function handleOpenShift() {
    if (!store?.id || !openBalance) return
    try {
      await openCashRegister.mutateAsync({
        body: {
          storeId: store.id,
          userId: useAuthStore.getState().user?.id || 0,
          openingBalance: parseInt(openBalance) || 0,
          notes: openNotes || undefined,
        },
      })
      toast.success('Caja abierta exitosamente')
      setShowOpenDialog(false)
      setOpenBalance('')
      setOpenNotes('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir caja')
    }
  }

  async function handleCloseShift() {
    const shiftData = openShifts.find((s) => s.shift.id === selectedShiftId)
    if (!shiftData) {
      toast.error('No se encontró el turno seleccionado')
      return
    }

    let closingBalance = 0
    const breakdown: Record<string, number> = {}
    for (const [method, val] of Object.entries(closeCount)) {
      const num = parseInt(val) || 0
      if (num > 0) {
        breakdown[method] = num
        if (method === 'CASH') {
          closingBalance += num
        }
      }
    }

    const body: Record<string, unknown> = { closingBalance }
    if (Object.keys(breakdown).length > 0) body.countBreakdown = breakdown
    if (closeNotes) body.notes = closeNotes

    try {
      const result = await updateCashRegister.mutateAsync({
        id: shiftData.shift.id,
        body,
      })

      const parsedShift = result.shift as CashShift
      const emptySummary: CashShiftSummary = { totalOrders: 0, totalSales: 0, totalTips: 0, cashSales: 0, otherSales: 0, byPayment: {} }

      toast.success('✅ Caja cerrada exitosamente')
      setShowCloseDialog(false)
      setCloseCount({})
      setCloseNotes('')
      setSelectedShiftId(null)

      // Fetch detail for printing
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: ['cash-register-detail', shiftData.shift.id],
          queryFn: async () => {
            const res = await fetch(`/api/cash-register/${shiftData.shift.id}`)
            if (!res.ok) throw new Error('Error')
            return res.json()
          },
          staleTime: 30_000,
        })
        const closedShiftData = { shift: parsedShift, summary: detail.orderSummary as CashShiftSummary }
        setLastClosedShift(closedShiftData)
        printShiftReport(parsedShift, detail.orderSummary as CashShiftSummary)
      } catch {
        setLastClosedShift({ shift: parsedShift, summary: emptySummary })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al cerrar caja. Intenta de nuevo.')
    }
  }

  async function handleReopenShift(shiftId: number) {
    try {
      await updateCashRegister.mutateAsync({
        id: shiftId,
        body: { action: 'reopen' },
      })
      toast.success('Turno reabierto correctamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo reabrir el turno')
    }
  }

  async function handleDeleteShift(shiftId: number) {
    try {
      await deleteCashRegister.mutateAsync({ id: shiftId })
      toast.success('Turno eliminado correctamente')
      setDeleteShiftId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el turno')
    }
  }

  async function handleShowShiftDetail(shiftId: number) {
    setDetailShiftId(shiftId)
    setShowDetailDialog(true)
    setDetailSearch('')
    setIsLoadingDetail(true)
    setDetailShiftData(null)
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['cash-register-detail-orders', shiftId],
        queryFn: async () => {
          const res = await fetch(`/api/cash-register/${shiftId}?storeId=${store?.id}&includeOrders=true`)
          if (!res.ok) throw new Error('Error')
          return res.json()
        },
        staleTime: 30_000,
      })
      setDetailShiftData(data)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function printShiftReport(shift: CashShift, summary: CashShiftSummary) {
    if (!store) return
    const payBreakdown = Object.entries(summary.byPayment).map(([method, data]) => ({
      method,
      count: data.count,
      total: data.total,
    }))
    let parsedCount: Record<string, number> = {}
    if (shift.countBreakdown) {
      try { parsedCount = JSON.parse(shift.countBreakdown) } catch { /* ignore */ }
    }
    const closeData: CashRegisterCloseData = {
      storeName: store.name,
      storeNIT: store.nit || undefined,
      storeAddress: store.address || undefined,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt || new Date().toISOString(),
      responsibleName: shift.user.fullName || 'Usuario',
      openingBalance: shift.openingBalance,
      totalCashSales: summary.cashSales,
      totalOtherSales: summary.otherSales,
      expectedCash: shift.expectedCash || 0,
      actualCash: shift.closingBalance || 0,
      difference: shift.difference || 0,
      totalTips: summary.totalTips,
      paymentBreakdown: payBreakdown,
      countBreakdown: Object.keys(parsedCount).length > 0 ? parsedCount : undefined,
      currencyCode,
    }
    printCashRegisterClose(closeData)
  }

  async function handlePrintShiftFromHistory(shiftId: number) {
    if (!store) return
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['cash-register-detail', shiftId],
        queryFn: async () => {
          const res = await fetch(`/api/cash-register/${shiftId}?storeId=${store.id}`)
          if (!res.ok) throw new Error('Error')
          return res.json()
        },
        staleTime: 30_000,
      })
      printShiftReport(detail.shift, detail.orderSummary)
    } catch {
      toast.error('Error de conexión')
    }
  }

  function handlePrintClose() {
    if (!lastClosedShift) return
    printShiftReport(lastClosedShift.shift, lastClosedShift.summary)
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
                const data = await queryClient.fetchQuery({
                  queryKey: ['daily-report-cash', store.id],
                  queryFn: async () => {
                    const res = await fetch(`/api/reports/daily?storeId=${store.id}`)
                    if (!res.ok) throw new Error('Error')
                    return res.json()
                  },
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
                const data = await queryClient.fetchQuery({
                  queryKey: ['products-catalog-cash', store.id],
                  queryFn: async () => {
                    const res = await fetch(`/api/products?storeId=${store.id}&active=true&limit=500`)
                    if (!res.ok) throw new Error('Error')
                    return res.json()
                  },
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
                            title="Ver detalles" onClick={() => handleShowShiftDetail(shift.id)}>
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

      {/* ─── Dialog: Open Cash ─────────────────────────────────────────── */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent className="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Abrir Caja</DialogTitle>
            <DialogDescription>Registra el saldo inicial en la caja registradora</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Saldo Inicial (COP)</Label>
              <Input type="number" min="0" placeholder="0" value={openBalance} onChange={(e) => setOpenBalance(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea placeholder="Observaciones..." value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpenDialog(false)}>Cancelar</Button>
            <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={handleOpenShift} disabled={isSavingShift || !openBalance}>
              {isSavingShift && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir Caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Close Cash — Conteo Detallado ────────────────────── */}
      <Dialog open={showCloseDialog} onOpenChange={(open) => {
        if (!open) { setSelectedShiftId(null); setCloseCount({}) }
        setShowCloseDialog(open)
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Conteo Final — Cerrar Caja
            </DialogTitle>
            <DialogDescription>
              Ingresa los valores reales que tienes en cada método de pago
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const shiftData = openShifts.find((s) => s.shift.id === selectedShiftId)
            if (!shiftData) return null

            const paymentMethods = Object.keys(shiftData.byPayment)
            const methodsUsed = getCanonicalMethods(paymentMethods)

            const getInitialValue = (method: string) => {
              if (closeCount[method] !== undefined) return closeCount[method]
              return ''
            }

            const reportedCash = parseInt(closeCount['CASH'] || '0') || 0
            const expectedCash = shiftData.expectedCash
            const diffCash = reportedCash - expectedCash

            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted/50 border p-3 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Saldo Inicial (Apertura)</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(shiftData.shift.openingBalance, currencyCode)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Ventas en Efectivo</p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatCurrency(shiftData.cashSales, currencyCode)}
                    </p>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Efectivo Esperado</p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatCurrency(expectedCash, currencyCode)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-sm font-semibold">Conteo por Método de Pago</p>

                  {methodsUsed.map((method) => {
                    const expectedData = getExpectedForCanonical(shiftData.byPayment, method)
                    const isCashMethod = method === 'CASH'
                    const expected = isCashMethod ? expectedData.total + shiftData.shift.openingBalance : expectedData.total
                    const reported = parseInt(closeCount[method] || '0') || 0
                    const diff = reported - expected
                    const label = PAYMENT_METHOD_LABELS[method] || method
                    const color = PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'

                    return (
                      <div key={method} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${color}`} />
                          <Label className="text-xs font-semibold flex-1">{label}</Label>
                          {expected > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              Esperado: {formatCurrency(expected, currencyCode)}{isCashMethod ? ` (${expectedData.count} ventas + ${formatCurrency(shiftData.shift.openingBalance, currencyCode)} apertura)` : ` (${expectedData.count})`}
                            </span>
                          )}
                        </div>
                        <Input type="number" min="0" placeholder="0" value={getInitialValue(method)}
                          onChange={(e) => setCloseCount(prev => ({ ...prev, [method]: e.target.value }))}
                          className="h-9 tabular-nums" />
                        {reported > 0 && expected > 0 && (
                          <p className={`text-[10px] font-medium tabular-nums ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                            {diff === 0 ? '✓ Cuadra' : diff > 0 ? `+${formatCurrency(diff, currencyCode)} de más` : `${formatCurrency(Math.abs(diff), currencyCode)} de menos`}
                          </p>
                        )}
                      </div>
                    )
                  })}

                  {methodsUsed.length > 0 && (
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">
                        Los métodos se muestran según las ventas del turno
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Resumen del Conteo</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs">Efectivo Reportado (apertura + ventas)</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(reportedCash, currencyCode)}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                    diffCash === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : diffCash > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-red-50 dark:bg-red-950/30'
                  }`}>
                    <span className="text-xs font-medium">Diferencia Efectivo</span>
                    <span className={`text-sm font-bold tabular-nums ${
                      diffCash === 0 ? 'text-emerald-600 dark:text-emerald-400' : diffCash > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {diffCash === 0 ? '✓ Cuadra perfectamente' : `${diffCash > 0 ? '+' : ''}${formatCurrency(diffCash, currencyCode)}`}
                    </span>
                  </div>
                  {(() => {
                    let otherTotal = 0
                    for (const [method, val] of Object.entries(closeCount)) {
                      if (method !== 'CASH') otherTotal += parseInt(val) || 0
                    }
                    if (otherTotal === 0) return null
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Otros Métodos</span>
                        <span className="text-sm font-bold tabular-nums">{formatCurrency(otherTotal, currencyCode)}</span>
                      </div>
                    )
                  })()}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea placeholder="Observaciones del cierre..." value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} />
                </div>
              </div>
            )
          })()}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => { setSelectedShiftId(null); setCloseCount({}); setShowCloseDialog(false) }}>Cancelar</Button>
            <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={handleCloseShift} disabled={isSavingShift} variant="destructive">
              {isSavingShift && <Loader2 className="h-4 w-4 animate-spin" />}
              <Scale className="h-4 w-4" />
              Confirmar y Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Shift Detail (Products Invoiced) ─────────────────── */}
      <Dialog open={showDetailDialog} onOpenChange={(open) => {
        if (!open) { setDetailShiftId(null); setDetailShiftData(null); setDetailSearch('') }
        setShowDetailDialog(open)
      }}>
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
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsable</p>
                    <p className="text-sm font-semibold truncate">{detailShiftData.shift.user.fullName || 'Usuario'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Apertura</p>
                    <p className="text-sm font-semibold tabular-nums">{formatTime(detailShiftData.shift.openedAt)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDateShort(detailShiftData.shift.openedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cierre</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {detailShiftData.shift.closedAt ? formatTime(detailShiftData.shift.closedAt) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {detailShiftData.shift.closedAt ? formatDateShort(detailShiftData.shift.closedAt) : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estado</p>
                    <Badge variant="outline" className={
                      detailShiftData.shift.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px]'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 text-[10px]'
                    }>
                      {detailShiftData.shift.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Órdenes</p>
                  <p className="text-lg font-bold tabular-nums">{detailShiftData.orderSummary.totalOrders}</p>
                </Card>
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ventas Totales</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(detailShiftData.orderSummary.totalSales, currencyCode)}
                  </p>
                </Card>
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Propinas</p>
                  <p className="text-lg font-bold tabular-nums text-pink-600 dark:text-pink-400">
                    {formatCurrency(detailShiftData.orderSummary.totalTips, currencyCode)}
                  </p>
                </Card>
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Efectivo</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatCurrency(detailShiftData.orderSummary.cashSales, currencyCode)}
                  </p>
                </Card>
              </div>

              {/* Search */}
              <div className="relative">
                <Input placeholder="Buscar producto o servicio..." value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} className="h-9 pl-8" />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>

              {/* Aggregated Products Table */}
              {(() => {
                const searchLower = detailSearch.toLowerCase().trim()
                const filteredProducts = searchLower
                  ? detailShiftData.aggregatedProducts.filter((p) =>
                      p.name.toLowerCase().includes(searchLower) ||
                      p.category?.toLowerCase().includes(searchLower) ||
                      p.sku?.toLowerCase().includes(searchLower)
                    )
                  : detailShiftData.aggregatedProducts

                if (filteredProducts.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <PackageX className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {searchLower ? 'No se encontraron productos' : 'No hay productos facturados en este turno'}
                      </p>
                    </div>
                  )
                }

                const totalQty = filteredProducts.reduce((sum, p) => sum + p.quantity, 0)
                const totalVal = filteredProducts.reduce((sum, p) => sum + p.total, 0)

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Productos Facturados (A-Z) — {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalQty} unidades · Total: <span className="font-bold text-foreground">{formatCurrency(totalVal, currencyCode)}</span>
                      </p>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-muted/30 transition-colors">
                            <TableHead className="w-[40px] text-center text-[10px]">#</TableHead>
                            <TableHead className="text-[11px]">Producto/Servicio</TableHead>
                            <TableHead className="text-[11px] whitespace-nowrap w-[80px]">Categoría</TableHead>
                            <TableHead className="text-[11px] text-center w-[60px]">Cant.</TableHead>
                            <TableHead className="text-[11px] text-right w-[100px]">Unitario</TableHead>
                            <TableHead className="text-[11px] text-right w-[110px]">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts.map((product, idx) => (
                            <TableRow className="hover:bg-muted/30 transition-colors" key={`${product.productId || 'svc'}-${product.serviceId || 'prd'}-${product.name}`}>
                              <TableCell className="text-center text-[10px] text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5">
                                    {product.isService && (
                                      <Badge variant="outline" className="text-[8px] px-1 py-0 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 border-violet-200">Svc</Badge>
                                    )}
                                    <span className="text-xs font-medium truncate max-w-[180px]">{product.name}</span>
                                  </div>
                                  {product.sku && <span className="text-[9px] text-muted-foreground">SKU: {product.sku}</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                {product.category ? <Badge variant="outline" className="text-[9px]">{product.category}</Badge> : <span className="text-[10px] text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-center text-xs font-semibold tabular-nums">{product.quantity}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(Math.round(product.total / product.quantity), currencyCode)}</TableCell>
                              <TableCell className="text-right text-xs font-bold tabular-nums">{formatCurrency(product.total, currencyCode)}</TableCell>
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
                      const payLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod
                      const payColor = PAYMENT_METHOD_COLORS[order.paymentMethod] || 'bg-gray-400'
                      return (
                        <div key={order.id} className="border-b last:border-b-0 p-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono font-bold text-muted-foreground">{order.orderNumber}</span>
                              {order.tableName && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0">
                                  <Armchair className="h-2.5 w-2.5 mr-0.5" />{order.tableName}
                                </Badge>
                              )}
                              <div className={`h-2 w-2 rounded-full ${payColor} shrink-0`} />
                              <span className="text-[9px] text-muted-foreground">{payLabel}</span>
                              {order.customer && (
                                <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">· {order.customer.name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] text-muted-foreground tabular-nums">{formatTime(order.createdAt)}</span>
                              <span className="text-xs font-bold tabular-nums">{formatCurrency(order.total, currencyCode)}</span>
                            </div>
                          </div>
                          <div className="mt-1.5 ml-4 space-y-0.5">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-[10px]">
                                <div className="flex items-center gap-1 min-w-0">
                                  {item.isService && (
                                    <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 border-violet-200 leading-none">Svc</Badge>
                                  )}
                                  <span className="truncate max-w-[200px]">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                  <span className="text-muted-foreground">×{item.quantity}</span>
                                  <span className="font-medium">{formatCurrency(item.totalRow, currencyCode)}</span>
                                </div>
                              </div>
                            ))}
                            {order.tipAmount > 0 && (
                              <div className="flex items-center justify-between text-[10px] text-pink-600 dark:text-pink-400">
                                <div className="flex items-center gap-1">
                                  <Heart className="h-2.5 w-2.5" />
                                  <span>Propina</span>
                                </div>
                                <span className="font-medium tabular-nums">{formatCurrency(order.tipAmount, currencyCode)}</span>
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ventas por Método de Pago</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(detailShiftData.orderSummary.byPayment)
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([method, data]) => {
                        const label = PAYMENT_METHOD_LABELS[method] || method
                        const color = PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'
                        return (
                          <div key={method} className="rounded-lg border p-2.5 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                              <span className="text-[10px] font-medium">{label}</span>
                              <span className="text-[9px] text-muted-foreground ml-auto tabular-nums">{data.count}</span>
                            </div>
                            <p className="text-xs font-bold tabular-nums">{formatCurrency(data.total, currencyCode)}</p>
                            {data.tips > 0 && <p className="text-[9px] text-pink-500 tabular-nums">+{formatCurrency(data.tips, currencyCode)} propina</p>}
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No se pudo cargar el detalle</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
