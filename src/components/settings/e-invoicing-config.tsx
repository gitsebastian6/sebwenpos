'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Upload,
  FileCheck,
  Trash2,
  Loader2,
  Save,
  Shield,
  ShieldCheck,
  KeyRound,
  Server,
  Plug,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Globe,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'

// ── Provider definitions ──────────────────────────────────────

interface ProviderOption {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  requiresCertificate: boolean
  requiresApiKey: boolean
  fields: ProviderField[]
  docsUrl?: string
  color: string
  badgeColor: string
}

interface ProviderField {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'password'
  required: boolean
  description?: string
}

const PROVIDERS: Record<string, ProviderOption> = {
  NONE: {
    id: 'NONE',
    name: 'Sin Proveedor',
    description: 'Facturación manual (sin envío automático a DIAN)',
    icon: FileCheck,
    requiresCertificate: false,
    requiresApiKey: false,
    fields: [],
    color: 'text-zinc-400',
    badgeColor: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  },
  DIAN_DIRECT: {
    id: 'DIAN_DIRECT',
    name: 'DIAN Directo',
    description: 'Integración directa con la DIAN usando certificado .p12 propio',
    icon: Shield,
    requiresCertificate: true,
    requiresApiKey: false,
    fields: [
      { key: 'softwareId', label: 'Software ID', placeholder: 'Ej: a4713d4b-6d7e-4b8f-9c3d-5e6f7a8b9c0d', type: 'text', required: true, description: 'Identificador del software registrado ante la DIAN' },
      { key: 'softwarePin', label: 'PIN del Software', placeholder: '6 dígitos', type: 'password', required: true, description: 'PIN de 6 dígitos asignado por la DIAN' },
    ],
    color: 'text-amber-500',
    badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    docsUrl: 'https://facturaelectronica.dian.gov.co',
  },
  SIMBA: {
    id: 'SIMBA',
    name: 'Simba Facturación',
    description: 'Proveedor colombiano de facturación electrónica por API',
    icon: Zap,
    requiresCertificate: false,
    requiresApiKey: true,
    fields: [
      { key: 'simba_apiKey', label: 'API Key', placeholder: 'Ej: sk_live_xxxxxxxxxxxxxxxx', type: 'password', required: true, description: 'Tu API Key de Simba (panel de administración)' },
      { key: 'simba_accountId', label: 'Account ID', placeholder: 'Ej: acc_123456789', type: 'text', required: true, description: 'Identificador de tu cuenta en Simba' },
      { key: 'simba_testMode', label: 'Token Test (habilitación)', placeholder: 'Token para ambiente de pruebas', type: 'password', required: false, description: 'Solo si estás en fase de habilitación' },
    ],
    color: 'text-emerald-500',
    badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    docsUrl: 'https://www.simba.co',
  },
  ALEGRA: {
    id: 'ALEGRA',
    name: 'Alegra',
    description: 'Plataforma de facturación y contabilidad en la nube',
    icon: Globe,
    requiresCertificate: false,
    requiresApiKey: true,
    fields: [
      { key: 'alegra_token', label: 'Token de Acceso', placeholder: 'Bearer token de Alegra', type: 'password', required: true, description: 'Token de autenticación API de Alegra' },
      { key: 'alegra_userId', label: 'ID de Usuario', placeholder: 'Ej: user_123@email.com', type: 'text', required: true, description: 'Email o ID del usuario en Alegra' },
    ],
    color: 'text-sky-500',
    badgeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
    docsUrl: 'https://www.alegra.com',
  },
  CUBI: {
    id: 'CUBI',
    name: 'Cubi Facturación',
    description: 'Software de facturación electrónica colombiano',
    icon: Plug,
    requiresCertificate: false,
    requiresApiKey: true,
    fields: [
      { key: 'cubi_apiToken', label: 'API Token', placeholder: 'Token de acceso Cubi', type: 'password', required: true, description: 'Token de autenticación de la API de Cubi' },
      { key: 'cubi_nit', label: 'NIT registrado', placeholder: 'NIT registrado en Cubi', type: 'text', required: true, description: 'NIT de la empresa registrado en la plataforma Cubi' },
    ],
    color: 'text-purple-500',
    badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    docsUrl: 'https://www.cubi.co',
  },
}

// ── Main Component ────────────────────────────────────────────

export function EInvoicingConfig() {
  const { store, updateStore } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingCert, setDeletingCert] = useState(false)
  const [showCertPassword, setShowCertPassword] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Config state
  const [invoiceEnabled, setInvoiceEnabled] = useState(false)
  const [invoiceProvider, setInvoiceProvider] = useState('NONE')
  const [certificatePassword, setCertificatePassword] = useState('')
  const [softwareId, setSoftwareId] = useState('')
  const [softwarePin, setSoftwarePin] = useState('')
  const [showSoftwarePin, setShowSoftwarePin] = useState(false)
  const [providerFields, setProviderFields] = useState<Record<string, string>>({})
  const [showProviderField, setShowProviderField] = useState<Record<string, boolean>>({})

  // Certificate status
  const [certStatus, setCertStatus] = useState<{ uploaded: boolean; fileName: string | null; fileSize: number; lastModified: string | null }>({
    uploaded: false, fileName: null, fileSize: 0, lastModified: null,
  })

  // Advanced settings expanded
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Load config ──
  const loadConfig = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/electronic-invoicing/config?storeId=${store.id}`)
      if (!res.ok) {
        // If server error, use defaults — don't block the UI
        return
      }
      const data = await res.json()

      // If API returned an error object, ignore silently
      if (data.error) {
        // API error — use defaults
        return
      }

      setInvoiceEnabled(data.invoiceEnabled ?? false)
      setInvoiceProvider(data.invoiceProvider ?? 'NONE')
      setSoftwareId(data.softwareId ?? '')
      setSoftwarePin(data.softwarePin ?? '')

      // Parse provider config fields safely
      if (data.providerConfig && typeof data.providerConfig === 'object' && !Array.isArray(data.providerConfig)) {
        const fields: Record<string, string> = {}
        for (const [key, value] of Object.entries(data.providerConfig)) {
          if (typeof value === 'string') fields[key] = value
        }
        setProviderFields(fields)
      } else {
        setProviderFields({})
      }
    } catch (err) {
      // Silent fail — show defaults, don't toast error on load
    } finally {
      setLoading(false)
    }
  }, [store?.id])

  // ── Load cert status ──
  const loadCertStatus = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/electronic-invoicing/upload-certificate?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        setCertStatus(data)
      }
    } catch { /* silent */ }
  }, [store?.id])

  useEffect(() => {
    loadConfig()
    loadCertStatus()
  }, [loadConfig, loadCertStatus])

  // ── Get selected provider info ──
  const selectedProvider = PROVIDERS[invoiceProvider] || PROVIDERS.NONE

  // ── Save config ──
  async function handleSave() {
    if (!store?.id) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        storeId: store.id,
        invoiceEnabled,
        invoiceProvider,
        certificatePassword: certificatePassword || null,
        softwareId: softwareId || null,
        softwarePin: softwarePin || null,
        providerConfig: { ...providerFields },
      }

      const res = await fetch('/api/electronic-invoicing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }

      const data = await res.json()
      updateStore(data)
      toast.success('Configuración de facturación guardada correctamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  // ── Upload certificate ──
  async function handleUploadCert(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !store?.id) return

    // Validate extension
    if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
      toast.error('El archivo debe ser .p12 o .pfx')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('storeId', store.id.toString())
      formData.append('certificate', file)

      const res = await fetch('/api/electronic-invoicing/upload-certificate', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al subir certificado')
      }

      toast.success(`Certificado ${file.name} cargado exitosamente`)
      loadCertStatus()
      updateStore({ ...store, certificateUploaded: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir certificado')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Delete certificate ──
  async function handleDeleteCert() {
    if (!store?.id) return
    setDeletingCert(true)
    try {
      const res = await fetch(`/api/electronic-invoicing/upload-certificate?storeId=${store.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Certificado eliminado correctamente')
      loadCertStatus()
      updateStore({ ...store, certificateUploaded: false })
      setCertificatePassword('')
    } catch {
      toast.error('Error al eliminar certificado')
    } finally {
      setDeletingCert(false)
    }
  }

  // ── Provider field helpers ──
  function getProviderFieldValue(key: string): string {
    return providerFields[key] || ''
  }
  function setProviderFieldValue(key: string, value: string) {
    setProviderFields((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ═══════════════════════════════════════════════════════
          SECCIÓN 1: Activación de Facturación Electrónica
          ═══════════════════════════════════════════════════════ */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Facturación Electrónica
          </CardTitle>
          <CardDescription>
            Configura el sistema de facturación electrónica DIAN para tu negocio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4 hover:border-primary/20 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold">Activar Facturación Electrónica</Label>
                {invoiceEnabled ? (
                  <Badge className={`text-[10px] px-1.5 py-0 border ${selectedProvider.badgeColor}`}>
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                    Activa
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Inactiva
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Al activar, las órdenes completadas podrán generarse como facturas electrónicas válidas ante la DIAN.
              </p>
            </div>
            <Switch
              checked={invoiceEnabled}
              onCheckedChange={setInvoiceEnabled}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          {/* Info box */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <p className="font-medium">¿Qué es la Facturación Electrónica DIAN?</p>
                <p>
                  Es la obligación en Colombia de emitir facturas electrónicas que cumplen con los estándares UBL 2.1
                  de la DIAN. Requiere un certificado digital (.p12) o un proveedor autorizado como Simba.
                </p>
                <p>
                  Ventify POS soporta <strong>dos modos híbridos</strong>: con certificado propio (DIAN Directo) o a
                  través de un proveedor de servicios (Simba, Alegra, Cubi, etc.).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Show provider config only if enabled */}
      {invoiceEnabled && (
        <>
          {/* ═══════════════════════════════════════════════════════
              SECCIÓN 2: Selección de Proveedor
              ═══════════════════════════════════════════════════════ */}
          <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Proveedor de Facturación
              </CardTitle>
              <CardDescription>
                Elige cómo se conectará tu sistema con la DIAN
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Método de Conexión</Label>
                <Select value={invoiceProvider} onValueChange={(val) => {
                  setInvoiceProvider(val)
                  if (val !== 'DIAN_DIRECT') {
                    setSoftwareId('')
                    setSoftwarePin('')
                  }
                }}>
                  <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDERS).map(([key, provider]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <provider.icon className={`h-4 w-4 ${provider.color}`} />
                          <span>{provider.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected provider description */}
              <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = selectedProvider.icon; return <Icon className={`h-4 w-4 ${selectedProvider.color}`} /> })()}
                  <p className="text-sm font-medium">{selectedProvider.name}</p>
                  {selectedProvider.docsUrl && (
                    <a
                      href={selectedProvider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-0.5 ml-auto"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Documentación
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{selectedProvider.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  {selectedProvider.requiresCertificate && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <KeyRound className="h-2.5 w-2.5" />
                      Requiere Certificado .p12
                    </Badge>
                  )}
                  {selectedProvider.requiresApiKey && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      Requiere API Key
                    </Badge>
                  )}
                </div>
              </div>

              {/* DIAN Direct fields */}
              {invoiceProvider === 'DIAN_DIRECT' && (
                <div className="space-y-4">
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="software-id" className="text-xs font-medium">Software ID *</Label>
                      <Input
                        id="software-id"
                        value={softwareId}
                        onChange={(e) => setSoftwareId(e.target.value)}
                        placeholder="a4713d4b-6d7e-4b8f..."
                        className="focus-visible:ring-primary/20 focus-visible:border-primary/40 font-mono text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Registrado en la DIAN al habilitar tu software como facturador
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="software-pin" className="text-xs font-medium">PIN del Software *</Label>
                      <div className="relative">
                        <Input
                          id="software-pin"
                          type={showSoftwarePin ? 'text' : 'password'}
                          value={softwarePin}
                          onChange={(e) => setSoftwarePin(e.target.value)}
                          placeholder="123456"
                          maxLength={6}
                          className="pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSoftwarePin(!showSoftwarePin)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSoftwarePin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        PIN de 6 dígitos asignado por la DIAN
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Provider-specific API fields (Simba, Alegra, etc.) */}
              {selectedProvider.requiresApiKey && selectedProvider.fields.length > 0 && (
                <div className="space-y-4">
                  <Separator />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Configuración de {selectedProvider.name}
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    {selectedProvider.fields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={field.key} className="text-xs font-medium">
                          {field.label} {field.required && <span className="text-destructive">*</span>}
                        </Label>
                        <div className="relative">
                          <Input
                            id={field.key}
                            type={(showProviderField[field.key] || field.type !== 'password') ? 'text' : 'password'}
                            value={getProviderFieldValue(field.key)}
                            onChange={(e) => setProviderFieldValue(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className={field.type === 'password' ? 'pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40 font-mono text-xs' : 'focus-visible:ring-primary/20 focus-visible:border-primary/40 font-mono text-xs'}
                          />
                          {field.type === 'password' && (
                            <button
                              type="button"
                              onClick={() => setShowProviderField((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showProviderField[field.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        {field.description && (
                          <p className="text-[10px] text-muted-foreground">{field.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══════════════════════════════════════════════════════
              SECCIÓN 3: Certificado .p12 (solo DIAN Directo)
              ═══════════════════════════════════════════════════════ */}
          {invoiceProvider === 'DIAN_DIRECT' && (
            <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-500" />
                  Certificado Digital (.p12)
                </CardTitle>
                <CardDescription>
                  Tu firma digital para facturar directamente con la DIAN
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Certificate Status */}
                {certStatus.uploaded ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        Certificado Cargado
                      </p>
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                        Activo
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                      <div>
                        <span className="text-muted-foreground">Archivo:</span>{' '}
                        <span className="font-mono">{certStatus.fileName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tamaño:</span>{' '}
                        <span className="font-mono">{(certStatus.fileSize / 1024).toFixed(1)} KB</span>
                      </div>
                      {certStatus.lastModified && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Última carga:</span>{' '}
                          <span>{new Date(certStatus.lastModified).toLocaleString('es-CO')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Reemplazar Certificado
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10">
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar certificado?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará el certificado .p12 del servidor. Podrás subir uno nuevo en cualquier momento.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteCert} disabled={deletingCert}>
                              {deletingCert ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div
                      className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-all group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Upload className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <p className="text-sm font-medium">Arrastra o haz clic para subir</p>
                      <p className="text-xs text-muted-foreground mt-1">Archivos .p12 o .pfx (máximo 50KB)</p>
                      {uploading && <Loader2 className="h-4 w-4 animate-spin text-primary mt-2" />}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".p12,.pfx"
                      className="hidden"
                      onChange={handleUploadCert}
                    />
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".p12,.pfx"
                  className="hidden"
                  onChange={handleUploadCert}
                />

                <Separator />

                {/* Certificate Password */}
                <div className="space-y-2">
                  <Label htmlFor="cert-password" className="text-xs font-medium flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    Contraseña del Certificado
                  </Label>
                  <div className="relative">
                    <Input
                      id="cert-password"
                      type={showCertPassword ? 'text' : 'password'}
                      value={certificatePassword}
                      onChange={(e) => setCertificatePassword(e.target.value)}
                      placeholder="Contraseña que protege tu .p12"
                      className="pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCertPassword(!showCertPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCertPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    La contraseña que usaste al crear/exportar el certificado .p12 desde la DIAN o tu entidad certificadora.
                  </p>
                </div>

                {/* Certificate info */}
                <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Sobre el Certificado .p12</p>
                      <p>
                        El certificado .p12 es tu firma digital emitida por una entidad certificadora autorizada por la DIAN
                        (ej: Certicámara, Camerfirma, Andercol). Es obligatorio para facturar electrónicamente en modo directo.
                      </p>
                      <p>
                        Si no tienes uno, puedes obtenerlo a través de tu proveedor o contratar directamente con una
                        entidad certificadora. También puedes usar un proveedor como Simba que gestiona el certificado por ti.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECCIÓN 4: Configuración Avanzada
              ═══════════════════════════════════════════════════════ */}
          <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
            <CardHeader className="pb-3">
              <button
                type="button"
                className="w-full flex items-center justify-between text-left"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Configuración Avanzada
                </CardTitle>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {showAdvanced && (
              <CardContent className="space-y-4">
                {/* Mode test/production */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:border-primary/20 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Modo Habilitación (Test)</Label>
                    <p className="text-xs text-muted-foreground">
                      {store?.invoiceTestMode
                        ? 'En modo test, las facturas no se envían realmente a la DIAN.'
                        : 'En producción, cada factura se envía y valida con la DIAN.'}
                    </p>
                  </div>
                  <Badge className={store?.invoiceTestMode ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}>
                    {store?.invoiceTestMode ? 'TEST' : 'PRODUCCIÓN'}
                  </Badge>
                </div>

                {/* Provider comparison table */}
                <Separator />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comparación de Proveedores</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-medium">Proveedor</th>
                        <th className="text-center p-2 font-medium">Cert. .p12</th>
                        <th className="text-center p-2 font-medium">API Key</th>
                        <th className="text-center p-2 font-medium">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        { name: 'DIAN Directo', cert: true, api: false, cost: 'Solo certificado', color: 'text-amber-500' },
                        { name: 'Simba', cert: false, api: true, cost: 'Desde $0 + uso', color: 'text-emerald-500' },
                        { name: 'Alegra', cert: false, api: true, cost: 'Desde $29.900/mes', color: 'text-sky-500' },
                        { name: 'Cubi', cert: false, api: true, cost: 'Desde $0 + uso', color: 'text-purple-500' },
                      ].map((p) => (
                        <tr key={p.name} className="hover:bg-muted/30">
                          <td className="p-2 font-medium">{p.name}</td>
                          <td className="p-2 text-center">{p.cert ? '✅' : '—'}</td>
                          <td className="p-2 text-center">{p.api ? '✅' : '—'}</td>
                          <td className="p-2 text-center text-muted-foreground">{p.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                      <p className="font-medium">Antes de ir a producción</p>
                      <p>
                        La DIAN requiere un periodo de <strong>habilitación</strong> (pruebas) antes de autorizar
                        la emisión en producción. Debes enviar y recibir validación de al menos 10 facturas
                        de prueba antes de solicitar el cambio a producción.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* ═══════════════════════════════════════════════════════
              SAVE BUTTON
              ═══════════════════════════════════════════════════════ */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full gap-2 active:scale-[0.98] transition-all h-11"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Configuración de Facturación
          </Button>
        </>
      )}
    </div>
  )
}
