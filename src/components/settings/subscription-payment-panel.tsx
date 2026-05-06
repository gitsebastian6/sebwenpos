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
  CheckCircle2,
  Send,
  AlertTriangle,
  CreditCard,
  Beaker,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  useSubscriptionCurrent,
  usePaymentReceipts,
  useSubscriptionPlans,
  useBillingHistory,
  useUploadPaymentReceipt,
} from '@/hooks/api/use-settings'
import { SubscriptionInfoCard } from '@/components/settings/subscription-info-card'
import type { SubInfo } from '@/components/settings/subscription-info-card'
import { ReceiptsHistoryCard } from '@/components/settings/receipts-history-card'
import { BillingPayCard } from '@/components/settings/billing-pay-card'
import { InvoiceHistoryCard } from '@/components/settings/invoice-history-card'
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

  if (isFetchingSub) {
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

      {/* Billing Pay Card — invoice + payment actions (shown when subscription needs payment) */}
      {subInfo && store?.id && needsPaymentCard(subInfo.status, subInfo.daysRemaining) && (
        <BillingPayCard
          storeId={store.id}
          planName={subInfo.planName}
          planPrice={subInfo.planPrice}
          billingPeriod={subInfo.billingPeriod}
          billingPrice={calculatePeriodPrice(subInfo.planPrice, subInfo.billingPeriod)}
          status={subInfo.status}
          daysRemaining={subInfo.daysRemaining}
          endDate={subInfo.endDate ?? null}
          hasPendingReceipt={hasPendingReceipt}
          showWompiPayment={(() => {
            const d = wompiHealth?.demoMode === true
            return d ? wompiHealth?.demoVisible === true : wompiHealth?.wompiEnabled === true
          })()}
          isWompiDemo={wompiHealth?.demoMode === true}
          onPayWithWompi={() => {
            const currentPlan = plans.find(p => p.name === subInfo.planName)
            setWompiCheckoutParams({
              planId: currentPlan?.id || 0,
              planName: subInfo.planName,
              amount: calculatePeriodPrice(subInfo.planPrice, subInfo.billingPeriod),
              billingPeriod: subInfo.billingPeriod || 'MONTHLY',
            })
            setShowWompiCheckout(true)
          }}
          onReceiptUploaded={() => {
            qc.invalidateQueries({ queryKey: ['payment-receipts', store.id] })
            qc.invalidateQueries({ queryKey: ['subscription-current', store.id] })
          }}
        />
      )}

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

      {/* Invoice History (Facturas) */}
      {store?.id && (
        <InvoiceHistoryCardWrapper storeId={store.id} />
      )}

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

// ── Helper: calculate period total price with discount ──
function calculatePeriodPrice(monthlyPrice: number, billingPeriod: string): number {
  const months = billingPeriod === 'QUARTERLY' ? 3 : billingPeriod === 'SEMI_ANNUAL' ? 6 : billingPeriod === 'ANNUAL' ? 12 : 1
  const discount = billingPeriod === 'QUARTERLY' ? 5 : billingPeriod === 'SEMI_ANNUAL' ? 10 : billingPeriod === 'ANNUAL' ? 15 : 0
  return Math.round(monthlyPrice * months * (1 - discount / 100))
}

// ── Helper: determine if billing pay card should show ──
function needsPaymentCard(status: string, daysRemaining: number | null): boolean {
  if (status === 'TRIAL') return true
  if (status === 'PAST_DUE' || status === 'EXPIRED') return true
  if (status === 'ACTIVE' && daysRemaining !== null && daysRemaining <= 5) return true
  return false
}

// ── Invoice History Wrapper ──
function InvoiceHistoryCardWrapper({ storeId }: { storeId: number }) {
  const { data: billingData, isLoading } = useBillingHistory(storeId)
  return (
    <InvoiceHistoryCard
      items={billingData?.items ?? []}
      summary={billingData?.summary ?? null}
      isLoading={isLoading}
    />
  )
}
