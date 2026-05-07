'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  User, Building2, Mail, Phone, Lock, ArrowRight,
  ArrowLeft, Sparkles, Info, ChevronRight, CheckCircle2,
} from 'lucide-react'

// ─── Colombian Departments ────────────────────────────────────────
const COLOMBIAN_DEPARTMENTS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bolívar', 'Boyacá',
  'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó',
  'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila',
  'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander',
  'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia',
  'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés',
  'Vichada', 'Bogotá D.C.',
]

interface TrialSignupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormData {
  // Step 1 - Personal Data
  ownerFullName: string
  ownerCedula: string
  ownerPhone: string
  ownerEmail: string
  ownerPassword: string
  // Step 2 - Company Data
  storeName: string
  nit: string
  legalName: string
  businessType: 'NATURAL' | 'JURIDICA'
  storePhone: string
  department: string
  cityName: string
  address: string
  hasCamaraComercio: boolean
  registrationNumber: string
}

const initialFormData: FormData = {
  ownerFullName: '',
  ownerCedula: '',
  ownerPhone: '',
  ownerEmail: '',
  ownerPassword: '',
  storeName: '',
  nit: '',
  legalName: '',
  businessType: 'NATURAL',
  storePhone: '',
  department: '',
  cityName: '',
  address: '',
  hasCamaraComercio: false,
  registrationNumber: '',
}

export function TrialSignupDialog({ open, onOpenChange }: TrialSignupDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function updateField(field: keyof FormData, value: string | boolean) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  function validateStep1(): boolean {
    if (!formData.ownerFullName.trim() || formData.ownerFullName.trim().length < 2) {
      toast.error('Nombre completo es requerido (mínimo 2 caracteres)')
      return false
    }
    if (!formData.ownerCedula.trim() || formData.ownerCedula.trim().length < 5) {
      toast.error('Cédula es requerida (mínimo 5 caracteres)')
      return false
    }
    if (!formData.ownerPhone.trim() || formData.ownerPhone.trim().length < 7) {
      toast.error('Teléfono es requerido (mínimo 7 caracteres)')
      return false
    }
    if (formData.ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) {
      toast.error('Email inválido')
      return false
    }
    if (!formData.ownerPassword || formData.ownerPassword.length < 6) {
      toast.error('Contraseña es requerida (mínimo 6 caracteres)')
      return false
    }
    return true
  }

  function validateStep2(): boolean {
    if (!formData.storeName.trim() || formData.storeName.trim().length < 2) {
      toast.error('Nombre de la tienda es requerido')
      return false
    }
    if (!formData.nit.trim() || formData.nit.trim().length < 5) {
      toast.error('NIT/RUT es requerido (mínimo 5 caracteres)')
      return false
    }
    if (!formData.legalName.trim() || formData.legalName.trim().length < 2) {
      toast.error('Razón social es requerida')
      return false
    }
    return true
  }

  function handleNext() {
    if (validateStep1()) {
      setStep(2)
    }
  }

  async function handleSubmit() {
    if (!validateStep2()) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/trial-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerFullName: formData.ownerFullName.trim(),
          ownerCedula: formData.ownerCedula.trim(),
          ownerPhone: formData.ownerPhone.trim(),
          ownerEmail: formData.ownerEmail.trim() || undefined,
          ownerPassword: formData.ownerPassword,
          storeName: formData.storeName.trim(),
          nit: formData.nit.trim(),
          legalName: formData.legalName.trim(),
          businessType: formData.businessType,
          storePhone: formData.storePhone.trim() || undefined,
          department: formData.department || undefined,
          cityName: formData.cityName.trim() || undefined,
          address: formData.address.trim() || undefined,
          hasCamaraComercio: formData.hasCamaraComercio,
          registrationNumber: formData.registrationNumber.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al enviar la solicitud')
        return
      }

      // Success — show confirmation, DO NOT login
      setSubmitted(true)
      toast.success(data.message || 'Solicitud enviada exitosamente')
    } catch {
      toast.error('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setStep(1); setFormData(initialFormData); setSubmitted(false) } }}>
      <DialogContent className="max-w-lg rounded-xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden">
        {/* ── Success Screen ── */}
        {submitted ? (
          <div className="px-6 py-10 text-center space-y-5">
            <div className="mx-auto h-16 w-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-100">¡Solicitud Enviada!</h3>
              <p className="text-sm text-zinc-400 mt-2 max-w-xs mx-auto leading-relaxed">
                Tu solicitud de prueba gratuita ha sido registrada. Nuestro equipo la revisará y se pondrá en contacto contigo para activar tu cuenta.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-4 max-w-xs mx-auto">
              <p className="text-xs text-emerald-300/80 leading-relaxed">
                Recibirás la activación de tu cuenta por <span className="font-semibold text-emerald-300">WhatsApp</span> o al <span className="font-semibold text-emerald-300">correo electrónico</span> que proporcionaste.
              </p>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="h-11 px-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 transition-all"
            >
              Entendido
            </Button>
          </div>
        ) : (
          <>
            {/* Progress indicator */}
            <div className="flex items-center gap-2 px-6 pt-6 pb-2">
              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors ${
                step >= 1 ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500'
              }`}>1</div>
              <div className={`h-0.5 flex-1 rounded-full transition-colors ${
                step >= 2 ? 'bg-emerald-500' : 'bg-zinc-800'
              }`} />
              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors ${
                step >= 2 ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500'
              }`}>2</div>
            </div>

            <DialogHeader className="px-6 pb-2">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-100">
                <div className="h-8 w-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                </div>
                {step === 1 ? 'Datos Personales' : 'Datos de la Empresa'}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 text-sm">
                {step === 1
                  ? 'Paso 1 de 2 — Ingresa tus datos personales'
                  : 'Paso 2 de 2 — Datos de facturación para tu negocio'}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4">
              {/* Owner Full Name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Nombre completo *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <Input
                    placeholder="Juan Pérez"
                    value={formData.ownerFullName}
                    onChange={(e) => updateField('ownerFullName', e.target.value)}
                    className="pl-10 h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  />
                </div>
              </div>

              {/* Owner Cedula */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Cédula *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <Input
                    placeholder="1098765432"
                    value={formData.ownerCedula}
                    onChange={(e) => updateField('ownerCedula', e.target.value)}
                    className="pl-10 h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  />
                </div>
              </div>

              {/* Owner Phone */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Teléfono *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <Input
                    placeholder="3011234567"
                    value={formData.ownerPhone}
                    onChange={(e) => updateField('ownerPhone', e.target.value)}
                    className="pl-10 h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  />
                </div>
              </div>

              {/* Owner Email */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Email (opcional)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <Input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={formData.ownerEmail}
                    onChange={(e) => updateField('ownerEmail', e.target.value)}
                    className="pl-10 h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  />
                </div>
              </div>

              {/* Owner Password */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Contraseña *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={formData.ownerPassword}
                    onChange={(e) => updateField('ownerPassword', e.target.value)}
                    className="pl-10 h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  />
                </div>
              </div>

              <Button
                onClick={handleNext}
                className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 transition-all"
              >
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Info Banner */}
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-sky-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-sky-300/80 leading-relaxed">
                    El <span className="font-semibold text-sky-300">NIT/RUT</span> y la <span className="font-semibold text-sky-300">Razón Social</span> son necesarios para la facturación electrónica DIAN.
                    Puedes actualizar estos datos después en la configuración de tu tienda.
                  </p>
                </div>
              </div>

              {/* Store Name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Nombre de la tienda *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <Input
                    placeholder="Mi Negocio"
                    value={formData.storeName}
                    onChange={(e) => updateField('storeName', e.target.value)}
                    className="pl-10 h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                  />
                </div>
              </div>

              {/* NIT / RUT */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">NIT / RUT *</Label>
                <Input
                  placeholder="900123456-1"
                  value={formData.nit}
                  onChange={(e) => updateField('nit', e.target.value)}
                  className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                />
              </div>

              {/* Legal Name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Razón Social *</Label>
                <Input
                  placeholder="Mi Negocio S.A.S."
                  value={formData.legalName}
                  onChange={(e) => updateField('legalName', e.target.value)}
                  className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                />
              </div>

              {/* Business Type */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Tipo de persona</Label>
                <Select
                  value={formData.businessType}
                  onValueChange={(v) => updateField('businessType', v)}
                >
                  <SelectTrigger className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 focus:ring-emerald-500/20 focus:border-emerald-500/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="NATURAL">Persona Natural</SelectItem>
                    <SelectItem value="JURIDICA">Persona Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Store Phone */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Teléfono del negocio</Label>
                <Input
                  placeholder="6011234567"
                  value={formData.storePhone}
                  onChange={(e) => updateField('storePhone', e.target.value)}
                  className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                />
              </div>

              {/* Department */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Departamento</Label>
                <Select
                  value={formData.department}
                  onValueChange={(v) => updateField('department', v)}
                >
                  <SelectTrigger className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 focus:ring-emerald-500/20 focus:border-emerald-500/40">
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-48 overflow-y-auto">
                    {COLOMBIAN_DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* City Name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Ciudad</Label>
                <Input
                  placeholder="Bogotá"
                  value={formData.cityName}
                  onChange={(e) => updateField('cityName', e.target.value)}
                  className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                />
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-zinc-400">Dirección</Label>
                <Input
                  placeholder="Calle 10 #5-23"
                  value={formData.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  className="h-11 rounded-lg border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                />
              </div>

              {/* Cámara de comercio toggle */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300">¿Tiene Cámara de Comercio?</span>
                  <button
                    type="button"
                    onClick={() => updateField('hasCamaraComercio', !formData.hasCamaraComercio)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                      formData.hasCamaraComercio ? 'bg-emerald-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                      formData.hasCamaraComercio ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </label>
                {formData.hasCamaraComercio && (
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-sm font-medium text-zinc-400">Número de matrícula</Label>
                    <Input
                      placeholder="001-12345"
                      value={formData.registrationNumber}
                      onChange={(e) => updateField('registrationNumber', e.target.value)}
                      className="h-10 rounded-lg border-zinc-800 bg-zinc-900/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                    />
                  </div>
                )}
              </div>

              {/* Navigation buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1 h-11 rounded-lg border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 transition-all"
                >
                  {loading ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      Crear Cuenta
                      <Sparkles className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
