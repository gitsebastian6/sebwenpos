'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  FileText,
  Crown,
  CheckCircle2,
  AlertTriangle,
  Send,
  CreditCard,
  Shield,
  Star,
  Sparkles,
  Check,
  Upload,
  ChevronLeft,
  MessageCircle,
  Beaker,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useUploadPaymentReceipt } from '@/hooks/api/use-settings'
import type { PlanOption } from '@/components/settings/subscription-payment-panel'
import { BILLING_PERIODS } from '@/components/settings/subscription-payment-panel'
import { WompiCheckoutDialog } from '@/components/settings/wompi-checkout'
import { WompiPaymentMethodsGrid, WompiPoweredBy } from '@/components/payments/wompi-payment-methods'

interface PlanChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  plans: PlanOption[]
  currentPlanName: string | undefined
  onPlanChanged: () => void
}

// Determine step based on user progress (2 steps: plan+period, then payment+proof)
function getActiveStep(selectedPlanId: number | null) {
  return selectedPlanId ? 2 : 1
}

// Plan icon mapping based on plan name
function getPlanIcon(planName: string) {
  const name = planName.toLowerCase()
  if (name === 'empresarial') return { icon: Crown, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' }
  if (name === 'pro') return { icon: Star, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' }
  // Default for Básico and any other
  return { icon: Sparkles, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' }
}

export function PlanChangeDialog({ open, onOpenChange, storeId, plans, currentPlanName, onPlanChanged }: PlanChangeDialogProps) {
  // ── Key to force remount (reset) when dialog opens ──
  const [dialogKey, setDialogKey] = useState(0)
  const handleOpenChange = useCallback((value: boolean) => {
    if (value) setDialogKey(k => k + 1)
    onOpenChange(value)
  }, [onOpenChange])

  // ── Wompi health check ──
  const { data: wompiHealth } = useQuery({
    queryKey: ['wompi-health'],
    queryFn: () => fetch('/api/payments/wompi/health').then(r => r.json()),
    staleTime: 60_000,
  })
  const isWompiDemo = wompiHealth?.demoMode === true
  const demoVisible = wompiHealth?.demoVisible === true
  const wompiEnabled = wompiHealth?.wompiEnabled === true
  const showWompiPayment = isWompiDemo ? demoVisible : wompiEnabled

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[560px] max-h-[92vh] overflow-hidden p-0 gap-0 flex flex-col">
        <PlanChangeInner
          key={dialogKey}
          storeId={storeId}
          plans={plans}
          currentPlanName={currentPlanName}
          onPlanChanged={() => { onPlanChanged(); handleOpenChange(false) }}
          onClose={() => handleOpenChange(false)}
          showWompiPayment={showWompiPayment}
          isWompiDemo={isWompiDemo}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── Inner form component (remounts on each dialog open via key) ──
function PlanChangeInner({
  storeId, plans, currentPlanName, onPlanChanged, onClose,
  showWompiPayment, isWompiDemo,
}: {
  storeId: number
  plans: PlanOption[]
  currentPlanName: string | undefined
  onPlanChanged: () => void
  onClose: () => void
  showWompiPayment: boolean
  isWompiDemo: boolean
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<string>('MONTHLY')
  const [uploadAmount, setUploadAmount] = useState('')
  const [uploadReference, setUploadReference] = useState('')
  const [uploadMethod, setUploadMethod] = useState('NEQUI')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // ── Wompi checkout state ──
  const [showWompiCheckout, setShowWompiCheckout] = useState(false)
  const [wompiCheckoutParams, setWompiCheckoutParams] = useState<{
    planId: number; planName: string; amount: number; billingPeriod: string
  } | null>(null)

  // Track whether user manually edited the amount (to avoid overwriting)
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false)

  // ── TanStack Query hooks ──
  const uploadMutation = useUploadPaymentReceipt()
  const uploading = uploadMutation.isPending

  // ── Plan price calculation (no credit/proration) ──
  function getPlanPrice(plan: PlanOption, periodValue?: string) {
    const pv = periodValue || selectedBillingPeriod
    const period = BILLING_PERIODS.find(p => p.value === pv)
    const discount = period?.discount || 0
    const months = pv === 'MONTHLY' ? 1 : pv === 'QUARTERLY' ? 3 : pv === 'SEMI_ANNUAL' ? 6 : 12
    const fullPrice = plan.price * months
    const discountedPrice = Math.round(fullPrice * (1 - discount / 100))
    return { fullPrice, discountedPrice, discount }
  }

  // Compute auto-filled amount from plan + period
  const autoFilledAmount = (() => {
    if (!selectedPlanId || !selectedBillingPeriod) return ''
    const plan = plans.find(p => p.id === selectedPlanId)
    if (!plan) return ''
    const { discountedPrice } = getPlanPrice(plan)
    return String(discountedPrice)
  })()

  // The displayed amount: auto-filled unless user manually edited
  const displayAmount = amountManuallyEdited ? uploadAmount : autoFilledAmount

  async function handlePlanChange(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId || !selectedPlanId) {
      toast.error('Selecciona un plan')
      return
    }
    const amount = parseInt(displayAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingresa el monto pagado')
      return
    }
    try {
      const plan = plans.find(p => p.id === selectedPlanId)
      const body: Record<string, unknown> = {
        amount,
        reference: uploadReference || undefined,
        paymentMethod: uploadMethod,
        notes: uploadNotes || undefined,
        // Plan change metadata
        requestedPlanId: selectedPlanId,
        requestedPlanName: plan?.name,
        requestedBillingPeriod: selectedBillingPeriod,
      }

      // File is optional — only attach if user uploaded one
      if (uploadFile) {
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
        body.fileData = `data:${uploadFile.type};base64,${fileData}`
        body.fileName = uploadFile.name
        body.fileSize = uploadFile.size
        body.fileType = uploadFile.type
      }

      await uploadMutation.mutateAsync({ storeId, body })
      toast.success(uploadFile
        ? `Solicitud de cambio a ${plan?.name} enviada con comprobante. El administrador revisará tu pago.`
        : `Solicitud de cambio a ${plan?.name} enviada. Puedes subir el comprobante después.`
      )
      onClose()
      onPlanChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al enviar solicitud')
    }
  }

  const activeStep = getActiveStep(selectedPlanId)

  // Filter active paid plans
  const activePlans = plans.filter(p => p.isActive && p.price > 0)

  return (
    <>
        {/* ─── Dialog Header (fixed top) ─── */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50 bg-gradient-to-b from-muted/30 to-background shrink-0">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold tracking-tight">
                    Cambiar Plan
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Elige el plan ideal para tu negocio
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[11px] font-medium tabular-nums bg-muted/80 backdrop-blur-sm border-border/50">
                  Paso {activeStep} de 2
                </Badge>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Volver"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Volver
                </button>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* ─── Form wrapping scrollable content + footer ─── */}
        <form onSubmit={handlePlanChange} className="flex flex-col flex-1 min-h-0">
          {/* ─── Scrollable Content ─── */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6" style={{ scrollbarGutter: 'stable' }}>
            <div className="space-y-6">

              {/* ═══ 1. PLAN SELECTION ═══ */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">1</span>
                  <Label className="text-sm font-bold">Selecciona tu plan</Label>
                </div>

                <div className="grid gap-3">
                  {activePlans.map((plan, planIndex) => {
                    const isSelected = selectedPlanId === plan.id
                    const { fullPrice, discountedPrice, discount } = selectedPlanId === plan.id ? getPlanPrice(plan) : { fullPrice: 0, discountedPrice: 0, discount: 0 }
                    const isCurrentPlan = currentPlanName === plan.name
                    const { icon: PlanIcon, color: iconColor, bg: iconBg } = getPlanIcon(plan.name)
                    // Mark the middle plan as "popular" if there are 3+
                    const isPopular = activePlans.length >= 3 && planIndex === 1 && !isCurrentPlan

                    // Extract feature names from the features object
                    const featureNames = Object.entries(plan.features)
                      .filter(([, val]) => val)
                      .map(([key]) => {
                        // Convert snake_case to readable text
                        return key
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, c => c.toUpperCase())
                      })

                    return (
                      <div key={plan.id} className="relative">
                        {/* Popular ribbon */}
                        {isPopular && (
                          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-[10px] font-bold shadow-md shadow-primary/25">
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Más Popular
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlanId(plan.id)
                            setAmountManuallyEdited(false)
                            if (plan.price === 0) setSelectedBillingPeriod('TRIAL')
                          }}
                          className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-200 group ${
                            isSelected
                              ? 'border-primary bg-primary/[0.04] dark:bg-primary/[0.07] shadow-sm shadow-primary/10'
                              : 'border-border hover:border-primary/30 hover:bg-muted/20'
                          } ${isPopular && !isSelected ? 'ring-1 ring-primary/10' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Plan icon */}
                            <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isSelected ? 'ring-2 ring-primary/20' : ''}`}>
                              <PlanIcon className={`h-5 w-5 ${iconColor}`} />
                            </div>

                            {/* Plan info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold">{plan.name}</span>
                                {isCurrentPlan && (
                                  <Badge className="text-[10px] px-1.5 py-0 font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200/50 dark:border-sky-800/50">
                                    Plan Actual
                                  </Badge>
                                )}
                              </div>

                              {/* Price */}
                              <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-xl font-extrabold font-mono tracking-tight">
                                  {formatCOP(plan.price)}
                                </span>
                                <span className="text-xs text-muted-foreground font-medium">/mes</span>
                              </div>

                              {/* Features (compact) */}
                              {featureNames.length > 0 && (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                                  {featureNames.slice(0, 4).map(feature => (
                                    <span key={feature} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                                      {feature}
                                    </span>
                                  ))}
                                  <span className="text-[11px] text-muted-foreground">
                                    {plan.maxProducts === -1 ? '∞' : plan.maxProducts} prod · {plan.maxEmployees === -1 ? '∞' : plan.maxEmployees} emp · {plan.maxStores === -1 ? '∞' : plan.maxStores} suc
                                  </span>
                                </div>
                              )}

                              {/* Discount info inside card when selected */}
                              {isSelected && (
                                <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                                  {discount > 0 && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        <span className="font-semibold">-{discount}%</span> por pago anticipado — Total: <span className="font-bold text-foreground">{formatCOP(discountedPrice)}</span>
                                      </span>
                                    </div>
                                  )}
                                  {discount === 0 && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span className="font-medium">Selecciona un período de facturación ↓</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Selection indicator */}
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/30 group-hover:border-primary/40'
                            }`}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* ═══ 2. BILLING PERIOD ═══ */}
              {selectedPlanId && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">1</span>
                    <Label className="text-sm font-bold">Período de facturación</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {BILLING_PERIODS.map(period => {
                      const plan = plans.find(p => p.id === selectedPlanId)
                      if (!plan) return null
                      const periodPrice = getPlanPrice(plan, period.value).discountedPrice
                      const isSelected = selectedBillingPeriod === period.value

                      return (
                        <button
                          key={period.value}
                          type="button"
                          onClick={() => {
                            setSelectedBillingPeriod(period.value)
                            setAmountManuallyEdited(false)
                          }}
                          className={`relative rounded-xl border-2 p-3.5 text-left transition-all duration-200 group ${
                            isSelected
                              ? 'border-primary bg-primary/[0.04] dark:bg-primary/[0.07] shadow-sm shadow-primary/10'
                              : 'border-border hover:border-primary/20 hover:bg-muted/20'
                          }`}
                        >
                          {/* Checkmark overlay */}
                          {isSelected && (
                            <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                              <Check className="h-3 w-3" />
                            </div>
                          )}

                          <p className={`text-xs font-bold ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{period.label}</p>
                          <p className="text-sm font-extrabold font-mono mt-0.5 tracking-tight">{formatCOP(periodPrice)}</p>

                          {period.discount > 0 && (
                            <Badge className="mt-1.5 text-[10px] font-semibold px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40">
                              -{period.discount}%
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ═══ 2. PAYMENT & PROOF ═══ */}
              {selectedPlanId && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">2</span>
                    <Label className="text-sm font-bold">Pago y comprobante</Label>
                  </div>

                  {showWompiPayment ? (
                    <>
                      {/* ── Wompi available (demo visible or real enabled) ── */}
                      <div className="space-y-2">
                        <Button
                          className="w-full h-12 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 transition-all duration-200"
                          size="lg"
                          type="button"
                          onClick={() => {
                            const plan = plans.find(p => p.id === selectedPlanId)
                            if (!plan) return
                            const { discountedPrice } = getPlanPrice(plan)
                            setWompiCheckoutParams({
                              planId: plan.id,
                              planName: plan.name,
                              amount: discountedPrice,
                              billingPeriod: selectedBillingPeriod,
                            })
                            setShowWompiCheckout(true)
                          }}
                        >
                          {isWompiDemo ? <Beaker className="h-4 w-4 mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                          {isWompiDemo ? 'Pagar con Wompi (Demo)' : 'Pagar con Wompi'}
                        </Button>
                        <div className="flex items-center gap-1.5 justify-center text-[11px] text-muted-foreground">
                          <Shield className="h-3 w-3 text-emerald-500" />
                          <span>Pago seguro · Tarjeta · Nequi · Daviplata · PSE · Bancolombia</span>
                        </div>
                      </div>

                      {/* Payment methods grid (only in real mode) */}
                      {!isWompiDemo && <WompiPaymentMethodsGrid />}

                      {/* Wompi Powered By */}
                      <div className="flex justify-center pt-1">
                        <WompiPoweredBy />
                      </div>

                      {/* ── Divider "ó" ── */}
                      <div className="relative flex items-center justify-center my-1">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/60" />
                        </div>
                        <span className="relative bg-background px-4 text-xs text-muted-foreground font-medium">ó</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* ── Wompi NOT available: Coming soon + manual payment info ── */}

                      {/* Payments coming soon banner */}
                      <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/10 p-4 text-center space-y-3">
                        <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
                          <CreditCard className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200">Pagos Online — Próximamente</h3>
                          <p className="text-xs text-amber-700/70 dark:text-amber-300/60 mt-1 leading-relaxed">
                            Estamos integrando pagos automatizados con nuestros aliados <span className="font-semibold">Wompi</span> y <span className="font-semibold">Stripe</span> para que puedas pagar directamente desde aquí.
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-1">
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 rounded-full">Wompi</span>
                          <span className="text-[11px] text-muted-foreground">+</span>
                          <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-3 py-1 rounded-full">Stripe</span>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="relative flex items-center justify-center my-1">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
                        <span className="relative bg-background px-4 text-xs text-muted-foreground font-medium">Pago manual</span>
                      </div>

                      {/* Manual payment info */}
                      <div className="space-y-3">
                        <div className="rounded-lg border border-border/50 p-3 space-y-2">
                          <p className="text-xs font-semibold">¿Cómo pagar?</p>
                          <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                            <li>Solicita datos de pago por <strong>WhatsApp</strong> si no los tienes</li>
                            <li>Realiza el pago por <strong>Nequi, Daviplata, Bancolombia</strong> o el método indicado</li>
                            <li>Envía la solicitud y sube el <strong>comprobante</strong> cuando lo tengas — el administrador activará tu plan</li>
                          </ol>
                        </div>
                        <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/10 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">¿Necesitas datos de pago?</p>
                          </div>
                          <a href="https://wa.me/573012695457?text=Hola%2C%20quiero%20los%20datos%20de%20pago%20para%20mi%20suscripción%20Sebwen%20POS" target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                            Escribir por WhatsApp →
                          </a>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Upload receipt (optional) ── */}
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sube el comprobante de tu pago <span className="font-medium text-foreground">(opcional — puedes enviar la solicitud ahora y subir el comprobante después)</span>. El monto total se llenó automáticamente según el plan y período elegido, pero puedes editarlo si es necesario.
                  </p>

                  {/* Upload zone */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="plan-change-file"
                    />
                    <label
                      htmlFor="plan-change-file"
                      className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                        uploadFile
                          ? 'border-primary/40 bg-primary/[0.03] hover:border-primary/60'
                          : 'border-border hover:border-primary/40 hover:bg-muted/20'
                      }`}
                    >
                      {uploadFile ? (
                        <>
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="text-center min-w-0">
                            <p className="text-sm font-semibold truncate max-w-[240px]">{uploadFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <Upload className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-foreground/80">Arrastra o haz clic para subir</p>
                            <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WebP, PDF — máx 5MB</p>
                          </div>
                        </>
                      )}
                    </label>
                  </div>

                  {/* Calculated total banner */}
                  {selectedPlanId && autoFilledAmount && !amountManuallyEdited && (
                    <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Total calculado: <span className="font-bold text-foreground">{formatCOP(parseInt(autoFilledAmount) || 0)}</span> — modifícalo si pagaste un monto diferente
                      </p>
                    </div>
                  )}

                  {/* Form fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="plan-amount" className="text-xs font-medium">
                        Monto pagado (COP) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="plan-amount"
                        type="number"
                        placeholder="0"
                        value={displayAmount}
                        onChange={(e) => {
                          setAmountManuallyEdited(true)
                          setUploadAmount(e.target.value)
                        }}
                        min={1}
                        required
                        className="h-9 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Método de pago</Label>
                      <Select value={uploadMethod} onValueChange={setUploadMethod}>
                        <SelectTrigger className="h-9 w-full rounded-lg">
                          <SelectValue placeholder="Seleccionar método" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NEQUI">Nequi</SelectItem>
                          <SelectItem value="DAVIPLATA">Daviplata</SelectItem>
                          <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                          <SelectItem value="BANCARY">Bancario</SelectItem>
                          <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                          <SelectItem value="OTHER">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plan-ref" className="text-xs font-medium">Referencia (opcional)</Label>
                    <Input
                      id="plan-ref"
                      placeholder="Número de transacción"
                      value={uploadReference}
                      onChange={(e) => setUploadReference(e.target.value)}
                      className="h-9 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plan-notes" className="text-xs font-medium">Notas (opcional)</Label>
                    <Textarea
                      id="plan-notes"
                      placeholder="Información adicional"
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      rows={2}
                      className="rounded-lg resize-none"
                    />
                  </div>

                  {/* Warning */}
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                      Tu solicitud quedará en estado <strong>Pendiente</strong> hasta que el administrador verifique tu pago. Recibirás los beneficios del nuevo plan una vez aprobado.
                    </p>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* ─── Footer (fixed bottom) ─── */}
          <DialogFooter className="px-6 pt-4 pb-5 border-t border-border/50 bg-background shrink-0 gap-2 flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={uploading}
              className="flex-1 h-10 rounded-xl font-medium"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={uploading || !selectedPlanId || !displayAmount}
              className="flex-1 h-10 rounded-xl font-semibold"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-1.5" /> Enviar Solicitud</>
              )}
            </Button>
          </DialogFooter>
        </form>

      {/* Wompi Checkout Dialog */}
      {wompiCheckoutParams && (
        <WompiCheckoutDialog
          open={showWompiCheckout}
          onOpenChange={setShowWompiCheckout}
          storeId={storeId}
          planId={wompiCheckoutParams.planId}
          planName={wompiCheckoutParams.planName}
          amount={wompiCheckoutParams.amount}
          billingPeriod={wompiCheckoutParams.billingPeriod}
          demoMode={isWompiDemo}
          onPaymentComplete={() => {
            onClose()
            onPlanChanged()
          }}
          onManualUpload={() => {
            setShowWompiCheckout(false)
          }}
        />
      )}
    </>
  )
}
