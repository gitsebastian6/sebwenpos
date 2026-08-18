'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Pencil, DollarSign, RotateCcw, Ban, Printer, FileSpreadsheet,
  CreditCard, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  usePurchaseDetail, usePurchasePayment, usePurchaseReturn,
  type Purchase,
} from '@/hooks/api/use-purchases'
import { getDocBadge, getPaymentStatusBadge, getStatusBadge, isOverdue, PAYMENT_METHODS } from './purchase-types'
import { handlePrintPurchaseDetail, handlePrintThermalDetail } from './purchase-export-utils'

// ── Props ──

interface PurchaseDetailDialogProps {
  open: boolean
  onClose: () => void
  purchaseId: number | null
  currencyCode: string
  onEdit: (purchase: Purchase) => void
  onCancel: (purchase: Purchase) => void
}

// ── Component ──

export function PurchaseDetailDialog({ open, onClose, purchaseId, currencyCode, onEdit, onCancel }: PurchaseDetailDialogProps) {
  const { data: purchase, isLoading } = usePurchaseDetail(purchaseId)
  const purchasePayment = usePurchasePayment()
  const purchaseReturn = usePurchaseReturn()

  // Payment state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  // Return state
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returnItems, setReturnItems] = useState<Map<number, number>>(new Map())

  function openPaymentDialog() {
    if (!purchase) return
    setPaymentAmount(String(purchase.total - purchase.amountPaid))
    setPaymentMethod('CASH')
    setPaymentReference('')
    setPaymentNotes('')
    setShowPaymentDialog(true)
  }

  function openReturnDialog() {
    if (!purchase) return
    const items = new Map<number, number>()
    for (const item of purchase.purchaseItems) {
      const available = item.quantity - (item.returnedQuantity ?? 0)
      if (available > 0) items.set(item.id, available)
    }
    setReturnItems(items)
    setReturnReason('')
    setShowReturnDialog(true)
  }

  function toggleReturnItem(itemId: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.set(itemId, maxQty)
      return next
    })
  }

  function setReturnItemQty(itemId: number, qty: number, _maxQty: number) {
    setReturnItems(prev => { const next = new Map(prev); next.set(itemId, Math.max(1, qty)); return next })
  }

  function handlePayment() {
    if (!purchase) return
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) { toast.error('Ingrese un monto válido'); return }
    const remaining = purchase.total - purchase.amountPaid
    if (amount > remaining) { toast.error(`El monto excede el saldo pendiente (${formatCurrency(remaining, currencyCode)})`); return }
    purchasePayment.mutate({
      id: purchase.id,
      body: { amount, paymentMethod, reference: paymentReference.trim() || undefined, notes: paymentNotes.trim() || undefined },
    }, {
      onSuccess: (data: any) => { toast.success(data?.message || 'Pago registrado exitosamente'); setShowPaymentDialog(false) },
      onError: (err) => toast.error(err.message),
    })
  }

  function handleReturn() {
    if (!purchase || returnItems.size === 0) { toast.error('Selecciona al menos un producto para devolver'); return }
    const items = Array.from(returnItems.entries()).map(([purchaseItemId, quantity]) => ({ itemId: purchaseItemId, quantity }))
    purchaseReturn.mutate({
      id: purchase.id,
      body: { items, reason: returnReason.trim() || undefined },
    }, {
      onSuccess: (data: { message?: string }) => {
        toast.success(data?.message || 'Devolución procesada')
        setShowReturnDialog(false)
        setReturnItems(new Map())
        onClose()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  function handleClose() {
    setShowPaymentDialog(false)
    setShowReturnDialog(false)
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!o) handleClose() }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {purchase && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>{purchase.consecutiveNumber || `Compra #${purchase.id}`}</DialogTitle>
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${getDocBadge(purchase.documentType).color}`}>
                    {getDocBadge(purchase.documentType).short}
                  </span>
                </div>
                <DialogDescription>Detalle de la compra</DialogDescription>
              </DialogHeader>

              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="space-y-4">
                  {/* Purchase info */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium">{format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}</p></div>
                    {purchase.dueDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">Vencimiento</p>
                        <p className={`font-medium ${isOverdue(purchase) ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {format(new Date(purchase.dueDate), 'd MMM yyyy', { locale: es })}
                          {isOverdue(purchase) && ' ⚠ Vencida'}
                        </p>
                      </div>
                    )}
                    <div><p className="text-xs text-muted-foreground">Forma de Pago</p><p className="font-medium">{purchase.paymentTerms === 'CONTADO' ? 'Contado' : purchase.paymentTerms === 'CREDITO_30' ? 'Crédito 30' : purchase.paymentTerms === 'CREDITO_60' ? 'Crédito 60' : purchase.paymentTerms === 'CREDITO_90' ? 'Crédito 90' : purchase.paymentTerms}</p></div>
                    <div><p className="text-xs text-muted-foreground">Proveedor</p><p className="font-medium">{purchase.provider?.name || 'Sin proveedor'}</p></div>
                    {purchase.invoiceNumber && <div><p className="text-xs text-muted-foreground">Factura</p><p className="font-mono">{purchase.invoiceNumber}</p></div>}
                    <div><p className="text-xs text-muted-foreground">Estado</p><div className="flex items-center gap-1.5">{getStatusBadge(purchase.status)} {getPaymentStatusBadge(purchase.paymentStatus)}</div></div>
                  </div>

                  {purchase.notes && <div className="text-sm"><p className="text-xs text-muted-foreground">Notas</p><p>{purchase.notes}</p></div>}
                  <Separator />

                  {/* Items table */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Productos ({purchase.purchaseItems.length})</h4>
                    <div className="rounded border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-xs">Producto</TableHead>
                          <TableHead className="text-xs text-center">Cant</TableHead>
                          <TableHead className="text-xs text-right">Costo</TableHead>
                          <TableHead className="text-xs text-center">IVA%</TableHead>
                          <TableHead className="text-xs text-right">IVA</TableHead>
                          <TableHead className="text-xs text-right">Desc</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {purchase.purchaseItems.map(item => (
                            <TableRow key={item.id}>
                              <TableCell className="text-xs">
                                {item.product?.name || 'Producto eliminado'}
                                {item.presentationName && <span className="text-muted-foreground"> — {item.presentationName}</span>}
                                {item.lotNumber && <span className="text-[10px] text-muted-foreground block">Lote: {item.lotNumber}</span>}
                              </TableCell>
                              <TableCell className="text-xs text-center">
                                {item.quantity}
                                {item.returnedQuantity > 0 && <span className="text-red-500 text-[10px] block">- {item.returnedQuantity} dev.</span>}
                              </TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(item.unitCost, currencyCode)}</TableCell>
                              <TableCell className="text-xs text-center">{item.ivaRate}%</TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(item.ivaAmount, currencyCode)}</TableCell>
                              <TableCell className="text-xs text-right">{item.discountAmount > 0 ? formatCurrency(item.discountAmount, currencyCode) : '—'}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{formatCurrency(item.total, currencyCode)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Tax breakdown */}
                  <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/20">
                    <h4 className="text-sm font-semibold mb-2">Desglose de Impuestos</h4>
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(purchase.subtotal, currencyCode)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IVA Descontable</span><span className="text-blue-600">{formatCurrency(purchase.totalIva, currencyCode)}</span></div>
                    {purchase.totalConsumptionTax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Impuesto al Consumo (IC)</span><span className="text-purple-600">{formatCurrency(purchase.totalConsumptionTax, currencyCode)}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Retención en la Fuente</span><span className="text-orange-600">-{formatCurrency(purchase.totalReteFuente, currencyCode)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Retención ICA</span><span className="text-orange-600">-{formatCurrency(purchase.totalReteIca, currencyCode)}</span></div>
                    {purchase.totalReteIva > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Retención IVA</span><span className="text-orange-600">-{formatCurrency(purchase.totalReteIva, currencyCode)}</span></div>}
                    {purchase.totalDiscount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Descuentos</span><span className="text-red-500">-{formatCurrency(purchase.totalDiscount, currencyCode)}</span></div>}
                    <Separator />
                    <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span className="text-primary">{formatCurrency(purchase.total, currencyCode)}</span></div>
                  </div>

                  {/* Payment progress */}
                  {purchase.paymentTerms !== 'CONTADO' && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Estado de Pago</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pagado: {formatCurrency(purchase.amountPaid, currencyCode)}</span>
                          <span className="text-muted-foreground">Pendiente: {formatCurrency(purchase.total - purchase.amountPaid, currencyCode)}</span>
                        </div>
                        <Progress value={purchase.total > 0 ? Math.min(100, (purchase.amountPaid / purchase.total) * 100) : 0} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground"><span>0%</span><span>{purchase.total > 0 ? Math.round((purchase.amountPaid / purchase.total) * 100) : 0}%</span><span>100%</span></div>
                      </div>
                      {purchase.purchasePayments && purchase.purchasePayments.length > 0 && (
                        <div className="mt-2 rounded border overflow-hidden">
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Método</TableHead>
                              <TableHead className="text-xs text-right">Monto</TableHead>
                              <TableHead className="text-xs">Ref</TableHead>
                              <TableHead className="text-xs">Por</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {purchase.purchasePayments.map(pp => (
                                <TableRow key={pp.id}>
                                  <TableCell className="text-xs">{format(new Date(pp.createdAt), 'd MMM yy HH:mm', { locale: es })}</TableCell>
                                  <TableCell className="text-xs">{PAYMENT_METHODS.find(m => m.value === pp.paymentMethod)?.label || pp.paymentMethod}</TableCell>
                                  <TableCell className="text-xs text-right font-medium">{formatCurrency(pp.amount, currencyCode)}</TableCell>
                                  <TableCell className="text-xs">{pp.reference || '—'}</TableCell>
                                  <TableCell className="text-xs">{pp.createdBy?.fullName || '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(purchase.status === 'PENDING' || purchase.status === 'COMPLETED') && (
                      <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(purchase) }}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>
                    )}
                    {purchase.paymentStatus !== 'PAID' && purchase.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-600" onClick={openPaymentDialog}><DollarSign className="h-3.5 w-3.5 mr-1" />Pagar</Button>
                    )}
                    {purchase.status === 'COMPLETED' && (
                      <Button variant="outline" size="sm" onClick={openReturnDialog}><RotateCcw className="h-3.5 w-3.5 mr-1" />Devolver</Button>
                    )}
                    {purchase.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-red-300 text-red-600" onClick={() => onCancel(purchase)}><Ban className="h-3.5 w-3.5 mr-1" />Cancelar</Button>
                    )}
                    <div className="flex-1" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm"><Printer className="h-3.5 w-3.5 mr-1" />Imprimir</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePrintPurchaseDetail(purchase, currencyCode)}><FileSpreadsheet className="h-4 w-4 mr-2" />Impresora Normal</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePrintThermalDetail(purchase, currencyCode)}><Printer className="h-4 w-4 mr-2" />Térmica 80mm</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ── */}
      <Dialog open={showPaymentDialog} onOpenChange={o => { if (!o) setShowPaymentDialog(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Registrar Abono</DialogTitle>
            <DialogDescription>Pago a compra {purchase?.consecutiveNumber || ''}</DialogDescription>
          </DialogHeader>
          {purchase && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm bg-muted/20">
                <div className="flex justify-between"><span className="text-muted-foreground">Proveedor</span><span className="font-medium">{purchase.provider?.name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Compra</span><span>{formatCurrency(purchase.total, currencyCode)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ya Pagado</span><span className="text-emerald-600">{formatCurrency(purchase.amountPaid, currencyCode)}</span></div>
                <Separator />
                <div className="flex justify-between font-semibold"><span>Saldo Pendiente</span><span className="text-red-600">{formatCurrency(purchase.total - purchase.amountPaid, currencyCode)}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Monto del Abono (COP)</Label>
                <Input type="number" min="1" className="h-10 text-lg font-semibold" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Método de Pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Número de Referencia (opcional)</Label>
                <Input placeholder="Ej: transacción bancaria" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea className="text-sm" placeholder="Notas del pago..." value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handlePayment} disabled={purchasePayment.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {purchasePayment.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <DollarSign className="h-4 w-4 mr-1" />Registrar Abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Return Dialog ── */}
      <Dialog open={showReturnDialog} onOpenChange={o => { if (!o) setShowReturnDialog(false) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><RotateCcw className="h-5 w-5" />Devolver Compra</DialogTitle>
            <DialogDescription>Selecciona los productos y cantidades a devolver</DialogDescription>
          </DialogHeader>
          {purchase && (
            <div className="space-y-3">
              <div className="flex gap-2 mb-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => { const items = new Map<number, number>(); for (const i of purchase.purchaseItems) { const a = i.quantity - (i.returnedQuantity ?? 0); if (a > 0) items.set(i.id, a) }; setReturnItems(items) }}>Seleccionar Todos</Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setReturnItems(new Map())}>Deseleccionar</Button>
              </div>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {purchase.purchaseItems.map(item => {
                  const available = item.quantity - (item.returnedQuantity ?? 0)
                  if (available <= 0) return null
                  const isSelected = returnItems.has(item.id)
                  const qty = returnItems.get(item.id) || 0
                  return (
                    <Card key={item.id} className="p-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleReturnItem(item.id, available)} className="rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.product?.name || 'Producto'}
                            {item.presentationName && <span className="text-muted-foreground"> — {item.presentationName}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">Disponible: {available} · Costo: {formatCurrency(item.unitCost, currencyCode)} · IVA: {formatCurrency(item.ivaAmount, currencyCode)}</p>
                        </div>
                        {isSelected && (
                          <Input type="number" min="1" max={available} className="w-20 h-8 text-sm text-right" value={qty} onChange={e => setReturnItemQty(item.id, Number(e.target.value) || 1, available)} />
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
              {returnItems.size > 0 && (
                <div className="text-sm font-medium text-muted-foreground">
                  {returnItems.size} producto(s) seleccionado(s) · Total: {formatCurrency(
                    Array.from(returnItems.entries()).reduce((sum, [id, qty]) => {
                      const item = purchase.purchaseItems.find(i => i.id === id)
                      return sum + (item ? Math.round(item.unitCost * qty) : 0)
                    }, 0), currencyCode,
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo de Devolución (opcional)</Label>
                <Textarea className="text-sm" placeholder="Describe el motivo..." value={returnReason} onChange={e => setReturnReason(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReturn} disabled={purchaseReturn.isPending}>
              {purchaseReturn.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <RotateCcw className="h-4 w-4 mr-1" />Confirmar Devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
