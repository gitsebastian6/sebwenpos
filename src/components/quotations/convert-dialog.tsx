'use client'

import { useState } from 'react'
import { formatCOP, formatQty } from '@/lib/format'
import { toast } from 'sonner'
import {
  FileText, Receipt, QrCode, AlertTriangle, Check, Hash,
  Loader2, MonitorSmartphone,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
import { useConvertQuotation } from '@/hooks/api/use-quotations'
import { useCreateInvoice } from '@/hooks/api/use-invoices'
import { PAYMENT_METHODS } from '@/components/quotations/quotation-types'
import type { QuotationDetail, InvoiceMode } from '@/components/quotations/quotation-types'

const cop = formatCOP

interface ConvertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: QuotationDetail | null
  store: {
    id: number
    name: string
    nit: string | null
    invoiceEnabled?: boolean
    invoiceTestMode?: boolean
    resolutionNumber?: string | null
    invoicePrefix?: string | null
  }
  onConverted: () => void
}

export function ConvertDialog({
  open,
  onOpenChange,
  detail,
  store,
  onConverted,
}: ConvertDialogProps) {
  const [convertMethod, setConvertMethod] = useState('')

  // Invoice mode
  const isEInvEnabled = !!store?.invoiceEnabled && !!store?.nit
  const hasStoreNit = !!store?.nit
  const [convertInvoiceMode, setConvertInvoiceMode] = useState<InvoiceMode>('TIRILLA')
  const [invoiceCustomerNit, setInvoiceCustomerNit] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')
  const [nitDvError, setNitDvError] = useState('')

  const convertQuotationMut = useConvertQuotation()
  const createInvoiceMut = useCreateInvoice()
  const converting = convertQuotationMut.isPending
  const creatingInvoice = createInvoiceMut.isPending

  const resetForm = () => {
    setConvertMethod('')
    setConvertInvoiceMode('TIRILLA')
    setInvoiceCustomerNit('')
    setInvoiceCustomerName('')
    setInvoiceCustomerEmail('')
    setNitDvError('')
  }

  const handleDialogChange = (v: boolean) => {
    if (!v) resetForm()
    onOpenChange(v)
  }

  const handleCancel = () => {
    resetForm()
    onOpenChange(false)
  }

  const handleConvert = async () => {
    if (!store || !detail || !convertMethod) return
    try {
      const convertResult = await convertQuotationMut.mutateAsync({
        id: detail.id,
        body: { storeId: store.id, paymentMethod: convertMethod },
      })
      toast.success(convertResult.message, { description: `Orden: ${convertResult.orderNumber} — ${cop(convertResult.total)}` })

      // ── Auto-create electronic invoice if selected ──
      if (convertInvoiceMode === 'ELECTRONICA' && isEInvEnabled && convertResult?.orderId) {
        try {
          const finalNit = invoiceCustomerNit.trim().replace(/[^0-9]/g, '') || DIAN_CONSUMIDOR_FINAL_NIT
          const finalName = invoiceCustomerName.trim() || 'Consumidor Final'
          const finalEmail = invoiceCustomerEmail.trim() || undefined

          const invBody: Record<string, unknown> = {
            orderId: convertResult.orderId,
            testMode: store?.invoiceTestMode ?? true,
            customerNit: finalNit,
            customerName: finalName,
            autoSend: true,
          }
          if (finalEmail) invBody.customerEmail = finalEmail

          const invoiceData = await createInvoiceMut.mutateAsync({ body: invBody })
          toast.success(`Factura electrónica ${invoiceData.invoiceNumber} generada`, { duration: 5000 })
        } catch (invErr: unknown) {
          const msg = invErr instanceof Error ? invErr.message : 'Error al generar factura'
          toast.error(`Error al generar factura: ${msg}`, { duration: 6000 })
        }
      }

      resetForm()
      onConverted()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>Convertir a Venta</DialogTitle>
          <DialogDescription>
            Se creará una orden de venta con los productos de la cotización {detail?.quotationNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Importante:</strong> Al convertir, se descontará el inventario y la cotización cambiará a estado &quot;Convertida&quot;.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Total de la cotización</Label>
            <div className="text-2xl font-bold text-emerald-600">
              {detail ? cop(detail.total) : ''}
            </div>
          </div>

          {/* ── Invoice Mode Selector (when store has NIT) ── */}
          {hasStoreNit && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Tipo de Comprobante
              </Label>
              <div className={`grid gap-2 ${isEInvEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  onClick={() => setConvertInvoiceMode('TIRILLA')}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                    convertInvoiceMode === 'TIRILLA'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Receipt className="h-5 w-5" />
                  <span className="text-xs font-semibold">Tirilla</span>
                  <span className="text-[10px] opacity-70">Venta simple</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConvertInvoiceMode('DOC_EQUIPOS')}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                    convertInvoiceMode === 'DOC_EQUIPOS'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <MonitorSmartphone className="h-5 w-5" />
                  <span className="text-xs font-semibold">Doc. Equivalente</span>
                  <span className="text-[10px] opacity-70">POS / Resolución</span>
                </button>
                {isEInvEnabled && (
                <button
                  type="button"
                  onClick={() => setConvertInvoiceMode('ELECTRONICA')}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                    convertInvoiceMode === 'ELECTRONICA'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <FileText className="h-5 w-5" />
                  <span className="text-xs font-semibold">Factura Elect.</span>
                  <span className="text-[10px] opacity-70">CUFE y QR DIAN</span>
                </button>
                )}
              </div>
              {convertInvoiceMode === 'ELECTRONICA' && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                  <QrCode className="h-3 w-3" />
                  Se generará automáticamente con CUFE y QR DIAN
                </div>
              )}
              {convertInvoiceMode === 'DOC_EQUIPOS' && store?.resolutionNumber && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                  <Hash className="h-3 w-3" />
                  Resolución: {store.resolutionNumber} — Prefijo: {store.invoicePrefix || 'POS'}
                </div>
              )}
              {convertInvoiceMode === 'ELECTRONICA' && (
                <div className="space-y-2 mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                      <Input
                        placeholder={DIAN_CONSUMIDOR_FINAL_NIT}
                        value={invoiceCustomerNit}
                        onChange={(e) => { setInvoiceCustomerNit(e.target.value); setNitDvError('') }}
                        onBlur={() => {
                          const nit = invoiceCustomerNit.trim().replace(/[^0-9]/g, '')
                          if (nit && nit !== DIAN_CONSUMIDOR_FINAL_NIT && nit.length >= 9) {
                            const digits = nit.slice(0, -1)
                            const dv = parseInt(nit[nit.length - 1], 10)
                            const weights = [71,67,59,53,47,43,41,37,29,23,19,17,13,7,3]
                            const n = digits.length
                            const w = weights.slice(-n)
                            let sum = 0
                            for (let i = 0; i < n; i++) sum += parseInt(digits[i], 10) * w[i]
                            const r = sum % 11
                            const expected = (r === 0 || r === 1) ? r : 11 - r
                            if (dv !== expected) setNitDvError(`DV inválido (esperado: ${expected})`)
                          }
                        }}
                        className="h-9 text-sm"
                        maxLength={20}
                      />
                      {nitDvError && <p className="text-[10px] text-destructive">{nitDvError}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Nombre / Razón social</Label>
                      <Input
                        placeholder="Consumidor Final"
                        value={invoiceCustomerName}
                        onChange={(e) => setInvoiceCustomerName(e.target.value)}
                        className="h-9 text-sm"
                        maxLength={200}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Email (requerido para DIAN)</Label>
                    <Input
                      type="email"
                      placeholder=""
                      value={invoiceCustomerEmail}
                      onChange={(e) => setInvoiceCustomerEmail(e.target.value)}
                      className="h-9 text-sm"
                      maxLength={200}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Método de pago *</Label>
            <Select value={convertMethod} onValueChange={setConvertMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar método de pago" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((pm) => (
                  <SelectItem key={pm.value} value={pm.value}>
                    {pm.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          {detail && (
            <div className="rounded-lg border p-3 text-sm space-y-1 max-h-40 overflow-y-auto">
              <div className="font-semibold mb-2">Productos ({detail.items.length})</div>
              {detail.items.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span className="truncate mr-2">
                    {item.productName} ×{formatQty(item.quantity)}
                  </span>
                  <span className="shrink-0">{cop(item.totalRow)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={converting || creatingInvoice}>
            Cancelar
          </Button>
          <Button onClick={handleConvert} disabled={!convertMethod || converting || creatingInvoice} className="gap-2">
            {converting || creatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {converting
              ? 'Convirtiendo...'
              : creatingInvoice
                ? 'Generando factura...'
                : convertInvoiceMode === 'ELECTRONICA'
                  ? 'Convertir + Factura Electrónica'
                  : convertInvoiceMode === 'DOC_EQUIPOS'
                    ? 'Convertir + Doc. Equivalente'
                    : 'Convertir a Orden'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
