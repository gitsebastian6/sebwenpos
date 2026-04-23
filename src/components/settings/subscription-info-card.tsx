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
} from 'lucide-react'
import { formatCOP } from '@/lib/format'

export interface SubInfo {
  id: number; status: string; planName: string; planPrice: number
  startDate: string; endDate: string | null; billingPeriod: string; daysRemaining: number | null
}

interface SubscriptionInfoCardProps {
  subInfo: SubInfo | null
  hasPendingReceipt: boolean
  onUpgrade: () => void
  onCancel: () => void
}

const VENTIFY_SUPPORT_PHONE = '573012695457'
const SUPPORT_WHATSAPP = `https://wa.me/${VENTIFY_SUPPORT_PHONE}?text=${encodeURIComponent('Hola, quiero actualizar mi plan de suscripción en Ventify POS')}`
const SUPPORT_PHONE = VENTIFY_SUPPORT_PHONE.slice(2) // local 10-digit format

export function SubscriptionInfoCard({ subInfo, hasPendingReceipt, onUpgrade, onCancel }: SubscriptionInfoCardProps) {
  if (!subInfo) {
    return (
      <Card className="border-amber-300 dark:border-amber-800 rounded-xl">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Sin Suscripción Asignada</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            No se encontró información de suscripción para tu tienda. Contacta al soporte para asignar un plan.
          </p>
          <div className="flex justify-center gap-2.5 mt-4">
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-all"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
            <a
              href={`tel:+57${SUPPORT_PHONE}`}
              className="inline-flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              {SUPPORT_PHONE}
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Trial Countdown Banner */}
      {subInfo.status === 'TRIAL' && subInfo.daysRemaining !== null && subInfo.daysRemaining > 0 && (
        <div className={`rounded-xl border p-5 ${
          subInfo.daysRemaining <= 3
            ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
            : subInfo.daysRemaining <= 5
            ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20'
            : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
              subInfo.daysRemaining <= 3
                ? 'bg-red-100 dark:bg-red-500/15'
                : subInfo.daysRemaining <= 5
                ? 'bg-amber-100 dark:bg-amber-500/15'
                : 'bg-emerald-100 dark:bg-emerald-500/15'
            }`}>
              <Clock className={`h-6 w-6 ${subInfo.daysRemaining <= 3 ? 'text-red-600 dark:text-red-400' : subInfo.daysRemaining <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-sm ${subInfo.daysRemaining <= 3 ? 'text-red-700 dark:text-red-300' : subInfo.daysRemaining <= 5 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                {subInfo.daysRemaining <= 3
                  ? `¡Tu prueba termina en ${subInfo.daysRemaining} día${subInfo.daysRemaining > 1 ? 's' : ''}!`
                  : subInfo.daysRemaining <= 5
                  ? `Período de prueba: ${subInfo.daysRemaining} días restantes`
                  : `Período de prueba activo — ${subInfo.daysRemaining} días restantes`}
              </h3>
              <p className="text-xs mt-1.5 text-muted-foreground">
                {subInfo.daysRemaining <= 3
                  ? 'Actualiza tu plan antes de que expire para no perder acceso al sistema.'
                  : 'Estás evaluando Ventify POS. Puedes actualizar tu plan en cualquier momento.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <Button
                  onClick={onUpgrade}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  disabled={hasPendingReceipt}
                >
                  <Crown className="h-3.5 w-3.5" />
                  {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Actualizar Plan'}
                </Button>
                <a
                  href={`tel:+57${SUPPORT_PHONE}`}
                  className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Llamar {SUPPORT_PHONE}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expired Banner */}
      {subInfo.status === 'EXPIRED' && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 bg-red-100 dark:bg-red-500/15 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-red-700 dark:text-red-300">Suscripción Expirada</h3>
              <p className="text-xs mt-1.5 text-red-600/70 dark:text-red-400/70">
                Tu plan {subInfo.planName} expiró el {subInfo.endDate ? new Date(subInfo.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}.
                Contacta al soporte para renovar y recuperar acceso completo al sistema.
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <Button
                  onClick={onUpgrade}
                  className="gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                  disabled={hasPendingReceipt}
                >
                  <Crown className="h-3.5 w-3.5" />
                  {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Renovar Plan'}
                </Button>
                <a
                  href={`tel:+57${SUPPORT_PHONE}`}
                  className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Llamar {SUPPORT_PHONE}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Details Card */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Mi Suscripción
              </CardTitle>
              <CardDescription className="mt-1">Información de tu plan actual</CardDescription>
            </div>
            <Badge className={
              subInfo.status === 'TRIAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20'
              : subInfo.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20'
              : subInfo.status === 'EXPIRED' || subInfo.status === 'CANCELLED' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20'
              : subInfo.status === 'PAST_DUE' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400'
            }>
              {subInfo.status === 'TRIAL' ? 'Prueba' : subInfo.status === 'ACTIVE' ? 'Activa' : subInfo.status === 'EXPIRED' ? 'Expirada' : subInfo.status === 'CANCELLED' ? 'Cancelada' : subInfo.status === 'PAST_DUE' ? 'Vencida' : subInfo.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Plan</p>
              <p className="text-sm font-semibold">{subInfo.planName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Precio</p>
              <p className="text-sm font-mono font-bold">
                {subInfo.planPrice === 0 ? 'Gratis' : `${formatCOP(subInfo.planPrice)}`}
                {subInfo.planPrice > 0 && <span className="text-xs text-muted-foreground font-normal">/mes</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Inicio</p>
              <p className="text-sm">{new Date(subInfo.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Vence</p>
              <p className="text-sm font-medium">
                {subInfo.endDate ? new Date(subInfo.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </p>
            </div>
          </div>

          {/* Days Remaining Progress Bar */}
          {subInfo.daysRemaining !== null && subInfo.daysRemaining > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">Tiempo restante</p>
                <p className={`text-xs font-bold ${
                  subInfo.daysRemaining <= 3 ? 'text-red-600 dark:text-red-400'
                  : subInfo.daysRemaining <= 5 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {subInfo.daysRemaining} día{subInfo.daysRemaining > 1 ? 's' : ''}
                </p>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    subInfo.daysRemaining <= 3 ? 'bg-red-500'
                    : subInfo.daysRemaining <= 5 ? 'bg-amber-500'
                    : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, (subInfo.daysRemaining / 7) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Active Plan — Upgrade CTA */}
          {(subInfo.status === 'ACTIVE' || subInfo.status === 'TRIAL' || subInfo.status === 'PAST_DUE') && (
            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/15">
              <p className="text-xs text-foreground font-medium">
                {subInfo.status === 'TRIAL'
                  ? 'Estás en período de prueba. Actualiza tu plan para acceder a todas las funciones.'
                  : subInfo.status === 'PAST_DUE'
                    ? 'Tu suscripción venció. Cambia tu plan para recuperar acceso completo.'
                    : '¿Necesitas más funcionalidades o cambiar tu plan?'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  onClick={onUpgrade}
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={hasPendingReceipt}
                >
                  <Crown className="h-3.5 w-3.5" />
                  {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Cambiar Plan'}
                </Button>
                <Button
                  onClick={onCancel}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Cancelar Suscripción
                </Button>
              </div>
            </div>
          )}

          {/* Cancelled State Info — with Self-Service Reactivation */}
          {subInfo.status === 'CANCELLED' && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">Suscripción Cancelada</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tu suscripción fue cancelada. Puedes reactivarla automáticamente seleccionando un plan y subiendo tu comprobante de pago.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  onClick={onUpgrade}
                  size="sm"
                  className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={hasPendingReceipt}
                >
                  <Crown className="h-3 w-3" />
                  {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Reactivar Suscripción'}
                </Button>
                <a
                  href={SUPPORT_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
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
