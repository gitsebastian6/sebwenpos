'use client'

import { useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryFetch } from '@/hooks/api/query-helpers'
import { useResetCustomerDebts } from '@/hooks/api/use-customers'
import { useDailyReport } from '@/hooks/api/use-reports'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { CalendarDays, FileText, Loader2 } from 'lucide-react'
import type { LedgerAccount, ReportData } from './accounting-types'
import { ReportsKpiCards } from './reports-kpi-cards'
import {
  SalesByPaymentCard,
  SalesByCategoryCard,
  TopProductsCard,
  SalesBySourceCard,
} from './reports-sales-sections'
import {
  CuentasPorCobrarCard,
  LowStockProductsCard,
  ValuedInventoryCard,
  BalanceCuentasCard,
} from './reports-inventory-sections'
import { DailySalesCard, SalesDetailCard } from './reports-daily-sales'
import { ResetDebtsDialog } from './reset-debts-dialog'
import {
  handlePrintDailySummary,
  handlePrintCatalog,
  handlePrintKardex,
} from './reports-print-handlers'

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

  async function handleResetDebts(note: string) {
    if (!store?.id) return
    try {
      const data = await resetDebtsMut.mutateAsync({ body: { storeId: store.id, note: note.trim() || undefined } })
      toast.success(data.message)
      setShowResetDialog(false)
      fetchReports()
      onAccountsChanged()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo resetear saldos')
    }
  }

  // ─── Print handlers (delegated to print module) ─────────────────────────

  const onPrintDailySummary = useCallback(() => {
    if (store) handlePrintDailySummary(queryClient, store, currencyCode)
  }, [queryClient, store, currencyCode])

  const onPrintCatalog = useCallback(() => {
    if (store) handlePrintCatalog(queryClient, store, currencyCode)
  }, [queryClient, store, currencyCode])

  const onPrintKardex = useCallback((productId: number, productName: string, category: string, sku?: string | null) => {
    if (store) handlePrintKardex(queryClient, store, productId, productName, category, sku, currencyCode)
  }, [queryClient, store, currencyCode])

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
            <Button className="h-9 gap-1.5 active:scale-[0.98] transition-all" onClick={() => void fetchReports()}
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
              <div className="p-6 pb-0">
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="p-6 pt-2">
                <Skeleton className="h-8 w-32 mt-2" />
                <Skeleton className="h-3 w-20 mt-2" />
              </div>
            </Card>
          ))}
        </div>
      ) : reportData ? (
        <>
          {/* KPI Cards */}
          <ReportsKpiCards reportData={reportData} currencyCode={currencyCode} />

          {/* Ventas por Método de Pago */}
          <SalesByPaymentCard reportData={reportData} currencyCode={currencyCode} />

          {/* Ventas por Categoría + Top Productos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesByCategoryCard reportData={reportData} currencyCode={currencyCode} />
            <TopProductsCard reportData={reportData} currencyCode={currencyCode} />
          </div>

          {/* Cuentas por Cobrar */}
          <CuentasPorCobrarCard
            reportData={reportData}
            currencyCode={currencyCode}
            onResetDebts={() => setShowResetDialog(true)}
          />

          {/* Productos con Stock Bajo */}
          <LowStockProductsCard reportData={reportData} currencyCode={currencyCode} />

          {/* Inventario Valorizado + Balance Cuentas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ValuedInventoryCard reportData={reportData} currencyCode={currencyCode} />
            <BalanceCuentasCard reportData={reportData} currencyCode={currencyCode} accounts={accounts} />
          </div>

          {/* Últimos 7 Días */}
          <DailySalesCard reportData={reportData} currencyCode={currencyCode} />

          {/* Ventas por Origen */}
          <SalesBySourceCard reportData={reportData} currencyCode={currencyCode} />

          {/* Detalle de Ventas */}
          <SalesDetailCard
            reportData={reportData}
            currencyCode={currencyCode}
            storeName={store?.name || ''}
          />
        </>
      ) : null}

      {/* ─── Reset Debts Dialog ────────────────────────────────────── */}
      <ResetDebtsDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        onResetComplete={handleResetDebts}
        customerDebts={reportData?.customerDebts || []}
        totalDebt={reportData?.customerDebts?.reduce((s, c) => s + c.totalDebt, 0) || 0}
        currencyCode={currencyCode}
        isResetting={isResetting}
      />
    </div>
  )
}
