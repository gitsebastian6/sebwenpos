'use client'

import { useState } from 'react'
import type { Product, Category, TraceMovement } from '@/types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { CategoryIconPicker, getCategoryIconByName } from '@/components/ui/category-icon-picker'
import {
  Route,
  Loader2,
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────

export const LOSS_REASONS = [
  { value: 'VENCIDO', label: 'Producto vencido' },
  { value: 'DANADO', label: 'Producto dañado' },
  { value: 'ROBO', label: 'Robo o hurto' },
  { value: 'DERRAME', label: 'Derrame o rotura' },
  { value: 'INVENTARIO', label: 'Diferencia de inventario' },
  { value: 'OTRO', label: 'Otro motivo' },
]

export const MOV_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  LOSS: 'Pérdida',
}

// ─── Props Interfaces ───────────────────────────────────────────────────────

export interface AdjustStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  currentStock: number
  onSubmit: (newStock: number, notes: string) => Promise<void>
  submitting: boolean
}

export interface LossDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  onSubmit: (quantity: number, reason: string, notes: string) => Promise<void>
  submitting: boolean
}

export interface ReturnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  onSubmit: (quantity: number, notes: string) => Promise<void>
  submitting: boolean
}

export interface TraceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  movements: TraceMovement[]
  loading: boolean
}

export interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingCategory: Category | null
  onSave: (name: string, icon: string, isEditing: boolean) => Promise<void>
  saving: boolean
}

export interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: { type: 'product' | 'category'; item: Product | Category } | null
  onConfirm: () => Promise<void>
  deleting: boolean
}

// ─── Category Form Dialog ──────────────────────────────────────────────────

export function CategoryFormDialog({
  open,
  onOpenChange,
  editingCategory,
  onSave,
  saving,
}: CategoryFormDialogProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')

  function handleOpenChange(v: boolean) {
    if (!v) {
      onOpenChange(false)
    } else {
      // When opening, initialise from editingCategory
      setName(editingCategory?.name ?? '')
      setIcon(editingCategory?.icon ?? '')
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    await onSave(name.trim(), icon, !!editingCategory)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>
            {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
          </DialogTitle>
          <DialogDescription>
            {editingCategory
              ? 'Modifica el nombre e ícono de la categoría.'
              : 'Ingresa el nombre y escoge un ícono para la nueva categoría.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cat-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cat-name"
              placeholder="Nombre de la categoría"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              autoFocus
            />
          </div>
          <CategoryIconPicker value={icon} onChange={setIcon} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editingCategory ? 'Guardar' : 'Crear Categoría'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Confirm Dialog ─────────────────────────────────────────────────

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  target,
  onConfirm,
  deleting,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.type === 'product'
              ? `Se eliminará el producto "${(target?.item as Product | null)?.name ?? ''}". Esta acción no se puede deshacer.`
              : `Se eliminará la categoría "${(target?.item as Category | null)?.name ?? ''}". Los productos en esta categoría no se eliminarán.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Adjust Stock Dialog ───────────────────────────────────────────────────

export function AdjustStockDialog({
  open,
  onOpenChange,
  productName,
  currentStock,
  onSubmit,
  submitting,
}: AdjustStockDialogProps) {
  const [newStock, setNewStock] = useState(String(currentStock))
  const [notes, setNotes] = useState('')

  function handleOpenChange(v: boolean) {
    if (!v) {
      onOpenChange(false)
    } else {
      setNewStock(String(currentStock))
      setNotes('')
    }
  }

  async function handleSubmit() {
    const parsed = parseInt(newStock, 10)
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Cantidad inválida')
      return
    }
    const diff = parsed - currentStock
    if (diff === 0) {
      toast.info('Sin cambios')
      return
    }
    await onSubmit(parsed, notes)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Ajustar Stock</DialogTitle>
          <DialogDescription>
            Modifica el stock actual de <span className="font-semibold">{productName}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Stock Actual</Label>
            <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium">
              {currentStock} unidades
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-new-stock">
              Nuevo Stock <span className="text-destructive">*</span>
            </Label>
            <Input
              id="adjust-new-stock"
              type="number"
              min="0"
              placeholder="0"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              autoFocus
            />
            {newStock && !isNaN(Number(newStock)) && Number(newStock) !== currentStock && (
              <p className={`text-xs ${
                Number(newStock) > currentStock
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {Number(newStock) > currentStock ? '+' : ''}
                {Number(newStock) - currentStock} unidades
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-notes">Notas</Label>
            <Textarea
              id="adjust-notes"
              placeholder="Motivo del ajuste (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar Ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Loss Dialog ───────────────────────────────────────────────────────────

export function LossDialog({
  open,
  onOpenChange,
  productName,
  onSubmit,
  submitting,
}: LossDialogProps) {
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('VENCIDO')
  const [notes, setNotes] = useState('')

  function handleOpenChange(v: boolean) {
    if (!v) {
      onOpenChange(false)
    } else {
      setQuantity('')
      setReason('VENCIDO')
      setNotes('')
    }
  }

  async function handleSubmit() {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Cantidad inválida')
      return
    }
    await onSubmit(qty, reason, notes)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Registrar Pérdida</DialogTitle>
          <DialogDescription>
            Registra una pérdida de <span className="font-semibold">{productName}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="loss-quantity">
              Cantidad <span className="text-destructive">*</span>
            </Label>
            <Input
              id="loss-quantity"
              type="number"
              min="1"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loss-reason">Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOSS_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="loss-notes">Notas</Label>
            <Textarea
              id="loss-notes"
              placeholder="Detalles adicionales (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Pérdida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Return Dialog ─────────────────────────────────────────────────────────

export function ReturnDialog({
  open,
  onOpenChange,
  productName,
  onSubmit,
  submitting,
}: ReturnDialogProps) {
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')

  function handleOpenChange(v: boolean) {
    if (!v) {
      onOpenChange(false)
    } else {
      setQuantity('')
      setNotes('')
    }
  }

  async function handleSubmit() {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Cantidad inválida')
      return
    }
    await onSubmit(qty, notes)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Registrar Devolución</DialogTitle>
          <DialogDescription>
            Registra la devolución de <span className="font-semibold">{productName}</span> al inventario
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="return-quantity">
              Cantidad <span className="text-destructive">*</span>
            </Label>
            <Input
              id="return-quantity"
              type="number"
              min="1"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-notes">Notas</Label>
            <Textarea
              id="return-notes"
              placeholder="Motivo de la devolución (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Devolución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Trace Dialog ──────────────────────────────────────────────────────────

export function TraceDialog({
  open,
  onOpenChange,
  productName,
  movements,
  loading,
}: TraceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Trazabilidad</DialogTitle>
          <DialogDescription>
            Historial de movimientos de <span className="font-semibold">{productName}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Cargando movimientos...</span>
          </div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Route className="h-14 w-14 mb-3 text-muted-foreground/30 animate-pulse" />
            <p className="text-sm text-muted-foreground/70">No hay movimientos registrados</p>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Fecha</TableHead>
                  <TableHead className="min-w-[100px]">Tipo</TableHead>
                  <TableHead className="text-right min-w-[80px]">Cantidad</TableHead>
                  <TableHead className="min-w-[200px]">Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((mov: TraceMovement, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm text-muted-foreground">
                      {mov.date
                        ? new Date(mov.date).toLocaleString('es-CO', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          mov.type === 'SALE'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : mov.type === 'PURCHASE'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : mov.type === 'RETURN'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                : mov.type === 'LOSS'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }
                      >
                        {MOV_TYPE_LABELS[mov.type] || mov.type}
                      </Badge>
                      {mov.presentationName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {mov.presentationName}
                          {mov.unitsPerPack && mov.unitsPerPack > 1 ? ` (×${mov.unitsPerPack})` : ''}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      <span className={
                        mov.quantity > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }>
                        {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                      </span>
                      {mov.balance !== undefined && (
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          → {mov.balance}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[250px]">
                      {mov.notes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">
              {movements.length} movimiento{movements.length !== 1 ? 's' : ''} encontrado{movements.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
