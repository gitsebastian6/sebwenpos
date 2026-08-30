'use client'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CategoryIconPicker } from '@/components/ui/category-icon-picker'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import type { Category, Product, TraceMovement } from '@/types'
import {
    Loader2,
    Route,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// ─── Constants ──────────────────────────────────────────────────────────────

export const MOV_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  LOSS: 'Pérdida',
}

// ─── Props Interfaces ───────────────────────────────────────────────────────

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
