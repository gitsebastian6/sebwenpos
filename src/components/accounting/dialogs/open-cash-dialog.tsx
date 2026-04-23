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
import { Loader2 } from 'lucide-react'

interface OpenCashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (openBalance: string, openNotes: string) => void
  isPending: boolean
}

export function OpenCashDialog({
  open,
  onOpenChange,
  onOpen,
  isPending,
}: OpenCashDialogProps) {
  const [openBalance, setOpenBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')

  function handleSubmit() {
    onOpen(openBalance, openNotes)
  }

  // Reset form when dialog opens
  function handleOpenChange(value: boolean) {
    if (!value) {
      setOpenBalance('')
      setOpenNotes('')
    }
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Abrir Caja</DialogTitle>
          <DialogDescription>
            Registra el saldo inicial en la caja registradora
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Saldo Inicial (COP)</Label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={openBalance}
              onChange={(e) => setOpenBalance(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Observaciones..."
              value={openNotes}
              onChange={(e) => setOpenNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="gap-1.5 active:scale-[0.98] transition-all"
            onClick={handleSubmit}
            disabled={isPending || !openBalance}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Abrir Caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
