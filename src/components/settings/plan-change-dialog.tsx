'use client'

import { useState, useRef, useEffect } from 'react'
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
  Loader2,
  FileText,
  Percent,
  Crown,
  CheckCircle2,
  Plus,
  AlertTriangle,
  Send,
  CreditCard,
  Shield,
  Star,
  Sparkles,
  Check,
  Upload,
  ArrowRight,
  X,
  MessageCircle,
  Beaker,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useSubscriptionProration, useUploadPaymentReceipt } from '@/hooks/api/use-settings'
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

// Determine step based on user progress
function getActiveStep(selectedPlanId: number | null, selectedBillingPeriod: string, uploadFile: File | null) {
  if (!selectedPlanId) return 1
  if (!selectedBillingPeriod) return 2
  if (!uploadFile) return 3
  return 3
}

// Plan icon mapping based on plan index
function getPlanIcon(index: number) {
  switch (index) {
    case 0: return { icon: Star, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' }
    case 1: return { icon: Crown, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' }
    case 2: return { icon: Sparkles, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' }
    default: return { icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10' }
  }
}

export function PlanChangeDialog({ open, onOpenChange, storeId, plans, currentPlanName, onPlanChanged }: PlanChangeDialogProps) {
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

  // ── Wompi health check ──
  const { data: wompiHealth } = useQuery({
    queryKey: ['wompi-health'],
    queryFn: () => fetch('/api/payments/wompi/health').then(r => r.json()),
    staleTime: 60_000,
  })
  const isWompiConfigured = wompiHealth?.configured === true
  const isWompiDemo = wompiHealth?.demoMode === true
  // Super admin controls: demoVisible hides demo from customers, wompiEnabled enables real Wompi
  const demoVisible = wompiHealth?.demoVisible === true
  const wompiEnabled = wompiHealth?.wompiEnabled === true
  // Show Wompi payment section only if demo is visible OR real Wompi is enabled
  const showWompiPayment = isWompiDemo ? demoVisible : wompiEnabled

  // Track whether user manually edited the amount (to avoid overwriting)
  const amountManuallyEditedRef = useRef(false)

  // Auto-fill amount when plan/billing period changes (unless user edited it)
  useEffect(() => {
    if (!selectedPlanId || !selectedBillingPeriod) return
    if (amountManuallyEditedRef.current) return
    const plan = plans.find(p => p.id === selectedPlanId)
    if (!plan) return
    const { adjustedPrice } = getPlanPriceWithProration(plan)
    setUploadAmount(String(adjustedPrice))
  }, [selectedPlanId, selectedBillingPeriod, prorationInfo])

  // Track previous open state to reset on open
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form when controlled dialog opens
      setSelectedPlanId(null)
      setSelectedBillingPeriod('MONTHLY')
      setUploadAmount('')
      amountManuallyEditedRef.current = false
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
    const discountedPrice = Math.round(fullPrice * (1 - discount / 100)) // Match calculateBillingPrice exactly
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

  const activeStep = getActiveStep(selectedPlanId, selectedBillingPeriod, uploadFile)

  // Filter active paid plans
  const activePlans = plans.filter(p => p.isActive && p.price > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-hidden p-0 gap-0 [&>button]:hidden flex flex-col">
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
                  Paso {activeStep} de 3
                </Badge>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
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
                    const { fullPrice, discountedPrice, discount, credit, adjustedPrice } = selectedPlanId === plan.id ? getPlanPriceWithProration(plan) : { fullPrice: 0, discountedPrice: 0, discount: 0, credit: 0, adjustedPrice: 0 }
                    const isCurrentPlan = currentPlanName === plan.name
                    const { icon: PlanIcon, color: iconColor, bg: iconBg } = getPlanIcon(planIndex)
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
                            amountManuallyEditedRef.current = false
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
                                  {featureNames.slice(0, 5).map(feature => (
                                    <span key={feature} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Proration & discount info inside card when selected */}
                              {isSelected && (
                                <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                                  {discount > 0 && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        <span className="font-semibold">-{discount}%</span> por pago anticipado — {formatCOP(discountedPrice)}
                                      </span>
                                    </div>
                                  )}
                                  {credit > 0 && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400">
                                      <Percent className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        Crédito por {prorationInfo?.proration?.unusedDays || 0} días no usados: <span className="font-semibold">-{formatCOP(credit)}</span>
                                        <ArrowRight className="h-2.5 w-2.5 inline mx-0.5" />
                                        <span className="font-bold text-foreground">{formatCOP(adjustedPrice)}</span>
                                      </span>
                                    </div>
                                  )}
                                  {discount === 0 && credit === 0 && (
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

              {/* ─── Proration Credit Banner ─── */}
              {selectedPlanId && prorationInfo?.hasCredit && prorationInfo.proration && !loadingProration && (
                <div className="rounded-xl border border-sky-200/60 dark:border-sky-800/40 bg-gradient-to-br from-sky-50 to-sky-50/50 dark:from-sky-950/30 dark:to-sky-950/10 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
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
                    <div className="text-center p-2.5 rounded-lg bg-white/60 dark:bg-white/5 border border-sky-100/50 dark:border-sky-800/30">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Días restantes</p>
                      <p className="text-sm font-bold font-mono text-sky-700 dark:text-sky-300">{prorationInfo.proration.unusedDays}</p>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-white/60 dark:bg-white/5 border border-sky-100/50 dark:border-sky-800/30">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Crédito diario</p>
                      <p className="text-sm font-bold font-mono text-sky-700 dark:text-sky-300">{formatCOP(prorationInfo.proration.dailyRate)}</p>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-800/30">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5">Total crédito</p>
                      <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">-{formatCOP(prorationInfo.proration.creditAmount)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-sky-600/70 dark:text-sky-400/60 text-center">
                    El crédito se aplicará automáticamente sobre el precio del nuevo plan al ser aprobado.
                  </p>
                </div>
              )}

              {loadingProration && selectedPlanId && (
                <div className="flex items-center gap-2 justify-center py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Calculando prorrateo...
                </div>
              )}

              {/* ═══ 2. BILLING PERIOD ═══ */}
              {selectedPlanId && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">2</span>
                    <Label className="text-sm font-bold">Período de facturación</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {BILLING_PERIODS.map(period => {
                      const plan = plans.find(p => p.id === selectedPlanId)
                      if (!plan) return null
                      const { discountedPrice, adjustedPrice } = getPlanPriceWithProration(plan)
                      const periodPrice = selectedBillingPeriod === period.value
                        ? discountedPrice
                        : Math.round(plan.price * (period.value === 'MONTHLY' ? 1 : period.value === 'QUARTERLY' ? 3 : period.value === 'SEMI_ANNUAL' ? 6 : 12) * (1 - period.discount / 100))
                      const showCredit = selectedBillingPeriod === period.value && prorationInfo?.hasCredit
                      const isSelected = selectedBillingPeriod === period.value

                      return (
                        <button
                          key={period.value}
                          type="button"
                          onClick={() => {
                            setSelectedBillingPeriod(period.value)
                            amountManuallyEditedRef.current = false
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

                          {showCredit && (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1.5">
                              Con crédito: {formatCOP(adjustedPrice)}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ═══ 3. PAYMENT METHOD ═══ */}
              {selectedPlanId && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">3</span>
                    <Label className="text-sm font-bold">Método de pago</Label>
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
                            const { adjustedPrice } = getPlanPriceWithProration(plan)
                            setWompiCheckoutParams({
                              planId: plan.id,
                              planName: plan.name,
                              amount: adjustedPrice,
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
                          <p className="text-xs font-semibold">Pasos para pagar manualmente:</p>
                          <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                            <li>Contacta a soporte por <strong>WhatsApp</strong> para recibir tu link de pago o datos bancarios (BREP)</li>
                            <li>Realiza el pago por <strong>Nequi, Daviplata, transferencia bancaria</strong> o el método indicado</li>
                            <li>Sube el <strong>comprobante de pago</strong> aquí mismo</li>
                            <li>Espera la <strong>aprobación del administrador</strong> para activar tu plan</li>
                          </ol>
                        </div>
                        <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/10 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">¿Necesitas datos de pago?</p>
                          </div>
                          <a href="https://wa.me/573012695457?text=Hola%2C%20quiero%20los%20datos%20de%20pago%20para%20mi%20suscripción%20Ventify%20POS" target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                            Escribir por WhatsApp →
                          </a>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Manual Upload (always shown) ── */}
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sube la captura o foto de tu pago manualmente. El administrador lo verificará para activar tu nuevo plan.
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

                  {/* Form fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="plan-amount" className="text-xs font-medium">
                        Monto pagado (COP) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="plan-amount"
                        type="number"
                        placeholder={selectedPlanId ? '0' : '69900'}
                        value={uploadAmount}
                        onChange={(e) => {
                          amountManuallyEditedRef.current = true
                          setUploadAmount(e.target.value)
                        }}
                        min={1}
                        required
                        className="h-9 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Método de pago</Label>
                      <select
                        value={uploadMethod}
                        onChange={(e) => setUploadMethod(e.target.value)}
                        className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              onClick={() => onOpenChange(false)}
              disabled={uploading}
              className="flex-1 h-10 rounded-xl font-medium"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={uploading || !selectedPlanId || !uploadFile || !uploadAmount}
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
      </DialogContent>

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
            onOpenChange(false)
            onPlanChanged()
          }}
          onManualUpload={() => {
            setShowWompiCheckout(false)
          }}
        />
      )}
    </Dialog>
  )
}
