'use client'

import { useInvoiceDetail, useSendInvoice, useEmailInvoice, useInvoicePdf, useInvoiceStatus } from '@/hooks/api/use-invoices'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  FileText,
  Download,
  Send,
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  Building2,
  User,
  CalendarDays,
  Hash,
  Shield,
  CreditCard,
  Info,
  Package,
  Percent,
  QrCode,
  ExternalLink,
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/lib/format'
import { PAYMENT_LABELS, InvoiceStatusBadge } from './invoices-types'

interface InvoiceDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  invoiceId: number | null
}

export function InvoiceDetailDialog({ open, onOpenChange, storeId, invoiceId }: InvoiceDetailDialogProps) {
  // ── Query hooks ──
  const detailQuery = useInvoiceDetail(invoiceId, storeId)

  // ── Mutation hooks (own instances for dialog actions) ──
  const pdfMutation = useInvoicePdf()
  const sendInvoiceMutation = useSendInvoice()
  const emailInvoiceMutation = useEmailInvoice()
  const statusMutation = useInvoiceStatus()

  const invoiceDetail = detailQuery.data ?? null

  // ── Action handlers ──
  async function handlePrintInvoice() {
    if (!invoiceId || !storeId) return
    try {
      const blob = await pdfMutation.mutateAsync({ id: invoiceId, storeId })
      const url = window.URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank')
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      } else {
        toast.error('Permite ventanas emergentes para imprimir')
      }
    } catch {
      toast.error('Error al imprimir factura')
    }
  }

  async function handleAction(action: string, invId: number, invoiceNumber?: string) {
    if (!storeId) return
    try {
      if (action === 'pdf') {
        const blob = await pdfMutation.mutateAsync({ id: invId, storeId })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Factura_${invoiceNumber || invId}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        toast.success('PDF descargado')
      } else if (action === 'send') {
        await sendInvoiceMutation.mutateAsync({ id: invId, storeId })
        toast.success('Factura enviada a DIAN')
      } else if (action === 'status') {
        const data = await statusMutation.mutateAsync({ id: invId, storeId })
        toast.success(`Estado DIAN: ${data.dianStatus || data.status || 'Consultado'}`)
      } else if (action === 'email') {
        await emailInvoiceMutation.mutateAsync({ id: invId, storeId })
        toast.success('Factura enviada por email')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en la acción')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoiceDetail ? invoiceDetail.invoiceNumber : 'Detalle de Factura'}
          </DialogTitle>
          <DialogDescription>
            {invoiceDetail
              ? `Factura electrónica — ${invoiceDetail.testMode ? 'Modo de prueba' : 'Producción'}`
              : 'Cargando...'}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isPending ? (
          <div className="space-y-4 p-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        ) : invoiceDetail ? (
          <div className="space-y-5">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Número</Label>
                <p className="font-mono font-semibold mt-0.5">{invoiceDetail.invoiceNumber}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Estado</Label>
                <div className="mt-0.5"><InvoiceStatusBadge status={invoiceDetail.status} /></div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Fecha de Creación</Label>
                <p className="text-sm mt-0.5 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  {format(new Date(invoiceDetail.createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Método de Pago</Label>
                <p className="text-sm mt-0.5 flex items-center gap-1">
                  <CreditCard className="h-3 w-3 text-muted-foreground" />
                  {PAYMENT_LABELS[invoiceDetail.paymentMethod || ''] || invoiceDetail.paymentMethod || invoiceDetail.order?.paymentMethod || 'N/A'}
                </p>
              </div>
            </div>

            <Separator />

            {/* Emisor & Receptor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Building2 className="h-3.5 w-3.5" /> Emisor
                </h4>
                <Card className="bg-muted/30">
                  <CardContent className="p-3 space-y-1">
                    <p className="font-medium text-sm">{invoiceDetail.store.legalName || invoiceDetail.store.name}</p>
                    <p className="text-xs text-muted-foreground">NIT: {invoiceDetail.store.nit || 'No configurado'}</p>
                    {invoiceDetail.store.address && <p className="text-xs text-muted-foreground">{invoiceDetail.store.address}</p>}
                  </CardContent>
                </Card>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <User className="h-3.5 w-3.5" /> Receptor
                </h4>
                <Card className="bg-muted/30">
                  <CardContent className="p-3 space-y-1">
                    <p className="font-medium text-sm">{invoiceDetail.customerName}</p>
                    <p className="text-xs text-muted-foreground">NIT: {invoiceDetail.customerNit} · {invoiceDetail.customerType}</p>
                    <p className="text-xs text-muted-foreground">Régimen: {invoiceDetail.customerRegime}</p>
                    {invoiceDetail.customerAddress && <p className="text-xs text-muted-foreground">{invoiceDetail.customerAddress}</p>}
                    {invoiceDetail.customerPhone && <p className="text-xs text-muted-foreground">Tel: {invoiceDetail.customerPhone}</p>}
                    {invoiceDetail.customerEmail && <p className="text-xs text-muted-foreground">Email: {invoiceDetail.customerEmail}</p>}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Separator />

            {/* Items table */}
            <div>
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                <Package className="h-3.5 w-3.5" /> Detalle de Productos ({invoiceDetail.order?.orderItems?.length || 0})
              </h4>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Descripción</TableHead>
                      <TableHead className="text-center text-xs">Cant.</TableHead>
                      <TableHead className="text-right text-xs">P. Unit.</TableHead>
                      <TableHead className="text-right text-xs">Imp.</TableHead>
                      <TableHead className="text-right text-xs">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceDetail.order?.orderItems?.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-medium">{item.productName}</TableCell>
                        <TableCell className="text-center text-xs">{item.quantity}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{formatCOP(item.unitPrice)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {item.taxRate ? `${item.taxRate}%` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">{formatCOP(item.totalRow)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator />

            {/* Tax breakdown */}
            {invoiceDetail.taxBreakdown && invoiceDetail.taxBreakdown.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Percent className="h-3.5 w-3.5" /> Desglose de Impuestos
                </h4>
                <div className="rounded-lg border divide-y">
                  {invoiceDetail.taxBreakdown.map((tax, i) => (
                    <div key={i} className="flex items-center justify-between p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">{tax.code}</Badge>
                        <span className="text-xs">{tax.name} ({tax.rate}%)</span>
                      </div>
                      <div className="text-right text-xs">
                        <span className="text-muted-foreground">Base: {formatCOP(tax.base)}</span>
                        <span className="ml-3 font-medium">{formatCOP(tax.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal (base gravable)</span><span>{formatCOP(invoiceDetail.subtotalBase)}</span>
              </div>
              {invoiceDetail.taxExemptAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Exento</span><span>{formatCOP(invoiceDetail.taxExemptAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Impuestos</span><span>{formatCOP(invoiceDetail.totalTaxAmount)}</span>
              </div>
              {invoiceDetail.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                  <span>Descuento</span><span>-{formatCOP(invoiceDetail.discountAmount)}</span>
                </div>
              )}
              {invoiceDetail.tipAmount > 0 && (
                <div className="flex justify-between text-sm text-pink-600 dark:text-pink-400">
                  <span>Propina</span><span>{formatCOP(invoiceDetail.tipAmount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total a Pagar</span><span>{formatCOP(invoiceDetail.grandTotal)}</span>
              </div>
            </div>

            <Separator />

            {/* CUFE */}
            {invoiceDetail.cufe && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Hash className="h-3.5 w-3.5" /> CUFE
                </h4>
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                  <code className="flex-1 text-[10px] break-all font-mono leading-relaxed">
                    {invoiceDetail.cufe.length > 100
                      ? `${invoiceDetail.cufe.slice(0, 100)}...`
                      : invoiceDetail.cufe}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Copiar CUFE"
                    aria-label="Copiar CUFE"
                    onClick={() => {
                      navigator.clipboard.writeText(invoiceDetail.cufe || '')
                      toast.success('CUFE copiado al portapapeles')
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* QR Code for DIAN verification */}
            {invoiceDetail.qrCode && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <QrCode className="h-3.5 w-3.5" /> Código QR — Verificación DIAN
                </h4>
                <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/50 p-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(invoiceDetail.qrCode)}`}
                    alt="QR Verificación DIAN"
                    className="w-36 h-36 rounded-lg border border-border/50 bg-white p-1"
                  />
                  <a
                    href={invoiceDetail.qrCode}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Verificar en portal DIAN
                  </a>
                  <p className="text-[10px] text-muted-foreground break-all text-center max-w-full">
                    {invoiceDetail.qrCode}
                  </p>
                </div>
              </div>
            )}

            {/* Resolution info */}
            {invoiceDetail.resolutionNumber && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Shield className="h-3.5 w-3.5" /> Resolución
                </h4>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-mono text-xs">{invoiceDetail.resolutionNumber}</p>
                  {invoiceDetail.resolutionDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Fecha: {format(new Date(invoiceDetail.resolutionDate), 'dd/MM/yyyy', { locale: es })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* DIAN status */}
            {(invoiceDetail.status === 'PENDING_VALIDATE' || invoiceDetail.status === 'VALIDATED' || invoiceDetail.status === 'REJECTED') && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Info className="h-3.5 w-3.5" /> Estado DIAN
                </h4>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    {invoiceDetail.status === 'PENDING_VALIDATE' && (
                      <><Clock className="h-4 w-4 text-amber-500" /><span className="text-sm text-amber-600 dark:text-amber-400">En espera de validación por DIAN</span></>
                    )}
                    {invoiceDetail.status === 'VALIDATED' && (
                      <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-sm text-emerald-600 dark:text-emerald-400">Factura validada exitosamente por DIAN</span></>
                    )}
                    {invoiceDetail.status === 'REJECTED' && (
                      <><AlertTriangle className="h-4 w-4 text-red-500" /><span className="text-sm text-red-600 dark:text-red-400">Factura rechazada por DIAN</span></>
                    )}
                  </div>
                  {invoiceDetail.sentAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviada: {format(new Date(invoiceDetail.sentAt), 'dd MMM yyyy HH:mm', { locale: es })}
                    </p>
                  )}
                  {invoiceDetail.validatedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Validada: {format(new Date(invoiceDetail.validatedAt), 'dd MMM yyyy HH:mm', { locale: es })}
                    </p>
                  )}
                  {invoiceDetail.dianErrorCode && (
                    <p className="text-xs text-red-500 mt-1">Error: {invoiceDetail.dianErrorCode}</p>
                  )}
                  {invoiceDetail.dianResponse && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">Ver respuesta DIAN</summary>
                      <pre className="mt-1 text-[10px] bg-muted/50 p-2 rounded overflow-auto max-h-24 font-mono">{invoiceDetail.dianResponse}</pre>
                    </details>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {invoiceDetail.notes && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" /> Notas
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-lg bg-muted/30 p-3">{invoiceDetail.notes}</p>
              </div>
            )}

            {/* Action buttons */}
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePrintInvoice} className="gap-2">
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              <Button onClick={() => handleAction('pdf', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={pdfMutation.isPending} variant="outline" className="gap-2">
                {pdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar PDF
              </Button>
              {(invoiceDetail.status === 'DRAFT' || invoiceDetail.status === 'REJECTED') && (
                <Button onClick={() => handleAction('send', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={sendInvoiceMutation.isPending} variant="outline" className="gap-2">
                  {sendInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar a DIAN
                </Button>
              )}
              {invoiceDetail.customerEmail && (invoiceDetail.status === 'VALIDATED' || invoiceDetail.status === 'DELIVERED') && (
                <Button onClick={() => handleAction('email', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={emailInvoiceMutation.isPending} variant="outline" className="gap-2">
                  {emailInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Enviar por Email
                </Button>
              )}
              {invoiceDetail.status === 'PENDING_VALIDATE' && (
                <Button onClick={() => handleAction('status', invoiceDetail.id, invoiceDetail.invoiceNumber)} disabled={statusMutation.isPending} variant="outline" className="gap-2">
                  {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Consultar Estado DIAN
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p>No se pudo cargar el detalle de la factura.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
