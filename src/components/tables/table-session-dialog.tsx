'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Minus, Loader2 } from 'lucide-react'
import type { BarTable, TableSession, Customer } from '@/hooks/use-tables-data'
import { ZONES, ZONE_STYLES } from '@/hooks/use-tables-data'

export { PaymentDialog } from './payment-dialog'

// ─── Open Session Dialog ────────────────────────────────────────────────────

interface OpenSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTable: BarTable | null
  customers: Customer[]
  customersLoading: boolean
  onOpenSession: (data: { guests: number; customerId: number | null; notes: string }) => void
  saving: boolean
}

export function OpenSessionDialog({
  open,
  onOpenChange,
  selectedTable,
  customers,
  customersLoading,
  onOpenSession,
  saving,
}: OpenSessionDialogProps) {
  const [guests, setGuests] = useState('1')
  const [notes, setNotes] = useState('')
  const [customerId, setCustomerId] = useState<string>('none')

  // Reset form when dialog opens
  function handleOpenChange(open: boolean) {
    if (!open) {
      setGuests('1')
      setNotes('')
      setCustomerId('none')
    }
    onOpenChange(open)
  }

  function handleConfirm() {
    const guestNum = parseInt(guests, 10)
    if (isNaN(guestNum) || guestNum < 1) {
      toast.error('El número de invitados debe ser al menos 1')
      return
    }
    const cid = customerId && customerId !== 'none' ? parseInt(customerId, 10) : null
    onOpenSession({ guests: guestNum, customerId: cid, notes: notes.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Abrir Mesa {selectedTable?.number}</DialogTitle>
          <DialogDescription>
            Inicia una nueva sesión para esta mesa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="session-guests">
              Invitados <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <Button type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 active:scale-[0.98] transition-all"
                onClick={() => setGuests(String(Math.max(1, parseInt(guests, 10) - 1)))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="session-guests"
                type="number"
                min="1"
                max="50"
                className="w-20 text-center"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
              />
              <Button type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 active:scale-[0.98] transition-all"
                onClick={() => setGuests(String(parseInt(guests, 10) + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-customer">Cliente (opcional)</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger id="session-customer" className="w-full">
                <SelectValue placeholder={customersLoading ? 'Cargando...' : 'Sin cliente'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin cliente</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.phone ? ` (${c.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-notes">Notas</Label>
            <Textarea
              id="session-notes"
              placeholder="Notas adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="gap-2 active:scale-[0.98] transition-all" onClick={handleConfirm} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Abrir Mesa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Close Session Dialog ───────────────────────────────────────────────────

interface CloseSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: TableSession | null
  hasUnpaidItems: boolean
  saving: boolean
  onClose: () => void
}

export function CloseSessionDialog({
  open,
  onOpenChange,
  session,
  hasUnpaidItems,
  saving,
  onClose,
}: CloseSessionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="backdrop-blur-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Cerrar Mesa</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas cerrar la mesa {session?.barTable.number}?
            {!hasUnpaidItems
              ? ' Todos los items han sido pagados.'
              : ' Aún hay items sin pagar.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onClose}
            disabled={saving || hasUnpaidItems}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {saving ? 'Cerrando...' : 'Cerrar Mesa'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Add Table Dialog ───────────────────────────────────────────────────────

interface AddTableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  saving: boolean
  onCreate: (data: { number: string; name: string; capacity: string; zone: string }) => Promise<boolean>
}

export function AddTableDialog({ open, onOpenChange, saving, onCreate }: AddTableDialogProps) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [zone, setZone] = useState('PRINCIPAL')

  function handleOpenChange(open: boolean) {
    if (!open) {
      setNumber('')
      setName('')
      setCapacity('4')
      setZone('PRINCIPAL')
    }
    onOpenChange(open)
  }

  async function handleConfirm() {
    const success = await onCreate({ number, name, capacity, zone })
    if (success) {
      handleOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nueva Mesa</DialogTitle>
          <DialogDescription>
            Agrega una nueva mesa al salón.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="table-number">
                Número <span className="text-destructive">*</span>
              </Label>
              <Input
                id="table-number"
                type="number"
                min="1"
                placeholder="1"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-capacity">
                Capacidad <span className="text-destructive">*</span>
              </Label>
              <Input
                id="table-capacity"
                type="number"
                min="1"
                placeholder="4"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="table-name">Nombre (opcional)</Label>
            <Input
              id="table-name"
              placeholder="Ej: Mesa de la esquina"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="table-zone">Zona</Label>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger id="table-zone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => (
                  <SelectItem key={z} value={z}>
                    {ZONE_STYLES[z]?.label ?? z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="gap-2 active:scale-[0.98] transition-all" onClick={handleConfirm} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear Mesa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Table Dialog ────────────────────────────────────────────────────

interface DeleteTableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tables: BarTable[]
  deletingTableId: number | null
  saving: boolean
  onConfirm: () => void
}

export function DeleteTableDialog({
  open,
  onOpenChange,
  tables,
  deletingTableId,
  saving,
  onConfirm,
}: DeleteTableDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="backdrop-blur-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar Mesa</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas eliminar esta mesa? Esta acción no se puede deshacer.
            {deletingTableId && tables.find(t => t.id === deletingTableId)?.activeSession
              ? ' La mesa tiene una sesión abierta y no se puede eliminar.'
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={
              saving ||
              (deletingTableId !== null && !!tables.find(t => t.id === deletingTableId)?.activeSession)
            }
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {saving ? 'Eliminando...' : 'Eliminar Mesa'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
