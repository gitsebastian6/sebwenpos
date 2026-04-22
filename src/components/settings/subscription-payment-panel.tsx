'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Receipt,
  Loader2,
  Phone,
  MessageCircle,
  FileText,
  CreditCard,
  BadgeCheck,
  Percent,
  Info,
  Plus,
  AlertTriangle,
  Clock,
  Crown,
  ArrowRight,
  CheckCircle2,
  Send,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'

// ── Subscription Payment Panel ──
// Shows subscription info (Trial/Active/Expired) with countdown.
// Owners can upload payment receipts; Super Admin reviews them.

export interface PlanOption {
  id: number; name: string; description: string | null; price: number
  maxEmployees: number; maxProducts: number; features: Record<string, boolean>; isActive: boolean
}

export const BILLING_PERIODS = [
  { value: 'MONTHLY', label: 'Mensual', discount: 0 },
  { value: 'QUARTERLY', label: 'Trimestral', discount: 5 },
  { value: 'SEMI_ANNUAL', label: 'Semestral', discount: 10 },
  { value: 'ANNUAL', label: 'Anual', discount: 15 },
] as const

export function SubscriptionPaymentPanel() {
  const { store } = useAuthStore()
  const [subInfo, setSubInfo] = useState<{
    id: number; status: string; planName: string; planPrice: number
    startDate: string; endDate: string | null; billingPeriod: string; daysRemaining: number | null
  } | null>(null)
  const [receipts, setReceipts] = useState<Array<{
    id: number; fileName: string; amount: number; paymentMethod: string
    reference: string | null; notes: string | null; status: string
    reviewNotes: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string
  }>>([])
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [loading, setLoading] = useState(true)

  // ── Payment receipt upload state ──
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showPlanChangeDialog, setShowPlanChangeDialog] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<string>('MONTHLY')
  const [uploadAmount, setUploadAmount] = useState('')
  const [uploadReference, setUploadReference] = useState('')
  const [uploadMethod, setUploadMethod] = useState('NEQUI')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // ── Cancel subscription state ──
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // ── Proration preview state ──
  const [prorationInfo, setProrationInfo] = useState<{
    hasCredit: boolean
    currentPlan: { name: string; billingPrice: number; billingPeriod: string; daysRemaining: number }
    proration: { unusedDays: number; creditAmount: number; dailyRate: number } | null
    pricing: Array<{ period: string; label: string; months: number; discount: number; fullPrice: number; discountedPrice: number; prorationCredit: number; adjustedPrice: number }>
  } | null>(null)
  const [loadingProration, setLoadingProration] = useState(false)

  const loadSubInfo = useCallback(async () => {
    if (!store?.id) return
    try {
      const [subRes, receiptsRes, plansRes] = await Promise.all([
        fetch(`/api/subscription/current?storeId=${store.id}`),
        fetch(`/api/payment-receipts?storeId=${store.id}`),
        fetch('/api/subscription/plans'),
      ])
      if (subRes.ok) {
        const data = await subRes.json()
        if (data.hasSubscription) {
          setSubInfo({
            id: data.subscriptionId, status: data.subscriptionStatus, planName: data.planName, planPrice: data.planPrice,
            startDate: data.startDate, endDate: data.endDate, billingPeriod: data.billingPeriod, daysRemaining: data.daysRemaining,
          })
        }
      }
      if (receiptsRes.ok) {
        const rData = await receiptsRes.json()
        setReceipts(Array.isArray(rData) ? rData : [])
      }
      if (plansRes.ok) {
        const pData = await plansRes.json()
        setPlans(Array.isArray(pData) ? pData : [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [store?.id])

  useEffect(() => { loadSubInfo() }, [loadSubInfo])

  // Auto-refresh every 30 seconds to detect admin changes
  useEffect(() => {
    const interval = setInterval(() => { loadSubInfo() }, 30000)
    return () => clearInterval(interval)
  }, [loadSubInfo])

  const VENTIFY_SUPPORT_PHONE = '573012695457'
  const SUPPORT_WHATSAPP = `https://wa.me/${VENTIFY_SUPPORT_PHONE}?text=${encodeURIComponent('Hola, quiero actualizar mi plan de suscripción en Ventify POS')}`
  const SUPPORT_PHONE = VENTIFY_SUPPORT_PHONE.slice(2) // local 10-digit format

  // ── Upload receipt handler ──
  function resetUploadForm() {
    setUploadAmount('')
    setUploadReference('')
    setUploadMethod('NEQUI')
    setUploadNotes('')
    setUploadFile(null)
  }

  // ── Plan change: calculate price with discount ──
  function getPlanPrice(plan: PlanOption) {
    const period = BILLING_PERIODS.find(p => p.value === selectedBillingPeriod)
    const discount = period?.discount || 0
    const months = selectedBillingPeriod === 'MONTHLY' ? 1 : selectedBillingPeriod === 'QUARTERLY' ? 3 : selectedBillingPeriod === 'SEMI_ANNUAL' ? 6 : 12
    const fullPrice = plan.price * months
    return { fullPrice, discountedPrice: Math.round(fullPrice * (1 - discount / 100)), discount }
  }

  // ── Fetch proration preview when plan is selected ──
  useEffect(() => {
    if (!store?.id || !selectedPlanId) {
      setProrationInfo(null)
      return
    }
    let cancelled = false
    setLoadingProration(true)
    fetch(`/api/subscription/proration?storeId=${store.id}&targetPlanId=${selectedPlanId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled) setProrationInfo(data)
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoadingProration(false) })
    return () => { cancelled = true }
  }, [store?.id, selectedPlanId])

  // Override getPlanPrice to use proration-adjusted price
  function getPlanPriceWithProration(plan: PlanOption) {
    const period = BILLING_PERIODS.find(p => p.value === selectedBillingPeriod)
    const discount = period?.discount || 0
    const months = selectedBillingPeriod === 'MONTHLY' ? 1 : selectedBillingPeriod === 'QUARTERLY' ? 3 : selectedBillingPeriod === 'SEMI_ANNUAL' ? 6 : 12
    const fullPrice = plan.price * months
    const discountedPrice = Math.round(fullPrice * (1 - discount / 100))
    const credit = prorationInfo?.proration?.creditAmount || 0
    return {
      fullPrice,
      discountedPrice,
      adjustedPrice: Math.max(0, discountedPrice - credit),
      credit,
      discount,
    }
  }

  function openPlanChangeDialog() {
    setSelectedPlanId(null)
    setSelectedBillingPeriod('MONTHLY')
    setUploadAmount('')
    setUploadReference('')
    setUploadMethod('NEQUI')
    setUploadNotes('')
    setUploadFile(null)
    setShowPlanChangeDialog(true)
  }

  async function handlePlanChange(e: React.FormEvent) {
    e.preventDefault()
    if (!store?.id || !uploadFile || !selectedPlanId) {
      toast.error('Selecciona un plan y un comprobante')
      return
    }
    const amount = parseInt(uploadAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingresa el monto pagado')
      return
    }
    setUploading(true)
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
      const plan = plans.find(p => p.id === selectedPlanId)
      const res = await fetch(`/api/payment-receipts?storeId=${store.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: `data:${uploadFile.type};base64,${fileData}`,
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type,
          amount,
          reference: uploadReference || undefined,
          paymentMethod: uploadMethod,
          notes: uploadNotes || undefined,
          // Plan change metadata
          requestedPlanId: selectedPlanId,
          requestedPlanName: plan?.name,
          requestedBillingPeriod: selectedBillingPeriod,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al enviar solicitud')
        return
      }
      toast.success(`Solicitud de cambio a ${plan?.name} enviada. El administrador revisará tu comprobante.`)
      setShowPlanChangeDialog(false)
      loadSubInfo()
    } catch {
      toast.error('Error de conexión al enviar solicitud')
    } finally {
      setUploading(false)
    }
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
    setUploading(true)
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

      const res = await fetch(`/api/payment-receipts?storeId=${store.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: `data:${uploadFile.type};base64,${fileData}`,
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type,
          amount,
          reference: uploadReference || undefined,
          paymentMethod: uploadMethod,
          notes: uploadNotes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al subir comprobante')
        return
      }
      toast.success('Comprobante enviado correctamente. Será revisado por el administrador.')
      setShowUploadDialog(false)
      resetUploadForm()
      loadSubInfo()
    } catch {
      toast.error('Error de conexión al subir comprobante')
    } finally {
      setUploading(false)
    }
  }

  // ── Parse plan change request from receipt notes ──
  function parsePlanChangeNotes(notes: string | null) {
    if (!notes) return null
    try {
      const parsed = JSON.parse(notes)
      if (parsed.planChangeRequest && parsed.requestedPlanName) {
        return parsed as { planChangeRequest: boolean; requestedPlanId: number; requestedPlanName: string; requestedBillingPeriod: string; userNotes: string | null }
      }
    } catch { /* not JSON */ }
    return null
  }

  // ── Cancel subscription handler ──
  async function handleCancelSubscription() {
    if (!store?.id || cancelReason.trim().length < 5) {
      toast.error('Indica el motivo de cancelación (mínimo 5 caracteres)')
      return
    }
    setCancelling(true)
    try {
      const res = await fetch(`/api/subscription/cancel?storeId=${store.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelReason: cancelReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al cancelar suscripción')
        return
      }
      toast.success('Suscripción cancelada correctamente')
      setShowCancelDialog(false)
      setCancelReason('')
      loadSubInfo()
    } catch {
      toast.error('Error de conexión al cancelar suscripción')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const hasPendingReceipt = receipts.some(r => r.status === 'PENDING')

  return (
    <div className="space-y-6">
      {/* Subscription Info Card */}
      {subInfo ? (
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
                      onClick={openPlanChangeDialog}
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
                      onClick={openPlanChangeDialog}
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
                      onClick={openPlanChangeDialog}
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={hasPendingReceipt}
                    >
                      <Crown className="h-3.5 w-3.5" />
                      {hasPendingReceipt ? 'Solicitud Pendiente...' : 'Cambiar Plan'}
                    </Button>
                    <Button
                      onClick={() => setShowCancelDialog(true)}
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
                      onClick={openPlanChangeDialog}
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
      ) : (
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
      )}

      {/* Payment Receipts History */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Comprobantes de Pago
              </CardTitle>
              <CardDescription className="mt-1">Historial de comprobantes registrados</CardDescription>
            </div>
            {subInfo && !hasPendingReceipt && (
              <Button
                onClick={() => { resetUploadForm(); setShowUploadDialog(true) }}
                size="sm"
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Subir Comprobante
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm">No hay comprobantes registrados</p>
              <p className="text-xs mt-1">
                Sube tu comprobante de pago cuando realices el pago por tu plan elegido. El administrador lo revisará y activará tu suscripción.
              </p>
            </div>
          ) : (
            <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                  <BadgeCheck className="h-3 w-3" />Total Aprobado
                </div>
                <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCOP(receipts.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0))}
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Receipt className="h-3 w-3" />Comprobantes
                </div>
                <p className="text-lg font-bold">{receipts.length}</p>
              </div>
            </div>

            {/* Receipt Cards */}
            <div className="space-y-4">
              {receipts.map((r) => (
                <div key={r.id} className={`rounded-xl border p-4 ${
                  r.status === 'APPROVED'
                    ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/10'
                    : r.status === 'REJECTED'
                    ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/10'
                    : 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10'
                }`}>
                  {/* Top row: icon, amount, badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        r.status === 'APPROVED' ? 'bg-emerald-100 dark:bg-emerald-500/15'
                        : r.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-500/15'
                        : 'bg-amber-100 dark:bg-amber-500/15'
                      }`}>
                        {r.status === 'APPROVED' ? <BadgeCheck className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                         : r.status === 'REJECTED' ? <AlertTriangle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
                         : <Clock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold font-mono truncate ${
                          r.status === 'APPROVED' ? 'text-emerald-700 dark:text-emerald-300'
                          : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                          : 'text-foreground'
                        }`}>
                          {r.status === 'APPROVED' && '✅ Pago confirmado — '}{formatCOP(r.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.paymentMethod}{r.reference ? ` · Ref: ${r.reference}` : ''} · {new Date(r.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 text-[11px] font-semibold ${
                      r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20'
                      : r.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20'
                    }`}>
                      {r.status === 'APPROVED' ? 'Confirmado' : r.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                    </Badge>
                  </div>

                  {/* File name */}
                  {r.fileName && (
                    <div className="flex items-center gap-1.5 mt-2.5 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{r.fileName}</span>
                    </div>
                  )}

                  {/* Plan Change Request Badge */}
                  {(() => {
                    const planChange = parsePlanChangeNotes(r.notes)
                    if (!planChange) return null
                    return (
                      <div className={`mt-2.5 p-2.5 rounded-lg border ${
                        r.status === 'APPROVED'
                          ? 'bg-violet-50 dark:bg-violet-500/5 border-violet-200/60 dark:border-violet-800/30'
                          : r.status === 'REJECTED'
                          ? 'bg-red-50 dark:bg-red-500/5 border-red-200/60 dark:border-red-800/30'
                          : 'bg-sky-50 dark:bg-sky-500/5 border-sky-200/60 dark:border-sky-800/30'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <ArrowRight className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                          <p className={`text-xs font-semibold ${
                            r.status === 'APPROVED' ? 'text-violet-700 dark:text-violet-300'
                            : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                            : 'text-sky-700 dark:text-sky-300'
                          }`}>
                            Solicitud de cambio a {planChange.requestedPlanName}
                          </p>
                        </div>
                        {planChange.userNotes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 italic">&quot;{planChange.userNotes}&quot;</p>
                        )}
                        {r.status === 'PENDING' && (
                          <p className="text-[11px] text-sky-600/70 dark:text-sky-400/60 mt-0.5">
                            Esperando aprobación del administrador para activar el nuevo plan.
                          </p>
                        )}
                        {r.status === 'APPROVED' && (
                          <p className="text-[11px] text-violet-600/70 dark:text-violet-400/60 mt-0.5">
                            ✅ Cambio de plan aprobado y aplicado.
                          </p>
                        )}
                        {r.status === 'REJECTED' && (
                          <p className="text-[11px] text-red-600/70 dark:text-red-400/60 mt-0.5">
                            Solicitud rechazada. Puedes intentar nuevamente.
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Status-specific detail messages */}
                  {r.status === 'APPROVED' && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-100/60 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-800/30">
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                        ✅ Pago verificado por administrador
                      </p>
                      {r.reviewedAt && (
                        <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
                          Confirmado el {new Date(r.reviewedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {r.reviewNotes && r.reviewedBy !== 'SUPER_ADMIN' && (
                        <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5 italic">{r.reviewNotes}</p>
                      )}
                    </div>
                  )}

                  {r.status === 'PENDING' && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-amber-100/60 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-800/30">
                      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                        ⏳ En revisión
                      </p>
                      <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                        El administrador verificará tu pago y activará tu suscripción. Esto puede tardar unas horas.
                      </p>
                    </div>
                  )}

                  {r.status === 'REJECTED' && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-red-100/60 dark:bg-red-500/10 border border-red-200/60 dark:border-red-800/30">
                      <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                        ❌ Pago rechazado
                      </p>
                      {r.reviewNotes && (
                        <p className="text-[11px] text-red-600/70 dark:text-red-400/60 mt-0.5">
                          Motivo: {r.reviewNotes}
                        </p>
                      )}
                      {r.reviewedAt && (
                        <p className="text-[11px] text-red-600/60 dark:text-red-400/50 mt-0.5">
                          Revisado el {new Date(r.reviewedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                      <a
                        href={SUPPORT_WHATSAPP}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 font-semibold mt-1.5 hover:underline"
                      >
                        <MessageCircle className="h-3 w-3" />
                        Contactar soporte para resolver
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Funcionalidad</th>
                    {plans.filter(p => p.isActive).map(plan => (
                      <th key={plan.id} className={`text-center py-2 px-3 font-bold ${subInfo?.planName === plan.name ? 'text-primary' : ''}`}>
                        {plan.name}
                        {subInfo?.planName === plan.name && (
                          <div className="text-[10px] font-normal text-primary/70 mt-0.5">Plan Actual</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4 text-muted-foreground">Precio/mes</td>
                    {plans.filter(p => p.isActive).map(plan => (
                      <td key={plan.id} className="text-center py-2.5 px-3 font-mono font-bold">
                        {plan.price === 0 ? 'Gratis' : formatCOP(plan.price)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4 text-muted-foreground">Empleados</td>
                    {plans.filter(p => p.isActive).map(plan => (
                      <td key={plan.id} className="text-center py-2.5 px-3 font-semibold">
                        {plan.maxEmployees === -1 ? '∞' : plan.maxEmployees}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4 text-muted-foreground">Productos</td>
                    {plans.filter(p => p.isActive).map(plan => (
                      <td key={plan.id} className="text-center py-2.5 px-3 font-semibold">
                        {plan.maxProducts === -1 ? '∞' : plan.maxProducts}
                      </td>
                    ))}
                  </tr>
                  {[
                    { key: 'electronicInvoicing', label: 'Facturación Electrónica' },
                    { key: 'multiStore', label: 'Multi-Tienda' },
                    { key: 'reports', label: 'Reportes Avanzados' },
                    { key: 'advancedInventory', label: 'Inventario Avanzado' },
                    { key: 'api', label: 'Acceso API' },
                    { key: 'customBranding', label: 'Branding Personalizado' },
                    { key: 'multiCurrency', label: 'Multi-Moneda' },
                  ].map(feature => (
                    <tr key={feature.key} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 text-muted-foreground">{feature.label}</td>
                      {plans.filter(p => p.isActive).map(plan => (
                        <td key={plan.id} className="text-center py-2.5 px-3">
                          {plan.features[feature.key] ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription History + Billing History */}
      <SubscriptionHistoryPanel />

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancelar Suscripción
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas cancelar tu suscripción? Esta acción es irreversible y perderás acceso a las funciones de tu plan actual al finalizar el período.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason" className="text-sm font-semibold">
                Motivo de cancelación <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel-reason"
                placeholder="Cuéntanos por qué deseas cancelar (mínimo 5 caracteres)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Tu motivo nos ayuda a mejorar Ventify POS.
              </p>
            </div>
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancelSubscription() }}
              disabled={cancelling || cancelReason.trim().length < 5}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Cancelando...</>
              ) : (
                'Sí, Cancelar Suscripción'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Plan Change Dialog */}
      <Dialog open={showPlanChangeDialog} onOpenChange={setShowPlanChangeDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              Cambiar Plan de Suscripción
            </DialogTitle>
            <DialogDescription>
              Selecciona el plan deseado y sube tu comprobante de pago. El administrador revisará y aprobará tu solicitud.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePlanChange}>
            <div className="space-y-5 py-2">
              {/* Plan Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">1. Selecciona tu plan</Label>
                <div className="grid gap-2">
                  {plans.filter(p => p.isActive && p.price > 0).map(plan => {
                    const isSelected = selectedPlanId === plan.id
                    const { fullPrice, discountedPrice, discount, credit, adjustedPrice } = selectedPlanId === plan.id ? getPlanPriceWithProration(plan) : { fullPrice: 0, discountedPrice: 0, discount: 0, credit: 0, adjustedPrice: 0 }
                    const isCurrentPlan = subInfo?.planName === plan.name
                    return (
                      <button
                        type="button"
                        key={plan.id}
                        onClick={() => {
                          setSelectedPlanId(plan.id)
                          if (plan.price === 0) setSelectedBillingPeriod('TRIAL')
                        }}
                        className={`w-full text-left rounded-xl border-2 p-3.5 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:border-primary/30 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold">{plan.name}</p>
                              {isCurrentPlan && <Badge className="text-[10px] px-1.5 py-0">Actual</Badge>}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {plan.maxEmployees === -1 ? '∞' : plan.maxEmployees} empleados · {plan.maxProducts === -1 ? '∞' : plan.maxProducts} productos
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold font-mono">{formatCOP(plan.price)}<span className="text-[10px] font-normal text-muted-foreground">/mes</span></p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 space-y-1">
                            {discount > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Descuento del {discount}% por pago anticipado — {formatCOP(discountedPrice)}
                              </div>
                            )}
                            {credit > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-sky-600 dark:text-sky-400">
                                <Percent className="h-3 w-3" />
                                Crédito por {prorationInfo?.proration?.unusedDays || 0} días no usados: -{formatCOP(credit)}
                                <span className="font-semibold text-foreground ml-1">→ {formatCOP(adjustedPrice)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Proration Credit Banner */}
              {selectedPlanId && prorationInfo?.hasCredit && prorationInfo.proration && !loadingProration && (
                <div className="rounded-lg border border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/20 p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                      <Percent className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-sky-700 dark:text-sky-300">Prorrateo por cambio de plan</p>
                      <p className="text-[11px] text-sky-600/80 dark:text-sky-400/80">
                        Tienes {prorationInfo.proration.unusedDays} días restantes de tu plan <strong>{prorationInfo.currentPlan.name}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="text-center p-2 rounded-md bg-white/60 dark:bg-white/5">
                      <p className="text-[10px] text-muted-foreground">Días restantes</p>
                      <p className="text-sm font-bold font-mono text-sky-700 dark:text-sky-300">{prorationInfo.proration.unusedDays}</p>
                    </div>
                    <div className="text-center p-2 rounded-md bg-white/60 dark:bg-white/5">
                      <p className="text-[10px] text-muted-foreground">Crédito diario</p>
                      <p className="text-sm font-bold font-mono text-sky-700 dark:text-sky-300">{formatCOP(prorationInfo.proration.dailyRate)}</p>
                    </div>
                    <div className="text-center p-2 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/30">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Total crédito</p>
                      <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">-{formatCOP(prorationInfo.proration.creditAmount)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-sky-600/70 dark:text-sky-400/60 text-center">
                    El crédito se aplicará automáticamente sobre el precio del nuevo plan al ser aprobado.
                  </p>
                </div>
              )}

              {loadingProration && selectedPlanId && (
                <div className="flex items-center gap-2 justify-center py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Calculando prorrateo...
                </div>
              )}

              {/* Billing Period */}
              {selectedPlanId && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">2. Período de facturación</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {BILLING_PERIODS.map(period => {
                      const plan = plans.find(p => p.id === selectedPlanId)
                      if (!plan) return null
                      const { discountedPrice, adjustedPrice } = getPlanPriceWithProration(plan)
                      const periodPrice = selectedBillingPeriod === period.value
                        ? discountedPrice
                        : Math.round(plan.price * (period.value === 'MONTHLY' ? 1 : period.value === 'QUARTERLY' ? 3 : period.value === 'SEMI_ANNUAL' ? 6 : 12) * (1 - period.discount / 100))
                      const showCredit = selectedBillingPeriod === period.value && prorationInfo?.hasCredit
                      return (
                        <button
                          key={period.value}
                          type="button"
                          onClick={() => setSelectedBillingPeriod(period.value)}
                          className={`rounded-lg border-2 p-2.5 text-left transition-all ${
                            selectedBillingPeriod === period.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/20'
                          }`}
                        >
                          <p className="text-xs font-semibold">{period.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatCOP(periodPrice)}
                            {period.discount > 0 && <span className="text-emerald-600 dark:text-emerald-400 ml-1">-{period.discount}%</span>}
                          </p>
                          {showCredit && (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                              Con crédito: {formatCOP(adjustedPrice)}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Comprobante Upload */}
              {selectedPlanId && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">3. Comprobante de pago <span className="text-destructive">*</span></Label>
                  <p className="text-[11px] text-muted-foreground">
                    Sube la captura o foto de tu pago. El administrador lo verificará para activar tu nuevo plan.
                  </p>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="plan-change-file"
                    />
                    <label htmlFor="plan-change-file" className="flex items-center justify-center gap-3 p-4 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="plan-amount" className="text-xs">Monto pagado (COP) <span className="text-destructive">*</span></Label>
                      <Input id="plan-amount" type="number" placeholder="69900" value={uploadAmount} onChange={(e) => setUploadAmount(e.target.value)} min={1} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Método de pago</Label>
                      <select
                        value={uploadMethod}
                        onChange={(e) => setUploadMethod(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="NEQUI">Nequi</option>
                        <option value="DAVIPLATA">Daviplata</option>
                        <option value="BANCOLOMBIA">Bancolombia</option>
                        <option value="BANCARY">Bancario</option>
                        <option value="EFFECTIVE">Efectivo</option>
                        <option value="OTHER">Otro</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plan-ref" className="text-xs">Referencia (opcional)</Label>
                    <Input id="plan-ref" placeholder="Número de transacción" value={uploadReference} onChange={(e) => setUploadReference(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plan-notes" className="text-xs">Notas (opcional)</Label>
                    <Textarea id="plan-notes" placeholder="Información adicional" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={2} />
                  </div>

                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Tu solicitud quedará en estado <strong>Pendiente</strong> hasta que el administrador verifique tu pago. Recibirás los beneficios del nuevo plan una vez aprobado.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => setShowPlanChangeDialog(false)} disabled={uploading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={uploading || !selectedPlanId || !uploadFile || !uploadAmount}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-1.5" /> Enviar Solicitud</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload Receipt Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Subir Comprobante de Pago
            </DialogTitle>
            <DialogDescription>
              Adjunta la captura o foto del comprobante de tu pago. Será revisado por el administrador.
            </DialogDescription>
          </DialogHeader>
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
    </div>
  )
}

// ── Subscription History & Billing History Panel ──
function SubscriptionHistoryPanel() {
  const { store } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'history' | 'billing'>('history')
  const [history, setHistory] = useState<Array<{
    id: number; eventType: string; eventLabel: string
    previousStatus: string | null; newStatus: string | null
    previousPlanName: string | null; newPlanName: string | null
    description: string | null; metadata: Record<string, unknown>; createdAt: string
  }>>([])
  const [billing, setBilling] = useState<{
    items: Array<{
      id: number; planName: string; billingPeriod: string
      amountFormatted: string; prorationCreditFormatted: string | null; netAmountFormatted: string
      status: string; statusLabel: string; paymentMethod: string | null
      periodStart: string; periodEnd: string; notes: string | null; createdAt: string
    }>
    summary: { totalBilledFormatted: string; totalPaidFormatted: string; totalCreditsFormatted: string; recordCount: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!store?.id) return
    Promise.all([
      fetch(`/api/subscription/history?storeId=${store.id}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/subscription/billing-history?storeId=${store.id}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([hData, bData]) => {
      setHistory(Array.isArray(hData) ? hData : [])
      setBilling(bData)
    }).finally(() => setLoading(false))
  }, [store?.id])

  if (loading) {
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
              <div className="grid grid-cols-3 gap-3 mb-4">
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
