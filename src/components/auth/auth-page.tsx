'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import {
  useLogin, useSetup, useResetPasswordStep1, useResetPasswordStep2,
  useSendOtp, useVerifyOtp,
  fetchOtpStatus, fetchAuthInit,
} from '@/hooks/api/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'
import {
  Store, CreditCard, Lock, Eye, EyeOff, Phone, MessageCircle,
  Check, Zap, Shield, Package, Star, Crown, Clock, Mail,
  AlertTriangle, ArrowRight, LogIn, ChevronRight, Sparkles,
  TrendingUp, BarChart3, ShoppingCart, Receipt, Headphones,
  KeyRound, ArrowLeft, Smartphone, Hash,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

const SUPPORT_PHONE = '3012695457'
const SUPPORT_WHATSAPP = `https://wa.me/57${SUPPORT_PHONE}?text=Hola%2C%20necesito%20informaci%C3%B3n%20sobre%20Ventify%20POS`

const PLANS = [
  {
    name: 'Trial',
    price: 'Gratis',
    period: '7 días',
    description: 'Evalúa el sistema completo sin compromiso',
    features: ['Hasta 50 productos', 'Hasta 3 empleados', 'Punto de venta', 'Inventario básico'],
    highlight: false,
    icon: Sparkles,
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    bgIcon: 'bg-amber-500/10',
  },
  {
    name: 'Pro',
    price: '$89.900',
    period: '/mes',
    description: 'Para negocios en crecimiento',
    features: ['Hasta 500 productos', 'Hasta 15 empleados', 'Facturación electrónica DIAN', 'Reportes avanzados', 'Soporte por email'],
    highlight: false,
    icon: TrendingUp,
    color: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bgIcon: 'bg-emerald-500/10',
  },
  {
    name: 'Empresarial',
    price: '$249.000',
    period: '/mes',
    description: 'Solución completa multi-tienda',
    features: ['Hasta 10 sucursales', 'Productos ilimitados', 'Multi-tienda', 'API personalizada', 'Soporte dedicado'],
    highlight: true,
    icon: Crown,
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bgIcon: 'bg-purple-500/10',
  },
]

const FEATURES_HIGHLIGHTS = [
  { icon: ShoppingCart, label: 'Punto de Venta', desc: 'Rápido e intuitivo' },
  { icon: Package, label: 'Inventario', desc: 'Control total' },
  { icon: Receipt, label: 'Facturación', desc: 'Electrónica DIAN' },
  { icon: BarChart3, label: 'Reportes', desc: 'En tiempo real' },
]

interface BlockedInfo {
  subscriptionStatus: string
  planName?: string
  endDate?: string
}

export function AuthPage() {
  const { login } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [loginCedula, setLoginCedula] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo | null>(null)

  // ─── TanStack Query mutations ───
  const loginMutation = useLogin()
  const setupMutation = useSetup()
  const resetStep1Mutation = useResetPasswordStep1()
  const resetStep2Mutation = useResetPasswordStep2()
  const sendOtpMutation = useSendOtp()
  const verifyOtpMutation = useVerifyOtp()
  const loading = loginMutation.isPending
  const setupLoading = setupMutation.isPending
  const resetLoading = resetStep1Mutation.isPending || resetStep2Mutation.isPending || sendOtpMutation.isPending || verifyOtpMutation.isPending

  // ─── Forgot password state ───
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetStep, setResetStep] = useState<'cedula' | 'question' | 'whatsapp-verify'>('cedula')
  const [resetMethod, setResetMethod] = useState<'security' | 'whatsapp'>('security')
  const [resetCedula, setResetCedula] = useState('')
  const [resetUserId, setResetUserId] = useState<number | null>(null)
  const [resetQuestion, setResetQuestion] = useState('')
  const [resetAnswer, setResetAnswer] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resetShowPass, setResetShowPass] = useState(false)
  // ── WhatsApp OTP state ──
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpSentTo, setOtpSentTo] = useState('')
  const [otpTestCode, setOtpTestCode] = useState('')
  const [otpResendTimer, setOtpResendTimer] = useState(0)
  const otpTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Setup form state ───
  const [setupCedula, setSetupCedula] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')
  const [setupFullName, setSetupFullName] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupShowPass, setSetupShowPass] = useState(false)

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

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (setupPassword !== setupConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (setupPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    try {
      await setupMutation.mutateAsync({
        cedula: setupCedula.trim(),
        password: setupPassword,
        fullName: setupFullName.trim(),
        email: setupEmail.trim(),
      })
      toast.success('Super Administrador creado. Ya puede iniciar sesión.')
      setNeedsSetup(false)
      setLoginCedula(setupCedula.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  // ── Check WhatsApp OTP availability on mount ──
  useEffect(() => {
    fetchOtpStatus().then(setWhatsappEnabled)
    return () => { if (otpTimerRef.current) clearInterval(otpTimerRef.current) }
  }, [])

  // ─── Reset password handlers ───
  function openResetDialog() {
    setResetStep('cedula')
    setResetMethod('security')
    setResetCedula('')
    setResetUserId(null)
    setResetQuestion('')
    setResetAnswer('')
    setResetNewPassword('')
    setResetConfirmPassword('')
    setResetShowPass(false)
    setOtpCode('')
    setOtpSentTo('')
    setOtpTestCode('')
    setOtpResendTimer(0)
    if (otpTimerRef.current) clearInterval(otpTimerRef.current)
    setShowResetDialog(true)
  }

  async function handleResetStep1(e: React.FormEvent) {
    e.preventDefault()
    if (!resetCedula.trim()) {
      toast.error('Ingresa tu número de cédula')
      return
    }
    try {
      const data = await resetStep1Mutation.mutateAsync({ cedula: resetCedula.trim() })
      setResetUserId(data.userId)
      setResetQuestion(data.question)
      setResetStep('question')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  async function handleResetStep2(e: React.FormEvent) {
    e.preventDefault()
    if (resetNewPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (!resetUserId) return
    try {
      await resetStep2Mutation.mutateAsync({
        userId: resetUserId,
        answer: resetAnswer,
        newPassword: resetNewPassword,
      })
      toast.success('Contraseña restablecida correctamente')
      setShowResetDialog(false)
      setLoginCedula(resetCedula.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  // ── WhatsApp OTP handlers ──
  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    if (!resetCedula.trim()) { toast.error('Ingresa tu número de cédula'); return }
    try {
      const data = await sendOtpMutation.mutateAsync({ cedula: resetCedula.trim() })
      setResetUserId(data.userId)
      setOtpSentTo(data.maskedPhone)
      setOtpTestCode(data.testCode || '')
      setOtpCode('')
      setResetStep('whatsapp-verify')
      setOtpResendTimer(60)
      if (otpTimerRef.current) clearInterval(otpTimerRef.current)
      otpTimerRef.current = setInterval(() => {
        setOtpResendTimer(prev => {
          if (prev <= 1) { if (otpTimerRef.current) clearInterval(otpTimerRef.current); return 0 }
          return prev - 1
        })
      }, 1000)
      if (data.testMode) {
        toast.success('Código generado (modo pruebas)')
      } else {
        toast.success('Código enviado por WhatsApp')
      }
    } catch (err) {
      const error = err as Error & { data?: { enabled?: boolean } }
      if (error.data?.enabled === false) {
        toast.error('WhatsApp OTP no disponible. Usa pregunta de seguridad.')
        setResetMethod('security')
      } else {
        toast.error(error instanceof Error ? error.message : 'Error de conexión')
      }
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    if (otpCode.length !== 6) { toast.error('Ingresa el código de 6 dígitos'); return }
    if (resetNewPassword.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
    if (resetNewPassword !== resetConfirmPassword) { toast.error('Las contraseñas no coinciden'); return }
    if (!resetUserId) return
    try {
      await verifyOtpMutation.mutateAsync({ userId: resetUserId, otp: otpCode, newPassword: resetNewPassword })
      toast.success('Contraseña restablecida correctamente')
      if (otpTimerRef.current) clearInterval(otpTimerRef.current)
      setShowResetDialog(false)
      setLoginCedula(resetCedula.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setBlockedInfo(null)
    try {
      const data = await loginMutation.mutateAsync({ cedula: loginCedula.trim(), password: loginPassword })
      login(data.user, data.store, data.token, data.permissions, data.isSuperAdmin, data.subscription || null, data.availableStores || null)
      if (data.isSuperAdmin) {
        toast.success('Bienvenido, Super Administrador')
      } else {
        toast.success(`¡Bienvenido${data.user.fullName ? ', ' + data.user.fullName : ''}!`)
      }
    } catch (err) {
      const error = err as Error & { data?: { subscriptionStatus?: string; planName?: string; endDate?: string; retryAfter?: number }; status?: number }
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

  // ═══════════════════════════════════════════════════════
  // FIRST-TIME SETUP WIZARD
  // ═══════════════════════════════════════════════════════
  if (needsSetup) {
    return (
      <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
        <div className="w-full border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center overflow-hidden bg-zinc-950 animate-[logo-pulse_3s_ease-in-out_infinite]">
              <Image src="/logo.png" alt="Ventify" width={40} height={40} className="object-contain animate-[logo-float_4s_ease-in-out_infinite,logo-glow_3s_ease-in-out_infinite]" />
            </div>
            <span className="font-bold text-base tracking-tight text-zinc-100">Ventify POS</span>
            <Badge className="ml-2 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-bold">PRIMER ACCESO</Badge>
          </div>
        </div>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-[480px] mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center h-16 w-16 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 mb-4">
                <Shield className="h-8 w-8 text-emerald-400" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50">
                Configurar Super Administrador
              </h1>
              <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto">
                Es la primera vez que se accede al sistema. Cree la cuenta de Super Administrador con sus credenciales personales.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm shadow-2xl shadow-black/20 overflow-hidden">
              <form onSubmit={handleSetup}>
                <div className="p-6 sm:p-8 space-y-5">
                  {/* Full Name */}
                  <div className="space-y-2">
                    <Label htmlFor="setup-name" className="text-sm font-medium text-zinc-400">Nombre completo</Label>
                    <div className="relative group">
                      <Zap className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input
                        id="setup-name"
                        placeholder="Juan Pérez"
                        value={setupFullName}
                        onChange={(e) => setSetupFullName(e.target.value)}
                        className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Cedula */}
                  <div className="space-y-2">
                    <Label htmlFor="setup-cedula" className="text-sm font-medium text-zinc-400">Identificación / Cédula</Label>
                    <div className="relative group">
                      <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input
                        id="setup-cedula"
                        placeholder="1098765432"
                        value={setupCedula}
                        onChange={(e) => setSetupCedula(e.target.value)}
                        className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                        required
                      />
                    </div>
                    <p className="text-xs text-zinc-600 ml-1">Será su usuario para iniciar sesión</p>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="setup-email" className="text-sm font-medium text-zinc-400">Email (opcional)</Label>
                    <div className="relative group">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input
                        id="setup-email"
                        type="email"
                        placeholder="admin@mitienda.com"
                        value={setupEmail}
                        onChange={(e) => setSetupEmail(e.target.value)}
                        className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="setup-password" className="text-sm font-medium text-zinc-400">Contraseña</Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input
                        id="setup-password"
                        type={setupShowPass ? 'text' : 'password'}
                        placeholder="Mínimo 8 caracteres"
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        className="pl-11 pr-12 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setSetupShowPass(!setupShowPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 p-1 rounded-md hover:bg-zinc-800 transition-all"
                        aria-label={setupShowPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {setupShowPass ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-600 ml-1">Mínimo 8 caracteres. Use una contraseña segura.</p>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="setup-confirm" className="text-sm font-medium text-zinc-400">Confirmar contraseña</Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input
                        id="setup-confirm"
                        type={setupShowPass ? 'text' : 'password'}
                        placeholder="Repita la contraseña"
                        value={setupConfirm}
                        onChange={(e) => setSetupConfirm(e.target.value)}
                        className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 pt-0">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold rounded-lg gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 transition-all active:scale-[0.98] border-0"
                    disabled={setupLoading}
                  >
                    {setupLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Creando cuenta...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4.5 w-4.5" />
                        Crear Super Administrador
                      </>
                    )}
                  </Button>

                  <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
                    <p className="text-xs text-amber-400/80 text-center">
                      <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                      Esta cuenta tiene acceso total al sistema. Guarde sus credenciales de forma segura.
                    </p>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </main>

        <footer className="border-t border-zinc-800/60 bg-zinc-950/60 backdrop-blur-sm mt-auto">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-zinc-600">
            <span className="font-medium text-zinc-500">Ventify POS</span>
            <span className="text-zinc-800">·</span>
            <span>Sistema de gestión multi-tienda · Colombia</span>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">

      {/* ─── Top Navigation Bar ─── */}
      <div className="w-full border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Ventify" width={32} height={32} className="object-contain" />
            <span className="font-bold text-base tracking-tight text-zinc-100">Ventify POS</span>
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

      {/* ─── Hero Logo Section ─── */}
      <div className="relative overflow-hidden border-b border-zinc-800/40">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/[0.05] rounded-full blur-[140px]" />
          <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[250px] bg-purple-500/[0.03] rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-[300px] h-[200px] bg-emerald-500/[0.02] rounded-full blur-[80px]" />
        </div>

        {/* Full-banner background watermark logo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <Image
            src="/logo.png"
            alt=""
            fill
            className="object-contain opacity-[0.07] blur-[0.5px] scale-150 lg:scale-[2]"
            aria-hidden="true"
          />
        </div>

        {/* Scanline overlay */}
        <div className="scanline-overlay" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-14">
          <div className="flex flex-col items-center text-center relative">

            {/* Logo + Brand combined */}
            <div className="relative flex items-center justify-center gap-4 sm:gap-5 mb-5">

              {/* Main Logo - no square, big and clean */}
              <div className="relative glitch-logo-img">
                <Image
                  src="/logo.png"
                  alt="Ventify POS"
                  width={120}
                  height={120}
                  className="object-contain drop-shadow-[0_0_30px_rgba(114,210,180,0.2)] sm:h-[140px] sm:w-auto lg:h-[160px] lg:w-auto"
                  priority
                />
              </div>

              {/* Brand text */}
              <div className="relative">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-zinc-50 leading-none glitch-text">
                  Ventify
                </h1>
                <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight mt-0.5">
                  <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
                    POS
                  </span>
                </p>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-sm sm:text-base text-zinc-400 max-w-lg mb-6 relative">
              El sistema de punto de venta que tu negocio merece
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 relative">
              {FEATURES_HIGHLIGHTS.map((f, i) => (
                <div
                  key={f.label}
                  className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-zinc-900/50 border border-zinc-800/40 hover:border-emerald-500/20 hover:bg-zinc-900/70 transition-all duration-300 group cursor-default"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                    <f.icon className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-bold text-zinc-200 leading-tight">{f.label}</span>
                    <span className="text-[10px] text-zinc-500 leading-tight">{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* ═══════════════════════════════════════════
              LEFT: Login Section
              ═══════════════════════════════════════════ */}
          <div className="w-full max-w-[440px] mx-auto lg:mx-0">
            {/* Welcome Header */}
            <div className="mb-8 text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start gap-2 bg-emerald-500/10 text-emerald-400 rounded-full px-3.5 py-1.5 text-xs font-semibold mb-4 border border-emerald-500/20">
                <Zap className="h-3.5 w-3.5" />
                Tu negocio, simplificado
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-50">
                Inicia sesión en tu cuenta
              </h1>
              <p className="text-base text-zinc-500 mt-2.5 max-w-sm mx-auto lg:mx-0">
                Ingresa tus credenciales para acceder al punto de venta y gestión de tu negocio.
              </p>
            </div>

            {/* Subscription Blocked Alert (expired, cancelled, or no subscription) */}
            {blockedInfo && (
              <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] backdrop-blur-sm p-5">
                  <div className="flex items-start gap-3.5">
                    <div className="h-10 w-10 bg-red-500/15 rounded-xl flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {blockedInfo.subscriptionStatus === 'NO_SUBSCRIPTION' ? (
                        <>
                          <h3 className="font-bold text-red-400 text-sm">Sin Suscripción Activa</h3>
                          <p className="text-sm text-red-300/70 mt-1.5 leading-relaxed">
                            Tu cuenta no tiene un plan de suscripción asignado. Sin un plan activo no es posible acceder al sistema.
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="font-bold text-red-400 text-sm">Suscripción {blockedInfo.subscriptionStatus === 'CANCELLED' ? 'Cancelada' : 'Expirada'}</h3>
                          <p className="text-sm text-red-300/70 mt-1.5 leading-relaxed">
                            {blockedInfo.planName && blockedInfo.endDate ? (
                              <>
                                Tu plan <span className="font-bold text-red-300">{blockedInfo.planName}</span>{' '}
                                {blockedInfo.subscriptionStatus === 'CANCELLED' ? 'fue cancelada' : `venció el ${new Date(blockedInfo.endDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`}.
                              </>
                            ) : (
                              'Tu suscripción no está activa.'
                            )}
                          </p>
                        </>
                      )}
                      <p className="text-sm text-red-400/60 mt-2 font-medium">
                        Contacta a soporte para {blockedInfo.subscriptionStatus === 'NO_SUBSCRIPTION' ? 'asignar un plan' : 'renovar y recuperar acceso'}.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
                        <a
                          href={SUPPORT_WHATSAPP}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-5 py-2.5 transition-all shadow-sm shadow-emerald-600/20"
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp Soporte
                        </a>
                        <a
                          href={`tel:+57${SUPPORT_PHONE}`}
                          className="inline-flex items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-semibold rounded-lg px-5 py-2.5 hover:bg-zinc-700 transition-colors"
                        >
                          <Phone className="h-4 w-4" />
                          {SUPPORT_PHONE}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Login Card */}
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm shadow-2xl shadow-black/20 overflow-hidden">
              <form onSubmit={handleLogin}>
                <div className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-11 w-11 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                      <LogIn className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg text-zinc-100">Acceso al sistema</h2>
                      <p className="text-xs text-zinc-500">Datos de tu cuenta</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* Cedula Field */}
                    <div className="space-y-2">
                      <Label htmlFor="login-cedula" className="text-sm font-medium text-zinc-400">
                        Identificación / Cédula
                      </Label>
                      <div className="relative group">
                        <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                        <Input
                          id="login-cedula"
                          placeholder="1098765432"
                          value={loginCedula}
                          onChange={(e) => setLoginCedula(e.target.value)}
                          className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                          autoFocus
                          required
                        />
                      </div>
                      <p className="text-xs text-zinc-600 ml-1">Ingresa tu número de cédula o identificación</p>
                    </div>

                    {/* Password Field */}
                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-sm font-medium text-zinc-400">
                        Contraseña
                      </Label>
                      <div className="relative group">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                        <Input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-11 pr-12 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 p-1 rounded-md hover:bg-zinc-800 transition-all"
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                        </button>
                      </div>
                      <p className="text-xs text-zinc-600 ml-1">Ingresa tu contraseña de acceso</p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800/60" />

                {/* Submit + Support */}
                <div className="p-6 sm:p-8 pt-5 space-y-5">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold rounded-lg gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 transition-all active:scale-[0.98] border-0"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Ingresando...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4.5 w-4.5" />
                        Iniciar Sesión
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>

                  {/* Forgot password link */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={openResetDialog}
                      className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-emerald-400 transition-colors group"
                    >
                      <KeyRound className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>

                  {/* Support link */}
                  <div className="text-center">
                    <a
                      href={SUPPORT_WHATSAPP}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-emerald-400 transition-colors group"
                    >
                      <Headphones className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                      ¿Necesitas ayuda? Escríbenos por WhatsApp
                      <ChevronRight className="h-3 w-3 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* ═══════════════════════════════════════════
              RIGHT: Marketing / Plans Section (Desktop Only)
              ═══════════════════════════════════════════ */}
          <div className="hidden lg:flex flex-col gap-6">

            {/* Plan Cards */}
            <div className="flex flex-col gap-4">
              {PLANS.map((plan) => {
                const IconComp = plan.icon
                return (
                  <div
                    key={plan.name}
                    className={`relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg hover:shadow-black/20 ${
                      plan.highlight
                        ? `${plan.border} bg-gradient-to-r from-emerald-500/[0.04] to-purple-500/[0.04] shadow-md ring-1 ring-emerald-500/20`
                        : 'border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700'
                    }`}
                  >
                    {plan.highlight && (
                      <div className="absolute top-0 right-0">
                        <Badge className="rounded-none rounded-bl-xl rounded-tr-xl text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/30">⭐ Más Popular</Badge>
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Plan Icon */}
                        <div className={`h-11 w-11 ${plan.bgIcon} rounded-xl flex items-center justify-center shrink-0 border ${plan.border}`}>
                          <IconComp className={`h-5 w-5 ${plan.color}`} />
                        </div>

                        {/* Plan Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-base text-zinc-100">{plan.name}</h3>
                          </div>
                          <p className="text-xs text-zinc-500 mb-3">{plan.description}</p>

                          {/* Features */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {plan.features.map((feature) => (
                              <div key={feature} className="flex items-center gap-1.5">
                                <Check className={`h-3.5 w-3.5 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500/70'}`} />
                                <span className="text-xs text-zinc-500">{feature}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Price */}
                        <div className="text-right shrink-0">
                          <p className="text-xl font-extrabold text-zinc-100">{plan.price}</p>
                          <p className="text-xs text-zinc-500 font-medium">{plan.period}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Trust Badges */}
            <div className="flex items-center justify-center gap-6 pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <div className="h-8 w-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/15">
                  <Shield className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-300">Datos seguros</p>
                  <p className="text-zinc-600">Encriptación SSL</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <div className="h-8 w-8 bg-sky-500/10 rounded-lg flex items-center justify-center border border-sky-500/15">
                  <Headphones className="h-4 w-4 text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-300">Soporte 24/7</p>
                  <p className="text-zinc-600">WhatsApp directo</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <div className="h-8 w-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/15">
                  <Star className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-300">Hecho en</p>
                  <p className="text-zinc-600">Colombia 🇨🇴</p>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <div className="text-center pt-1">
              <a
                href={SUPPORT_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-8 py-3.5 transition-all shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] text-sm"
              >
                <MessageCircle className="h-4.5 w-4.5" />
                Contratar por WhatsApp
                <ArrowRight className="h-4 w-4" />
              </a>
              <p className="text-xs text-zinc-600 mt-3">
                <Phone className="h-3 w-3 inline mr-1" />
                O llámanos al <span className="font-semibold text-zinc-400">{SUPPORT_PHONE}</span>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Reset Password Dialog ─── */}
      <Dialog open={showResetDialog} onOpenChange={(open) => { if (!open) setShowResetDialog(false) }}>
        <DialogContent className="sm:max-w-[440px] bg-zinc-900 border-zinc-800/60 text-zinc-100 p-0 overflow-hidden">
          {/* ═══ STEP: Select cédula + method ═══ */}
          {resetStep === 'cedula' ? (
            <>
              <DialogHeader className="p-6 sm:p-8 pb-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-11 w-11 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                    <KeyRound className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-zinc-100">Restablecer contraseña</DialogTitle>
                    <DialogDescription className="text-xs text-zinc-500">Paso 1 — Buscar tu cuenta</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="px-6 sm:px-8 pb-2 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-cedula" className="text-sm font-medium text-zinc-400">Cédula / Identificación</Label>
                  <div className="relative group">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      id="reset-cedula"
                      placeholder="1098765432"
                      value={resetCedula}
                      onChange={(e) => setResetCedula(e.target.value)}
                      className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {/* Method selector: Security Question */}
                <div
                  onClick={() => { setResetMethod('security'); handleResetStep1({ preventDefault: () => {} } as React.FormEvent) }}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                    resetMethod === 'security' ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-700'
                  }`}
                >
                  <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                    <Shield className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">Pregunta de seguridad</p>
                    <p className="text-xs text-zinc-500">Responde tu pregunta secreta para verificar tu identidad</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                </div>

                {/* Method selector: WhatsApp OTP */}
                {whatsappEnabled && (
                  <div
                    onClick={() => { setResetMethod('whatsapp'); handleSendOTP({ preventDefault: () => {} } as React.FormEvent) }}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                      resetMethod === 'whatsapp' ? 'border-green-500/40 bg-green-500/[0.06]' : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-700'
                    }`}
                  >
                    <div className="h-10 w-10 bg-green-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Smartphone className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-200">Código por WhatsApp</p>
                      <p className="text-xs text-zinc-500">Recibe un código de verificación de 6 dígitos</p>
                    </div>
                    <MessageCircle className="h-4 w-4 text-green-500/60 shrink-0" />
                  </div>
                )}
              </div>
              <div className="p-6 sm:p-8 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-10 text-sm text-zinc-500 hover:text-zinc-300 gap-2"
                  onClick={() => setShowResetDialog(false)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver al inicio de sesión
                </Button>
              </div>
            </>
          ) : resetStep === 'question' ? (
            /* ═══ STEP: Security Question ═══ */
            <>
              <DialogHeader className="p-6 sm:p-8 pb-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-11 w-11 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                    <Shield className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-zinc-100">Verificar identidad</DialogTitle>
                    <DialogDescription className="text-xs text-zinc-500">Paso 2 — Responde tu pregunta de seguridad</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleResetStep2}>
                <div className="px-6 sm:px-8 pb-2 space-y-4">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                    <p className="text-sm text-emerald-300 font-medium">{resetQuestion}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-answer" className="text-sm font-medium text-zinc-400">Tu respuesta</Label>
                    <div className="relative group">
                      <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input id="reset-answer" placeholder="Escribe tu respuesta" value={resetAnswer} onChange={(e) => setResetAnswer(e.target.value)} className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all" autoFocus required />
                    </div>
                    <p className="text-xs text-zinc-600 ml-1">La respuesta no distingue mayúsculas</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-new-password" className="text-sm font-medium text-zinc-400">Nueva contraseña</Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input id="reset-new-password" type={resetShowPass ? 'text' : 'password'} placeholder="Mínimo 8 caracteres" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} className="pl-11 pr-12 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all" required />
                      <button type="button" onClick={() => setResetShowPass(!resetShowPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 p-1 rounded-md hover:bg-zinc-800 transition-all" aria-label={resetShowPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                        {resetShowPass ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-confirm-password" className="text-sm font-medium text-zinc-400">Confirmar nueva contraseña</Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                      <Input id="reset-confirm-password" type={resetShowPass ? 'text' : 'password'} placeholder="Repite la nueva contraseña" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 transition-all" required />
                    </div>
                  </div>
                </div>
                <div className="p-6 sm:p-8 pt-4 flex flex-col gap-3">
                  <Button type="submit" className="w-full h-12 text-base font-semibold rounded-lg gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 transition-all active:scale-[0.98] border-0" disabled={resetLoading}>
                    {resetLoading ? (<><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Restableciendo...</>) : (<><KeyRound className="h-4.5 w-4.5" />Restablecer contraseña</>)}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full h-10 text-sm text-zinc-500 hover:text-zinc-300 gap-2" onClick={() => setResetStep('cedula')}>
                    <ArrowLeft className="h-3.5 w-3.5" />Volver
                  </Button>
                </div>
              </form>
            </>
          ) : resetStep === 'whatsapp-verify' ? (
            /* ═══ STEP: WhatsApp OTP Verification ═══ */
            <>
              <DialogHeader className="p-6 sm:p-8 pb-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-11 w-11 bg-green-500/10 rounded-xl flex items-center justify-center border border-green-500/20">
                    <Smartphone className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-zinc-100">Verificar código</DialogTitle>
                    <DialogDescription className="text-xs text-zinc-500">
                      {otpTestCode ? 'MODO PRUEBAS — Código mostrado abajo' : `Código enviado a ${otpSentTo}`}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleVerifyOTP}>
                <div className="px-6 sm:p-8 pb-2 space-y-4">
                  {/* Test mode code display */}
                  {otpTestCode && (
                    <div className="rounded-xl border-2 border-dashed border-amber-500/40 bg-amber-500/[0.06] p-4 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                        <Zap className="h-3.5 w-3.5" />
                        Modo Pruebas
                      </div>
                      <div className="text-3xl sm:text-4xl font-black tracking-[0.3em] text-amber-300 font-mono">
                        {otpTestCode}
                      </div>
                      <p className="text-[11px] text-amber-500/60">En producción, este código se enviaría por WhatsApp</p>
                    </div>
                  )}

                  {/* Production info */}
                  {!otpTestCode && (
                    <div className="rounded-lg border border-green-500/20 bg-green-500/[0.06] p-3 text-center space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <MessageCircle className="h-4 w-4 text-green-400" />
                        <p className="text-sm text-green-300 font-medium">WhatsApp enviado a {otpSentTo}</p>
                      </div>
                      <p className="text-xs text-zinc-500">Revisa tu WhatsApp para obtener el código</p>
                    </div>
                  )}

                  {/* OTP Input */}
                  <div className="space-y-2">
                    <Label htmlFor="otp-code" className="text-sm font-medium text-zinc-400">Código de 6 dígitos</Label>
                    <div className="relative group">
                      <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-green-400 transition-colors" />
                      <Input
                        id="otp-code"
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="pl-11 h-14 text-center text-2xl font-mono font-bold tracking-[0.3em] rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-700 placeholder:tracking-wider placeholder:text-base placeholder:font-normal focus-visible:ring-green-500/20 focus-visible:border-green-500/40 transition-all"
                        autoFocus
                        maxLength={6}
                        required
                      />
                    </div>
                  </div>

                  {/* Resend timer */}
                  <div className="text-center">
                    {otpResendTimer > 0 ? (
                      <p className="text-xs text-zinc-500">
                        Reenviar en <span className="text-zinc-300 font-mono font-semibold">{otpResendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { handleSendOTP(e) }}
                        className="text-xs text-green-400 hover:text-green-300 font-medium transition-colors"
                      >
                        Reenviar código
                      </button>
                    )}
                  </div>

                  <Separator className="bg-zinc-800/60" />

                  {/* New Password */}
                  <div className="space-y-2">
                    <Label htmlFor="otp-new-password" className="text-sm font-medium text-zinc-400">Nueva contraseña</Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-green-400 transition-colors" />
                      <Input id="otp-new-password" type={resetShowPass ? 'text' : 'password'} placeholder="Mínimo 8 caracteres" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} className="pl-11 pr-12 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-green-500/20 focus-visible:border-green-500/40 transition-all" required />
                      <button type="button" onClick={() => setResetShowPass(!resetShowPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 p-1 rounded-md hover:bg-zinc-800 transition-all" aria-label={resetShowPass ? 'Ocultar' : 'Mostrar'}>
                        {resetShowPass ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otp-confirm-password" className="text-sm font-medium text-zinc-400">Confirmar nueva contraseña</Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-600 group-focus-within:text-green-400 transition-colors" />
                      <Input id="otp-confirm-password" type={resetShowPass ? 'text' : 'password'} placeholder="Repite la nueva contraseña" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} className="pl-11 h-12 text-base rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-green-500/20 focus-visible:border-green-500/40 transition-all" required />
                    </div>
                  </div>
                </div>
                <div className="p-6 sm:p-8 pt-4 flex flex-col gap-3">
                  <Button type="submit" className="w-full h-12 text-base font-semibold rounded-lg gap-2.5 bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 hover:shadow-xl hover:shadow-green-600/30 transition-all active:scale-[0.98] border-0" disabled={resetLoading}>
                    {resetLoading ? (<><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Verificando...</>) : (<><KeyRound className="h-4.5 w-4.5" />Verificar y restablecer</>)}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full h-10 text-sm text-zinc-500 hover:text-zinc-300 gap-2" onClick={() => { if (otpTimerRef.current) clearInterval(otpTimerRef.current); setResetStep('cedula') }}>
                    <ArrowLeft className="h-3.5 w-3.5" />Volver
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Mobile: Plans Section (below login) ─── */}
      <section className="lg:hidden px-4 pb-8">
        <Separator className="bg-zinc-800/60 mb-8" />
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 rounded-full px-3.5 py-1.5 text-xs font-bold mb-3 border border-emerald-500/20">
              <Star className="h-3.5 w-3.5" />
              Planes desde $0
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Elige el plan ideal</h2>
            <p className="text-sm text-zinc-500 mt-1">7 días de prueba gratuita en todos los planes</p>
          </div>

          <div className="flex flex-col gap-3">
            {PLANS.map((plan) => {
              const IconComp = plan.icon
              return (
                <div
                  key={plan.name}
                  className={`rounded-xl border p-4 transition-all ${
                    plan.highlight
                      ? `${plan.border} bg-gradient-to-r from-emerald-500/[0.04] to-purple-500/[0.04] ring-1 ring-emerald-500/20`
                      : 'border-zinc-800/60 bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 ${plan.bgIcon} rounded-lg flex items-center justify-center shrink-0 border ${plan.border}`}>
                      <IconComp className={`h-4.5 w-4.5 ${plan.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-zinc-100">{plan.name}</h3>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-zinc-100">{plan.price}</span>
                          <span className="text-[10px] text-zinc-500 ml-1">{plan.period}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5 mb-2">{plan.description}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {plan.features.map((f) => (
                          <div key={f} className="flex items-center gap-1">
                            <Check className={`h-3 w-3 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500/70'}`} />
                            <span className="text-[11px] text-zinc-500">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile CTA */}
          <div className="text-center mt-6">
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-6 py-3 transition-all shadow-md shadow-emerald-600/20 text-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Contratar por WhatsApp
            </a>
          </div>

          {/* Mobile Trust Badges */}
          <div className="flex items-center justify-center gap-4 mt-5">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Shield className="h-3.5 w-3.5 text-emerald-500/70" />
              <span>Datos seguros</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Headphones className="h-3.5 w-3.5 text-sky-500/70" />
              <span>Soporte 24/7</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Star className="h-3.5 w-3.5 text-amber-500/70" />
              <span>Colombia 🇨🇴</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-zinc-800/60 bg-zinc-950/60 backdrop-blur-sm mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-zinc-600">
          <span className="font-medium text-zinc-500">Ventify POS</span>
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
