'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CreditCard,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  ArrowRight,
  Beaker,
  MessageCircle,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useCreateWompiPaymentLink, useWompiTransactionStatus } from '@/hooks/api/use-wompi'
import { BILLING_PERIODS } from '@/components/settings/subscription-payment-panel'
import { WompiPaymentMethodsGrid, WompiPoweredBy } from '@/components/payments/wompi-payment-methods'
import { WompiStepIndicator } from '@/components/payments/wompi-checkout-steps'
import type { WompiCheckoutStep } from '@/components/payments/wompi-checkout-steps'

// ── Wompi Checkout Component ──
// Componente de checkout para pagos con Wompi.
// Soporta modo Demo (auto-aprobación) y modo Real (Wompi API).

interface WompiCheckoutProps {
  storeId: number
  planId: number
  planName: string
  amount: number
  billingPeriod: string
  customerEmail?: string
  customerName?: string
  customerDocument?: string
  demoMode?: boolean
  onPaymentComplete: () => void
  onManualUpload: () => void  // Fallback a subida manual de comprobante
}

type UserAction = 'idle' | 'pending' | 'retrying'

export function WompiCheckout({
  storeId,
  planId,
  planName,
  amount,
  billingPeriod,
  customerEmail,
  customerName,
  customerDocument,
  demoMode,
  onPaymentComplete,
  onManualUpload,
}: WompiCheckoutProps) {
  // Hook de mutación para crear enlace de pago
  const createLinkMutation = useCreateWompiPaymentLink()

  // Solo rastreamos la acción del usuario (click en pagar, retry, etc.)
  const [userAction, setUserAction] = useState<UserAction>('idle')
  const [wompiTransactionId, setWompiTransactionId] = useState<number | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string>('')

  // Polling solo cuando el usuario inició el checkout y sigue pendiente
  const isPolling = userAction === 'pending'
  const { data: txStatus } = useWompiTransactionStatus(
    isPolling ? wompiTransactionId : null,
    { refresh: true },
  )

  // ── Derivar step y errorMessage de txStatus ──
  let derivedStep: WompiCheckoutStep
  let derivedErrorMessage: string

  if (userAction === 'idle' || userAction === 'retrying') {
    derivedStep = 'summary'
    derivedErrorMessage = ''
  } else if (linkError) {
    derivedStep = 'error'
    derivedErrorMessage = linkError
  } else if (!txStatus) {
    derivedStep = 'pending'
    derivedErrorMessage = ''
  } else {
    switch (txStatus.status) {
      case 'APPROVED':
        derivedStep = 'approved'
        derivedErrorMessage = ''
        break
      case 'DECLINED':
      case 'VOIDED':
        derivedStep = 'declined'
        derivedErrorMessage = txStatus.wompiStatus || 'La transacción fue rechazada'
        break
      case 'ERROR':
        derivedStep = 'error'
        derivedErrorMessage = 'Error al procesar la transacción con Wompi'
        break
      default:
        derivedStep = 'pending'
        derivedErrorMessage = ''
    }
  }

  // ── Notificar aprobación (side-effect con ref para evitar duplicados) ──
  const notifiedApprovalRef = useRef<number | null>(null)
  useEffect(() => {
    if (derivedStep === 'approved' && wompiTransactionId !== null && wompiTransactionId !== notifiedApprovalRef.current) {
      notifiedApprovalRef.current = wompiTransactionId
      toast.success('¡Pago aprobado! Tu suscripción ha sido activada.')
      onPaymentComplete()
    }
  }, [derivedStep, wompiTransactionId, onPaymentComplete])

  // ── Período de facturación en español ──
  const periodLabel = BILLING_PERIODS.find(p => p.value === billingPeriod)?.label || billingPeriod

  // ── Crear enlace de pago ──
  const handleCreatePaymentLink = useCallback(async () => {
    try {
      setUserAction('pending')
      setLinkError('')
      const result = await createLinkMutation.mutateAsync({
        storeId,
        amount,
        planId,
        planName,
        billingPeriod,
        type: 'SUBSCRIPTION',
        customerEmail,
        customerName,
        customerDocument,
      })

      setWompiTransactionId(result.wompiTransactionId)
      setCheckoutUrl(result.checkoutUrl)

      if (demoMode) {
        // In demo mode, just wait for auto-approval
        toast.info('Modo Demo: el pago se aprobará automáticamente en unos segundos...')
      } else {
        // In real mode, open Wompi checkout in a new tab
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer')
        toast.info('Se abrió la página de pago de Wompi. Completa el pago en esa ventana.')
      }
    } catch (err) {
      setUserAction('idle')
      const msg = err instanceof Error ? err.message : 'Error al crear enlace de pago'
      setLinkError(msg)
      toast.error(msg)
    }
  }, [storeId, amount, planId, planName, billingPeriod, customerEmail, customerName, customerDocument, createLinkMutation, demoMode])

  // ── Reintentar pago ──
  const handleRetry = useCallback(() => {
    setUserAction('idle')
    setWompiTransactionId(null)
    setCheckoutUrl(null)
    setLinkError('')
    notifiedApprovalRef.current = null
  }, [])

  // ── Reabrir checkout ──
  const handleReopenCheckout = useCallback(() => {
    if (checkoutUrl && !demoMode) {
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
      toast.info('Se abrió la página de pago de Wompi.')
    }
  }, [checkoutUrl, demoMode])

  const step = derivedStep
  const errorMessage = derivedErrorMessage

  return (
    <div className="space-y-5">
      {/* ── Step Indicator ── */}
      <WompiStepIndicator currentStep={step} />

      {/* ── Paso 1: Resumen del pago (Receipt-style) ── */}
      {step === 'summary' && (
        <div className="space-y-5">
          {/* Demo Mode Banner */}
          {demoMode && (
            <div className="rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-3">
              <Beaker className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/30"
                  >
                    Modo Demo
                  </Badge>
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400/80 mt-1">
                  Los pagos se simulan automáticamente. No se conecta a Wompi real. Cambia WOMPI_ENV a &quot;sandbox&quot; o &quot;production&quot; cuando tengas tus llaves.
                </p>
              </div>
            </div>
          )}

          {/* Receipt Card */}
          <div className="relative rounded-xl bg-white dark:bg-zinc-900 shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
            {/* Dashed top border (receipt tear line) */}
            <div className="border-t-2 border-dashed border-muted-foreground/20 dark:border-muted-foreground/15" />

            <div className="p-5 sm:p-6 space-y-4">
              {/* Store name (Plan) */}
              <div className="text-center">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {planName}
                </h3>
              </div>

              {/* Billing period badge */}
              <div className="flex justify-center">
                <Badge
                  variant="secondary"
                  className="rounded-full px-3 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                >
                  {periodLabel}
                </Badge>
              </div>

              {/* Big amount */}
              <div className="text-center py-2">
                <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground font-mono">
                  {formatCOP(amount)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">COP</p>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-muted-foreground/15" />

              {/* Summary rows */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono text-foreground">{formatCOP(amount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Impuestos</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs">Incluido</span>
                </div>
              </div>

              {/* Divider before total */}
              <div className="border-t border-muted" />

              {/* Total */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Total a pagar</span>
                <span className="text-xl font-extrabold font-mono text-foreground">{formatCOP(amount)}</span>
              </div>
            </div>

            {/* Dashed bottom border (receipt tear line) */}
            <div className="border-b-2 border-dashed border-muted-foreground/20 dark:border-muted-foreground/15" />
          </div>

          {/* Payment Methods Grid */}
          {!demoMode && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground text-center font-medium uppercase tracking-wider">
                Métodos de pago aceptados
              </p>
              <WompiPaymentMethodsGrid />
            </div>
          )}

          {demoMode && (
            <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400 py-1">
              <Beaker className="h-3.5 w-3.5" />
              <span className="font-medium">Simulación — se aprobará en ~10 segundos</span>
            </div>
          )}

          {/* Pay Button */}
          <button
            type="button"
            onClick={handleCreatePaymentLink}
            disabled={createLinkMutation.isPending}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:from-emerald-600 disabled:hover:to-emerald-700"
          >
            {createLinkMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {demoMode ? 'Creando pago demo...' : 'Creando enlace de pago...'}
              </>
            ) : (
              <>
                {demoMode ? <Beaker className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {demoMode ? 'Simular Pago' : 'Pagar con Wompi'}
              </>
            )}
          </button>

          {/* Powered By Footer */}
          <WompiPoweredBy />

          {/* Manual Upload Link */}
          {!demoMode && (
            <div className="text-center">
              <button
                type="button"
                onClick={onManualUpload}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-muted-foreground"
              >
                ó subir comprobante manualmente
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 2: Esperando pago (Professional waiting state) ── */}
      {step === 'pending' && (
        <div className="space-y-5">
          {/* Status header with pulsing dot */}
          <div className="flex flex-col items-center gap-3 text-center">
            {/* Pulsing dot */}
            <div className="relative flex items-center justify-center">
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                demoMode
                  ? 'bg-amber-100 dark:bg-amber-900/30'
                  : 'bg-emerald-100 dark:bg-emerald-900/30'
              }`}>
                <div className={`h-3 w-3 rounded-full animate-pulse ${
                  demoMode
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`} />
              </div>
              <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                demoMode
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`} />
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground">
                {demoMode ? 'Pago demo en proceso...' : 'Esperando confirmación del pago'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {demoMode
                  ? 'El pago demo se aprobará automáticamente en unos segundos.'
                  : 'Completa el pago en la ventana de Wompi que se abrió.'}
              </p>
            </div>
          </div>

          {/* Receipt Card (locked/disabled look) */}
          <div className="relative rounded-xl bg-white dark:bg-zinc-900 shadow-md shadow-black/5 dark:shadow-black/20 overflow-hidden opacity-80">
            <div className="border-t-2 border-dashed border-muted-foreground/15" />
            <div className="p-5 sm:p-6 space-y-4">
              <div className="text-center">
                <h3 className="text-sm font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  {planName}
                </h3>
              </div>
              <div className="flex justify-center">
                <Badge
                  variant="secondary"
                  className="rounded-full px-3 py-0.5 text-xs font-medium bg-muted/50 text-muted-foreground border border-muted"
                >
                  {periodLabel}
                </Badge>
              </div>
              <div className="text-center py-1">
                <p className="text-3xl font-extrabold tracking-tight text-muted-foreground font-mono">
                  {formatCOP(amount)}
                </p>
              </div>
              <div className="border-t border-dashed border-muted-foreground/10" />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Monto</span>
                  <span className="font-mono text-muted-foreground">{formatCOP(amount)}</span>
                </div>
                {wompiTransactionId && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Referencia</span>
                    <span className="text-xs font-mono text-muted-foreground/70">#{wompiTransactionId}</span>
                  </div>
                )}
                {demoMode && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Modo</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"
                    >
                      <Beaker className="h-3 w-3 mr-1" />
                      Demo
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            <div className="border-b-2 border-dashed border-muted-foreground/15" />
          </div>

          {/* Polling indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {demoMode
                ? 'El pago se aprobará automáticamente en ~10 segundos...'
                : 'Verificando estado cada 5 segundos...'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            {!demoMode && checkoutUrl && (
              <Button
                variant="outline"
                className="w-full border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-800 dark:hover:text-emerald-300"
                onClick={handleReopenCheckout}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Reabrir página de Wompi
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={handleRetry}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Cancelar y volver
            </Button>
          </div>
        </div>
      )}

      {/* ── Paso 3: Pago aprobado (Celebratory success state) ── */}
      {step === 'approved' && (
        <div className="space-y-5">
          {/* Success header with green checkmark */}
          <div className="flex flex-col items-center gap-3 text-center">
            {/* Circular checkmark with glow */}
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-200 dark:ring-emerald-500/20">
                <CheckCircle2 className="h-9 w-9 text-white" strokeWidth={2.5} />
              </div>
              {/* Sparkle elements */}
              <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-300 dark:bg-emerald-400 opacity-60 animate-pulse" />
              <div className="absolute -bottom-0.5 -left-1.5 h-1.5 w-1.5 rounded-full bg-emerald-200 dark:bg-emerald-500 opacity-40 animate-pulse" style={{ animationDelay: '300ms' }} />
              <div className="absolute top-1 -left-2 h-1 w-1 rounded-full bg-emerald-400 dark:bg-emerald-300 opacity-50 animate-pulse" style={{ animationDelay: '600ms' }} />
              <div className="absolute -top-2 left-2 h-1.5 w-1.5 rounded-full bg-yellow-300 dark:bg-yellow-400 opacity-30 animate-pulse" style={{ animationDelay: '150ms' }} />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-foreground">
                ¡Pago Exitoso!
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {demoMode
                  ? 'El pago demo fue aprobado automáticamente.'
                  : 'Tu pago ha sido confirmado y tu suscripción ha sido activada.'}
              </p>
            </div>
          </div>

          {/* Receipt Card */}
          <div className="relative rounded-xl bg-white dark:bg-zinc-900 shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
            <div className="border-t-2 border-dashed border-emerald-200 dark:border-emerald-700/30" />
            <div className="p-5 sm:p-6 space-y-4">
              {/* Plan & Period */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-semibold">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Período</span>
                <Badge
                  variant="secondary"
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                >
                  {periodLabel}
                </Badge>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-muted-foreground/15" />

              {/* Amount & Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monto</span>
                <span className="text-lg font-extrabold font-mono text-foreground">{formatCOP(amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estado</span>
                <Badge className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0 px-3">
                  Aprobado {demoMode && '(Demo)'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fecha</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-muted-foreground/15" />

              {/* Wompi Reference */}
              {wompiTransactionId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Referencia Wompi</span>
                  <span className="text-xs font-mono text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded">
                    #{wompiTransactionId}
                  </span>
                </div>
              )}
            </div>
            <div className="border-b-2 border-dashed border-emerald-200 dark:border-emerald-700/30" />
          </div>

          {/* Continue Button */}
          <button
            type="button"
            onClick={onPaymentComplete}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30"
          >
            <ArrowRight className="h-4 w-4" />
            Continuar
          </button>
        </div>
      )}

      {/* ── Paso 4: Pago rechazado (Professional error) ── */}
      {step === 'declined' && (
        <div className="space-y-5">
          {/* Error header with red warning */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center ring-4 ring-red-200 dark:ring-red-500/20 shadow-md shadow-red-500/10">
              <AlertTriangle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-foreground">
                Pago Rechazado
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                La transacción fue rechazada. Intenta nuevamente o usa un método alternativo.
              </p>
            </div>
          </div>

          {/* Error reason box */}
          {errorMessage && (
            <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/10 p-3">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{errorMessage}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30"
            >
              <RotateCcw className="h-4 w-4" />
              Intentar de nuevo
            </button>
            {!demoMode && (
              <Button
                variant="outline"
                className="w-full rounded-xl h-11 border-muted-foreground/20 text-muted-foreground hover:text-foreground"
                onClick={onManualUpload}
              >
                Subir comprobante
              </Button>
            )}
          </div>

          {/* Help text */}
          {!demoMode && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>¿Problemas con tu pago? Contáctanos por WhatsApp</span>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 5: Error (Similar to declined, different icon) ── */}
      {step === 'error' && (
        <div className="space-y-5">
          {/* Error header with X icon */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center ring-4 ring-red-200 dark:ring-red-500/20 shadow-md shadow-red-500/10">
              <XCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-foreground">
                Error en el pago
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Hubo un error al procesar el pago. Intenta nuevamente o usa la opción manual.
              </p>
            </div>
          </div>

          {/* Error reason box */}
          {errorMessage && (
            <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/10 p-3">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{errorMessage}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30"
            >
              <RotateCcw className="h-4 w-4" />
              Intentar de nuevo
            </button>
            {!demoMode && (
              <Button
                variant="outline"
                className="w-full rounded-xl h-11 border-muted-foreground/20 text-muted-foreground hover:text-foreground"
                onClick={onManualUpload}
              >
                Subir comprobante
              </Button>
            )}
          </div>

          {/* Help text */}
          {!demoMode && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>¿Problemas con tu pago? Contáctanos por WhatsApp</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Wompi Checkout Dialog ──

interface WompiCheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  planId: number
  planName: string
  amount: number
  billingPeriod: string
  customerEmail?: string
  customerName?: string
  customerDocument?: string
  demoMode?: boolean
  onPaymentComplete: () => void
  onManualUpload: () => void
}

export function WompiCheckoutDialog({
  open,
  onOpenChange,
  storeId,
  planId,
  planName,
  amount,
  billingPeriod,
  customerEmail,
  customerName,
  customerDocument,
  demoMode,
  onPaymentComplete,
  onManualUpload,
}: WompiCheckoutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {demoMode ? (
                <Beaker className="h-4 w-4 text-amber-500" />
              ) : (
                <CreditCard className="h-4 w-4 text-primary" />
              )}
              {demoMode ? 'Pago Demo' : 'Pago con Wompi'}
            </DialogTitle>
            <DialogDescription>
              {demoMode
                ? 'Simulación de pago para desarrollo'
                : 'Realiza tu pago de forma segura a través de Wompi'}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <WompiCheckout
            storeId={storeId}
            planId={planId}
            planName={planName}
            amount={amount}
            billingPeriod={billingPeriod}
            customerEmail={customerEmail}
            customerName={customerName}
            customerDocument={customerDocument}
            demoMode={demoMode}
            onPaymentComplete={() => {
              onPaymentComplete()
              onOpenChange(false)
            }}
            onManualUpload={() => {
              onOpenChange(false)
              onManualUpload()
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
