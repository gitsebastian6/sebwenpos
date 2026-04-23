'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { paymentMethodLabel } from '@/lib/format'
import { playSaleSuccess, playError } from '@/lib/pos-sounds'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
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
  Banknote,
  Smartphone,
  CreditCard,
  ArrowRightLeft,
  Users,
  Loader2,
  FileText,
  Receipt,
  QrCode,
  MonitorSmartphone,
  Hash,
  DollarSign,
  Heart,
  Percent,
  Tag,
  AlertTriangle,
  Wallet,
  X,
} from 'lucide-react'
import type { TableSession, OpenCashRegister } from '@/hooks/use-tables-data'
import { usePaySession } from '@/hooks/api/use-tables'
import { useCreateInvoice } from '@/hooks/api/use-pos'

// ─── Payment Dialog ─────────────────────────────────────────────────────────

type InvoiceMode = 'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: TableSession | null
  selectedItemIds: number[]
  selectedItemsTotal: number
  computedDiscount: number
  taxEstimate: { breakdown: Array<{ name: string; code: string; rate: number; base: number; amount: number }>; totalTax: number }
  openCashRegisters: OpenCashRegister[]
  selectedCashRegisterId: string
  setSelectedCashRegisterId: (id: string) => void
  onSave: () => void
}

export function PaymentDialog({
  open,
  onOpenChange,
  session,
  selectedItemIds,
  selectedItemsTotal,
  computedDiscount,
  taxEstimate,
  openCashRegisters,
  selectedCashRegisterId,
  setSelectedCashRegisterId,
  onSave,
}: PaymentDialogProps) {
  const { store } = useAuthStore()

  const isEInvEnabled = !!store?.invoiceEnabled && !!store?.nit
  const hasStoreNit = !!store?.nit

  // TanStack Query mutations
  const paySessionMutation = usePaySession()
  const createInvoiceMutation = useCreateInvoice()

  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [tipAmount, setTipAmount] = useState<number>(0)
  const [showTipInput, setShowTipInput] = useState(false)
  const [transferRef, setTransferRef] = useState('')

  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENTAGE' | 'FIXED'>('NONE')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState<string>('')

  const [tableInvoiceMode, setTableInvoiceMode] = useState<InvoiceMode>('TIRILLA')
  const [invoiceCustomerNit, setInvoiceCustomerNit] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')
  const [nitDvError, setNitDvError] = useState('')
  const [creatingInvoice, setCreatingInvoice] = useState(false)

  // Payment method icons map
  const paymentMethodIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    CASH: Banknote,
    DAVIPLATA: Smartphone,
    NEQUI: Smartphone,
    CARD: CreditCard,
    TRANSFER: ArrowRightLeft,
    FIADO: Users,
  }

  // Local discount calculation
  const localDiscount = discountType === 'PERCENTAGE'
    ? Math.round(selectedItemsTotal * discountValue / 100)
    : discountType === 'FIXED'
      ? Math.min(discountValue, selectedItemsTotal)
      : 0

  function handleOpenChange(open: boolean) {
    if (!open) {
      setPaymentMethod('CASH')
      setTransferRef('')
      setDiscountType('NONE')
      setDiscountValue(0)
      setDiscountReason('')
      setTableInvoiceMode('TIRILLA')
      setInvoiceCustomerNit('')
      setInvoiceCustomerName('')
      setInvoiceCustomerEmail('')
      setNitDvError('')
      setTipAmount(0)
      setShowTipInput(false)
      setPaymentSaving(false)
      setCreatingInvoice(false)
    }
    onOpenChange(open)
  }

  async function handleConfirmPayment() {
    if (!session || !store?.id || selectedItemIds.length === 0) return

    const calcDiscount = localDiscount

    // Block if no cash register is open
    if (openCashRegisters.length === 0) {
      toast.error('Debes abrir la caja antes de procesar pagos. Ve a Contabilidad → Caja.')
      setPaymentSaving(false)
      return
    }

    // Fiado/CREDIT requires a customer
    if ((paymentMethod === 'FIADO' || paymentMethod === 'CREDIT') && !session.customerId) {
      toast.error('Para vender fiado la mesa debe tener un cliente asignado')
      onOpenChange(false)
      return
    }

    // Transfer/Nequi/Daviplata require reference number
    if (['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && !transferRef.trim()) {
      toast.error(`Ingresa el número de ${paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod}`)
      return
    }

    setPaymentSaving(true)
    try {
      const paymentData = await paySessionMutation.mutateAsync({
        sessionId: session.id,
        storeId: store.id,
        itemIds: selectedItemIds,
        paymentMethod,
        cashRegisterId: selectedCashRegisterId !== 'auto' ? Number(selectedCashRegisterId) : undefined,
        tipAmount: (paymentMethod !== 'CREDIT' && paymentMethod !== 'FIADO') ? tipAmount : 0,
        discountType,
        discountAmount: calcDiscount,
        discountReason: discountReason.trim() || undefined,
      })

      playSaleSuccess()
      toast.success(`Pago exitoso - ${paymentMethodLabel(paymentMethod)}`)

      // ── Auto-create electronic invoice if selected ──
      if (tableInvoiceMode === 'ELECTRONICA' && isEInvEnabled && paymentData.id) {
        try {
          setCreatingInvoice(true)
          const finalNit = invoiceCustomerNit.trim()
            ? invoiceCustomerNit.trim().replace(/[^0-9]/g, '')
            : (session?.customer?.nit?.replace(/[^0-9]/g, '') || DIAN_CONSUMIDOR_FINAL_NIT)
          const finalName = invoiceCustomerName.trim() || session?.customer?.name || 'Consumidor Final'
          const finalEmail = invoiceCustomerEmail.trim() || undefined

          const invBody: Record<string, unknown> = {
            orderId: paymentData.id,
            testMode: store?.invoiceTestMode ?? true,
            customerNit: finalNit,
            customerName: finalName,
            autoSend: true,
          }
          if (finalEmail) invBody.customerEmail = finalEmail

          const invoiceData = await createInvoiceMutation.mutateAsync(invBody)
          toast.success(`Factura electrónica ${invoiceData.invoiceNumber} generada`, {
            description: 'CUFE generado correctamente',
            duration: 5000,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Desconocido'
          toast.error(`Error al generar factura: ${msg}`, { duration: 6000 })
        } finally {
          setCreatingInvoice(false)
        }
      }

      handleOpenChange(false)
      onSave()
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al procesar pago')
    } finally {
      setPaymentSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Cobrar</DialogTitle>
          <DialogDescription>
            Selecciona el método de pago para los items seleccionados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                  onClick={() => setTableInvoiceMode('TIRILLA')}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                    tableInvoiceMode === 'TIRILLA'
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
                  onClick={() => setTableInvoiceMode('DOC_EQUIPOS')}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                    tableInvoiceMode === 'DOC_EQUIPOS'
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
                  onClick={() => setTableInvoiceMode('ELECTRONICA')}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                    tableInvoiceMode === 'ELECTRONICA'
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
              {tableInvoiceMode === 'ELECTRONICA' && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                  <QrCode className="h-3 w-3" />
                  Se generará automáticamente con CUFE y QR DIAN
                </div>
              )}
              {tableInvoiceMode === 'DOC_EQUIPOS' && store?.resolutionNumber && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                  <Hash className="h-3 w-3" />
                  Resolución: {store.resolutionNumber} — Prefijo: {store.invoicePrefix || 'POS'}
                </div>
              )}
              {/* ── Buyer info fields (Art. 11 DIAN: only name, NIT, email) ── */}
              {tableInvoiceMode === 'ELECTRONICA' && (
                <div className="space-y-2 mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                      <Input
                        placeholder={session?.customer?.nit || DIAN_CONSUMIDOR_FINAL_NIT}
                        value={invoiceCustomerNit}
                        onChange={(e) => {
                          setInvoiceCustomerNit(e.target.value)
                          setNitDvError('')
                        }}
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
                        placeholder={session?.customer?.name || 'Consumidor Final'}
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
          {/* Selected items summary */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Items a cobrar ({selectedItemIds.length})
            </p>
            <ScrollArea className="max-h-40">
              <div className="space-y-1.5">
                {session?.comandaItems
                  ?.filter((item) => selectedItemIds.includes(item.id))
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.quantity}x {item.productName}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(item.total, store?.currencyCode)}
                      </span>
                    </div>
                  ))}
              </div>
            </ScrollArea>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-medium">
                {formatCurrency(selectedItemsTotal, store?.currencyCode)}
              </span>
            </div>
            {/* Tip */}
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setShowTipInput(!showTipInput)}
            >
              <Heart className="h-3.5 w-3.5" />
              <span>Propina</span>
              {tipAmount > 0 && (
                <span className="ml-auto font-medium text-pink-600 dark:text-pink-400">
                  +{formatCurrency(tipAmount, store?.currencyCode)}
                </span>
              )}
              {!showTipInput && (
                <span className="ml-auto text-xs opacity-60">agregar</span>
              )}
            </button>
            {showTipInput && paymentMethod !== 'CREDIT' && paymentMethod !== 'FIADO' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">$</span>
                <Input
                  type="number"
                  min="0"
                  value={tipAmount || ''}
                  onChange={(e) => setTipAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="h-8 text-sm tabular-nums"
                />
                <Button type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30 active:scale-[0.98] transition-all"
                  onClick={() => setTipAmount(Math.round(selectedItemsTotal * 0.1))}
                >
                  10%
                </Button>
                <Button type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30 active:scale-[0.98] transition-all"
                  onClick={() => setTipAmount(Math.round(selectedItemsTotal * 0.15))}
                >
                  15%
                </Button>
                <Button type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/30 active:scale-[0.98] transition-all"
                  onClick={() => setTipAmount(0)}
                >
                  Quitar
                </Button>
              </div>
            )}
            {showTipInput && (paymentMethod === 'CREDIT' || paymentMethod === 'FIADO') && (
              <p className="text-xs text-muted-foreground italic">No aplica para ventas fiadas</p>
            )}
            {tipAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-pink-600 dark:text-pink-400">Propina</span>
                <span className="font-medium text-pink-600 dark:text-pink-400">
                  {formatCurrency(tipAmount, store?.currencyCode)}
                </span>
              </div>
            )}
            {/* Discount */}
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => {
                if (discountType === 'NONE') {
                  setDiscountType('PERCENTAGE')
                  setDiscountValue(0)
                } else {
                  setDiscountType('NONE')
                  setDiscountValue(0)
                  setDiscountReason('')
                }
              }}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Descuento</span>
              {localDiscount > 0 && (
                <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">
                  -{formatCurrency(localDiscount, store?.currencyCode)}
                </span>
              )}
              {discountType !== 'NONE' ? null : (
                <span className="ml-auto text-xs opacity-60">agregar</span>
              )}
            </button>
            {discountType !== 'NONE' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={discountType}
                    onValueChange={(val: 'PERCENTAGE' | 'FIXED') => {
                      setDiscountType(val)
                      setDiscountValue(0)
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm w-auto min-w-[110px] focus-visible:ring-primary/20 focus-visible:border-primary/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">
                        <span className="flex items-center gap-1.5">
                          <Percent className="h-3 w-3" />
                          Porcentaje %
                        </span>
                      </SelectItem>
                      <SelectItem value="FIXED">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3" />
                          Valor fijo $
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    max={discountType === 'PERCENTAGE' ? 100 : undefined}
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="h-8 text-sm tabular-nums flex-1"
                  />
                  <Button type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 shrink-0 active:scale-[0.98] transition-all"
                    onClick={() => {
                      setDiscountType('NONE')
                      setDiscountValue(0)
                      setDiscountReason('')
                    }}
                    title="Quitar descuento"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="Motivo del descuento (opcional)"
                  className="h-8 text-sm"
                />
              </div>
            )}
            {localDiscount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Descuento
                  {discountType === 'PERCENTAGE' && <span className="text-xs opacity-70">({discountValue}%)</span>}
                </span>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  -{formatCurrency(localDiscount, store?.currencyCode)}
                </span>
              </div>
            )}
            {taxEstimate.breakdown.length > 0 && (
              <div className="space-y-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
                <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5" />
                    IVA Incluido
                  </span>
                  <span>{formatCurrency(taxEstimate.totalTax, store?.currencyCode)}</span>
                </div>
                {taxEstimate.breakdown.map((tax) => (
                  <div key={tax.code} className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                    <span>{tax.name} ({tax.rate}%) — Base: {formatCurrency(tax.base, store?.currencyCode)}</span>
                    <span>{formatCurrency(tax.amount, store?.currencyCode)}</span>
                  </div>
                ))}
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span className="text-lg text-emerald-600 dark:text-emerald-400">
                {formatCurrency(selectedItemsTotal - localDiscount + tipAmount, store?.currencyCode)}
              </span>
            </div>
          </div>

          {/* Caja selector */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Caja
            </Label>
            {openCashRegisters.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                No hay cajas abiertas
              </div>
            ) : (
              <Select value={selectedCashRegisterId} onValueChange={setSelectedCashRegisterId}>
                <SelectTrigger className="h-9 focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automática</SelectItem>
                  {openCashRegisters.map((cr) => (
                    <SelectItem key={cr.id} value={String(cr.id)}>
                      Caja #{cr.id} — {cr.user.fullName || 'Usuario'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <Label>Método de pago</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { value: 'CASH', label: 'Efectivo', Icon: Banknote },
                { value: 'DAVIPLATA', label: 'Daviplata', Icon: Smartphone },
                { value: 'NEQUI', label: 'Nequi', Icon: Smartphone },
                { value: 'CARD', label: 'Tarjeta', Icon: CreditCard },
                { value: 'TRANSFER', label: 'Transferencia', Icon: ArrowRightLeft },
                { value: 'FIADO', label: 'Fiado', Icon: Users },
              ].map((method) => {
                const isFiado = method.value === 'FIADO' || method.value === 'CREDIT'
                const fiadoDisabled = isFiado && !session?.customerId
                return (
                  <Button
                    key={method.value}
                    type="button"
                    variant={paymentMethod === method.value ? 'default' : 'outline'}
                    className={`justify-start gap-2 h-auto py-3 ${fiadoDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (fiadoDisabled) return
                      setPaymentMethod(method.value)
                      if (!['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(method.value)) setTransferRef('')
                    }}
                    disabled={fiadoDisabled}
                  >
                    <method.Icon className="h-4 w-4 shrink-0" />
                    {method.label}
                    {fiadoDisabled && <span className="text-[9px] ml-auto opacity-60">Sin cliente</span>}
                  </Button>
                )
              })}
            </div>
            {(paymentMethod === 'FIADO' || paymentMethod === 'CREDIT') && !session?.customerId && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Users className="h-3 w-3" />
                La mesa debe tener un cliente asignado para vender fiado
              </p>
            )}
          </div>

          {/* Transfer reference number */}
          {['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Número de {paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
                placeholder={paymentMethod === 'TRANSFER' ? 'Ej: 000123456789' : 'Ej: 3111234567'}
                className="text-sm tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                {paymentMethod === 'TRANSFER'
                  ? 'Número de referencia de la transferencia bancaria'
                  : paymentMethod === 'NEQUI'
                    ? 'Número de transacción o celular asociado'
                    : 'Número de transacción de Daviplata'
                }
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={paymentSaving}>
            Cancelar
          </Button>
          <Button className="gap-2 active:scale-[0.98] transition-all" onClick={handleConfirmPayment} disabled={paymentSaving || creatingInvoice}>
            {creatingInvoice ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando Factura...
              </>
            ) : (
              <>
                {paymentSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {tableInvoiceMode === 'ELECTRONICA' ? 'Confirmar + Factura Electrónica' : tableInvoiceMode === 'DOC_EQUIPOS' ? 'Confirmar + Doc. Equivalente' : 'Confirmar Pago'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
