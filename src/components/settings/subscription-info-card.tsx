'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Phone,
  MessageCircle,
  CreditCard,
  AlertTriangle,
  Clock,
  Crown,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'

export interface SubInfo {
  id: number; status: string; planName: string; planPrice: number
  startDate: string; endDate: string | null; billingPeriod: string; daysRemaining: number | null
  trialEndDate: string | null
}

interface SubscriptionInfoCardProps {
  subInfo: SubInfo | null
  hasPendingReceipt: boolean
  onUpgrade: () => void
  onCancel: () => void
  isOwner?: boolean
  isFetching?: boolean
  onRefresh?: () => void
}

const SEBWEN_SUPPORT_PHONE = '573012695457'
const SUPPORT_WHATSAPP = `https://wa.me/${SEBWEN_SUPPORT_PHONE}?text=${encodeURIComponent('Hola, quiero actualizar mi plan de suscripción en Sebwen POS')}`
const SUPPORT_PHONE = SEBWEN_SUPPORT_PHONE.slice(2) // local 10-digit format

export function SubscriptionInfoCard({ subInfo, hasPendingReceipt, onUpgrade, onCancel, isOwner = true, isFetching = false, onRefresh }: SubscriptionInfoCardProps) {
  if (!subInfo) {
    return (
      <Card className="border-amber-200/60 dark:border-amber-800/40 rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="py-10 text-center px-6">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <AlertTriangle className="h-8 w-8 text-amber-500 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-amber-800 dark:text-amber-200 mb-1.5">
            Sin Suscripción Asignada
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No se encontró información de suscripción para tu tienda. Contacta al soporte para asignar un plan.
          </p>
          <div className="flex justify-center gap-3 mt-6">
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl px-5 py-2.5 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
            <a
              href={`tel:+57${SUPPORT_PHONE}`}
              className="inline-flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-semibold rounded-xl px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:shadow-sm transition-all duration-200 shadow-sm"
            >
              <Phone className="h-4 w-4" />
              {SUPPORT_PHONE}
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Determine urgency level for trial
  const trialUrgency = subInfo.status === 'TRIAL' && subInfo.daysRemaining !== null
    ? subInfo.daysRemaining <= 3 ? 'critical' : subInfo.daysRemaining <= 5 ? 'warning' : 'safe'
    : null

  const urgencyColors = {
    critical: {
      border: 'border-l-4 border-l-red-500 dark:border-l-red-400',
      bg: 'bg-red-50/70 dark:bg-red-950/30',
      iconBg: 'bg-red-500',
      iconText: 'text-white',
      headingText: 'text-red-700 dark:text-red-300',
      progressBg: 'bg-red-500',
      pillBg: 'bg-red-100 dark:bg-red-500/15',
      pillText: 'text-red-700 dark:text-red-300',
    },
    warning: {
      border: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
      bg: 'bg-amber-50/70 dark:bg-amber-950/30',
      iconBg: 'bg-amber-500',
      iconText: 'text-white',
      headingText: 'text-amber-700 dark:text-amber-300',
      progressBg: 'bg-amber-500',
      pillBg: 'bg-amber-100 dark:bg-amber-500/15',
      pillText: 'text-amber-700 dark:text-amber-300',
    },
    safe: {
      border: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
      bg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
      iconBg: 'bg-emerald-500',
      iconText: 'text-white',
      headingText: 'text-emerald-700 dark:text-emerald-300',
      progressBg: 'bg-emerald-500',
      pillBg: 'bg-emerald-100 dark:bg-emerald-500/15',
      pillText: 'text-emerald-700 dark:text-emerald-300',
    },
  }

  // Status badge configuration
  const statusConfig: Record<string, { label: string; dotColor: string; badgeBg: string; badgeText: string }> = {
    TRIAL: { label: 'Prueba', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-100 dark:bg-amber-500/15', badgeText: 'text-amber-700 dark:text-amber-400' },
    ACTIVE: { label: 'Activa', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-100 dark:bg-emerald-500/15', badgeText: 'text-emerald-700 dark:text-emerald-400' },
    EXPIRED: { label: 'Expirada', dotColor: 'bg-red-500', badgeBg: 'bg-red-100 dark:bg-red-500/15', badgeText: 'text-red-700 dark:text-red-400' },
    CANCELLED: { label: 'Cancelada', dotColor: 'bg-red-500', badgeBg: 'bg-red-100 dark:bg-red-500/15', badgeText: 'text-red-700 dark:text-red-400' },
    PAST_DUE: { label: 'Vencida', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-100 dark:bg-amber-500/15', badgeText: 'text-amber-700 dark:text-amber-400' },
  }
  const currentStatus = statusConfig[subInfo.status] || { label: subInfo.status, dotColor: 'bg-gray-500', badgeBg: 'bg-gray-100 dark:bg-gray-500/15', badgeText: 'text-gray-700 dark:text-gray-400' }

  // Progress bar percentage — use 7 for trial, actual period for others
  const periodDays = subInfo.billingPeriod === 'TRIAL' ? 7
    : subInfo.billingPeriod === 'QUARTERLY' ? 90
    : subInfo.billingPeriod === 'SEMI_ANNUAL' ? 180
    : subInfo.billingPeriod === 'ANNUAL' ? 365
    : 30
  const daysRem = subInfo.daysRemaining ?? 0
  const progressPercent = daysRem > 0
    ? Math.min(100, Math.max(5, (daysRem / periodDays) * 100))
    : 0

  // For TRIAL status, show trialEndDate as "Vence"; otherwise show endDate
  const displayEndDate = subInfo.status === 'TRIAL' && subInfo.trialEndDate
    ? subInfo.trialEndDate
    : subInfo.endDate

  return (
    <>
      {/* Trial Countdown Banner */}
      {subInfo.status === 'TRIAL' && daysRem > 0 && (() => {
        const colors = urgencyColors[trialUrgency!]
        return (
          <div className={`rounded-2xl border border-border/30 ${colors.border} ${colors.bg} p-5 shadow-sm`}>
            <div className="flex items-start gap-4">
              <div className={`h-11 w-11 rounded-full ${colors.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                <Clock className={`h-5 w-5 ${colors.iconText}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className={`font-bold text-sm ${colors.headingText}`}>
                    {daysRem <= 3
                      ? `¡Tu prueba termina pronto!`
                      : daysRem <= 5
                      ? `Período de prueba`
                      : `Período de prueba activo`}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${colors.pillBg} ${colors.pillText}`}>
                    {daysRem} día{daysRem > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs mt-1.5 text-muted-foreground leading-relaxed">
                  {daysRem <= 3
                    ? 'Actualiza tu plan antes de que expire para no perder acceso al sistema.'
                    : 'Estás evaluando Sebwen POS. Puedes actualizar tu plan en cualquier momento.'}
                </p>

                {/* Progress bar */}
                <div className="mt-3.5">
                  <div className="w-full h-3 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 relative ${colors.progressBg} ${
                        daysRem <= 3 ? 'animate-pulse' : ''
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    >
                      {daysRem <= 3 && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-right font-medium">{Math.round(progressPercent)}%</p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
                  {isOwner && (
                    <Button
                      onClick={onUpgrade}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                      disabled={hasPendingReceipt}
                    >
                      <Crown className="h-4 w-4" />
                      {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Actualizar Plan'}
                    </Button>
                  )}
                  {!isOwner && (
                    <p className="text-xs text-muted-foreground">
                      Contacta al propietario del negocio para gestionar la suscripción.
                    </p>
                  )}
                  <a
                    href={`tel:+57${SUPPORT_PHONE}`}
                    className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-semibold rounded-xl px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:shadow-sm transition-all duration-200 shadow-sm"
                  >
                    <Phone className="h-4 w-4" />
                    Llamar {SUPPORT_PHONE}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Expired Banner */}
      {subInfo.status === 'EXPIRED' && (
        <div className="rounded-2xl border border-border/30 border-l-4 border-l-red-500 dark:border-l-red-400 bg-red-50/70 dark:bg-red-950/30 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping opacity-50" />
              <div className="relative h-11 w-11 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-red-700 dark:text-red-300">Suscripción Expirada</h3>
              <p className="text-xs mt-1.5 text-red-600/70 dark:text-red-400/70 leading-relaxed">
                Tu plan {subInfo.planName} expiró el{' '}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {subInfo.endDate ? new Date(subInfo.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                </span>.
                Contacta al soporte para renovar y recuperar acceso completo al sistema.
              </p>
              <div className="mt-4">
                {isOwner && (
                  <Button
                    onClick={onUpgrade}
                    disabled={hasPendingReceipt}
                    className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <Crown className="h-4 w-4" />
                    {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Renovar Plan'}
                  </Button>
                )}
                {!isOwner && (
                  <p className="text-xs text-muted-foreground">
                    Contacta al propietario del negocio para gestionar la suscripción.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Details Card */}
      <Card className="border-border/50 hover:shadow-lg hover:border-primary/20 transition-all duration-300 rounded-2xl overflow-hidden">
        {/* Top gradient accent */}
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-emerald-500" />

        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-primary" />
                  </div>
                  Mi Suscripción
                </CardTitle>
                <CardDescription className="mt-1.5">Información de tu plan actual</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${currentStatus.badgeBg} ${currentStatus.badgeText}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${currentStatus.dotColor}`} />
                {currentStatus.label}
              </div>
              {/* Refresh button */}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isFetching}
                  className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Actualizar información"
                  title="Actualizar información de suscripción"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Dashboard stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/50 dark:bg-muted/30 p-3.5 border border-border/30">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Plan</p>
              <p className="text-sm font-bold">{subInfo.planName}</p>
            </div>
            <div className="rounded-xl bg-muted/50 dark:bg-muted/30 p-3.5 border border-border/30">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Precio</p>
              <p className="text-sm font-mono font-bold">
                {subInfo.planPrice === 0 ? 'Gratis' : `${formatCOP(subInfo.planPrice)}`}
                {subInfo.planPrice > 0 && <span className="text-[11px] text-muted-foreground font-normal">/mes</span>}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 dark:bg-muted/30 p-3.5 border border-border/30">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Inicio</p>
              <p className="text-sm font-semibold">{new Date(subInfo.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <div className="rounded-xl bg-muted/50 dark:bg-muted/30 p-3.5 border border-border/30">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Vence</p>
              <p className="text-sm font-semibold">
                {displayEndDate ? new Date(displayEndDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </p>
            </div>
          </div>

          {/* Days Remaining — always show the section, with appropriate message for edge cases */}
          <div className="mt-5">
            {daysRem > 0 ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">Tiempo restante</p>
                  <p className={`text-xs font-bold ${
                    daysRem <= 3 ? 'text-red-600 dark:text-red-400'
                    : daysRem <= 5 ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {daysRem} día{daysRem > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 relative ${
                      daysRem <= 3 ? 'bg-red-500'
                      : daysRem <= 5 ? 'bg-amber-500'
                      : 'bg-emerald-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  >
                    {daysRem <= 3 && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-right font-medium">{Math.round(progressPercent)}%</p>
              </>
            ) : subInfo.status === 'ACTIVE' && subInfo.planPrice > 0 ? (
              /* Active paid plan without days remaining — likely needs renewal */
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  Tu suscripción necesita renovación. Actualiza tu plan para continuar.
                </p>
              </div>
            ) : subInfo.status === 'ACTIVE' || (subInfo.status === 'TRIAL' && daysRem === 0) ? (
              /* Active plan with 0 days — trial just ended or annual plan rolled over */
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-xs text-muted-foreground font-medium">
                  {subInfo.status === 'TRIAL' ? 'Tu período de prueba ha terminado. Actualiza tu plan.' : 'Tu suscripción está al día.'}
                </p>
              </div>
            ) : subInfo.daysRemaining === null ? (
              /* daysRemaining is null — data might not be available yet */
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground font-medium">
                  Calculando tiempo restante...
                </p>
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="ml-auto text-xs text-primary hover:underline font-medium"
                  >
                    Actualizar
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* Active Plan — Upgrade CTA (cleaner inline row) */}
          {(subInfo.status === 'ACTIVE' || subInfo.status === 'TRIAL' || subInfo.status === 'PAST_DUE') && (
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <p className="text-xs text-foreground/80 font-medium flex-1 leading-relaxed">
                {subInfo.status === 'TRIAL'
                  ? 'Estás en período de prueba. Actualiza tu plan para acceder a todas las funciones.'
                  : subInfo.status === 'PAST_DUE'
                    ? 'Tu suscripción venció. Cambia tu plan para recuperar acceso completo.'
                    : '¿Necesitas más funcionalidades o cambiar tu plan?'}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {isOwner ? (
                  <>
                    <Button
                      onClick={onUpgrade}
                      size="sm"
                      className="gap-1.5 text-xs rounded-lg"
                      disabled={hasPendingReceipt}
                    >
                      <Crown className="h-3.5 w-3.5" />
                      {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Cambiar Plan'}
                    </Button>
                    <Button
                      onClick={onCancel}
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5 rounded-lg"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Contacta al propietario del negocio para gestionar la suscripción.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cancelled State Info — with Self-Service Reactivation */}
          {subInfo.status === 'CANCELLED' && (
            <div className="mt-5 rounded-xl bg-red-50/70 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/30 p-4">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                </div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Suscripción Cancelada</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed pl-[38px]">
                Tu suscripción fue cancelada. Puedes reactivarla automáticamente seleccionando un plan y subiendo tu comprobante de pago.
              </p>
              <div className="flex items-center gap-2.5 mt-3 pl-[38px]">
                {isOwner && (
                  <Button
                    onClick={onUpgrade}
                    size="sm"
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                    disabled={hasPendingReceipt}
                  >
                    <Crown className="h-3 w-3" />
                    {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Reactivar Suscripción'}
                  </Button>
                )}
                {!isOwner && (
                  <p className="text-xs text-muted-foreground">
                    Contacta al propietario del negocio para gestionar la suscripción.
                  </p>
                )}
                <a
                  href={SUPPORT_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-xl px-3.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:shadow-sm transition-all duration-200 shadow-sm"
                >
                  <MessageCircle className="h-3 w-3" />
                  WhatsApp
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
