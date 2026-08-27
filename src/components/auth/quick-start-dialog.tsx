'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Zap, CreditCard, Lock, Store, Phone, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface QuickStartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickStartDialog({ open, onOpenChange }: QuickStartDialogProps) {
  const { login } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    cedula: '',
    phone: '',
    storeName: '',
    password: '',
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fullName || !form.cedula || !form.storeName || !form.password) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/quickstart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al crear la cuenta')
        return
      }

      // Auto-login
      login(
        { id: data.user.id, fullName: data.user.fullName, cedula: data.user.cedula, phone: data.user.phone, email: data.user.email, role: data.user.role },
        data.store,
        data.token,
        data.permissions,
        data.isSuperAdmin,
        data.subscription,
        data.availableStores,
      )

      setSuccess(true)
      toast.success('¡Bienvenido! Tu cuenta está lista para vender.')
    } catch {
      toast.error('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (!loading) {
      onOpenChange(false)
      if (success) {
        setSuccess(false)
        setForm({ fullName: '', cedula: '', phone: '', storeName: '', password: '' })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px] bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden">
        {success ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto h-16 w-16 bg-emerald-500/15 rounded-full flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-50">¡Tu cuenta está lista!</h2>
            <p className="text-sm text-zinc-400">
              Ya puedes empezar a vender. Agrega tus productos desde el módulo de Productos y configura tu negocio desde Ajustes cuando quieras.
            </p>
            <Button
              onClick={handleClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-11 rounded-lg gap-2"
            >
              Empezar a Vender
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="p-6 pb-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                  <Zap className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-zinc-50">Inicio Rápido</DialogTitle>
                  <DialogDescription className="text-xs text-zinc-500">
                    Crea tu cuenta en 30 segundos y empieza a vender
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
              {/* Nombre completo */}
              <div className="space-y-1.5">
                <Label className="text-sm text-zinc-400">Tu nombre</Label>
                <div className="relative group">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                  <Input
                    placeholder="Juan Pérez"
                    value={form.fullName}
                    onChange={(e) => update('fullName', e.target.value)}
                    className="pl-10 h-10 rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Cédula + Teléfono en fila */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-zinc-400">Cédula</Label>
                  <div className="relative group">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      placeholder="1098765432"
                      value={form.cedula}
                      onChange={(e) => update('cedula', e.target.value)}
                      className="pl-10 h-10 rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-zinc-400">Teléfono</Label>
                  <div className="relative group">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      placeholder="3001234567"
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      className="pl-10 h-10 rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                    />
                  </div>
                </div>
              </div>

              {/* Nombre de la tienda */}
              <div className="space-y-1.5">
                <Label className="text-sm text-zinc-400">Nombre de tu negocio</Label>
                <Input
                  placeholder="Mi Tienda"
                  value={form.storeName}
                  onChange={(e) => update('storeName', e.target.value)}
                  className="h-10 rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  required
                />
              </div>

              {/* Contraseña */}
              <div className="space-y-1.5">
                <Label className="text-sm text-zinc-400">Contraseña</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 group-focus-within:text-emerald-400 transition-colors" />
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                    className="pl-10 h-10 rounded-lg border-zinc-800 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold rounded-lg gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] border-0"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Crear Cuenta y Vender
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>

              <p className="text-[11px] text-zinc-600 text-center leading-relaxed">
                Obtienes 7 días de prueba gratis. Configura NIT, facturación y más desde Ajustes cuando quieras.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
