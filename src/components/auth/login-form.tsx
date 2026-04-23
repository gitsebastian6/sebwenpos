'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  CreditCard, Lock, Eye, EyeOff, Phone, MessageCircle,
  AlertTriangle, ArrowRight, LogIn, Zap, KeyRound, ChevronRight, Headphones,
} from 'lucide-react'
import { SUPPORT_PHONE, SUPPORT_WHATSAPP } from './auth-constants'
import type { BlockedInfo } from './auth-constants'

interface LoginFormProps {
  loading: boolean
  blockedInfo: BlockedInfo | null
  loginCedula: string
  loginPassword: string
  onLoginCedulaChange: (value: string) => void
  onLoginPasswordChange: (value: string) => void
  onLogin: (e: React.FormEvent) => void
  onForgotPassword: () => void
}

export function LoginForm({
  loading, blockedInfo, loginCedula, loginPassword,
  onLoginCedulaChange, onLoginPasswordChange, onLogin, onForgotPassword,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
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
        <form onSubmit={onLogin}>
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
                    onChange={(e) => onLoginCedulaChange(e.target.value)}
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
                    onChange={(e) => onLoginPasswordChange(e.target.value)}
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
                onClick={onForgotPassword}
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
  )
}
