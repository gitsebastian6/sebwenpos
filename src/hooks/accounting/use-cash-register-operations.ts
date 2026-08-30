'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useQueryClient } from '@tanstack/react-query'
import { queryFetch } from '@/hooks/api/query-helpers'
import { toast } from 'sonner'
import {
  useCurrentShift,
  useShiftHistory,
  useOpenShift,
  useCloseShift,
  useReopenShift,
  useDeleteShift,
} from '@/hooks/api/use-cash-register'
import type { CashShift, CashShiftSummary, ShiftDetailData } from '@/hooks/api/use-cash-register'
import type { CashShift as ComponentCashShift, CashShiftSummary as ComponentCashShiftSummary } from '@/components/accounting/accounting-types'
import {
  printCashRegisterClose,
  type CashRegisterCloseData,
} from '@/lib/print-ticket'
import { receiptPaperWidthOf } from '@/lib/receipt-store-fields'

export function useCashRegisterOperations(currencyCode: string) {
  const store = useAuthStore((s) => s.store)
  const queryClient = useQueryClient()

  // ─── State ──────────────────────────────────────────────────────────────
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null)
  const [lastClosedShift, setLastClosedShift] = useState<{
    shift: ComponentCashShift
    summary: ComponentCashShiftSummary
  } | null>(null)
  const [deleteShiftId, setDeleteShiftId] = useState<number | null>(null)

  // History filter
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')

  // ─── Query hooks ───────────────────────────────────────────────────────
  const {
    data: openShifts = [],
    refetch: refetchCurrentShift,
  } = useCurrentShift(store?.id)

  const {
    data: shiftHistory = [],
    isLoading: isLoadingCash,
    refetch: refetchHistory,
  } = useShiftHistory(store?.id, {
    limit: 50,
    from: historyFrom || undefined,
    to: historyTo || undefined,
  })

  // ─── Mutation hooks ────────────────────────────────────────────────────
  const openShift = useOpenShift()
  const closeShift = useCloseShift()
  const reopenShift = useReopenShift()
  const deleteShift = useDeleteShift()
  const isSavingShift =
    openShift.isPending || closeShift.isPending || deleteShift.isPending

  // ─── Handlers ──────────────────────────────────────────────────────────

  async function handleOpenShift(openBalance: string, openNotes: string) {
    if (!store?.id || !openBalance) return
    try {
      await openShift.mutateAsync({
        storeId: store.id,
        userId: useAuthStore.getState().user?.id || 0,
        openingBalance: parseInt(openBalance) || 0,
        notes: openNotes || undefined,
      })
      toast.success('Caja abierta exitosamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir caja')
    }
  }

  async function handleCloseShift(
    openShiftsData: Array<{
      shift: CashShift
      byPayment: Record<string, { count: number; total: number; tips: number }>
      expectedCash: number
      cashSales: number
    }>,
    shiftId: number | null,
    closeCount: Record<string, string>,
    closeNotes: string,
  ) {
    const shiftData = openShiftsData.find((s) => s.shift.id === shiftId)
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
      const result = await closeShift.mutateAsync({
        id: shiftData.shift.id,
        body,
      })

      const parsedShift = result.shift
      const emptySummary: CashShiftSummary = {
        totalOrders: 0,
        totalSales: 0,
        totalTips: 0,
        cashSales: 0,
        otherSales: 0,
        byPayment: {},
      }

      toast.success('✅ Caja cerrada exitosamente')
      setSelectedShiftId(null)

      // Fetch detail for printing
      try {
        const detail = await queryClient.fetchQuery<ShiftDetailData>({
          queryKey: ['cash-register-detail', shiftData.shift.id],
          queryFn: () => queryFetch<ShiftDetailData>(`/api/cash-register/${shiftData.shift.id}`),
          staleTime: 30_000,
        })
        const closedShiftData = {
          shift: parsedShift as unknown as ComponentCashShift,
          summary: detail.orderSummary as unknown as ComponentCashShiftSummary,
        }
        setLastClosedShift(closedShiftData)
        printShiftReport(parsedShift as unknown as ComponentCashShift, detail.orderSummary as unknown as ComponentCashShiftSummary)
      } catch {
        setLastClosedShift({ shift: parsedShift as unknown as ComponentCashShift, summary: emptySummary as unknown as ComponentCashShiftSummary })
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Error de conexión al cerrar caja. Intenta de nuevo.',
      )
    }
  }

  async function handleReopenShift(shiftId: number) {
    try {
      await reopenShift.mutateAsync({ id: shiftId })
      toast.success('Turno reabierto correctamente')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo reabrir el turno',
      )
    }
  }

  async function handleDeleteShift(shiftId: number) {
    try {
      await deleteShift.mutateAsync({ id: shiftId })
      toast.success('Turno eliminado correctamente')
      setDeleteShiftId(null)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo eliminar el turno',
      )
    }
  }

  async function printShiftReport(
    shift: ComponentCashShift,
    summary: ComponentCashShiftSummary,
  ) {
    if (!store) return
    const payBreakdown = Object.entries(summary.byPayment).map(
      ([method, data]) => ({
        method,
        count: data.count,
        total: data.total,
      }),
    )
    let parsedCount: Record<string, number> = {}
    if (shift.countBreakdown) {
      try {
        parsedCount = JSON.parse(shift.countBreakdown)
      } catch {
        /* ignore */
      }
    }
    const closeData: CashRegisterCloseData = {
      storeName: store.name,
      storeNIT: store.nit || undefined,
      storeAddress: store.address || undefined,
      paperWidth: receiptPaperWidthOf(store),
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
      countBreakdown:
        Object.keys(parsedCount).length > 0 ? parsedCount : undefined,
      currencyCode,
    }
    printCashRegisterClose(closeData)
  }

  async function handlePrintShiftFromHistory(shiftId: number) {
    if (!store) return
    try {
      const detail = await queryClient.fetchQuery<ShiftDetailData>({
        queryKey: ['cash-register-detail', shiftId],
        queryFn: () =>
          queryFetch<ShiftDetailData>(`/api/cash-register/${shiftId}?storeId=${store.id}`),
        staleTime: 30_000,
      })
      printShiftReport(detail.shift as unknown as ComponentCashShift, detail.orderSummary as unknown as ComponentCashShiftSummary)
    } catch {
      toast.error('Error de conexión')
    }
  }

  function handlePrintClose() {
    if (!lastClosedShift) return
    printShiftReport(lastClosedShift.shift, lastClosedShift.summary)
  }

  return {
    // State
    openShifts,
    shiftHistory,
    isLoadingCash,
    lastClosedShift,
    setLastClosedShift,
    selectedShiftId,
    setSelectedShiftId,
    deleteShiftId,
    setDeleteShiftId,
    // Handlers
    handleOpenShift,
    handleCloseShift,
    handleReopenShift,
    handleDeleteShift,
    handlePrintShiftFromHistory,
    handlePrintClose,
    printShiftReport,
    // Refetch
    refetchCurrentShift,
    refetchHistory,
    // Flags
    isSavingShift,
    // History filter state
    historyFrom,
    setHistoryFrom,
    historyTo,
    setHistoryTo,
    // QueryClient (for inline fetches in the main component)
    queryClient,
    store,
  }
}
