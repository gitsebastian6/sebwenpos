'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShieldX,
  AlertTriangle,
  Crown,
  Settings,
  Lock,
  X,
  MessageCircle,
  Phone,
} from 'lucide-react'
import { useState } from 'react'

// ── Support contact info (same as subscription-info-card) ──
const VENTIFY_SUPPORT_PHONE = '573012695457'
const SUPPORT_WHATSAPP = `https://wa.me/${VENTIFY_SUPPORT_PHONE}?text=${encodeURIComponent('Hola, necesito ayuda con mi suscripción en Ventify POS')}`
const SUPPORT_PHONE = VENTIFY_SUPPORT_PHONE.slice(2)

interface SubscriptionGateProps {
  children: React.ReactNode
}

/**
 * SubscriptionGate — Blocks POS access when subscription is EXPIRED or CANCELLED,
 * shows a persistent warning for PAST_DUE, and passes through for TRIAL/ACTIVE.
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const subscription = useAuthStore((s) => s.subscription)
  const setView = useAppStore((s) => s.setView)

  const hasSubscription = subscription?.hasSubscription
  const status = subscription?.subscriptionStatus
  const planName = subscription?.planName
  const graceDaysRemaining = subscription?.graceDaysRemaining
  const daysRemaining = subscription?.daysRemaining

  // ── No subscription at all ──
  if (!hasSubscription) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md border-amber-200 dark:border-amber-800/50 shadow-lg">
          <CardContent className="py-8 text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
              <Crown className="h-8 w-8 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Sin Suscripción
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              No se encontró una suscripción activa para tu tienda. Configura un plan para acceder al Punto de Venta.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-2.5 mt-5">
              <Button
                onClick={() => setView('settings')}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                <Settings className="h-4 w-4" />
                Configurar Plan
              </Button>
              <a
                href={SUPPORT_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-semibold rounded-lg px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── EXPIRED or CANCELLED: Full blocking overlay ──
  if (status === 'EXPIRED' || status === 'CANCELLED') {
    return (
      <SubscriptionBlockedOverlay
        status={status}
        planName={planName}
        graceDaysRemaining={graceDaysRemaining}
        onGoToSettings={() => setView('settings')}
      />
    )
  }

  // ── PAST_DUE: Warning banner + children ──
  if (status === 'PAST_DUE') {
    return (
      <div className="flex flex-col h-full">
        <PastDueBanner
          planName={planName}
          graceDaysRemaining={graceDaysRemaining}
          onGoToSettings={() => setView('settings')}
        />
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>
    )
  }

  // ── TRIAL: show a conversion nudge banner in the last 3 days ──
  if (status === 'TRIAL' && daysRemaining !== null && daysRemaining <= 3) {
    return (
      <div className="flex flex-col h-full">
        <TrialEndingBanner
          daysRemaining={daysRemaining}
          onGoToSettings={() => setView('settings')}
        />
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>
    )
  }

  // ── TRIAL (early) or ACTIVE: Render children normally ──
  return <>{children}</>
}

// ── Full-Screen Blocking Overlay ──

interface SubscriptionBlockedOverlayProps {
  status: string | null
  planName: string | null
  graceDaysRemaining: number | null
  onGoToSettings: () => void
}

function SubscriptionBlockedOverlay({ status, planName, graceDaysRemaining, onGoToSettings }: SubscriptionBlockedOverlayProps) {
  const isCancelled = status === 'CANCELLED'

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4 relative overflow-hidden">
      {/* Background gradient decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-red-500/5 dark:bg-red-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-amber-500/5 dark:bg-amber-500/8 blur-3xl" />
      </div>

      <Card className="w-full max-w-lg border-red-200 dark:border-red-800/50 shadow-xl relative z-10">
        <CardContent className="py-10 text-center">
          {/* Icon */}
          <div className="mx-auto mb-5 h-20 w-20 rounded-2xl bg-gradient-to-br from-red-100 to-red-200 dark:from-red-500/15 dark:to-red-600/10 flex items-center justify-center shadow-sm">
            <ShieldX className="h-10 w-10 text-red-500" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-foreground">
            {isCancelled ? 'Suscripción Cancelada' : 'Suscripción Expirada'}
          </h2>

          {/* Badge */}
          <Badge
            variant="destructive"
            className="mt-3 text-xs font-semibold"
          >
            <Lock className="h-3 w-3 mr-1" />
            {isCancelled ? 'Cancelada' : 'Expirada'}
          </Badge>

          {/* Description */}
          <p className="text-sm text-muted-foreground mt-4 max-w-sm mx-auto leading-relaxed">
            {isCancelled
              ? `Tu suscripción al plan ${planName || 'anterior'} fue cancelada. Reactiva tu plan para recuperar acceso completo al Punto de Venta.`
              : graceDaysRemaining !== null && graceDaysRemaining <= 0
                ? `Tu período de gracia del plan ${planName || 'anterior'} ha terminado. Renueva tu suscripción para continuar usando el Punto de Venta.`
                : `La suscripción al plan ${planName || 'anterior'} ha expirado. Renueva tu plan para recuperar acceso completo al sistema.`
            }
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-6">
            <Button
              onClick={onGoToSettings}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              size="lg"
            >
              <Settings className="h-4 w-4" />
              {isCancelled ? 'Reactivar Plan' : 'Renovar Plan'}
            </Button>
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-semibold rounded-lg px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Soporte
            </a>
          </div>

          {/* Secondary info */}
          <div className="mt-6 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              ¿Necesitas ayuda inmediata? Llama al{' '}
              <a
                href={`tel:+57${SUPPORT_PHONE}`}
                className="font-semibold text-foreground hover:text-primary transition-colors"
              >
                {SUPPORT_PHONE}
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── TRIAL Ending Banner (conversion nudge, last 3 days) ──

interface TrialEndingBannerProps {
  daysRemaining: number
  onGoToSettings: () => void
}

function TrialEndingBanner({ daysRemaining, onGoToSettings }: TrialEndingBannerProps) {
  // Banner is persistent — dismissible but shows again on refresh (no localStorage persistence)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const isLastDay = daysRemaining <= 1

  return (
    <div className="border-b bg-amber-500/5 border-amber-500/20 dark:bg-amber-500/8 dark:border-amber-500/15">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5">
        <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
          <Crown className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Prueba Gratuita por Terminar
            </p>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-semibold shrink-0 border-amber-400 text-amber-600 dark:text-amber-400"
            >
              {daysRemaining}d restante{daysRemaining !== 1 ? 's' : ''}
            </Badge>
          </div>
          <p className="text-[11px] text-amber-600/80 dark:text-amber-300/70 mt-0.5">
            {isLastDay
              ? 'Tu prueba gratuita termina mañana. Elige un plan para no perder acceso al POS.'
              : `Te quedan ${daysRemaining} días de prueba gratuita. Elige un plan cuando quieras para seguir sin interrupciones.`
            }
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onGoToSettings}
        >
          Ver Planes
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 hover:bg-transparent text-amber-400 hover:text-amber-300"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── PAST_DUE Warning Banner ──

interface PastDueBannerProps {
  planName: string | null
  graceDaysRemaining: number | null
  onGoToSettings: () => void
}

function PastDueBanner({ planName, graceDaysRemaining, onGoToSettings }: PastDueBannerProps) {
  // Banner is persistent — dismissible but shows again on refresh (no localStorage persistence)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="border-b bg-red-500/5 border-red-500/20 dark:bg-red-500/8 dark:border-red-500/15">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5">
        <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              Suscripción Vencida
            </p>
            {graceDaysRemaining != null && (
              <Badge
                variant="destructive"
                className="text-[10px] px-1.5 py-0 h-4 font-semibold shrink-0"
              >
                {graceDaysRemaining}d de gracia
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-red-500/80 dark:text-red-300/70 mt-0.5">
            {graceDaysRemaining != null && graceDaysRemaining > 0
              ? `Tienes ${graceDaysRemaining} día${graceDaysRemaining !== 1 ? 's' : ''} de gracia para renovar tu plan ${planName || ''}. Después, el acceso al POS será bloqueado.`
              : 'Tu período de gracia está por terminar. Renueva tu plan para evitar la pérdida de acceso.'
            }
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white"
          onClick={onGoToSettings}
        >
          Renovar Plan
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 hover:bg-transparent text-red-400 hover:text-red-300"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
