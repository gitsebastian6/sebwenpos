'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  CreditCard, Lock, Eye, EyeOff, Shield, KeyRound, ArrowLeft,
  Smartphone, Hash, MessageCircle, ChevronRight, Zap,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  useResetPasswordStep1, useResetPasswordStep2,
  useSendOtp, useVerifyOtp, fetchOtpStatus,
} from '@/hooks/api/use-auth'
import { toast } from 'sonner'

interface ResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResetSuccess: (cedula: string) => void
}

export function ResetPasswordDialog({ open, onOpenChange, onResetSuccess }: ResetPasswordDialogProps) {
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

  const resetStep1Mutation = useResetPasswordStep1()
  const resetStep2Mutation = useResetPasswordStep2()
  const sendOtpMutation = useSendOtp()
  const verifyOtpMutation = useVerifyOtp()
  const resetLoading = resetStep1Mutation.isPending || resetStep2Mutation.isPending || sendOtpMutation.isPending || verifyOtpMutation.isPending

  // ── Check WhatsApp OTP availability + cleanup timer on unmount ──
  useEffect(() => {
    fetchOtpStatus().then(setWhatsappEnabled)
    return () => { if (otpTimerRef.current) clearInterval(otpTimerRef.current) }
  }, [])

  const handleClose = useCallback((val: boolean) => {
    if (!val) {
      if (otpTimerRef.current) clearInterval(otpTimerRef.current)
    }
    onOpenChange(val)
  }, [onOpenChange])

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
      handleClose(false)
      onResetSuccess(resetCedula.trim())
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
      handleClose(false)
      onResetSuccess(resetCedula.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
                onClick={() => handleClose(false)}
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
  )
}
