'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCOP } from '@/lib/format'
import { useUploadPaymentReceipt } from '@/hooks/api/use-settings'
import {
  Receipt,
  Copy,
  Check,
  CreditCard,
  Upload,
  Loader2,
  Clock,
  Landmark,
  Smartphone,
  Banknote,
  CircleDollarSign,
  Send,
  FileText,
  ShieldCheck,
  CalendarDays,
  ArrowRight,
  Info,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BillingPayCardProps {
  storeId: number
  planName: string
  planPrice: number            // monthly price
  billingPeriod: string        // MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL, TRIAL
  billingPrice: number         // total price for the period (with discount)
  status: string               // TRIAL, ACTIVE, PAST_DUE, EXPIRED
  daysRemaining: number | null
  endDate: string | null
  hasPendingReceipt: boolean
  showWompiPayment: boolean
  isWompiDemo: boolean
  onPayWithWompi: () => void
  onReceiptUploaded: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  SEMI_ANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  TRIAL: 'Prueba',
}

const PERIOD_DISCOUNTS: Record<string, number> = {
  MONTHLY: 0,
  QUARTERLY: 5,
  SEMI_ANNUAL: 10,
  ANNUAL: 15,
}

const BANK_DETAILS = [
  {
    method: 'Nequi',
    number: '301 269 5457',
    icon: Smartphone,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-500/15',
  },
  {
    method: 'Daviplata',
    number: '301 269 5457',
    icon: Smartphone,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-500/15',
  },
  {
    method: 'Bancolombia',
    number: 'Ahorros 301 269 5457',
    icon: Landmark,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-500/15',
  },
] as const

const PAYMENT_METHODS = [
  { value: 'NEQUI', label: 'Nequi' },
  { value: 'DAVIPLATA', label: 'Daviplata' },
  { value: 'BANCOLOMBIA', label: 'Bancolombia' },
  { value: 'EFFECTIVE', label: 'Efectivo' },
  { value: 'OTHER', label: 'Otro' },
] as const

// ─── Component ───────────────────────────────────────────────────────────────

export function BillingPayCard({
  storeId,
  planName,
  planPrice,
  billingPeriod,
  billingPrice,
  status,
  daysRemaining,
  endDate,
  hasPendingReceipt,
  showWompiPayment,
  isWompiDemo,
  onPayWithWompi,
  onReceiptUploaded,
}: BillingPayCardProps) {
  const uploadReceiptMutation = useUploadPaymentReceipt()
  const uploading = uploadReceiptMutation.isPending

  // ── Receipt upload form state ──
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptAmount, setReceiptAmount] = useState(String(billingPrice))
  const [receiptMethod, setReceiptMethod] = useState('NEQUI')
  const [receiptReference, setReceiptReference] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Derived values ──
  const periodLabel = PERIOD_LABELS[billingPeriod] ?? billingPeriod
  const discountPercent = PERIOD_DISCOUNTS[billingPeriod] ?? 0
  const fullPeriodPrice = planPrice * getPeriodMonths(billingPeriod)
  const discountAmount = fullPeriodPrice > billingPrice ? fullPeriodPrice - billingPrice : 0
  const hasDiscount = discountPercent > 0 && discountAmount > 0

  // ── Copy to clipboard ──
  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, '')).then(
      () => toast.success(`${label} copiado!`),
      () => toast.error('No se pudo copiar'),
    )
  }, [])

  // ── File handling ──
  const handleFileChange = useCallback((file: File | null) => {
    if (!file) {
      setReceiptFile(null)
      return
    }
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error('El archivo no puede superar 5MB')
      return
    }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf']
    if (!allowed.includes(file.type)) {
      toast.error('Formato no soportado. Usa PNG, JPG, WebP o PDF')
      return
    }
    setReceiptFile(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0] ?? null
    handleFileChange(file)
  }, [handleFileChange])

  // ── Submit receipt ──
  const handleSubmitReceipt = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!receiptFile) {
      toast.error('Selecciona un comprobante')
      return
    }
    const amount = parseInt(receiptAmount, 10)
    if (!amount || amount <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          resolve(base64)
        }
        reader.readAsDataURL(receiptFile)
      })
      const fileData = await base64Promise

      await uploadReceiptMutation.mutateAsync({
        storeId,
        body: {
          fileData: `data:${receiptFile.type};base64,${fileData}`,
          fileName: receiptFile.name,
          fileSize: receiptFile.size,
          fileType: receiptFile.type,
          amount,
          reference: receiptReference || undefined,
          paymentMethod: receiptMethod,
        },
      })

      toast.success('Comprobante enviado correctamente. Será revisado por el administrador.')
      onReceiptUploaded()

      // Reset form
      setReceiptFile(null)
      setReceiptAmount(String(billingPrice))
      setReceiptMethod('NEQUI')
      setReceiptReference('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar comprobante')
    }
  }, [
    storeId,
    receiptFile,
    receiptAmount,
    receiptMethod,
    receiptReference,
    billingPrice,
    uploadReceiptMutation,
    onReceiptUploaded,
  ])

  return (
    <Card className="border-2 border-dashed border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 rounded-2xl overflow-hidden">
      {/* ── Pending receipt banner ── */}
      {hasPendingReceipt && (
        <div className="bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-800/60 px-6 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Tienes un comprobante en revisión. El administrador activará tu plan pronto.
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <CardHeader className="pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
              <Receipt className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Factura Pendiente</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {planName} &middot; {periodLabel}
                {daysRemaining !== null && daysRemaining !== undefined && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    {daysRemaining} día{daysRemaining !== 1 ? 's' : ''} restante{daysRemaining !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatCOP(billingPrice)}
            </p>
            {billingPeriod !== 'TRIAL' && (
              <p className="text-[11px] text-muted-foreground">
                {periodLabel}
                {hasDiscount && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium ml-1">
                    (-{discountPercent}%)
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Stripe-style price preview ── */}
        <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/15 p-4 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              {status === 'TRIAL' ? (
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  Paga hoy <span className="font-bold font-mono">{formatCOP(billingPrice)}</span> para activar tu plan{' '}
                  <span className="font-semibold">{planName}</span> por <span className="font-semibold">{periodLabel}</span>
                </p>
              ) : status === 'CANCELLED' ? (
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  Reactiva tu plan <span className="font-semibold">{planName}</span> — paga{' '}
                  <span className="font-bold font-mono">{formatCOP(billingPrice)}</span> por <span className="font-semibold">{periodLabel}</span>
                </p>
              ) : status === 'EXPIRED' || status === 'PAST_DUE' ? (
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  Renueva tu plan <span className="font-semibold">{planName}</span> — paga{' '}
                  <span className="font-bold font-mono">{formatCOP(billingPrice)}</span> por <span className="font-semibold">{periodLabel}</span>
                </p>
              ) : (
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  Próxima renovación: <span className="font-bold font-mono">{formatCOP(billingPrice)}</span> por{' '}
                  <span className="font-semibold">{periodLabel}</span> del plan <span className="font-semibold">{planName}</span>
                </p>
              )}
              {billingPeriod !== 'TRIAL' && planPrice > 0 && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3 shrink-0" />
                  Equivalente a <span className="font-semibold font-mono">{formatCOP(planPrice)}/mes</span>
                  {hasDiscount && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      <ArrowRight className="h-3 w-3 inline" />
                      -{discountPercent}% por pago anticipado
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Summary table ── */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {/* Plan name + period */}
              <tr className="border-b border-border/40">
                <td className="px-4 py-3 text-muted-foreground">
                  {planName} &mdash; Plan {periodLabel}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {billingPeriod === 'TRIAL' ? '—' : `${formatCOP(planPrice)}/mes`}
                </td>
              </tr>

              {/* Full period price */}
              {billingPeriod !== 'TRIAL' && (
                <tr className="border-b border-border/40">
                  <td className="px-4 py-3 text-muted-foreground">
                    Subtotal ({getPeriodMonths(billingPeriod)} mes{getPeriodMonths(billingPeriod) !== 1 ? 'es' : ''} × {formatCOP(planPrice)})
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground line-through">
                    {formatCOP(fullPeriodPrice)}
                  </td>
                </tr>
              )}

              {/* Discount row */}
              {hasDiscount && (
                <tr className="border-b border-border/40">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      Descuento {periodLabel}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-bold">
                        -{discountPercent}%
                      </Badge>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                    -{formatCOP(discountAmount)}
                  </td>
                </tr>
              )}

              {/* Total */}
              <tr className="bg-muted/30">
                <td className="px-4 py-3.5 font-bold text-base text-foreground">
                  Total a pagar
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-base text-foreground">
                  {formatCOP(billingPrice)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Payment section ── */}
        {!hasPendingReceipt && (
          <div className="space-y-4">
            {/* Wompi button or "Próximamente" */}
            {showWompiPayment ? (
              <Button
                type="button"
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold shadow-lg shadow-emerald-600/25 transition-all text-sm"
                onClick={onPayWithWompi}
              >
                {isWompiDemo ? (
                  <>
                    <ShieldCheck className="h-4.5 w-4.5 mr-2" />
                    Pagar con Wompi (Demo)
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4.5 w-4.5 mr-2" />
                    Pagar con Wompi
                  </>
                )}
              </Button>
            ) : (
              <div className="rounded-xl border border-muted bg-muted/30 p-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <CreditCard className="h-5 w-5 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">Pago en línea</p>
                </div>
                <p className="text-xs text-muted-foreground/60">Próximamente disponible</p>
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0">
                    Próximamente
                  </Badge>
                </div>
              </div>
            )}

            {/* Divider "ó" */}
            <div className="relative flex items-center justify-center">
              <Separator className="absolute" />
              <span className="relative bg-card px-3 text-xs text-muted-foreground font-medium">
                ó
              </span>
            </div>

            {/* ── Bank payment details (always visible) ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2">
                <Banknote className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Datos para transferencia o Nequi</span>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                {/* Titular */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                      Titular
                    </p>
                    <p className="text-sm font-semibold mt-0.5">SEBASTIAN RAMIREZ</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('SEBASTIAN RAMIREZ', 'Nombre')}
                    className="shrink-0 h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                    aria-label="Copiar nombre del titular"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>

                {/* Bank accounts */}
                {BANK_DETAILS.map((detail) => (
                  <BankDetailRow
                    key={detail.method}
                    method={detail.method}
                    number={detail.number}
                    Icon={detail.icon}
                    color={detail.color}
                    bgColor={detail.bgColor}
                    onCopy={copyToClipboard}
                  />
                ))}
              </div>
            </div>

            {/* ── Inline receipt upload ── */}
            <form onSubmit={handleSubmitReceipt} className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Subir comprobante</span>
                </div>

                {/* File drop zone */}
                <div
                  className={`relative rounded-xl border-2 border-dashed p-5 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-primary bg-primary/5 scale-[1.01]'
                      : receiptFile
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-border hover:border-primary/40 hover:bg-muted/30'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    className="hidden"
                    aria-label="Seleccionar archivo de comprobante"
                  />
                  {receiptFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
                        <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-medium truncate max-w-[200px]">{receiptFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(receiptFile.size / 1024).toFixed(1)} KB &middot; Click para cambiar
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mx-auto">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Arrastra tu comprobante aquí
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          o haz click para seleccionar &middot; PNG, JPG, PDF &middot; máx 5MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Amount input */}
                <div className="space-y-1.5">
                  <Label htmlFor="billing-receipt-amount" className="text-xs font-medium">
                    Monto pagado (COP) <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <CircleDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="billing-receipt-amount"
                      type="number"
                      value={receiptAmount}
                      onChange={(e) => setReceiptAmount(e.target.value)}
                      min={1}
                      className="pl-9 font-mono"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Payment method select */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Método de pago</Label>
                  <Select value={receiptMethod} onValueChange={setReceiptMethod}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Reference input */}
                <div className="space-y-1.5">
                  <Label htmlFor="billing-receipt-ref" className="text-xs font-medium">
                    Referencia <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="billing-receipt-ref"
                    type="text"
                    value={receiptReference}
                    onChange={(e) => setReceiptReference(e.target.value)}
                    placeholder="Número de transacción"
                  />
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl font-semibold"
                  disabled={uploading || !receiptFile}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar Comprobante
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Helper: Bank detail row ─────────────────────────────────────────────────

function BankDetailRow({
  method,
  number,
  Icon,
  color,
  bgColor,
  onCopy,
}: {
  method: string
  number: string
  Icon: typeof Landmark
  color: string
  bgColor: string
  onCopy: (text: string, label: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy(number, method)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`h-7 w-7 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{method}</p>
          <p className="text-sm font-semibold font-mono tracking-wide">{number}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
        aria-label={`Copiar número de ${method}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}

// ─── Helper: get period months ──────────────────────────────────────────────

function getPeriodMonths(period: string): number {
  switch (period) {
    case 'MONTHLY':
    case 'TRIAL':
      return 1
    case 'QUARTERLY':
      return 3
    case 'SEMI_ANNUAL':
      return 6
    case 'ANNUAL':
      return 12
    default:
      return 1
  }
}
