'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Receipt,
  Loader2,
  FileText,
  Plus,
  Crown,
  ArrowRight,
  CheckCircle2,
  Send,
  AlertTriangle,
  BadgeCheck,
  Clock,
  CreditCard,
  Beaker,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  useSubscriptionCurrent,
  usePaymentReceipts,
  useSubscriptionPlans,
  useSubscriptionHistory,
  useBillingHistory,
  useUploadPaymentReceipt,
} from '@/hooks/api/use-settings'
import { SubscriptionInfoCard } from '@/components/settings/subscription-info-card'
import type { SubInfo } from '@/components/settings/subscription-info-card'
import { ReceiptsHistoryCard } from '@/components/settings/receipts-history-card'
import { PlanChangeDialog } from '@/components/settings/plan-change-dialog'
import { WompiCheckoutDialog } from '@/components/settings/wompi-checkout'
import { WompiTransactionsCard } from '@/components/settings/wompi-transactions-card'
import { PlanComparisonTable } from '@/components/settings/plan-comparison-table'
import { CancelSubscriptionDialog } from '@/components/settings/cancel-subscription-dialog'
import { WompiPaymentMethodsGrid, WompiPoweredBy } from '@/components/payments/wompi-payment-methods'

// ── Subscription Payment Panel ──
// Shows subscription info (Trial/Active/Expired) with countdown.
// Owners can upload payment receipts; Super Admin reviews them.

export { type PlanOption } from '@/hooks/api/use-subscription'

export const BILLING_PERIODS = [
  { value: 'MONTHLY', label: 'Mensual', discount: 0 },
  { value: 'QUARTERLY', label: 'Trimestral', discount: 5 },
  { value: 'SEMI_ANNUAL', label: 'Semestral', discount: 10 },
  { value: 'ANNUAL', label: 'Anual', discount: 15 },
] as const

export function SubscriptionPaymentPanel() {
  const { store, user } = useAuthStore()
  const isOwner = user?.role === 'OWNER'
  const qc = useQueryClient()

  // ── TanStack Query hooks ──
  const { data: subData, isFetching: isFetchingSub } = useSubscriptionCurrent(store?.id)
  const { data: receiptsData } = usePaymentReceipts(store?.id)
  const { data: plansData } = useSubscriptionPlans()
  const uploadReceiptMutation = useUploadPaymentReceipt()

  const receipts = Array.isArray(receiptsData) ? receiptsData : []
  const plans = Array.isArray(plansData) ? plansData : []
  const subInfo: SubInfo | null = subData?.hasSubscription ? {
    id: subData.subscriptionId, status: subData.subscriptionStatus, planName: subData.planName, planPrice: subData.planPrice,
    startDate: subData.startDate, endDate: subData.endDate, billingPeriod: subData.billingPeriod, daysRemaining: subData.daysRemaining,
    trialEndDate: subData.trialEndDate,
  } : null

  const loading = false // queries handle their own loading

  // ── Sync fresh subscription data back to auth store ──
  // This ensures the SubscriptionGate, sidebar badge, and top banner
  // all reflect the latest subscription state from the database.
  useEffect(() => {
    if (subData?.hasSubscription) {
      const { updateSubscription } = useAuthStore.getState()
      updateSubscription({
        hasSubscription: true,
        subscriptionStatus: subData.subscriptionStatus,
        subscriptionId: subData.subscriptionId,
        planId: subData.planId,
        planName: subData.planName,
        planPrice: subData.planPrice,
        startDate: subData.startDate,
        endDate: subData.endDate,
        trialEndDate: subData.trialEndDate,
        graceEndDate: subData.graceEndDate,
        graceDaysRemaining: subData.graceDaysRemaining,
        billingPeriod: subData.billingPeriod,
        daysRemaining: subData.daysRemaining,
        planLimits: subData.planLimits,
      })
    }
  }, [subData])

  // ── Manual refresh subscription data ──
  function handleRefreshSubscription() {
    qc.invalidateQueries({ queryKey: ['subscription-current', store?.id] })
    qc.invalidateQueries({ queryKey: ['payment-receipts', store?.id] })
    toast.info('Actualizando información de suscripción...')
  }

  // ── Payment receipt upload state ──
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showPlanChangeDialog, setShowPlanChangeDialog] = useState(false)
  const [uploadAmount, setUploadAmount] = useState('')
  const [uploadReference, setUploadReference] = useState('')
  const [uploadMethod, setUploadMethod] = useState('NEQUI')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const uploading = uploadReceiptMutation.isPending

  // ── Cancel subscription state ──
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // ── Wompi health check ──
  const { data: wompiHealth } = useQuery({
    queryKey: ['wompi-health'],
    queryFn: () => fetch('/api/payments/wompi/health').then(r => r.json()),
    staleTime: 60_000,
  })

  // ── Wompi checkout state ──
  const [showWompiCheckout, setShowWompiCheckout] = useState(false)
  const [wompiCheckoutParams, setWompiCheckoutParams] = useState<{
    planId: number; planName: string; amount: number; billingPeriod: string
  } | null>(null)

  // ── Upload receipt handler ──
  function resetUploadForm() {
    setUploadAmount('')
    setUploadReference('')
    setUploadMethod('NEQUI')
    setUploadNotes('')
    setUploadFile(null)
  }

  async function handleUploadReceipt(e: React.FormEvent) {
    e.preventDefault()
    if (!store?.id || !uploadFile) {
      toast.error('Selecciona un archivo de comprobante')
      return
    }
    const amount = parseInt(uploadAmount)
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
        reader.readAsDataURL(uploadFile)
      })
      const fileData = await base64Promise
      await uploadReceiptMutation.mutateAsync({
        storeId: store.id,
        body: {
          fileData: `data:${uploadFile.type};base64,${fileData}`,
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type,
          amount,
          reference: uploadReference || undefined,
          paymentMethod: uploadMethod,
          notes: uploadNotes || undefined,
        },
      })
      toast.success('Comprobante enviado correctamente. Será revisado por el administrador.')
      setShowUploadDialog(false)
      resetUploadForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al subir comprobante')
    }
  }

  // ── Handle cancel subscription completed ──
  function handleCancelled() {
    qc.invalidateQueries({ queryKey: ['subscription-current', store?.id] })
    qc.invalidateQueries({ queryKey: ['payment-receipts', store?.id] })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const hasPendingReceipt = receipts.some(r => r.status === 'PENDING')

  // Non-OWNER users get a read-only view
  if (!isOwner) {
    return (
      <div className="space-y-6">
        <SubscriptionInfoCard
          subInfo={subInfo}
          hasPendingReceipt={hasPendingReceipt}
          onUpgrade={() => {}}
          onCancel={() => {}}
          isOwner={false}
          isFetching={isFetchingSub}
          onRefresh={handleRefreshSubscription}
        />

        <ReceiptsHistoryCard
          receipts={receipts}
          onUpload={() => {}}
          canUpload={false}
          hasPendingReceipt={hasPendingReceipt}
        />

        {plans.length > 0 && (
          <Card className="border-border/50 rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                Comparación de Planes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlanComparisonTable
                plans={plans}
                currentPlanName={subInfo?.planName}
              />
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Subscription Info Card */}
      <SubscriptionInfoCard
        subInfo={subInfo}
        hasPendingReceipt={hasPendingReceipt}
        onUpgrade={() => setShowPlanChangeDialog(true)}
        onCancel={() => setShowCancelDialog(true)}
        isOwner={true}
        isFetching={isFetchingSub}
        onRefresh={handleRefreshSubscription}
      />

      {/* Payment Receipts History */}
      <ReceiptsHistoryCard
        receipts={receipts}
        onUpload={() => { resetUploadForm(); setShowUploadDialog(true) }}
        canUpload={!!subInfo && isOwner}
        hasPendingReceipt={hasPendingReceipt}
      />

      {/* Wompi Transaction History */}
      {store?.id && (
        <WompiTransactionsCard storeId={store.id} />
      )}

      {/* Plan Comparison Card */}
      {plans.length > 0 && (
        <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              Comparación de Planes
            </CardTitle>
            <CardDescription>Funcionalidades incluidas en cada plan</CardDescription>
          </CardHeader>
          <CardContent>
            <PlanComparisonTable
              plans={plans}
              currentPlanName={subInfo?.planName}
            />
          </CardContent>
        </Card>
      )}

      {/* Subscription History + Billing History */}
      <SubscriptionHistoryPanel />

      {/* Cancel Subscription Dialog */}
      {store?.id && subInfo?.planName && (
        <CancelSubscriptionDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          storeId={store.id}
          currentPlanName={subInfo.planName}
          onCancelled={handleCancelled}
        />
      )}

      {/* Plan Change Dialog */}
      <PlanChangeDialog
        open={showPlanChangeDialog}
        onOpenChange={setShowPlanChangeDialog}
        storeId={store!.id}
        plans={plans}
        currentPlanName={subInfo?.planName}
        onPlanChanged={() => qc.invalidateQueries({ queryKey: ['subscription-current', store!.id] })}
      />

      {/* Upload Receipt Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Subir Comprobante de Pago
            </DialogTitle>
            <DialogDescription>
              Paga con Wompi de forma automática, o adjunta el comprobante manualmente.
            </DialogDescription>
          </DialogHeader>

          {/* ── Opción Wompi ── */}
          {subInfo && (
            <div className="space-y-3">
              {(() => {
                const isDemo = wompiHealth?.demoMode === true
                const demoVisible = wompiHealth?.demoVisible === true
                const wompiEnabled = wompiHealth?.wompiEnabled === true
                const showWompi = isDemo ? demoVisible : wompiEnabled

                if (showWompi) {
                  return (
                    <>
                      <Button
                        className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold shadow-lg shadow-emerald-600/25 transition-all"
                        onClick={() => {
                          const currentPlan = plans.find(p => p.name === subInfo.planName)
                          setWompiCheckoutParams({
                            planId: currentPlan?.id || 0,
                            planName: subInfo.planName,
                            amount: subInfo.planPrice,
                            billingPeriod: subInfo.billingPeriod || 'MONTHLY',
                          })
                          setShowUploadDialog(false)
                          setShowWompiCheckout(true)
                        }}
                      >
                        {isDemo ? (
                          <><Beaker className="h-5 w-5 mr-2" /> Pagar con Wompi (Demo)</>
                        ) : (
                          <><CreditCard className="h-5 w-5 mr-2" /> Pagar con Wompi</>
                        )}
                      </Button>
                      {!isDemo && (
                        <WompiPaymentMethodsGrid />
                      )}
                      <WompiPoweredBy />

                      {/* Divisor "ó" */}
                      <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <span className="relative bg-background px-3 text-xs text-muted-foreground">ó</span>
                      </div>
                    </>
                  )
                }

                return (
                  <>
                    <div className="rounded-lg border border-muted bg-muted/30 p-4 text-center">
                      <CreditCard className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-muted-foreground">Pago en línea</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Próximamente disponible con aliados</p>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">Wompi</span>
                        <span className="text-[10px] text-muted-foreground">+</span>
                        <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">Stripe</span>
                      </div>
                    </div>

                    {/* Divisor "ó" */}
                    <div className="relative flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <span className="relative bg-background px-3 text-xs text-muted-foreground">ó</span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          <form onSubmit={handleUploadReceipt}>
            <div className="space-y-4 py-2">
              {/* File Upload */}
              <div className="space-y-2">
                <Label className="text-sm">Comprobante <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="receipt-file"
                  />
                  <label htmlFor="receipt-file" className="flex items-center justify-center gap-3 p-4 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
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
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="receipt-amount" className="text-sm">Monto pagado (COP) <span className="text-destructive">*</span></Label>
                <Input
                  id="receipt-amount"
                  type="number"
                  placeholder="69900"
                  value={uploadAmount}
                  onChange={(e) => setUploadAmount(e.target.value)}
                  min={1}
                  required
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label className="text-sm">Método de pago</Label>
                <select
                  value={uploadMethod}
                  onChange={(e) => setUploadMethod(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="NEQUI">Nequi</option>
                  <option value="DAVIPLATA">Davivienda (Daviplata)</option>
                  <option value="BANCOLOMBIA">Bancolombia</option>
                  <option value="BANCARY">Bancario</option>
                  <option value="EFFECTIVE">Efectivo</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              {/* Reference */}
              <div className="space-y-2">
                <Label htmlFor="receipt-ref" className="text-sm">Referencia (opcional)</Label>
                <Input
                  id="receipt-ref"
                  placeholder="Número de transacción o referencia"
                  value={uploadReference}
                  onChange={(e) => setUploadReference(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="receipt-notes" className="text-sm">Notas (opcional)</Label>
                <Textarea
                  id="receipt-notes"
                  placeholder="Información adicional sobre el pago"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadForm() }} disabled={uploading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Subiendo...</>
                ) : (
                  <><Send className="h-4 w-4 mr-1.5" /> Enviar Comprobante</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Wompi Checkout Dialog */}
      {wompiCheckoutParams && (
        <WompiCheckoutDialog
          open={showWompiCheckout}
          onOpenChange={setShowWompiCheckout}
          storeId={store!.id}
          planId={wompiCheckoutParams.planId}
          planName={wompiCheckoutParams.planName}
          amount={wompiCheckoutParams.amount}
          billingPeriod={wompiCheckoutParams.billingPeriod}
          demoMode={wompiHealth?.demoMode}
          onPaymentComplete={() => {
            qc.invalidateQueries({ queryKey: ['subscription-current', store!.id] })
            qc.invalidateQueries({ queryKey: ['payment-receipts', store!.id] })
          }}
          onManualUpload={() => {
            resetUploadForm()
            setShowUploadDialog(true)
          }}
        />
      )}
    </div>
  )
}

// ── Subscription History & Billing History Panel ──
function SubscriptionHistoryPanel() {
  const { store } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'history' | 'billing'>('history')

  const { data: historyData, isLoading: historyLoading } = useSubscriptionHistory(store?.id)
  const { data: billingData } = useBillingHistory(store?.id)

  const history = Array.isArray(historyData) ? historyData : []
  const billing = billingData ?? null

  if (historyLoading) {
    return (
      <Card className="border-border/50 rounded-xl">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
        </CardContent>
      </Card>
    )
  }

  const hasHistory = history.length > 0
  const hasBilling = billing && billing.items.length > 0

  if (!hasHistory && !hasBilling) {
    return (
      <Card className="border-border/50 rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Historial de Suscripción
          </CardTitle>
          <CardDescription>No hay registros de actividad aún</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Historial de Suscripción
            </CardTitle>
            <CardDescription className="mt-1">Cambios de plan, renovaciones y facturación</CardDescription>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'history' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Actividad ({history.length})
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'billing' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Facturación {billing ? `(${billing.items.length})` : '(0)'}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'history' && (
          history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No hay registros de actividad</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {history.map(item => {
                const isPlanChange = item.eventType === 'PLAN_CHANGED' || item.eventType === 'REACTIVATED'
                const isNegative = item.eventType === 'CANCELLED' || item.eventType === 'EXPIRED'
                return (
                  <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isNegative ? 'border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-950/10'
                    : isPlanChange ? 'border-violet-200 dark:border-violet-800/40 bg-violet-50/30 dark:bg-violet-950/10'
                    : 'border-border/50 bg-muted/10'
                  }`}>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isNegative ? 'bg-red-100 dark:bg-red-500/15'
                      : isPlanChange ? 'bg-violet-100 dark:bg-violet-500/15'
                      : 'bg-emerald-100 dark:bg-emerald-500/15'
                    }`}>
                      {isNegative ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                       : isPlanChange ? <ArrowRight className="h-3.5 w-3.5 text-violet-500" />
                       : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{item.eventLabel}</p>
                        <p className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(item.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                      {item.previousPlanName && item.newPlanName && item.previousPlanName !== item.newPlanName && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.previousPlanName}</Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.newPlanName}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {activeTab === 'billing' && (
          !billing || billing.items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No hay registros de facturación</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="text-[10px] text-muted-foreground mb-1">Total Facturado</div>
                  <p className="text-sm font-bold font-mono">{billing.summary.totalBilledFormatted}</p>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="text-[10px] text-muted-foreground mb-1">Total Pagado</div>
                  <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{billing.summary.totalPaidFormatted}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="text-[10px] text-muted-foreground mb-1">Créditos Aplicados</div>
                  <p className="text-sm font-bold font-mono">{billing.summary.totalCreditsFormatted}</p>
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {billing.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.status === 'PAID' ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'
                      }`}>
                        {item.status === 'PAID' ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Clock className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{item.planName} — {item.billingPeriod}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(item.periodStart).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} → {new Date(item.periodEnd).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold font-mono">{item.netAmountFormatted}</p>
                      {item.prorationCreditFormatted && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{item.prorationCreditFormatted}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </CardContent>
    </Card>
  )
}
