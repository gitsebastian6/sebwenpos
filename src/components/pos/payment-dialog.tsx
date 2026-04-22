'use client'

import { formatCurrency } from '@/lib/auth'
import type { PaymentMethod, CustomerSummary } from '@/types'
import type { InvoiceMode } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { NITInput } from '@/components/ui/nit-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Smartphone,
  Users,
  FileText,
  Receipt,
  QrCode,
  MonitorSmartphone,
  Hash,
  Percent,
  Loader2,
} from 'lucide-react'

// ─── Payment method labels ──────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Efectivo', icon: <Banknote className="h-4 w-4" /> },
  { value: 'DAVIPLATA', label: 'Daviplata', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'NEQUI', label: 'Nequi', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'CARD', label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" /> },
  { value: 'TRANSFER', label: 'Transferencia', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { value: 'FIADO', label: 'Fiado', icon: <Users className="h-4 w-4" /> },
]

// ─── Types ──────────────────────────────────────────────

export interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  // Cart summary
  cartItemCount: number
  cart: Array<{ id?: number; name: string; quantity: number; salePrice: number; isService: boolean }>
  subtotal: number
  taxEstimate: { breakdown: Array<{ name: string; code: string; base: number; rate: number; amount: number }>; totalTax: number }
  discountAmount: number
  discountType: string
  discountValue: number
  discountReason: string
  tipAmount: number
  total: number

  // Payment & customer
  paymentMethod: PaymentMethod
  selectedCustomer: string

  // Invoice mode
  hasStoreNit: boolean
  isEInvEnabled: boolean
  posInvoiceMode: InvoiceMode
  setPosInvoiceMode: (m: InvoiceMode) => void
  creatingInvoice: boolean
  invoiceCustomerNit: string
  setInvoiceCustomerNit: (v: string) => void
  invoiceCustomerName: string
  setInvoiceCustomerName: (v: string) => void
  invoiceCustomerEmail: string
  setInvoiceCustomerEmail: (v: string) => void

  // Store info
  storeName?: string
  storeNit?: string
  storeAddress?: string
  storePhone?: string
  resolutionNumber?: string
  invoicePrefix?: string

  // External
  customers: CustomerSummary[]
  currencyCode: string

  // Actions
  isSubmitting: boolean
  handleSubmitOrder: () => void
}

// ─── Component ──────────────────────────────────────────

export function PaymentDialog({
  open,
  onOpenChange,
  cartItemCount,
  subtotal,
  taxEstimate,
  discountAmount,
  discountType,
  discountValue,
  discountReason,
  tipAmount,
  total,
  paymentMethod,
  selectedCustomer,
  hasStoreNit,
  isEInvEnabled,
  posInvoiceMode,
  setPosInvoiceMode,
  creatingInvoice,
  invoiceCustomerNit,
  setInvoiceCustomerNit,
  invoiceCustomerName,
  setInvoiceCustomerName,
  invoiceCustomerEmail,
  setInvoiceCustomerEmail,
  resolutionNumber,
  invoicePrefix,
  customers,
  currencyCode,
  isSubmitting,
  handleSubmitOrder,
}: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o && !isSubmitting) onOpenChange(false)
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar venta</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <p>¿Estás seguro de que deseas registrar esta venta?</p>

              {/* ── Invoice Mode Selector (only when e-invoicing is enabled) ── */}
              {hasStoreNit && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Tipo de Comprobante
                  </Label>
                  <div className={`grid gap-2 ${isEInvEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <button
                      type="button"
                      onClick={() => setPosInvoiceMode('TIRILLA')}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                        posInvoiceMode === 'TIRILLA'
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
                      onClick={() => setPosInvoiceMode('DOC_EQUIPOS')}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                        posInvoiceMode === 'DOC_EQUIPOS'
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
                      onClick={() => setPosInvoiceMode('ELECTRONICA')}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer ${
                        posInvoiceMode === 'ELECTRONICA'
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
                  {posInvoiceMode === 'ELECTRONICA' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                      <QrCode className="h-3 w-3" />
                      Se generará automáticamente con CUFE y QR DIAN
                    </div>
                  )}
                  {posInvoiceMode === 'DOC_EQUIPOS' && resolutionNumber && (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/80">
                      <Hash className="h-3 w-3" />
                      Resolución: {resolutionNumber} — Prefijo: {invoicePrefix || 'POS'}
                    </div>
                  )}
                  {/* ── Buyer info fields (Art. 11 DIAN: only name, NIT, email) ── */}
                  {posInvoiceMode === 'ELECTRONICA' && (
                    <div className="space-y-2 mt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">NIT del comprador (opcional)</Label>
                          <NITInput
                            value={invoiceCustomerNit}
                            onChange={setInvoiceCustomerNit}
                            placeholder={selectedCustomer !== 'none'
                              ? customers.find(c => String(c.id) === selectedCustomer)?.nit || '222222222222'
                              : '222222222222'}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Nombre / Razón social</Label>
                          <Input
                            placeholder={selectedCustomer !== 'none'
                              ? customers.find(c => String(c.id) === selectedCustomer)?.name || 'Consumidor Final'
                              : 'Consumidor Final'}
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
                          placeholder={selectedCustomer !== 'none'
                            ? customers.find(c => String(c.id) === selectedCustomer)?.phone || ''
                            : ''}
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

              <div className="bg-muted rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Artículos</span>
                  <span className="font-medium">{cartItemCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Método de pago</span>
                  <span className="font-medium">
                    {PAYMENT_METHODS.find((pm) => pm.value === paymentMethod)?.label}
                  </span>
                </div>
                {selectedCustomer !== 'none' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="font-medium">
                      {customers.find((c) => String(c.id) === selectedCustomer)?.name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-semibold">Subtotal</span>
                  <span className="font-medium">
                    {formatCurrency(subtotal, currencyCode)}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-600 dark:text-amber-400">
                      Descuento
                      {discountType === 'PERCENTAGE' && ` (${discountValue}%)`}
                      {discountReason && ` — ${discountReason}`}
                    </span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      -{formatCurrency(discountAmount, currencyCode)}
                    </span>
                  </div>
                )}
                {/* IVA Breakdown */}
                {taxEstimate.breakdown.length > 0 && (
                  <div className="space-y-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
                    <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      <span className="flex items-center gap-1.5">
                        <Percent className="h-3.5 w-3.5" />
                        IVA Incluido
                      </span>
                      <span>{formatCurrency(taxEstimate.totalTax, currencyCode)}</span>
                    </div>
                    {taxEstimate.breakdown.map((tax) => (
                      <div key={tax.code} className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                        <span>{tax.name} ({tax.rate}%) — Base: {formatCurrency(tax.base, currencyCode)}</span>
                        <span>{formatCurrency(tax.amount, currencyCode)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-pink-600 dark:text-pink-400">Propina</span>
                    <span className="font-medium text-pink-600 dark:text-pink-400">
                      {formatCurrency(tipAmount, currencyCode)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="font-bold text-lg">Total</span>
                  <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(total, currencyCode)}
                  </span>
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting || creatingInvoice} className="active:scale-[0.98] transition-all duration-150">Cancelar</Button>
          <Button
            onClick={handleSubmitOrder}
            disabled={isSubmitting || creatingInvoice}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-600/20"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Procesando...' : posInvoiceMode === 'ELECTRONICA' && isEInvEnabled ? 'Confirmar + Factura Electrónica' : posInvoiceMode === 'DOC_EQUIPOS' ? 'Confirmar + Doc. Equivalente' : 'Confirmar Venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
