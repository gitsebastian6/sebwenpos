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
  QrCode,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useCreateWompiPaymentLink, useWompiTransactionStatus } from '@/hooks/api/use-wompi'

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

      // Abrir checkout de Wompi en nueva pestaña
      window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer')
      toast.info('Se abrió la página de pago de Wompi. Completa el pago en esa ventana.')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
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

        {/* ── Step 1: Creating link ── */}
        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Creando enlace de pago</p>
              <p className="text-xs text-muted-foreground">
                Monto: <span className="font-mono font-bold text-emerald-600">{formatCOP(amount)}</span>
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: Awaiting payment ── */}
        {step === 'awaiting' && (
          <div className="space-y-4">
            {/* Monto y referencia */}
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monto</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCOP(amount)}
                </span>
              </div>
              {reference && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Referencia</span>
                  <span className="text-xs font-mono text-muted-foreground">{reference}</span>
                </div>
              )}
            </div>

            {/* Enlace de pago + QR-like reference display */}
            {checkoutUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  <QrCode className="h-8 w-8 text-emerald-600 shrink-0" />
                  <a
                    href={checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline break-all flex-1 min-w-0"
                  >
                    {checkoutUrl}
                  </a>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              </div>
            )}

            {/* Polling indicator */}
            <div className="flex items-center gap-2 justify-center text-xs text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Consultando estado del pago cada 5 segundos...</span>
            </div>

            {/* Acciones */}
            <div className="flex flex-col gap-2">
              {checkoutUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Reabrir página de Wompi
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCopyLink}
                disabled={!checkoutUrl}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar enlace
              </Button>
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3a: Success ── */}
        {step === 'success' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">¡Pago aprobado!</p>
                <p className="text-xs text-muted-foreground">
                  Monto: <span className="font-mono font-bold">{formatCOP(amount)}</span>
                </p>
                {(reference || txStatus?.reference) && (
                  <p className="text-xs text-muted-foreground">
                    Ref: <span className="font-mono">{reference || txStatus?.reference}</span>
                  </p>
                )}
              </div>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handlePaymentComplete}
            >
              Continuar y registrar venta
            </Button>
          </div>
        )}

        {/* ── Step 3b: Declined ── */}
        {step === 'declined' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-4 gap-3">
              <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Pago rechazado</p>
                {derivedDeclineReason && (
                  <p className="text-xs text-muted-foreground">{derivedDeclineReason}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={handleRetry}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reintentar pago
              </Button>
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3c: Error ── */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-4 gap-3">
              <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Error en el pago</p>
                {linkError && (
                  <p className="text-xs text-muted-foreground">{linkError}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={handleRetry}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reintentar pago
              </Button>
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Badge footer */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[11px] text-muted-foreground">Pago seguro vía Wompi — Tarjeta · Nequi · Daviplata · PSE</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
