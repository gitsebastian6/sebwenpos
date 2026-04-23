'use client'

import { useState } from 'react'
import { RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useResetStock } from '@/hooks/api/use-inventory'

interface InventoryResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number | undefined
}

export function InventoryResetDialog({ open, onOpenChange, storeId }: InventoryResetDialogProps) {
  const [resetNote, setResetNote] = useState('')
  const resetStock = useResetStock()
  const isResetting = resetStock.isPending

  async function handleResetStock() {
    if (!storeId) return
    try {
      const data = await resetStock.mutateAsync({
        body: { storeId, note: resetNote.trim() || undefined },
      })
      toast.success(data.message)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo resetear inventario')
    }
  }

  function handleClose() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-sm backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-destructive" />
            Resetear Stock a 0
          </DialogTitle>
          <DialogDescription>
            Pone el stock de TODOS los productos a 0 y registra el movimiento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Esta acción no se puede deshacer. Todos los productos quedarán en stock 0.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nota (opcional)</Label>
            <Input
              value={resetNote}
              onChange={(e) => setResetNote(e.target.value)}
              placeholder="Ej: Inicio de inventario"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button variant="destructive" onClick={handleResetStock} disabled={isResetting}>
            {isResetting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Resetear Todo a 0
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
