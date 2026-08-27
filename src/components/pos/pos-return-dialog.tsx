'use client'

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ReturnOrderDetail } from '@/types'
import { useOrderDetail, useReturnOrder } from '@/hooks/api/use-orders'
import { formatQty, clampQty, parseQtyInput } from '@/lib/format'
import { formatCurrency } from '@/lib/auth'

// ─── Types ──────────────────────────────────────────────

interface POSReturnDialogProps {
  storeId: number | undefined
  currencyCode: string
  onReturnSuccess: (returnedOrderId: number) => void
}

export interface POSReturnDialogRef {
  openReturnDialog: (orderId: number) => void
}

// ─── Component ─────────────────────────────────────────

export const POSReturnDialog = forwardRef<POSReturnDialogRef, POSReturnDialogProps>(
  function POSReturnDialog({ storeId, currencyCode, onReturnSuccess }, ref) {
    const [showDialog, setShowDialog] = useState(false)
    const [returnReason, setReturnReason] = useState('')
    const [returning, setReturning] = useState(false)
    const [returningOrderId, setReturningOrderId] = useState<number | null>(null)
    const [returnItems, setReturnItems] = useState<Map<number, number>>(new Map())

    // ─── TanStack Query hooks ────────────────────────
    const orderDetailQuery = useOrderDetail(returningOrderId, storeId)
    const returnOrderDetail: ReturnOrderDetail | null = returningOrderId ? orderDetailQuery.data : null
    const loadingReturnDetail = orderDetailQuery.isLoading
    const returnOrderMut = useReturnOrder()

    // Pre-select all returnable items when detail loads
    useEffect(() => {
      if (orderDetailQuery.data) {
        const items = new Map<number, number>()
        for (const item of orderDetailQuery.data.orderItems || []) {
          if (item.productId && item.quantity > (item.returnedQuantity || 0)) {
            items.set(item.id, item.quantity - (item.returnedQuantity || 0))
          }
        }
        setReturnItems(items)
      }
    }, [orderDetailQuery.data])

    // ─── Expose openReturnDialog via ref ────────────
    useImperativeHandle(ref, () => ({
      openReturnDialog: (orderId: number) => {
        if (!storeId) return
        setReturningOrderId(orderId)
        setReturnReason('')
        setReturnItems(new Map())
        setShowDialog(true)
      },
    }), [storeId])

    // ─── Toggle return item selection ──────────────
    function toggleReturnItem(itemId: number, maxQty: number) {
      setReturnItems(prev => {
        const next = new Map(prev)
        if (next.has(itemId)) {
          next.delete(itemId)
        } else {
          next.set(itemId, maxQty)
        }
        return next
      })
    }

    function setReturnItemQty(itemId: number, qty: number, maxQty: number) {
      setReturnItems(prev => {
        const next = new Map(prev)
        // Mínimo 0.001 (no 1): permite devolver fracciones de productos por peso.
        const clamped = clampQty(qty, 0.001, maxQty)
        next.set(itemId, clamped)
        return next
      })
    }

    // ─── Handle return submission ──────────────────
    async function handleReturnOrder() {
      if (!returningOrderId || !storeId || returnItems.size === 0) {
        toast.error('Selecciona al menos un producto para devolver')
        return
      }
      setReturning(true)
      try {
        const items = Array.from(returnItems.entries()).map(([orderItemId, quantity]) => ({
          orderItemId,
          quantity,
        }))
        const data = await returnOrderMut.mutateAsync({
          id: returningOrderId,
          body: { items, reason: returnReason.trim() || undefined },
        })
        toast.success(data.message)
        // Show credit note notification if auto-generated
        if (data.creditNote) {
          toast.success(`Nota Crédito ${data.creditNote.noteNumber} generada automáticamente`, {
            description: `${data.creditNote.concept} por $${data.creditNote.grandTotal.toLocaleString('es-CO')}`,
            duration: 6000,
          })
        }
        setShowDialog(false)
        onReturnSuccess(returningOrderId)
        setReturningOrderId(null)
        setReturnItems(new Map())
        setReturnReason('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al procesar devolución')
      } finally {
        setReturning(false)
      }
    }

    // ─── Close handler ─────────────────────────────
    function handleClose() {
      setShowDialog(false)
      setReturningOrderId(null)
      setReturnItems(new Map())
    }

    return (
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) handleClose() }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Devolver Venta {returnOrderDetail?.orderNumber || ''}
            </DialogTitle>
            <DialogDescription>
              Selecciona los productos y cantidades que deseas devolver al inventario.
            </DialogDescription>
          </DialogHeader>

          {loadingReturnDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : returnOrderDetail ? (
            <div className="space-y-4">
              {/* Items list */}
              <div className="border rounded-lg divide-y max-h-[55vh] overflow-y-auto">
                {returnOrderDetail.orderItems?.filter((i) => i.productId && i.quantity > (i.returnedQuantity || 0)).length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay productos devolvibles en esta venta.
                  </div>
                ) : (
                  returnOrderDetail.orderItems?.map((item) => {
                    if (!item.productId) return null
                    const available = item.quantity - (item.returnedQuantity || 0)
                    if (available <= 0) return null
                    const isSelected = returnItems.has(item.id)
                    const returnQty = returnItems.get(item.id) || 0

                    return (
                      <div key={item.id} className={`flex items-start gap-3 p-3 ${isSelected ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReturnItem(item.id, available)}
                          className="h-4 w-4 mt-0.5 rounded border-gray-300 text-destructive focus:ring-destructive shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-medium break-words leading-snug">
                            {item.productName}
                            {item.presentationName && (
                              <span className="text-muted-foreground font-normal"> — {item.presentationName}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Vendido: {formatQty(item.quantity)}{item.returnedQuantity > 0 ? ` · Devuelto: ${formatQty(item.returnedQuantity)}` : ''} · Disponible: {formatQty(available)}
                          </p>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              P. unit: <span className="font-medium text-foreground">{formatCurrency(item.unitPrice, currencyCode)}</span>
                              {' · '}
                              Línea: <span className="font-medium text-foreground">{formatCurrency(item.totalRow, currencyCode)}</span>
                            </p>
                            {isSelected && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setReturnItemQty(item.id, returnQty - 1, available)}
                                  disabled={returnQty <= 1}
                                  className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50"
                                >
                                  −
                                </button>
                                <Input
                                  type="number"
                                  min={0.001}
                                  max={available}
                                  step="0.001"
                                  value={returnQty}
                                  onChange={(e) => setReturnItemQty(item.id, parseQtyInput(e.target.value), available)}
                                  className="h-7 w-14 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setReturnItemQty(item.id, returnQty + 1, available)}
                                  disabled={returnQty >= available}
                                  className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Services note */}
              {returnOrderDetail.orderItems?.some((i) => !i.productId) && (
                <p className="text-xs text-muted-foreground italic">
                  Los servicios no se pueden devolver al inventario.
                </p>
              )}

              {/* Refund total summary */}
              {returnItems.size > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Total a reembolsar ({returnItems.size} {returnItems.size > 1 ? 'líneas' : 'línea'})</span>
                  <span className="font-bold text-destructive">
                    {formatCurrency(
                      Array.from(returnItems.entries()).reduce((sum, [itemId, qty]) => {
                        const it = returnOrderDetail.orderItems?.find((x) => x.id === itemId)
                        return sum + (it ? it.unitPrice * qty : 0)
                      }, 0),
                      currencyCode
                    )}
                  </span>
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="pos-return-reason" className="text-xs font-medium">Motivo de la devolución (opcional)</Label>
                <Textarea
                  id="pos-return-reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Ej: Error en el pedido, producto defectuoso..."
                  rows={2}
                  className="text-xs min-h-[60px]"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={returning}
                  className="active:scale-[0.98] transition-all duration-150"
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReturnOrder}
                  disabled={returning || returnItems.size === 0}
                  className="active:scale-[0.98] transition-all duration-150"
                >
                  {returning ? 'Procesando...' : `Devolver ${returnItems.size > 0 ? `(${returnItems.size} producto${returnItems.size > 1 ? 's' : ''})` : ''}`}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    )
  }
)
