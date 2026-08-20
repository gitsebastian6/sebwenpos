'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShieldX,
  Crown,
  Settings,
  Lock,
  MessageCircle,
  Phone,
} from 'lucide-react'

// ── Support contact info (same as subscription-info-card) ──
const SEBWEN_SUPPORT_PHONE = '573012695457'
const SUPPORT_WHATSAPP = `https://wa.me/${SEBWEN_SUPPORT_PHONE}?text=${encodeURIComponent('Hola, necesito ayuda con mi suscripción en Sebwen POS')}`
const SUPPORT_PHONE = SEBWEN_SUPPORT_PHONE.slice(2)

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

  // ── PAST_DUE and TRIAL-ending-soon: no banner here — app-shell.tsx already
  // renders a global top banner for these exact statuses on every view,
  // including POS. Rendering another one here just duplicated it. This gate
  // only needs to keep its actual blocking behavior (above).
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

// TrialEndingBanner and PastDueBanner were removed — app-shell.tsx's global
// top banner already covers these exact statuses on every view, including
// POS, so keeping these here just duplicated the same message.
