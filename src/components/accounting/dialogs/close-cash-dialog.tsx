'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Loader2, Scale } from 'lucide-react'
import type { OpenShiftData } from '@/hooks/api/use-cash-register'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  getCanonicalMethods,
  getExpectedForCanonical,
  formatCurrency,
} from '@/components/accounting/accounting-types'

interface CloseCashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: (
    openShiftsData: OpenShiftData[],
    shiftId: number | null,
    closeCount: Record<string, string>,
    closeNotes: string,
  ) => void
  openShifts: OpenShiftData[]
  selectedShiftId: number | null
  currencyCode: string
  isPending: boolean
}

export function CloseCashDialog({
  open,
  onOpenChange,
  onClose,
  openShifts,
  selectedShiftId,
  currencyCode,
  isPending,
}: CloseCashDialogProps) {
  const [closeCount, setCloseCount] = useState<Record<string, string>>({})
  const [closeNotes, setCloseNotes] = useState('')

  function handleOpenChange(value: boolean) {
    if (!value) {
      setCloseCount({})
      setCloseNotes('')
    }
    onOpenChange(value)
  }

  function handleCancel() {
    setCloseCount({})
    setCloseNotes('')
    onOpenChange(false)
  }

  function handleSubmit() {
    onClose(openShifts, selectedShiftId, closeCount, closeNotes)
    setCloseCount({})
    setCloseNotes('')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          const shiftData = openShifts.find(
            (s) => s.shift.id === selectedShiftId,
          )
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
                  <p className="text-xs text-muted-foreground font-medium">
                    Saldo Inicial (Apertura)
                  </p>
                  <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(shiftData.shift.openingBalance, currencyCode)}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">
                    Ventas en Efectivo
                  </p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatCurrency(shiftData.cashSales, currencyCode)}
                  </p>
                </div>
                {!!shiftData.cxcCollected && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">
                      + Recaudos CxC (abonos)
                    </p>
                    <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(shiftData.cxcCollected, currencyCode)}
                    </p>
                  </div>
                )}
                {!!shiftData.pettyCashExpenses && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">
                      − Gastos de Caja Menor
                    </p>
                    <p className="text-sm font-bold tabular-nums text-red-700 dark:text-red-400">
                      -{formatCurrency(shiftData.pettyCashExpenses, currencyCode)}
                    </p>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">
                    Efectivo Esperado
                  </p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatCurrency(expectedCash, currencyCode)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  Conteo por Método de Pago
                </p>

                {methodsUsed.map((method) => {
                  const expectedData = getExpectedForCanonical(
                    shiftData.byPayment,
                    method,
                  )
                  const isCashMethod = method === 'CASH'
                  const expected = isCashMethod
                    ? expectedData.total + shiftData.shift.openingBalance
                    : expectedData.total
                  const reported = parseInt(closeCount[method] || '0') || 0
                  const diff = reported - expected
                  const label = PAYMENT_METHOD_LABELS[method] || method
                  const color = PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'

                  return (
                    <div key={method} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${color}`} />
                        <Label className="text-xs font-semibold flex-1">
                          {label}
                        </Label>
                        {expected > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            Esperado:{' '}
                            {formatCurrency(expected, currencyCode)}
                            {isCashMethod
                              ? ` (${expectedData.count} ventas + ${formatCurrency(shiftData.shift.openingBalance, currencyCode)} apertura)`
                              : ` (${expectedData.count})`}
                          </span>
                        )}
                      </div>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={getInitialValue(method)}
                        onChange={(e) =>
                          setCloseCount((prev) => ({
                            ...prev,
                            [method]: e.target.value,
                          }))
                        }
                        className="h-9 tabular-nums"
                      />
                      {reported > 0 && expected > 0 && (
                        <p
                          className={`text-[10px] font-medium tabular-nums ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}
                        >
                          {diff === 0
                            ? '✓ Cuadra'
                            : diff > 0
                              ? `+${formatCurrency(diff, currencyCode)} de más`
                              : `${formatCurrency(Math.abs(diff), currencyCode)} de menos`}
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
                <p className="text-xs font-semibold text-muted-foreground">
                  Resumen del Conteo
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs">
                      Efectivo Reportado (apertura + ventas)
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(reportedCash, currencyCode)}
                  </span>
                </div>
                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                    diffCash === 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/30'
                      : diffCash > 0
                        ? 'bg-amber-50 dark:bg-amber-950/30'
                        : 'bg-red-50 dark:bg-red-950/30'
                  }`}
                >
                  <span className="text-xs font-medium">
                    Diferencia Efectivo
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      diffCash === 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : diffCash > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {diffCash === 0
                      ? '✓ Cuadra perfectamente'
                      : `${diffCash > 0 ? '+' : ''}${formatCurrency(diffCash, currencyCode)}`}
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
                      <span className="text-xs text-muted-foreground">
                        Otros Métodos
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {formatCurrency(otherTotal, currencyCode)}
                      </span>
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea
                  placeholder="Observaciones del cierre..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )
        })()}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button
            className="gap-1.5 active:scale-[0.98] transition-all"
            onClick={handleSubmit}
            disabled={isPending}
            variant="destructive"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Scale className="h-4 w-4" />
            Confirmar y Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
