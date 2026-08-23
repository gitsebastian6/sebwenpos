'use client'

import { useRef } from 'react'
import { formatCOP, formatQty } from '@/lib/format'
import {
  Printer, ArrowRightLeft, XCircle, Loader2, CalendarDays, Layers,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { QuotationDetail } from '@/components/quotations/quotation-types'
import { StatusBadge } from '@/components/quotations/status-badge'

const cop = formatCOP

interface QuotationDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: QuotationDetail | null
  loading: boolean
  store: {
    id: number
    name: string
    nit: string | null
    address?: string | null
    phone?: string | null
  }
  onCancel: (id: number) => void
  onOpenConvert: () => void
}

export function QuotationDetailDialog({
  open,
  onOpenChange,
  detail,
  loading,
  store,
  onCancel,
  onOpenConvert,
}: QuotationDetailDialogProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    if (!printRef.current) return
    const printContent = printRef.current.innerHTML
    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html><head><title>Imprimir Cotización</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .store-name { font-size: 22px; font-weight: bold; }
        .store-nit { font-size: 13px; color: #555; }
        .doc-title { font-size: 18px; font-weight: bold; margin: 15px 0 5px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; font-size: 13px; }
        .info-label { font-weight: bold; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .totals { display: flex; justify-content: flex-end; }
        .totals-table { width: 250px; }
        .totals-table td { border: none; padding: 3px 8px; }
        .grand-total td { font-weight: bold; font-size: 15px; border-top: 2px solid #333 !important; }
        .notes { margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      ${printContent}
      <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>`)
    win.document.close()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col rounded-xl">
          {!detail && <DialogTitle className="sr-only">Detalle de cotización</DialogTitle>}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="font-mono">{detail.quotationNumber}</DialogTitle>
                  <StatusBadge status={detail.status} />
                </div>
                <DialogDescription>
                  Creada el {format(parseISO(detail.createdAt), "dd 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
                  {detail.convertedToOrderId && (
                    <span className="ml-2 text-sky-600">→ Convertida a Orden</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4 py-2">
                  {/* Store header */}
                  <div className="text-center border-b pb-3">
                    <div className="text-lg font-bold">{store.name}</div>
                    {store.nit && <div className="text-sm text-muted-foreground">NIT: {store.nit}</div>}
                  </div>

                  {/* Customer info */}
                  <div className="grid gap-2 text-sm sm:grid-cols-2 rounded-lg border p-3">
                    <div>
                      <span className="text-muted-foreground">Cliente:</span>{' '}
                      <span className="font-medium">{detail.customerName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">NIT:</span>{' '}
                      <span className="font-medium">{detail.customerNit || '—'}</span>
                    </div>
                    {detail.customerPhone && (
                      <div>
                        <span className="text-muted-foreground">Teléfono:</span> {detail.customerPhone}
                      </div>
                    )}
                    {detail.customerEmail && (
                      <div>
                        <span className="text-muted-foreground">Email:</span> {detail.customerEmail}
                      </div>
                    )}
                    {detail.customerAddress && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Dirección:</span> {detail.customerAddress}
                      </div>
                    )}
                  </div>

                  {/* Valid until */}
                  {detail.validUntil && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Válida hasta:</span>
                      <span className={detail.status === 'EXPIRED' ? 'text-amber-600 font-medium' : ''}>
                        {format(parseISO(detail.validUntil), "dd 'de' MMMM yyyy", { locale: es })}
                      </span>
                      {detail.status === 'EXPIRED' && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                          Vencida
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-center">Cant.</TableHead>
                          <TableHead className="text-right">P. Unit.</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Base</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Imp.</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.items.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell className="text-sm">
                              {item.productName}
                              {item.presentationName && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 text-xs">
                                  <Layers className="h-3 w-3" />{item.presentationName}
                                </span>
                              )}
                              {item.notes && (
                                <div className="text-xs text-muted-foreground mt-0.5">📝 {item.notes}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{formatQty(item.quantity)}</TableCell>
                            <TableCell className="text-right text-sm">{cop(item.unitPrice)}</TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell">{cop(item.taxBase)}</TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell text-muted-foreground">
                              {item.taxCode ? `${item.taxRate}%` : '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{cop(item.totalRow)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Tax breakdown */}
                  {detail.taxBreakdown && detail.taxBreakdown.length > 0 && (
                    <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-sm">
                      <div className="font-semibold text-xs uppercase text-muted-foreground">Desglose de Impuestos</div>
                      {detail.taxBreakdown.map((tax) => (
                        <div key={tax.code} className="flex justify-between">
                          <span>{tax.name || tax.code} ({tax.rate}%)</span>
                          <span>{cop(tax.base)} → {cop(tax.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-72 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{cop(detail.subtotal)}</span>
                      </div>
                      {detail.discountAmount > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>Descuento{detail.discountType === 'PERCENTAGE' ? ` (%)` : ''}</span>
                          <span>-{cop(detail.discountAmount)}</span>
                        </div>
                      )}
                      {detail.taxAmount > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Incluye IVA</span>
                          <span>{cop(detail.taxAmount)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span className="text-emerald-600">{cop(detail.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {detail.notes && (
                    <div className="rounded-lg bg-muted/30 p-3 text-sm">
                      <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">Notas</div>
                      {detail.notes}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Actions */}
              <Separator />
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {detail.status === 'ACTIVE' && (
                  <>
                    <Button variant="outline" className="gap-2" onClick={handlePrint}>
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={onOpenConvert}>
                      <ArrowRightLeft className="h-4 w-4" />
                      Convertir a Venta
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => onCancel(detail.id)}
                    >
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </Button>
                  </>
                )}
                {detail.status === 'CONVERTED' && (
                  <Button variant="outline" className="gap-2" onClick={handlePrint}>
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════
          HIDDEN PRINT TEMPLATE
      ════════════════════════════════════════════════ */}
      {detail && (
        <div ref={printRef} className="hidden" aria-hidden="true">
          <div className="header">
            <div className="store-name">{store.name}</div>
            {store.nit && <div className="store-nit">NIT: {store.nit}</div>}
            {store.address && <div className="store-nit">{store.address}</div>}
            {store.phone && <div className="store-nit">Tel: {store.phone}</div>}
          </div>

          <div className="doc-title">COTIZACIÓN {detail.quotationNumber}</div>

          <div className="info-grid">
            <div><span className="info-label">Fecha:</span> {format(parseISO(detail.createdAt), 'dd/MM/yyyy')}</div>
            <div><span className="info-label">Válida hasta:</span> {detail.validUntil ? format(parseISO(detail.validUntil), 'dd/MM/yyyy') : 'Sin límite'}</div>
            <div><span className="info-label">Cliente:</span> {detail.customerName || '—'}</div>
            <div><span className="info-label">NIT:</span> {detail.customerNit || '—'}</div>
            {detail.customerPhone && <div><span className="info-label">Teléfono:</span> {detail.customerPhone}</div>}
            {detail.customerEmail && <div><span className="info-label">Email:</span> {detail.customerEmail}</div>}
            {detail.customerAddress && <div style={{ gridColumn: '1 / -1' }}><span className="info-label">Dirección:</span> {detail.customerAddress}</div>}
          </div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">P. Unit.</th>
                <th className="text-right">Base</th>
                <th className="text-right">Imp.</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}{item.presentationName ? ` — ${item.presentationName}` : ''}{item.notes ? ` — ${item.notes}` : ''}</td>
                  <td className="text-right">{formatQty(item.quantity)}</td>
                  <td className="text-right">{cop(item.unitPrice)}</td>
                  <td className="text-right">{cop(item.taxBase)}</td>
                  <td className="text-right">{item.taxCode ? `${item.taxRate}%` : '—'}</td>
                  <td className="text-right">{cop(item.totalRow)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {detail.taxBreakdown && detail.taxBreakdown.length > 0 && (
            <div style={{ marginBottom: '10px', fontSize: '12px' }}>
              <strong>Desglose de Impuestos:</strong><br />
              {detail.taxBreakdown.map((tax) => (
                <span key={tax.code}>
                  {tax.name || tax.code} ({tax.rate}%): Base {cop(tax.base)} / Impuesto {cop(tax.amount)}&nbsp;&nbsp;
                </span>
              ))}
            </div>
          )}

          <div className="totals">
            <table className="totals-table">
              <tbody>
                <tr>
                  <td className="text-right" style={{ paddingRight: '10px' }}>Subtotal:</td>
                  <td className="text-right" style={{ fontWeight: 500 }}>{cop(detail.subtotal)}</td>
                </tr>
                {detail.discountAmount > 0 && (
                  <tr>
                    <td className="text-right" style={{ paddingRight: '10px', color: '#b45309' }}>Descuento:</td>
                    <td className="text-right" style={{ fontWeight: 500, color: '#b45309' }}>-{cop(detail.discountAmount)}</td>
                  </tr>
                )}
                {detail.taxAmount > 0 && (
                  <tr>
                    <td className="text-right" style={{ paddingRight: '10px', color: '#666' }}>Incluye IVA:</td>
                    <td className="text-right" style={{ color: '#666' }}>{cop(detail.taxAmount)}</td>
                  </tr>
                )}
                <tr className="grand-total">
                  <td className="text-right" style={{ paddingRight: '10px' }}>TOTAL:</td>
                  <td className="text-right">{cop(detail.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {detail.notes && (
            <div className="notes">
              <strong>Notas:</strong> {detail.notes}
            </div>
          )}

          <div className="footer">
            {store.name} — Generado el {format(new Date(), "dd/MM/yyyy 'a las' HH:mm")}
          </div>
        </div>
      )}
    </>
  )
}
