'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useAuthStore } from '@/stores/auth-store'
import { useLogin, fetchAuthInit } from '@/hooks/api/use-auth'
import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

import { SUPPORT_WHATSAPP, SUPPORT_PHONE } from './auth-constants'
import type { BlockedInfo } from './auth-constants'
import { AuthHero } from './auth-hero'
import { SetupWizard } from './setup-wizard'
import { LoginForm } from './login-form'
import { ResetPasswordDialog } from './reset-password-dialog'
import { PlansSection } from './plans-section'

export function AuthPage() {
  const { login } = useAuthStore()
  const [loginCedula, setLoginCedula] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo | null>(null)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetDialogKey, setResetDialogKey] = useState(0)

  const loginMutation = useLogin()
  const loading = loginMutation.isPending

  useEffect(() => {
    fetchAuthInit()
      .then((needsSetup) => {
        if (needsSetup) setNeedsSetup(true)
      })
      .catch(() => {
        // On total failure, don't lock user out
      })
      .finally(() => setInitializing(false))
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setBlockedInfo(null)
    try {
      const data = await loginMutation.mutateAsync({ cedula: loginCedula.trim(), password: loginPassword })
      login({ id: data.user.id, fullName: data.user.fullName ?? null, cedula: data.user.cedula, phone: data.user.phone ?? null, email: data.user.email ?? null, role: data.user.role ?? 'EMPLOYEE' }, data.store as any, data.token, data.permissions as any, data.isSuperAdmin, (data.subscription || null) as any, (data.availableStores || null) as any, data.csrfToken || null)
      if (data.isSuperAdmin) {
        toast.success('Bienvenido, Super Administrador')
      } else {
        toast.success(`¡Bienvenido${data.user.fullName ? ', ' + data.user.fullName : ''}!`)
      }
    } catch (err) {
      const error = err as Error & { data?: { error?: string; subscriptionStatus?: string; planName?: string; endDate?: string; retryAfter?: number }; status?: number }
      const data = error.data
      const status = error.status || 0
      if (data?.subscriptionStatus === 'EXPIRED' || data?.subscriptionStatus === 'CANCELLED' || data?.subscriptionStatus === 'NO_SUBSCRIPTION') {
        setBlockedInfo({
          subscriptionStatus: data.subscriptionStatus,
          planName: data.planName,
          endDate: data.endDate,
        })
        if (data.subscriptionStatus === 'NO_SUBSCRIPTION') {
          toast.error('Sin suscripción activa', {
            description: 'Tu cuenta no tiene un plan asignado. Contacta al soporte.',
            duration: 8000,
          })
        } else {
          toast.error('Suscripción expirada', {
            description: `Tu plan ${data.planName || ''} venció. Contacta soporte para renovar.`,
            duration: 8000,
          })
        }
      } else if (status === 429) {
        const retrySec = data?.retryAfter || 60
        toast.error('Demasiados intentos', {
          description: `Espere ${retrySec} segundos antes de intentar de nuevo.`,
          duration: retrySec * 1000,
        })
      } else {
        toast.error(data?.error || error.message || 'Error al iniciar sesión')
      }
    }
  }

  function handleResetSuccess(cedula: string) {
    setLoginCedula(cedula)
    setShowResetDialog(false)
  }

  function handleSetupComplete(cedula: string) {
    setNeedsSetup(false)
    setLoginCedula(cedula)
  }

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Verificando sistema...</p>
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return <SetupWizard onSetupComplete={handleSetupComplete} />
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">

      {/* ─── Top Navigation Bar ─── */}
      <div className="w-full border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Sebwen" width={32} height={32} className="object-contain" />
            <span className="font-bold text-base tracking-tight text-zinc-100">Sebwen POS</span>
          </div>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 px-3 py-1.5 rounded-full transition-colors border border-emerald-500/20"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Soporte WhatsApp</span>
            <span className="sm:hidden">Soporte</span>
          </a>
        </div>
      </div>

      {/* ─── Hero Section ─── */}
      <AuthHero />

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* LEFT: Login Section */}
          <LoginForm
            loading={loading}
            blockedInfo={blockedInfo}
            loginCedula={loginCedula}
            loginPassword={loginPassword}
            onLoginCedulaChange={setLoginCedula}
            onLoginPasswordChange={setLoginPassword}
            onLogin={handleLogin}
            onForgotPassword={() => { setResetDialogKey(k => k + 1); setShowResetDialog(true) }}
          />

          {/* RIGHT: Marketing / Plans Section */}
          <PlansSection />
        </div>
      </main>

      {/* ─── Reset Password Dialog ─── */}
      <ResetPasswordDialog
        key={resetDialogKey}
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        onResetSuccess={handleResetSuccess}
      />

      {/* ─── Footer ─── */}
      <footer className="border-t border-zinc-800/60 bg-zinc-950/60 backdrop-blur-sm mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-zinc-600">
          <span className="font-medium text-zinc-500">Sebwen POS</span>
          <span className="hidden sm:inline text-zinc-800">·</span>
          <span>Sistema de gestión multi-tienda · Colombia</span>
          <span className="hidden sm:inline text-zinc-800">·</span>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors font-medium"
          >
            <MessageCircle className="h-3 w-3" />
            Soporte: {SUPPORT_PHONE}
          </a>
        </div>
      </footer>
    </div>
  )
}
