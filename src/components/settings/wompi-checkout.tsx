'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Shield,
  RotateCcw,
  ArrowRight,
  Beaker,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'
import { useCreateWompiPaymentLink, useWompiTransactionStatus } from '@/hooks/api/use-wompi'
import { BILLING_PERIODS } from '@/components/settings/subscription-payment-panel'

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
  let derivedStep: 'summary' | 'pending' | 'approved' | 'declined' | 'error'
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
    <div className="space-y-4">
      {/* ── Demo Mode Banner ── */}
      {demoMode && step === 'summary' && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-3">
          <Beaker className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Modo Demo</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400/80 mt-0.5">
              Los pagos se simulan automáticamente. No se conecta a Wompi real. Cambia WOMPI_ENV a &quot;sandbox&quot; o &quot;production&quot; cuando tengas tus llaves.
            </p>
          </div>
        </div>
      )}

      {/* ── Paso 1: Resumen del pago ── */}
      {step === 'summary' && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {demoMode ? (
                <Beaker className="h-4 w-4 text-amber-500" />
              ) : (
                <CreditCard className="h-4 w-4 text-primary" />
              )}
              {demoMode ? 'Pago Demo' : 'Pago con Wompi'}
            </CardTitle>
            <CardDescription>
              {demoMode
                ? 'Simulación de pago para desarrollo. Se aprobará automáticamente.'
                : 'Paga de forma segura a través de Wompi — tarjeta, Nequi, Daviplata, PSE y más.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Resumen del plan */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-semibold">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Período</span>
                <Badge variant="outline" className="text-xs">{periodLabel}</Badge>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold">Total a pagar</span>
                <span className="text-lg font-bold font-mono text-primary">{formatCOP(amount)}</span>
              </div>
            </div>

            {/* Métodos de pago aceptados */}
            {!demoMode && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                <span>Tarjeta · Nequi · Daviplata · PSE · Bancolombia</span>
              </div>
            )}

            {demoMode && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Beaker className="h-3.5 w-3.5" />
                <span>Simulación — se aprobará en ~10 segundos</span>
              </div>
            )}

            {/* Botón de pago */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleCreatePaymentLink}
              disabled={createLinkMutation.isPending}
            >
              {createLinkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {demoMode ? 'Creando pago demo...' : 'Creando enlace de pago...'}
                </>
              ) : (
                <>
                  {demoMode ? <Beaker className="h-4 w-4 mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  {demoMode ? 'Simular Pago' : 'Pagar con Wompi'}
                </>
              )}
            </Button>

            {/* Enlace alternativo: subida manual */}
            {!demoMode && (
              <>
                <div className="relative flex items-center justify-center my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <span className="relative bg-background px-3 text-xs text-muted-foreground">ó</span>
                </div>

                <button
                  type="button"
                  onClick={onManualUpload}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Subir comprobante manualmente
                </button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Paso 2: Esperando pago ── */}
      {step === 'pending' && (
        <Card className={demoMode ? 'border-amber-200 dark:border-amber-800/40' : 'border-amber-200 dark:border-amber-800/40'}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              {demoMode ? 'Procesando pago demo...' : 'Esperando pago...'}
            </CardTitle>
            <CardDescription>
              {demoMode
                ? 'El pago demo se aprobará automáticamente en unos segundos.'
                : 'Completa el pago en la ventana de Wompi. Verificaremos el estado automáticamente.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Resumen */}
            <div className={`rounded-lg border p-4 space-y-2 ${
              demoMode
                ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/10'
                : 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/10'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-semibold">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monto</span>
                <span className="text-sm font-bold font-mono">{formatCOP(amount)}</span>
              </div>
              {wompiTransactionId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Referencia</span>
                  <span className="text-xs font-mono text-muted-foreground">#{wompiTransactionId}</span>
                </div>
              )}
              {demoMode && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Modo</span>
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-700">
                    <Beaker className="h-3 w-3 mr-1" />
                    Demo
                  </Badge>
                </div>
              )}
            </div>

            {/* Indicador de polling */}
            <div className="flex items-center gap-2 justify-center text-xs text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                {demoMode
                  ? 'El pago se aprobará automáticamente en ~10 segundos...'
                  : 'Consultando estado del pago cada 5 segundos...'}
              </span>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-col gap-2">
              {!demoMode && checkoutUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleReopenCheckout}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Reabrir página de Wompi
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleRetry}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Cancelar y volver
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Paso 3: Pago aprobado ── */}
      {step === 'approved' && (
        <Card className="border-emerald-200 dark:border-emerald-800/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              ¡Pago aprobado!
            </CardTitle>
            <CardDescription>
              {demoMode
                ? 'El pago demo fue aprobado automáticamente. Tu suscripción ha sido activada.'
                : 'Tu pago ha sido confirmado por Wompi y tu suscripción ha sido activada.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-semibold">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monto pagado</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCOP(amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estado</span>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0">
                  Aprobado {demoMode && '(Demo)'}
                </Badge>
              </div>
            </div>

            <Button className="w-full" onClick={onPaymentComplete}>
              <ArrowRight className="h-4 w-4 mr-2" />
              Continuar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Paso 4: Pago rechazado ── */}
      {step === 'declined' && (
        <Card className="border-red-200 dark:border-red-800/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Pago rechazado
            </CardTitle>
            <CardDescription>
              La transacción fue rechazada. Puedes intentar nuevamente o subir el comprobante manualmente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/10 p-3">
                <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleRetry}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Intentar de nuevo
              </Button>
              {!demoMode && (
                <button
                  type="button"
                  onClick={onManualUpload}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Subir comprobante manualmente
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Paso 5: Error ── */}
      {step === 'error' && (
        <Card className="border-red-200 dark:border-red-800/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Error en el pago
            </CardTitle>
            <CardDescription>
              Hubo un error al procesar el pago. Intenta nuevamente o usa la opción manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/10 p-3">
                <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleRetry}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Intentar de nuevo
              </Button>
              {!demoMode && (
                <button
                  type="button"
                  onClick={onManualUpload}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Subir comprobante manualmente
                </button>
              )}
            </div>
          </CardContent>
        </Card>
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
      <DialogContent className="sm:max-w-md">
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
      </DialogContent>
    </Dialog>
  )
}
