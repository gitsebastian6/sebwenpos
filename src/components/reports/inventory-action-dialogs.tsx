'use client'

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { RotateCcw, SlidersHorizontal, AlertTriangle, Loader2 } from 'lucide-react'
import type { ReportProduct } from './reports-export'

// ── Loss Reasons ──
const LOSS_REASONS: Record<string, string> = {
  VENCIDO: 'Vencido', DANADO: 'Dañado', ROBO: 'Robo/Hurto', DERRAME: 'Derrame',
  INVENTARIO: 'Conteo diferencial', OTRO: 'Otro',
}

// ── Product Search Select ──
function ProductSearchSelect({
  products, value, onValueChange, placeholder = 'Buscar producto...',
}: {
  products: ReportProduct[]; value: string; onValueChange: (v: string) => void; placeholder?: string;
}) {
  const [search, setSearch] = useState('')
  const filtered = products.filter((p: ReportProduct) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="space-y-1.5">
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9 text-xs"
      />
      <div className="max-h-40 overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">Sin resultados</div>
        ) : (
          filtered.map((p: ReportProduct) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onValueChange(p.id); setSearch('') }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between ${value === p.id ? 'bg-muted' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                {p.sku && <span className="text-muted-foreground font-mono text-[10px]">{p.sku}</span>}
              </div>
              <span className="text-muted-foreground">Stock: {p.currentStock ?? 0}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── Imperative handle exposed to parent ──
export interface InventoryDialogsHandle {
  openReturnDialog: () => void
  openAdjustDialog: () => void
  openLossDialog: () => void
}

interface InventoryActionDialogsProps {
  storeId: number
  products: ReportProduct[]
  onSuccess: () => void
}

export const InventoryActionDialogs = forwardRef<InventoryDialogsHandle, InventoryActionDialogsProps>(
  function InventoryActionDialogs({ storeId, products, onSuccess }, ref) {
    // ── Dialog visibility ──
    const [showReturnDialog, setShowReturnDialog] = useState(false)
    const [showAdjustDialog, setShowAdjustDialog] = useState(false)
    const [showLossDialog, setShowLossDialog] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // ── Return form ──
    const [returnForm, setReturnForm] = useState({ productId: '', quantity: '', notes: '' })

    // ── Adjust form ──
    const [adjustForm, setAdjustForm] = useState({ productId: '', quantity: '', mode: 'delta' as 'delta' | 'set', notes: '' })
    const [selectedProductStock, setSelectedProductStock] = useState<number | null>(null)

    // ── Loss form ──
    const [lossForm, setLossForm] = useState({ productId: '', quantity: '', reason: 'EXPIRED', notes: '' })

    // ── Expose open methods to parent via ref ──
    useImperativeHandle(ref, () => ({
      openReturnDialog: () => {
        setReturnForm({ productId: '', quantity: '', notes: '' })
        setShowReturnDialog(true)
      },
      openAdjustDialog: () => {
        setAdjustForm({ productId: '', quantity: '', mode: 'delta', notes: '' })
        setSelectedProductStock(null)
        setShowAdjustDialog(true)
      },
      openLossDialog: () => {
        setLossForm({ productId: '', quantity: '', reason: 'EXPIRED', notes: '' })
        setShowLossDialog(true)
      },
    }), [])

    // ── Submit handlers ──
    const handleSubmitReturn = async () => {
      if (!returnForm.productId || !returnForm.quantity || Number(returnForm.quantity) <= 0) {
        toast.error('Selecciona un producto y una cantidad válida')
        return
      }
      setIsSubmitting(true)
      try {
        const res = await fetch('/api/inventory/returns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, productId: returnForm.productId, quantity: Number(returnForm.quantity), notes: returnForm.notes }),
        })
        if (!res.ok) throw new Error('Error al registrar devolución')
        toast.success('Devolución registrada correctamente')
        setShowReturnDialog(false)
        onSuccess()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error al registrar devolución')
      } finally { setIsSubmitting(false) }
    }

    const handleSubmitAdjust = async () => {
      if (!adjustForm.productId || !adjustForm.quantity || Number(adjustForm.quantity) === 0) {
        toast.error('Selecciona un producto y una cantidad')
        return
      }
      if (!adjustForm.notes.trim()) {
        toast.error('Las notas son obligatorias para ajustes')
        return
      }
      setIsSubmitting(true)
      try {
        const payload: Record<string, unknown> = { storeId, productId: adjustForm.productId, quantity: Number(adjustForm.quantity), notes: adjustForm.notes }
        if (adjustForm.mode === 'set') {
          payload.mode = 'set'
        } else {
          payload.mode = 'delta'
        }
        const res = await fetch('/api/inventory/adjustments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Error al registrar ajuste')
        toast.success('Ajuste registrado correctamente')
        setShowAdjustDialog(false)
        onSuccess()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error al registrar ajuste')
      } finally { setIsSubmitting(false) }
    }

    const handleSubmitLoss = async () => {
      if (!lossForm.productId || !lossForm.quantity || Number(lossForm.quantity) <= 0) {
        toast.error('Selecciona un producto y una cantidad válida')
        return
      }
      setIsSubmitting(true)
      try {
        const res = await fetch('/api/inventory/losses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, productId: lossForm.productId, quantity: Number(lossForm.quantity), reason: lossForm.reason, notes: lossForm.notes }),
        })
        if (!res.ok) throw new Error('Error al registrar pérdida')
        toast.success('Pérdida registrada correctamente')
        setShowLossDialog(false)
        onSuccess()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error al registrar pérdida')
      } finally { setIsSubmitting(false) }
    }

    return (
      <>
        {/* ═══════════════════════════════════════════════ */}
        {/* ── DIALOG: Registrar Devolución ── */}
        {/* ═══════════════════════════════════════════════ */}
        <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <RotateCcw className="h-4 w-4" />Registrar Devolución
              </DialogTitle>
              <DialogDescription className="text-xs">Agrega stock devuelto a un producto</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Producto</Label>
                <ProductSearchSelect
                  products={products}
                  value={returnForm.productId}
                  onValueChange={(v) => setReturnForm(f => ({ ...f, productId: v }))}
                  placeholder="Buscar producto para devolver..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Cantidad devuelta"
                  value={returnForm.quantity}
                  onChange={(e) => setReturnForm(f => ({ ...f, quantity: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Notas (opcional)</Label>
                <Textarea
                  placeholder="Razón de la devolución..."
                  value={returnForm.notes}
                  onChange={(e) => setReturnForm(f => ({ ...f, notes: e.target.value }))}
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowReturnDialog(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSubmitReturn} disabled={isSubmitting} className="gap-1.5 active:scale-[0.98] transition-all">
                {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── DIALOG: Registrar Ajuste ── */}
        {/* ═══════════════════════════════════════════════ */}
        <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-4 w-4" />Registrar Ajuste
              </DialogTitle>
              <DialogDescription className="text-xs">Ajusta el inventario de un producto</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Producto</Label>
                <ProductSearchSelect
                  products={products}
                  value={adjustForm.productId}
                  onValueChange={(v) => {
                    const prod = products.find((p: ReportProduct) => p.id === v)
                    setSelectedProductStock(prod?.currentStock ?? null)
                    setAdjustForm(f => ({ ...f, productId: v }))
                  }}
                  placeholder="Buscar producto para ajustar..."
                />
              </div>
              {selectedProductStock !== null && (
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-[10px] text-muted-foreground">Stock actual: </span>
                  <span className="text-sm font-bold">{selectedProductStock}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Modo</Label>
                <Select value={adjustForm.mode} onValueChange={(v) => setAdjustForm(f => ({ ...f, mode: v as 'delta' | 'set' }))}>
                  <SelectTrigger className="h-9 text-xs focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delta" className="text-xs">Agregar/Quitar (+/-)</SelectItem>
                    <SelectItem value="set" className="text-xs">Establecer cantidad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {adjustForm.mode === 'set' ? 'Nueva cantidad' : 'Cantidad (+ para agregar, - para quitar)'}
                </Label>
                <Input
                  type="number"
                  placeholder={adjustForm.mode === 'set' ? 'Nueva cantidad total' : 'Ej: +5 o -3'}
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm(f => ({ ...f, quantity: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Notas <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Motivo del ajuste (obligatorio)..."
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowAdjustDialog(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSubmitAdjust} disabled={isSubmitting} className="gap-1.5 active:scale-[0.98] transition-all">
                {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── DIALOG: Registrar Pérdida ── */}
        {/* ═══════════════════════════════════════════════ */}
        <Dialog open={showLossDialog} onOpenChange={setShowLossDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500" />Registrar Pérdida
              </DialogTitle>
              <DialogDescription className="text-xs">Registra mercancía perdida, vencida o dañada</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Producto</Label>
                <ProductSearchSelect
                  products={products}
                  value={lossForm.productId}
                  onValueChange={(v) => setLossForm(f => ({ ...f, productId: v }))}
                  placeholder="Buscar producto con pérdida..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Cantidad perdida"
                  value={lossForm.quantity}
                  onChange={(e) => setLossForm(f => ({ ...f, quantity: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Motivo</Label>
                <Select value={lossForm.reason} onValueChange={(v) => setLossForm(f => ({ ...f, reason: v }))}>
                  <SelectTrigger className="h-9 text-xs focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LOSS_REASONS).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Notas (opcional)</Label>
                <Textarea
                  placeholder="Detalles adicionales..."
                  value={lossForm.notes}
                  onChange={(e) => setLossForm(f => ({ ...f, notes: e.target.value }))}
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowLossDialog(false)}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={handleSubmitLoss} disabled={isSubmitting} className="gap-1.5 active:scale-[0.98] transition-all">
                {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Registrar Pérdida
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  },
)
