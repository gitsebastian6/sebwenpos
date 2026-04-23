'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  CreditCard, Lock, Eye, EyeOff, Zap, Shield, Mail, AlertTriangle,
} from 'lucide-react'
import { useSetup } from '@/hooks/api/use-auth'
import { toast } from 'sonner'

interface SetupWizardProps {
  onSetupComplete: (cedula: string) => void
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const [setupCedula, setSetupCedula] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')
  const [setupFullName, setSetupFullName] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupShowPass, setSetupShowPass] = useState(false)

  const setupMutation = useSetup()
  const setupLoading = setupMutation.isPending

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
      onSetupComplete(setupCedula.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

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
