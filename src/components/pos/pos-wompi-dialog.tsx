'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Shield,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Beaker,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useCreateWompiPaymentLink, useWompiTransactionStatus } from '@/hooks/api/use-wompi'
import { WompiPaymentMethodsGrid, WompiPoweredBy } from '@/components/payments/wompi-payment-methods'

// ── POS Wompi Payment Dialog ──
// Diálogo específico para el flujo POS de pagos Wompi.
// Step is DERIVED from userAction + txStatus + linkError.
// No setState in effects — React 19 lint compliant.

interface PosWompiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  amount: number
  onPaymentComplete: (wompiReference: string) => void
  onCancel: () => void
}

type UserAction = 'idle' | 'pending' | 'retrying'
type DisplayStep = 'creating' | 'awaiting' | 'success' | 'declined' | 'error'

export function PosWompiDialog({
  open,
  onOpenChange,
  storeId,
  amount,
  onPaymentComplete,
  onCancel,
}: PosWompiDialogProps) {
  const createLinkMutation = useCreateWompiPaymentLink()

  // Track user action and data
  const [userAction, setUserAction] = useState<UserAction>('idle')
  const [wompiTransactionId, setWompiTransactionId] = useState<number | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string>('')
  const [isDemoMode, setIsDemoMode] = useState(false)

  // ── Polling ──
  const isPolling = userAction === 'pending' && wompiTransactionId !== null
  const { data: txStatus } = useWompiTransactionStatus(
    isPolling ? wompiTransactionId : null,
    { refresh: true },
  )

  // ── Derive step from data (React 19 pattern) ──
  let derivedStep: DisplayStep
  let derivedDeclineReason = ''

  if (userAction === 'idle' || userAction === 'retrying') {
    derivedStep = 'creating'
  } else if (linkError && userAction === 'pending') {
    derivedStep = 'error'
  } else if (!txStatus) {
    derivedStep = 'awaiting'
  } else {
    switch (txStatus.status) {
      case 'APPROVED':
        derivedStep = 'success'
        break
      case 'DECLINED':
      case 'VOIDED':
        derivedStep = 'declined'
        derivedDeclineReason = txStatus.wompiStatus || 'La transacción fue rechazada'
        break
      case 'ERROR':
        derivedStep = 'error'
        break
      default:
        derivedStep = 'awaiting'
    }
  }

  // ── Notify approval (useEffect for side effects only, no setState) ──
  const notifiedApprovalRef = useRef<number | null>(null)
  useEffect(() => {
    if (derivedStep === 'success' && wompiTransactionId !== null && wompiTransactionId !== notifiedApprovalRef.current) {
      notifiedApprovalRef.current = wompiTransactionId
      toast.success('¡Pago Wompi aprobado!')
    }
  }, [derivedStep, wompiTransactionId])

  // ── Create payment link (called from event handlers only) ──
  const handleCreateLink = useCallback(async () => {
    try {
      setUserAction('pending')
      setLinkError('')
      const result = await createLinkMutation.mutateAsync({
        storeId,
        amount,
        type: 'POS',
      })

      setWompiTransactionId(result.wompiTransactionId)
      setCheckoutUrl(result.checkoutUrl)
      setReference(result.reference)
      setIsDemoMode(!!result.demoMode)

      // In demo mode, the checkout URL is a hash fragment — no external page to open
      if (result.demoMode) {
        toast.info('Modo Demo: el pago se aprobará automáticamente en unos segundos...')
      } else {
        // Abrir checkout de Wompi en nueva pestaña (real mode only)
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer')
        toast.info('Se abrió la página de pago de Wompi. Completa el pago en esa ventana.')
      }
    } catch (err) {
      setUserAction('idle')
      const msg = err instanceof Error ? err.message : 'Error al crear enlace de pago'
      setLinkError(msg)
      toast.error(msg)
    }
  }, [storeId, amount, createLinkMutation])

  // ── Handle dialog open/close (event handler, not effect) ──
  const hasCreatedRef = useRef(false)
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && !hasCreatedRef.current) {
      hasCreatedRef.current = true
      // Trigger link creation from event handler (not effect)
      handleCreateLink()
    }
    if (!nextOpen) {
      // Reset state on close
      setUserAction('idle')
      setWompiTransactionId(null)
      setCheckoutUrl(null)
      setReference(null)
      setLinkError('')
      setIsDemoMode(false)
      hasCreatedRef.current = false
      notifiedApprovalRef.current = null
    }
    onOpenChange(nextOpen)
  }, [handleCreateLink, onOpenChange])

  // ── Copy link ──
  const handleCopyLink = useCallback(() => {
    if (checkoutUrl) {
      navigator.clipboard.writeText(checkoutUrl).then(
        () => toast.success('Enlace copiado al portapapeles'),
        () => toast.error('No se pudo copiar el enlace'),
      )
    }
  }, [checkoutUrl])

  // ── Retry ──
  const handleRetry = useCallback(() => {
    setWompiTransactionId(null)
    setCheckoutUrl(null)
    setReference(null)
    setLinkError('')
    hasCreatedRef.current = false
    notifiedApprovalRef.current = null
    handleCreateLink()
  }, [handleCreateLink])

  // ── Cancel ──
  const handleCancel = useCallback(() => {
    onOpenChange(false)
    onCancel()
  }, [onOpenChange, onCancel])

  // ── Payment complete ──
  const handlePaymentComplete = useCallback(() => {
    const wompiRef = reference || txStatus?.reference || ''
    onPaymentComplete(wompiRef)
    onOpenChange(false)
  }, [reference, txStatus, onPaymentComplete, onOpenChange])

  const step = derivedStep

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`sm:max-w-[420px] p-0 overflow-hidden transition-all duration-700 ${
          step === 'creating'
            ? 'border-2 border-emerald-300 dark:border-emerald-700'
            : ''
        }`}
        style={
          step === 'creating'
            ? { animation: 'pos-border-pulse 2s ease-in-out infinite' }
            : undefined
        }
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Inline keyframes for animations */}
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes pos-border-pulse {
              0%, 100% { border-color: rgb(167 243 208 / 1); }
              50% { border-color: rgb(52 211 153 / 1); }
            }
            @keyframes pos-glow-spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes pos-dot-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(1.4); }
            }
            @keyframes pos-check-pop {
              0% { transform: scale(0); opacity: 0; }
              60% { transform: scale(1.15); }
              100% { transform: scale(1); opacity: 1; }
            }
          `,
        }} />

        {/* ── Header (minimal, contextual) ── */}
        <DialogHeader className="sr-only">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            Pago Wompi POS
          </DialogTitle>
          <DialogDescription>
            {step === 'creating' && 'Creando enlace de pago...'}
            {step === 'awaiting' && 'Esperando confirmación del pago'}
            {step === 'success' && '¡Pago aprobado!'}
            {step === 'declined' && 'El pago fue rechazado'}
            {step === 'error' && 'Error en el pago'}
          </DialogDescription>
        </DialogHeader>

        {/* ════════════════════════════════════════════════════════════════
            STEP 1 — CREATING: Payment Terminal Initialization
            ════════════════════════════════════════════════════════════════ */}
        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 gap-6">
            {/* Large spinner with glow ring */}
            <div className="relative h-20 w-20 flex items-center justify-center">
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-full bg-emerald-400/20 dark:bg-emerald-500/15 blur-xl animate-pulse" />
              {/* Spinning glow ring */}
              <div
                className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-emerald-500 border-r-emerald-400"
                style={{ animation: 'pos-glow-spin 1.2s linear infinite' }}
              />
              {/* Inner spinner */}
              <Loader2 className="h-10 w-10 animate-spin text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>

            {/* Text */}
            <div className="text-center space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Iniciando pasarela de pago...
              </p>
              <p className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
                {formatCOP(amount)}
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 2 — AWAITING: Professional Payment Waiting
            ════════════════════════════════════════════════════════════════ */}
        {step === 'awaiting' && (
          <div className="flex flex-col gap-5 px-6 pt-6 pb-5">
            {/* ── Receipt-style card ── */}
            <div className="relative rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
              {/* Dashed top border (receipt tear-off) */}
              <div className="h-0 w-full border-t-[3px] border-dashed border-border" />

              <div className="px-5 py-4 space-y-4">
                {/* Amount row */}
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                    Monto
                  </p>
                  <p className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
                    {formatCOP(amount)}
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-dashed border-border" />

                {/* Reference row */}
                {reference && (
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                      Referencia
                    </p>
                    <p className="text-sm font-mono text-muted-foreground tracking-wide select-all">
                      {reference}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Payment methods grid ── */}
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2.5">
                Métodos de pago aceptados
              </p>
              <WompiPaymentMethodsGrid />
            </div>

            {/* ── Pulsing status indicator ── */}
            <div className="flex items-center justify-center gap-2.5">
              <span
                className="inline-block h-2 w-2 rounded-full bg-amber-500"
                style={{ animation: 'pos-dot-pulse 1.5s ease-in-out infinite' }}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {isDemoMode
                  ? 'Pago demo — aprobación automática...'
                  : 'Esperando confirmación...'}
              </span>
            </div>

            {/* ── Action buttons (horizontal row) ── */}
            <div className="flex items-center gap-2">
              {checkoutUrl && !isDemoMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs"
                  onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Reabrir Wompi
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs"
                onClick={handleCopyLink}
                disabled={!checkoutUrl}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copiar Link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
            </div>

            {/* ── Footer ── */}
            <WompiPoweredBy />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 3a — SUCCESS: Clean Success Screen
            ════════════════════════════════════════════════════════════════ */}
        {step === 'success' && (
          <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-5">
            {/* Large emerald checkmark */}
            <div
              className="h-20 w-20 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center ring-4 ring-emerald-100 dark:ring-emerald-500/25 shadow-[0_0_24px_rgba(16,185,129,0.15)]"
              style={{ animation: 'pos-check-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
            >
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>

            {/* Text content */}
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                ¡Pago Completado!
              </h3>
              <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {formatCOP(amount)}
              </p>
              {(reference || txStatus?.reference) && (
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  Ref: {reference || txStatus?.reference}
                </p>
              )}
            </div>

            {/* CTA button */}
            <Button
              className="w-full h-12 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200"
              onClick={handlePaymentComplete}
            >
              Continuar y registrar venta
            </Button>

            {/* Approved badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/40 px-3 py-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                Transacción aprobada por Wompi
              </span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 3b — DECLINED
            ════════════════════════════════════════════════════════════════ */}
        {step === 'declined' && (
          <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-5">
            {/* Large red icon */}
            <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-500/15 flex items-center justify-center ring-4 ring-red-100 dark:ring-red-500/25 shadow-[0_0_24px_rgba(239,68,68,0.1)]">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>

            {/* Text content */}
            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-red-700 dark:text-red-400">
                Pago Rechazado
              </h3>
              {derivedDeclineReason && (
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  {derivedDeclineReason}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1 h-10 text-sm"
                onClick={handleRetry}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reintentar
              </Button>
              <Button
                variant="ghost"
                className="flex-1 h-10 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 3c — ERROR
            ════════════════════════════════════════════════════════════════ */}
        {step === 'error' && (
          <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-5">
            {/* Large red icon */}
            <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-500/15 flex items-center justify-center ring-4 ring-red-100 dark:ring-red-500/25 shadow-[0_0_24px_rgba(239,68,68,0.1)]">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>

            {/* Text content */}
            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-red-700 dark:text-red-400">
                Error en el pago
              </h3>
              {linkError && (
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  {linkError}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1 h-10 text-sm"
                onClick={handleRetry}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reintentar
              </Button>
              <Button
                variant="ghost"
                className="flex-1 h-10 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            DIALOG FOOTER
            ════════════════════════════════════════════════════════════════ */}
        {step !== 'awaiting' && step !== 'success' && (
          <div className="flex items-center justify-center px-6 py-3 border-t border-border bg-muted/20">
            {isDemoMode ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/40 px-3 py-1.5">
                <Beaker className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Modo Demo
                </span>
              </div>
            ) : (
              <WompiPoweredBy />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
