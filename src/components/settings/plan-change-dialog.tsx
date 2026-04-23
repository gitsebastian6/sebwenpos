'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2,
  FileText,
  Percent,
  Crown,
  CheckCircle2,
  Plus,
  AlertTriangle,
  Send,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useSubscriptionProration, useUploadPaymentReceipt } from '@/hooks/api/use-settings'
import type { PlanOption } from '@/components/settings/subscription-payment-panel'
import { BILLING_PERIODS } from '@/components/settings/subscription-payment-panel'

interface PlanChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  plans: PlanOption[]
  currentPlanName: string | undefined
  onPlanChanged: () => void
}

export function PlanChangeDialog({ open, onOpenChange, storeId, plans, currentPlanName, onPlanChanged }: PlanChangeDialogProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<string>('MONTHLY')
  const [uploadAmount, setUploadAmount] = useState('')
  const [uploadReference, setUploadReference] = useState('')
  const [uploadMethod, setUploadMethod] = useState('NEQUI')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Track previous open state to reset on open
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form when controlled dialog opens
      setSelectedPlanId(null)
      setSelectedBillingPeriod('MONTHLY')
      setUploadAmount('')
      setUploadReference('')
      setUploadMethod('NEQUI')
      setUploadNotes('')
      setUploadFile(null)
    }
    prevOpenRef.current = open
  }, [open])

  // ── TanStack Query hooks ──
  const { data: prorationInfo, isLoading: loadingProration } = useSubscriptionProration(storeId, selectedPlanId)
  const uploadMutation = useUploadPaymentReceipt()
  const uploading = uploadMutation.isPending

  // ── Plan price with proration adjustment ──
  function getPlanPriceWithProration(plan: PlanOption) {
    const period = BILLING_PERIODS.find(p => p.value === selectedBillingPeriod)
    const discount = period?.discount || 0
    const months = selectedBillingPeriod === 'MONTHLY' ? 1 : selectedBillingPeriod === 'QUARTERLY' ? 3 : selectedBillingPeriod === 'SEMI_ANNUAL' ? 6 : 12
    const fullPrice = plan.price * months
    const discountedPrice = Math.round(fullPrice * (1 - discount / 100))
    const credit = prorationInfo?.proration?.creditAmount || 0
    return {
      fullPrice,
      discountedPrice,
      adjustedPrice: Math.max(0, discountedPrice - credit),
      credit,
      discount,
    }
  }

  async function handlePlanChange(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId || !uploadFile || !selectedPlanId) {
      toast.error('Selecciona un plan y un comprobante')
      return
    }
    const amount = parseInt(uploadAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingresa el monto pagado')
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
        reader.readAsDataURL(uploadFile)
      })
      const fileData = await base64Promise
      const plan = plans.find(p => p.id === selectedPlanId)
      await uploadMutation.mutateAsync({
        storeId,
        data: {
          fileData: `data:${uploadFile.type};base64,${fileData}`,
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type,
          amount,
          reference: uploadReference || undefined,
          paymentMethod: uploadMethod,
          notes: uploadNotes || undefined,
          // Plan change metadata
          requestedPlanId: selectedPlanId,
          requestedPlanName: plan?.name,
          requestedBillingPeriod: selectedBillingPeriod,
        },
      })
      toast.success(`Solicitud de cambio a ${plan?.name} enviada. El administrador revisará tu comprobante.`)
      onOpenChange(false)
      onPlanChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al enviar solicitud')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            Cambiar Plan de Suscripción
          </DialogTitle>
          <DialogDescription>
            Selecciona el plan deseado y sube tu comprobante de pago. El administrador revisará y aprobará tu solicitud.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handlePlanChange}>
          <div className="space-y-5 py-2">
            {/* Plan Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Selecciona tu plan</Label>
              <div className="grid gap-2">
                {plans.filter(p => p.isActive && p.price > 0).map(plan => {
                  const isSelected = selectedPlanId === plan.id
                  const { fullPrice, discountedPrice, discount, credit, adjustedPrice } = selectedPlanId === plan.id ? getPlanPriceWithProration(plan) : { fullPrice: 0, discountedPrice: 0, discount: 0, credit: 0, adjustedPrice: 0 }
                  const isCurrentPlan = currentPlanName === plan.name
                  return (
                    <button
                      type="button"
                      key={plan.id}
                      onClick={() => {
                        setSelectedPlanId(plan.id)
                        if (plan.price === 0) setSelectedBillingPeriod('TRIAL')
                      }}
                      className={`w-full text-left rounded-xl border-2 p-3.5 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/30 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold">{plan.name}</p>
                            {isCurrentPlan && <Badge className="text-[10px] px-1.5 py-0">Actual</Badge>}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {plan.maxEmployees === -1 ? '∞' : plan.maxEmployees} empleados · {plan.maxProducts === -1 ? '∞' : plan.maxProducts} productos
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono">{formatCOP(plan.price)}<span className="text-[10px] font-normal text-muted-foreground">/mes</span></p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-2 space-y-1">
                          {discount > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Descuento del {discount}% por pago anticipado — {formatCOP(discountedPrice)}
                            </div>
                          )}
                          {credit > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-sky-600 dark:text-sky-400">
                              <Percent className="h-3 w-3" />
                              Crédito por {prorationInfo?.proration?.unusedDays || 0} días no usados: -{formatCOP(credit)}
                              <span className="font-semibold text-foreground ml-1">→ {formatCOP(adjustedPrice)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Proration Credit Banner */}
            {selectedPlanId && prorationInfo?.hasCredit && prorationInfo.proration && !loadingProration && (
              <div className="rounded-lg border border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/20 p-3.5 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Percent className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-sky-700 dark:text-sky-300">Prorrateo por cambio de plan</p>
                    <p className="text-[11px] text-sky-600/80 dark:text-sky-400/80">
                      Tienes {prorationInfo.proration.unusedDays} días restantes de tu plan <strong>{prorationInfo.currentPlan.name}</strong>
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="text-center p-2 rounded-md bg-white/60 dark:bg-white/5">
                    <p className="text-[10px] text-muted-foreground">Días restantes</p>
                    <p className="text-sm font-bold font-mono text-sky-700 dark:text-sky-300">{prorationInfo.proration.unusedDays}</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-white/60 dark:bg-white/5">
                    <p className="text-[10px] text-muted-foreground">Crédito diario</p>
                    <p className="text-sm font-bold font-mono text-sky-700 dark:text-sky-300">{formatCOP(prorationInfo.proration.dailyRate)}</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/30">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Total crédito</p>
                    <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">-{formatCOP(prorationInfo.proration.creditAmount)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-sky-600/70 dark:text-sky-400/60 text-center">
                  El crédito se aplicará automáticamente sobre el precio del nuevo plan al ser aprobado.
                </p>
              </div>
            )}

            {loadingProration && selectedPlanId && (
              <div className="flex items-center gap-2 justify-center py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculando prorrateo...
              </div>
            )}

            {/* Billing Period */}
            {selectedPlanId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">2. Período de facturación</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BILLING_PERIODS.map(period => {
                    const plan = plans.find(p => p.id === selectedPlanId)
                    if (!plan) return null
                    const { discountedPrice, adjustedPrice } = getPlanPriceWithProration(plan)
                    const periodPrice = selectedBillingPeriod === period.value
                      ? discountedPrice
                      : Math.round(plan.price * (period.value === 'MONTHLY' ? 1 : period.value === 'QUARTERLY' ? 3 : period.value === 'SEMI_ANNUAL' ? 6 : 12) * (1 - period.discount / 100))
                    const showCredit = selectedBillingPeriod === period.value && prorationInfo?.hasCredit
                    return (
                      <button
                        key={period.value}
                        type="button"
                        onClick={() => setSelectedBillingPeriod(period.value)}
                        className={`rounded-lg border-2 p-2.5 text-left transition-all ${
                          selectedBillingPeriod === period.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/20'
                        }`}
                      >
                        <p className="text-xs font-semibold">{period.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatCOP(periodPrice)}
                          {period.discount > 0 && <span className="text-emerald-600 dark:text-emerald-400 ml-1">-{period.discount}%</span>}
                        </p>
                        {showCredit && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                            Con crédito: {formatCOP(adjustedPrice)}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Comprobante Upload */}
            {selectedPlanId && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">3. Comprobante de pago <span className="text-destructive">*</span></Label>
                <p className="text-[11px] text-muted-foreground">
                  Sube la captura o foto de tu pago. El administrador lo verificará para activar tu nuevo plan.
                </p>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="plan-change-file"
                  />
                  <label htmlFor="plan-change-file" className="flex items-center justify-center gap-3 p-4 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
                    {uploadFile ? (
                      <>
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Plus className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Seleccionar archivo</p>
                          <p className="text-xs text-muted-foreground">PNG, JPG, WebP, PDF — máx 5MB</p>
                        </div>
                      </>
                    )}
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-amount" className="text-xs">Monto pagado (COP) <span className="text-destructive">*</span></Label>
                    <Input id="plan-amount" type="number" placeholder="69900" value={uploadAmount} onChange={(e) => setUploadAmount(e.target.value)} min={1} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Método de pago</Label>
                    <select
                      value={uploadMethod}
                      onChange={(e) => setUploadMethod(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="NEQUI">Nequi</option>
                      <option value="DAVIPLATA">Daviplata</option>
                      <option value="BANCOLOMBIA">Bancolombia</option>
                      <option value="BANCARY">Bancario</option>
                      <option value="EFFECTIVE">Efectivo</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plan-ref" className="text-xs">Referencia (opcional)</Label>
                  <Input id="plan-ref" placeholder="Número de transacción" value={uploadReference} onChange={(e) => setUploadReference(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plan-notes" className="text-xs">Notas (opcional)</Label>
                  <Textarea id="plan-notes" placeholder="Información adicional" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={2} />
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Tu solicitud quedará en estado <strong>Pendiente</strong> hasta que el administrador verifique tu pago. Recibirás los beneficios del nuevo plan una vez aprobado.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={uploading || !selectedPlanId || !uploadFile || !uploadAmount}>
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-1.5" /> Enviar Solicitud</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
