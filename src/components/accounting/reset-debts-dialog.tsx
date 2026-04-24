'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
import { RotateCcw, AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react'
import { formatCurrency } from './accounting-types'

interface CustomerDebt {
  id: number
  name: string
  phone: string | null
  totalDebt: number
}

interface ResetDebtsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResetComplete: (note: string) => void
  customerDebts: CustomerDebt[]
  totalDebt: number
  currencyCode: string
  isResetting: boolean
}

export function ResetDebtsDialog({
  open,
  onOpenChange,
  onResetComplete,
  customerDebts,
  totalDebt,
  currencyCode,
  isResetting,
}: ResetDebtsDialogProps) {
  const [resetNote, setResetNote] = useState('')
  const [showResetFinalConfirm, setShowResetFinalConfirm] = useState(false)

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setResetNote('')
      setShowResetFinalConfirm(false)
    }
    onOpenChange(nextOpen)
  }

  const handleConfirm = () => {
    setShowResetFinalConfirm(false)
    onResetComplete(resetNote)
  }

  return (
    <>
      {/* ─── Dialog: Resetear Saldos ─────────────────────────────────── */}
      <Dialog open={open && !showResetFinalConfirm} onOpenChange={handleClose}>
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
            {customerDebts.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Deudas actuales:</p>
                {customerDebts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span>{c.name}</span>
                    <span className="font-semibold">{formatCurrency(c.totalDebt, currencyCode)}</span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Total a condonar</span>
                  <span className="text-destructive">
                    {formatCurrency(totalDebt, currencyCode)}
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
            <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => setShowResetFinalConfirm(true)}
              disabled={isResetting || !customerDebts.length}
            >
              {isResetting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Resetear Todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmación FINAL: Resetear Saldos ─────────────────────── */}
      <AlertDialog open={open && showResetFinalConfirm} onOpenChange={(nextOpen) => { if (!nextOpen) setShowResetFinalConfirm(false) }}>
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
                  Vas a condonar las deudas de <strong>{customerDebts.length} cliente{customerDebts.length !== 1 ? 's' : ''}</strong> por un total de:
                </p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300 mt-1">
                  {formatCurrency(totalDebt, currencyCode)}
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
              onClick={handleConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isResetting ? 'Procesando...' : 'Sí, Resetear Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
