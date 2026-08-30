'use client'

import { useState, useRef, useMemo } from 'react'
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { toast } from 'sonner'
import {
  User, Building2, Mail, Phone, Lock, ArrowRight,
  ArrowLeft, Sparkles, Info, CheckCircle2, Check,
  ChevronDown, Upload, X, FileText, MapPin, Search,
  FileUp, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTrialSignup } from '@/hooks/api/use-auth'

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

// ─── Colombian Cities Dataset ─────────────────────────────────────
const COLOMBIAN_CITIES: Record<string, string[]> = {
  'Amazonas': ['Leticia', 'Puerto Nariño'],
  'Antioquia': ['Medellín', 'Envigado', 'Bello', 'Itagüí', 'Rionegro', 'Caucasia', 'Turbo', 'Apartadó'],
  'Arauca': ['Arauca', 'Saravena', 'Tame'],
  'Atlántico': ['Barranquilla', 'Soledad', 'Malambo', 'Sabanalarga'],
  'Bolívar': ['Cartagena', 'Magangué', 'Turbaco', 'El Carmen de Bolívar'],
  'Boyacá': ['Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá', 'Puerto Boyacá'],
  'Caldas': ['Manizales', 'La Dorada', 'Chinchiná', 'Villamaría'],
  'Caquetá': ['Florencia', 'San Vicente del Caguán', 'Puerto Rico'],
  'Casanare': ['Yopal', 'Aguazul', 'Villanueva', 'Tauramena'],
  'Cauca': ['Popayán', 'Santander de Quilichao', 'Puerto Tejada'],
  'Cesar': ['Valledupar', 'Aguachica', 'Bosconia', 'La Jagua de Ibirico'],
  'Chocó': ['Quibdó', 'Istmina', 'Tadó'],
  'Córdoba': ['Montería', 'Cereté', 'Lorica', 'Sahagún', 'Planeta Rica'],
  'Cundinamarca': ['Bogotá', 'Soacha', 'Facatativá', 'Zipaquirá', 'Chía', 'Fusagasugá', 'Girardot', 'Mosquera'],
  'Guainía': ['Inírida'],
  'Guaviare': ['San José del Guaviare'],
  'Huila': ['Neiva', 'Pitalito', 'Garzón', 'La Plata'],
  'La Guajira': ['Riohacha', 'Maicao', 'Uribia', 'Fonseca'],
  'Magdalena': ['Santa Marta', 'Ciénaga', 'Fundación', 'El Banco'],
  'Meta': ['Villavicencio', 'Acacías', 'Granada', 'Puerto López'],
  'Nariño': ['Pasto', 'Tumaco', 'Ipiales', 'Túquerres'],
  'Norte de Santander': ['Cúcuta', 'Ocaña', 'Pamplona', 'Los Patios'],
  'Putumayo': ['Mocoa', 'Puerto Asís', 'Orito'],
  'Quindío': ['Armenia', 'Calarcá', 'Montenegro', 'La Tebaida'],
  'Risaralda': ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal'],
  'San Andrés y Providencia': ['San Andrés', 'Providencia'],
  'Santander': ['Bucaramanga', 'Floridablanca', 'Barrancabermeja', 'Piedecuesta', 'San Gil', 'Lebrija'],
  'Sucre': ['Sincelejo', 'Corozal', 'San Marcos', 'Tolú'],
  'Tolima': ['Ibagué', 'Espinal', 'Melgar', 'Honda', 'Líbano'],
  'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Cartago', 'Buga', 'Yumbo'],
  'Vaupés': ['Mitú'],
  'Vichada': ['Puerto Carreño'],
  'Bogotá D.C.': ['Bogotá'],
}

// ─── File Upload Types ────────────────────────────────────────────
const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface UploadedFile {
  base64: string
  name: string
  type: string
  size: number
}

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
  // Step 3 - Documents
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
  registrationNumber: '',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── File Upload Component ────────────────────────────────────────
function FileUploadArea({
  label,
  file,
  onFileSelect,
  onFileRemove,
}: {
  label: string
  file: UploadedFile | null
  onFileSelect: (file: UploadedFile) => void
  onFileRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function processFile(f: File) {
    if (!ACCEPTED_FILE_TYPES.includes(f.type)) {
      toast.error('Formato no permitido. Use PDF, PNG, JPG o WEBP.')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error('El archivo supera el tamaño máximo de 5MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      onFileSelect({ base64, name: f.name, type: f.type, size: f.size })
    }
    reader.readAsDataURL(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 shrink-0">
          <FileText className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 truncate font-medium">{file.name}</p>
          <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
        </div>
        <button
          type="button"
          onClick={onFileRemove}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-all',
        dragOver
          ? 'border-emerald-500/60 bg-emerald-500/[0.08]'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
        <Upload className="h-5 w-5 text-zinc-500" />
      </div>
      <div className="text-center">
        <p className="text-sm text-zinc-300 font-medium">{label}</p>
        <p className="text-xs text-zinc-600 mt-1">PDF, PNG, JPG, WEBP — Máximo 5MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  )
}

// ─── Department Combobox ──────────────────────────────────────────
function DepartmentCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls="dept-combobox-list"
          className="flex h-11 w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 focus-visible:outline-none transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 text-zinc-600 shrink-0" />
            {value ? value : <span className="text-zinc-600">Busca tu departamento...</span>}
          </span>
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-zinc-900 border-zinc-800" align="start">
        <Command className="bg-zinc-900 text-zinc-100">
          <CommandInput placeholder="Buscar departamento..." className="h-9 border-zinc-800 text-zinc-100 placeholder:text-zinc-600" />
          <CommandList id="dept-combobox-list" className="max-h-60">
            <CommandEmpty className="text-zinc-500 py-3 text-center text-sm">
              No se encontró el departamento
            </CommandEmpty>
            <CommandGroup className="p-1">
              {COLOMBIAN_DEPARTMENTS.map((dept) => (
                <CommandItem
                  key={dept}
                  value={dept}
                  onSelect={() => {
                    onChange(dept)
                    setOpen(false)
                  }}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm text-zinc-300 data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-400 data-[selected=true]:bg-zinc-800"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === dept ? 'text-emerald-400' : 'opacity-0'
                    )}
                  />
                  {dept}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── City Combobox (same UX as Department) ────────────────────────
function CityCombobox({
  department,
  value,
  onChange,
}: {
  department: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  const cities = useMemo(() => {
    if (!department) return []
    return COLOMBIAN_CITIES[department] || []
  }, [department])

  if (!department) {
    return (
      <div
        className="flex h-11 w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-600 cursor-not-allowed"
      >
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          Primero selecciona un departamento
        </span>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-11 w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40 focus-visible:outline-none transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 text-zinc-600 shrink-0" />
            {value ? value : <span className="text-zinc-600">Busca tu ciudad...</span>}
          </span>
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-zinc-900 border-zinc-800" align="start">
        <Command className="bg-zinc-900 text-zinc-100">
          <CommandInput placeholder="Buscar ciudad..." className="h-9 border-zinc-800 text-zinc-100 placeholder:text-zinc-600" />
          <CommandList className="max-h-60">
            <CommandEmpty className="text-zinc-500 py-3 text-center text-sm">
              No se encontró la ciudad
            </CommandEmpty>
            <CommandGroup className="p-1">
              {cities.map((city) => (
                <CommandItem
                  key={city}
                  value={city}
                  onSelect={() => {
                    onChange(city)
                    setOpen(false)
                  }}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm text-zinc-300 data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-400 data-[selected=true]:bg-zinc-800"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === city ? 'text-emerald-400' : 'opacity-0'
                    )}
                  />
                  {city}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Main Dialog ──────────────────────────────────────────────────
export function TrialSignupDialog({ open, onOpenChange }: TrialSignupDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [submitted, setSubmitted] = useState(false)
  const [rutFile, setRutFile] = useState<UploadedFile | null>(null)
  const [camaraFile, setCamaraFile] = useState<UploadedFile | null>(null)
  const trialSignupMutation = useTrialSignup()

  function updateField(field: keyof FormData, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // When department changes, reset city
    if (field === 'department') {
      setFormData((prev) => ({ ...prev, department: value as string, cityName: '' }))
    }
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
    if (step === 1 && validateStep1()) {
      setStep(2)
    } else if (step === 2 && validateStep2()) {
      setStep(3)
    }
  }

  function handleBack() {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  function handleSubmit() {
    if (!validateStep2()) return

    trialSignupMutation.mutate(
      {
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
        registrationNumber: formData.registrationNumber.trim() || undefined,
        // RUT file
        rutFileBase64: rutFile?.base64 || undefined,
        rutFileName: rutFile?.name || undefined,
        rutFileType: rutFile?.type || undefined,
        // Camara file
        camaraFileBase64: camaraFile?.base64 || undefined,
        camaraFileName: camaraFile?.name || undefined,
        camaraFileType: camaraFile?.type || undefined,
      },
      {
        onSuccess: (data) => {
          setSubmitted(true)
          toast.success(data.message || 'Solicitud enviada exitosamente')
        },
        onError: (err) => {
          toast.error(err.message || 'Error de conexión. Intenta de nuevo.')
        },
      },
    )
  }

  function handleDialogClose(v: boolean) {
    onOpenChange(v)
    if (!v) {
      setStep(1)
      setFormData(initialFormData)
      setSubmitted(false)
      setRutFile(null)
      setCamaraFile(null)
    }
  }

  const stepLabels = ['Datos Personales', 'Datos de la Empresa', 'Documentos']

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent showCloseButton={false} className="max-w-lg rounded-xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden">
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
            <button
              type="button"
              onClick={() => handleDialogClose(false)}
              aria-label="Volver"
              className="mt-4 ml-4 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </button>
            {/* ── Progress indicator ── */}
            <div className="flex items-center gap-2 px-6 pt-3 pb-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={cn(
                      'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                      step >= s
                        ? 'bg-emerald-500 text-white'
                        : 'bg-zinc-800 text-zinc-500'
                    )}
                  >
                    {s}
                  </div>
                  {s < 3 && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 rounded-full transition-colors',
                        step > s ? 'bg-emerald-500' : 'bg-zinc-800'
                      )}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* ── Header ── */}
            <DialogHeader className="px-6 pb-2">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-100">
                <div className="h-8 w-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                </div>
                {stepLabels[step - 1]}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 text-sm">
                Paso {step} de 3 —{' '}
                {step === 1 && 'Ingresa tus datos personales'}
                {step === 2 && 'Datos de facturación para tu negocio'}
                {step === 3 && 'Sube tus documentos tributarios (opcional)'}
              </DialogDescription>
            </DialogHeader>

            {/* ── Form Body ── */}
            <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto">
              {/* ──── Step 1: Personal Data ──── */}
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

              {/* ──── Step 2: Company Data ──── */}
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

                  {/* Department — Searchable Combobox */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-zinc-400">Departamento</Label>
                    <DepartmentCombobox
                      value={formData.department}
                      onChange={(v) => updateField('department', v)}
                    />
                  </div>

                  {/* City — Autocomplete based on department */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-zinc-400">Ciudad</Label>
                    <CityCombobox
                      department={formData.department}
                      value={formData.cityName}
                      onChange={(v) => updateField('cityName', v)}
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

                  {/* Navigation buttons */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      className="flex-1 h-11 rounded-lg border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Atrás
                    </Button>
                    <Button
                      onClick={handleNext}
                      className="flex-1 h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 transition-all"
                    >
                      Siguiente
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ──── Step 3: Documents ──── */}
              {step === 3 && (
                <div className="space-y-4">
                  {/* Info Banner */}
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-300/80 leading-relaxed">
                        Todos los documentos son opcionales. Puedes enviar tu solicitud ahora y el equipo de soporte te contactará para los documentos pendientes si son necesarios.
                      </p>
                    </div>
                  </div>

                  {/* RUT / Documento Tributario Section */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-zinc-500" />
                      <div>
                        <Label className="text-sm font-medium text-zinc-300">
                          RUT / Documento Tributario (opcional)
                        </Label>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Sube tu RUT para agilizar la activación de facturación electrónica
                        </p>
                      </div>
                    </div>
                    <FileUploadArea
                      label="Subir RUT"
                      file={rutFile}
                      onFileSelect={setRutFile}
                      onFileRemove={() => setRutFile(null)}
                    />
                  </div>

                  {/* Cámara de Comercio Section */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <FileUp className="h-4 w-4 text-zinc-500" />
                      <div>
                        <Label className="text-sm font-medium text-zinc-300">
                          Cámara de Comercio (opcional)
                        </Label>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Si eres persona jurídica, sube tu certificado de cámara de comercio
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-zinc-400">Número de matrícula</Label>
                      <Input
                        placeholder="001-12345"
                        value={formData.registrationNumber}
                        onChange={(e) => updateField('registrationNumber', e.target.value)}
                        className="h-10 rounded-lg border-zinc-800 bg-zinc-900/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
                      />
                    </div>
                    <FileUploadArea
                      label="Subir Cámara de Comercio"
                      file={camaraFile}
                      onFileSelect={setCamaraFile}
                      onFileRemove={() => setCamaraFile(null)}
                    />
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      className="flex-1 h-11 rounded-lg border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Atrás
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={trialSignupMutation.isPending}
                      className="flex-1 h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 transition-all"
                    >
                      {trialSignupMutation.isPending ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          Enviar Solicitud
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
