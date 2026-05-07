'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Users, Search, Phone, Mail, MapPin, Building2, FileText,
  MessageCircle, ChevronDown, Eye, Trash2, CheckCircle2,
  XCircle, AlertTriangle, Clock, ArrowRight, ExternalLink,
  X, FileCheck, FileWarning, UserCheck, UserX, ShieldCheck,
  RefreshCw, Loader2, Pencil, Save, Upload,
} from 'lucide-react'
import type { LeadData, LeadsStats } from './types'

// ─── Status Configuration ───
const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; icon: typeof Clock }> = {
  NEW: { label: 'Nuevo', color: 'text-amber-400', bgClass: 'bg-amber-500/10 border-amber-500/20 text-amber-400', icon: Clock },
  CONTACTED: { label: 'Contactado', color: 'text-sky-400', bgClass: 'bg-sky-500/10 border-sky-500/20 text-sky-400', icon: Phone },
  APPROVED: { label: 'Aprobado', color: 'text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', icon: CheckCircle2 },
  REJECTED: { label: 'Rechazado', color: 'text-red-400', bgClass: 'bg-red-500/10 border-red-500/20 text-red-400', icon: XCircle },
  CONVERTED: { label: 'Convertido', color: 'text-violet-400', bgClass: 'bg-violet-500/10 border-violet-500/20 text-violet-400', icon: ShieldCheck },
}

const SOURCE_LABELS: Record<string, string> = {
  WEB: 'Web',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referido',
}

type FilterTab = 'ALL' | 'NEW' | 'CONTACTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED'

// ─── Edit form state interface ───
interface EditFormData {
  ownerFullName: string
  ownerEmail: string
  ownerPhone: string
  storeName: string
  nit: string
  legalName: string
  businessType: string
  storePhone: string
  department: string
  cityName: string
  address: string
  hasCamaraComercio: boolean
  registrationNumber: string
  notes: string
  // Files
  rutFileBase64: string
  rutFileName: string
  rutFileType: string
  camaraFileBase64: string
  camaraFileName: string
  camaraFileType: string
}

// ─── Relative Time Helper ───
function relativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'hace un momento'
  if (diffMins < 60) return `hace ${diffMins} min`
  if (diffHours < 24) return `hace ${diffHours}h`
  if (diffDays === 1) return 'ayer'
  if (diffDays < 30) return `hace ${diffDays} días`
  if (diffDays < 365) return `hace ${Math.floor(diffDays / 30)} meses`
  return `hace ${Math.floor(diffDays / 365)} años`
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── KPI Card ───
function KPICard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  )
}

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.NEW
  return (
    <Badge variant="outline" className={config.bgClass}>
      {config.label}
    </Badge>
  )
}

// ─── Document Indicator ───
function DocIndicator({ label, hasFile }: { label: string; hasFile: boolean }) {
  if (hasFile) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400" title={`${label} subido`}>
        <FileCheck className="h-3 w-3" />
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500" title={`${label} pendiente`}>
      <FileWarning className="h-3 w-3" />
      {label}
    </span>
  )
}

// ─── File Upload Area ───
function FileUploadArea({
  label,
  currentFileName,
  currentFileSize,
  currentFileType,
  fileBase64,
  fileName,
  onFileSelect,
  onRemoveFile,
  leadId,
  fileType,
}: {
  label: string
  currentFileName?: string | null
  currentFileSize?: number | null
  currentFileType?: string | null
  fileBase64: string
  fileName: string
  onFileSelect: (base64: string, name: string, type: string) => void
  onRemoveFile: () => void
  leadId: number
  fileType: 'rut' | 'camara'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const acceptTypes = 'application/pdf,image/png,image/jpeg,image/webp'

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no puede ser mayor a 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      onFileSelect(base64, file.name, file.type)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const showExisting = currentFileName && !fileBase64
  const showNewFile = fileBase64 && fileName

  return (
    <div className="space-y-2">
      {/* Existing file info */}
      {showExisting && (
        <div className="flex items-center justify-between rounded-md bg-zinc-900 border border-zinc-800 p-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-zinc-300 truncate">{currentFileName}</p>
              <p className="text-[10px] text-zinc-500">
                {formatFileSize(currentFileSize || null)} · {currentFileType}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={`/api/super-admin/leads/${leadId}/files?type=${fileType}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-zinc-700">
                <ExternalLink className="h-2.5 w-2.5" />Ver
              </Button>
            </a>
          </div>
        </div>
      )}

      {/* New file selected preview */}
      {showNewFile && (
        <div className="flex items-center justify-between rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2">
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-300 truncate">{fileName}</p>
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">Nuevo</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-400 hover:text-red-400" onClick={onRemoveFile}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Upload drop zone */}
      <div
        className={`relative rounded-md border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/30'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          className="hidden"
          onChange={handleChange}
        />
        <Upload className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
        <p className="text-[10px] text-zinc-500">
          Arrastra o haz clic para subir {label}
        </p>
        <p className="text-[9px] text-zinc-600 mt-0.5">PDF, PNG, JPG, WEBP (máx. 5MB)</p>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───
export function LeadsView() {
  // ── State ──
  const [leads, setLeads] = useState<LeadData[]>([])
  const [stats, setStats] = useState<LeadsStats>({ new: 0, contacted: 0, approved: 0, rejected: 0, converted: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLead, setSelectedLead] = useState<LeadData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // ── Edit mode state ──
  const [isEditing, setIsEditing] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // ── View document (fetches with auth, opens as blob) ──
  async function viewDocument(leadId: number, type: 'rut' | 'camara', fileName?: string | null) {
    try {
      // Get token from localStorage
      let token: string | null = null
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('pos-auth')
          if (raw) {
            const parsed = JSON.parse(raw)
            token = parsed?.state?.token || parsed?.token || null
          }
        } catch { /* ignore */ }
      }

      if (!token) {
        toast.error('Sesión expirada. Inicia sesión de nuevo.')
        return
      }

      const fileRes = await fetch(`/api/super-admin/leads/${leadId}/files?type=${type}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!fileRes.ok) {
        toast.error('Error al cargar el documento')
        return
      }

      const blob = await fileRes.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || `documento_${type}`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      toast.error('Error de conexión al cargar el documento')
    }
  }

  const [editForm, setEditForm] = useState<EditFormData>({
    ownerFullName: '',
    ownerEmail: '',
    ownerPhone: '',
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
    notes: '',
    rutFileBase64: '',
    rutFileName: '',
    rutFileType: '',
    camaraFileBase64: '',
    camaraFileName: '',
    camaraFileType: '',
  })

  // ── Fetch leads ──
  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== 'ALL') params.set('status', activeTab)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(`/api/super-admin/leads?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar leads')
      const data = await res.json()
      setLeads(data.leads || [])
      setStats(data.stats || { new: 0, contacted: 0, approved: 0, rejected: 0, converted: 0, total: 0 })
    } catch {
      toast.error('Error al cargar leads')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // ── Fetch single lead for detail ──
  const openDetail = async (lead: LeadData) => {
    setSelectedLead(lead)
    setNotesText(lead.notes || '')
    setIsEditing(false)
    setDetailOpen(true)

    // Fetch fresh data for the detail
    try {
      const res = await fetch(`/api/super-admin/leads/${lead.id}`)
      if (res.ok) {
        const fresh = await res.json()
        setSelectedLead(fresh)
        setNotesText(fresh.notes || '')
      }
    } catch {
      // Use the data we already have
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setSelectedLead(null)
    setIsEditing(false)
  }

  // ── Edit helpers ──
  const startEditing = () => {
    if (!selectedLead) return
    setEditForm({
      ownerFullName: selectedLead.ownerFullName,
      ownerEmail: selectedLead.ownerEmail || '',
      ownerPhone: selectedLead.ownerPhone || '',
      storeName: selectedLead.storeName,
      nit: selectedLead.nit,
      legalName: selectedLead.legalName,
      businessType: selectedLead.businessType,
      storePhone: selectedLead.storePhone || '',
      department: selectedLead.department || '',
      cityName: selectedLead.cityName || '',
      address: selectedLead.address || '',
      hasCamaraComercio: selectedLead.hasCamaraComercio,
      registrationNumber: selectedLead.registrationNumber || '',
      notes: selectedLead.notes || '',
      rutFileBase64: '',
      rutFileName: '',
      rutFileType: '',
      camaraFileBase64: '',
      camaraFileName: '',
      camaraFileType: '',
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const updateField = (field: keyof EditFormData, value: string | boolean) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Save edit form ──
  const saveEdit = async () => {
    if (!selectedLead) return
    setEditSaving(true)
    try {
      const payload: Record<string, unknown> = {
        ownerFullName: editForm.ownerFullName,
        ownerEmail: editForm.ownerEmail || null,
        ownerPhone: editForm.ownerPhone || null,
        storeName: editForm.storeName,
        nit: editForm.nit,
        legalName: editForm.legalName,
        businessType: editForm.businessType,
        storePhone: editForm.storePhone || null,
        department: editForm.department || null,
        cityName: editForm.cityName || null,
        address: editForm.address || null,
        hasCamaraComercio: editForm.hasCamaraComercio,
        registrationNumber: editForm.registrationNumber || null,
        notes: editForm.notes,
      }

      // Add file uploads if present
      if (editForm.rutFileBase64 && editForm.rutFileName) {
        payload.rutFileBase64 = editForm.rutFileBase64
        payload.rutFileName = editForm.rutFileName
        payload.rutFileType = editForm.rutFileType
      }
      if (editForm.camaraFileBase64 && editForm.camaraFileName) {
        payload.camaraFileBase64 = editForm.camaraFileBase64
        payload.camaraFileName = editForm.camaraFileName
        payload.camaraFileType = editForm.camaraFileType
      }

      const res = await fetch(`/api/super-admin/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }

      toast.success('Lead actualizado correctamente')
      setIsEditing(false)

      // Refresh detail
      const freshRes = await fetch(`/api/super-admin/leads/${selectedLead.id}`)
      if (freshRes.ok) {
        const fresh = await freshRes.json()
        setSelectedLead(fresh)
        setNotesText(fresh.notes || '')
      }
      fetchLeads()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar cambios')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Status change ──
  const changeStatus = async (leadId: number, newStatus: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/super-admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al cambiar estado')
      }
      const config = STATUS_CONFIG[newStatus]
      toast.success(`Estado cambiado a "${config?.label || newStatus}"`)
      fetchLeads()
      // Refresh detail
      if (selectedLead?.id === leadId) {
        const freshRes = await fetch(`/api/super-admin/leads/${leadId}`)
        if (freshRes.ok) {
          const fresh = await freshRes.json()
          setSelectedLead(fresh)
          setNotesText(fresh.notes || '')
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar estado')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Approve / Convert ──
  const approveLead = async (leadId: number) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/super-admin/leads/${leadId}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al convertir lead')
      }
      const data = await res.json()
      toast.success(data.message || 'Lead convertido exitosamente')
      fetchLeads()
      // Refresh detail
      if (selectedLead?.id === leadId) {
        const freshRes = await fetch(`/api/super-admin/leads/${leadId}`)
        if (freshRes.ok) {
          const fresh = await freshRes.json()
          setSelectedLead(fresh)
          setNotesText(fresh.notes || '')
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir lead')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Delete ──
  const deleteLead = async (leadId: number) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/super-admin/leads/${leadId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar lead')
      }
      toast.success('Lead eliminado exitosamente')
      closeDetail()
      fetchLeads()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar lead')
    } finally {
      setActionLoading(false)
      setDeleteDialogOpen(false)
    }
  }

  // ── Save notes (view mode only) ──
  const saveNotes = async () => {
    if (!selectedLead || isEditing) return
    setNotesSaving(true)
    try {
      const res = await fetch(`/api/super-admin/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText }),
      })
      if (!res.ok) throw new Error()
      toast.success('Notas guardadas')
    } catch {
      toast.error('Error al guardar notas')
    } finally {
      setNotesSaving(false)
    }
  }

  // ── WhatsApp link ───
  const waLink = (phone: string | null) => {
    if (!phone) return '#'
    const clean = phone.replace(/[^0-9]/g, '')
    return `https://wa.me/57${clean}`
  }

  const waMessage = (name: string) => {
    return encodeURIComponent(`Hola ${name}, somos el equipo de VentifyPOS. Estamos revisando tu solicitud de prueba...`)
  }

  // ── Tab definitions ──
  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'ALL', label: 'Todos', count: stats.total },
    { key: 'NEW', label: 'Nuevos', count: stats.new },
    { key: 'CONTACTED', label: 'Contactados', count: stats.contacted },
    { key: 'APPROVED', label: 'Aprobados', count: stats.approved },
    { key: 'REJECTED', label: 'Rechazados', count: stats.rejected },
    { key: 'CONVERTED', label: 'Convertidos', count: stats.converted },
  ]

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Total Leads" value={stats.total} color="bg-zinc-600/20 text-zinc-300" icon={Users} />
        <KPICard label="Nuevos" value={stats.new} color="bg-amber-500/20 text-amber-400" icon={Clock} />
        <KPICard label="Contactados" value={stats.contacted} color="bg-sky-500/20 text-sky-400" icon={Phone} />
        <KPICard label="Aprobados" value={stats.approved} color="bg-emerald-500/20 text-emerald-400" icon={CheckCircle2} />
        <KPICard label="Rechazados" value={stats.rejected} color="bg-red-500/20 text-red-400" icon={XCircle} />
        <KPICard label="Convertidos" value={stats.converted} color="bg-violet-500/20 text-violet-400" icon={ShieldCheck} />
      </div>

      {/* ── Filters Row ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 flex-wrap rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'text-primary-foreground/70' : 'text-zinc-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Buscar por nombre, cédula, NIT..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-zinc-900/50 border-zinc-800"
          />
        </div>
      </div>

      {/* ── Leads Table ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            <span className="ml-3 text-sm text-zinc-500">Cargando leads...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <Users className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No hay leads</p>
            <p className="text-xs mt-1">
              {searchQuery ? 'Intenta con otro término de búsqueda' : 'Los leads aparecerán aquí cuando se registren'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-3 font-medium">Propietario</th>
                    <th className="text-left px-4 py-3 font-medium">Empresa</th>
                    <th className="text-left px-4 py-3 font-medium">Contacto</th>
                    <th className="text-left px-4 py-3 font-medium">Ubicación</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium">Documentos</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Fecha</th>
                    <th className="text-right px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr
                      key={lead.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => openDetail(lead)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-zinc-100">{lead.ownerFullName}</p>
                          <p className="text-xs text-zinc-500">CC: {lead.ownerCedula}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-zinc-100">{lead.storeName}</p>
                          <p className="text-xs text-zinc-500">NIT: {lead.nit}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {lead.ownerPhone && (
                            <a
                              href={waLink(lead.ownerPhone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-green-400 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3 w-3" />{lead.ownerPhone}
                            </a>
                          )}
                          {lead.ownerEmail && (
                            <a
                              href={`mailto:${lead.ownerEmail}`}
                              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-sky-400 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Mail className="h-3 w-3" />{lead.ownerEmail}
                            </a>
                          )}
                          {!lead.ownerPhone && !lead.ownerEmail && (
                            <span className="text-xs text-zinc-600">Sin contacto</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs text-zinc-300">{lead.department || '—'}</p>
                          <p className="text-xs text-zinc-500">{lead.cityName || '—'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                          {lead.businessType === 'JURIDICA' ? 'Jurídica' : 'Natural'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <DocIndicator label="RUT" hasFile={!!lead.rutFilePath} />
                          <DocIndicator label="Cámara" hasFile={lead.camaraFilePath} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-zinc-500">{relativeTime(lead.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openDetail(lead)}
                          >
                            <Eye className="h-3 w-3" />Ver
                          </Button>
                          {lead.ownerPhone && (
                            <a
                              href={waLink(lead.ownerPhone)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-400 hover:text-green-300 hover:bg-green-400/10">
                                <MessageCircle className="h-3 w-3" />WA
                              </Button>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-zinc-800/50">
              {leads.map(lead => (
                <div
                  key={lead.id}
                  className="p-4 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                  onClick={() => openDetail(lead)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-zinc-100">{lead.ownerFullName}</p>
                      <p className="text-xs text-zinc-500">CC: {lead.ownerCedula}</p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                  <div className="space-y-1 mb-3">
                    <p className="text-sm text-zinc-300">{lead.storeName}</p>
                    <p className="text-xs text-zinc-500">NIT: {lead.nit} · {lead.businessType === 'JURIDICA' ? 'Jurídica' : 'Natural'}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2">
                    <MapPin className="h-3 w-3" />
                    <span>{[lead.department, lead.cityName].filter(Boolean).join(', ') || 'Sin ubicación'}</span>
                    <span className="ml-auto">{relativeTime(lead.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <DocIndicator label="RUT" hasFile={!!lead.rutFilePath} />
                    <DocIndicator label="Cámara" hasFile={lead.camaraFilePath} />
                  </div>
                </div>
              ))}
            </div>

            {/* Count Footer */}
            <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Mostrando {leads.length} de {stats.total} leads
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Detail Slide-Over Panel ── */}
      <Sheet open={detailOpen} onOpenChange={(open) => { if (!open) closeDetail() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto bg-zinc-950 border-zinc-800">
          {selectedLead && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="px-4 pt-4 pb-2 flex-shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <SheetTitle className="text-lg text-zinc-100">{selectedLead.storeName}</SheetTitle>
                    <SheetDescription className="text-xs">
                      Lead #{selectedLead.id} · {selectedLead.source ? SOURCE_LABELS[selectedLead.source] : 'N/A'} · {relativeTime(selectedLead.createdAt)}
                    </SheetDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Edit / Save / Cancel buttons */}
                    {selectedLead.status !== 'CONVERTED' && (
                      isEditing ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 border-zinc-700 text-xs"
                            onClick={cancelEditing}
                            disabled={editSaving}
                          >
                            <X className="h-3 w-3" />Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                            onClick={saveEdit}
                            disabled={editSaving}
                          >
                            {editSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Guardar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-zinc-700 text-xs"
                          onClick={startEditing}
                          disabled={actionLoading}
                        >
                          <Pencil className="h-3 w-3" />Editar
                        </Button>
                      )
                    )}
                    {!isEditing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 gap-1 border-zinc-700 text-xs" disabled={actionLoading}>
                            {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
                            Estado
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          {Object.entries(STATUS_CONFIG)
                            .filter(([key]) => key !== selectedLead.status)
                            .map(([key, config]) => (
                              <DropdownMenuItem
                                key={key}
                                onClick={() => changeStatus(selectedLead.id, key)}
                                className={`text-xs ${config.color} focus:${config.color}`}
                              >
                                {config.label}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-500 hover:text-red-400"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <StatusBadge status={selectedLead.status} />
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                    {selectedLead.businessType === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Natural'}
                  </Badge>
                  {/* Doc indicators in header */}
                  <DocIndicator label="RUT" hasFile={!!selectedLead.rutFilePath} />
                  <DocIndicator label="Cámara" hasFile={selectedLead.camaraFilePath} />
                </div>

                {/* WhatsApp contact button */}
                {selectedLead.ownerPhone && !isEditing && (
                  <div className="pt-2">
                    <a
                      href={`${waLink(selectedLead.ownerPhone)}?text=${waMessage(selectedLead.ownerFullName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        size="sm"
                        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Contactar por WhatsApp
                      </Button>
                    </a>
                  </div>
                )}
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
                {/* ═══════════════════ EDIT MODE ═══════════════════ */}
                {isEditing ? (
                  <>
                    {/* ── Contacto (Edit) ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <Users className="h-4 w-4" />Contacto
                      </h3>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Nombre completo</Label>
                          <Input
                            value={editForm.ownerFullName}
                            onChange={(e) => updateField('ownerFullName', e.target.value)}
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Email</Label>
                          <Input
                            type="email"
                            value={editForm.ownerEmail}
                            onChange={(e) => updateField('ownerEmail', e.target.value)}
                            placeholder="correo@ejemplo.com"
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Teléfono</Label>
                          <Input
                            value={editForm.ownerPhone}
                            onChange={(e) => updateField('ownerPhone', e.target.value)}
                            placeholder="3001234567"
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                      </div>
                    </section>

                    {/* ── Empresa (Edit) ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <Building2 className="h-4 w-4" />Empresa
                      </h3>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Nombre tienda</Label>
                          <Input
                            value={editForm.storeName}
                            onChange={(e) => updateField('storeName', e.target.value)}
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">NIT</Label>
                          <Input
                            value={editForm.nit}
                            onChange={(e) => updateField('nit', e.target.value)}
                            className="h-8 text-sm bg-zinc-800 border-zinc-700 font-mono"
                          />
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Razón social</Label>
                          <Input
                            value={editForm.legalName}
                            onChange={(e) => updateField('legalName', e.target.value)}
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Tipo empresa</Label>
                          <Select
                            value={editForm.businessType}
                            onValueChange={(v) => updateField('businessType', v)}
                          >
                            <SelectTrigger className="h-8 text-sm bg-zinc-800 border-zinc-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="NATURAL">Persona Natural</SelectItem>
                              <SelectItem value="JURIDICA">Persona Jurídica</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Teléfono tienda</Label>
                          <Input
                            value={editForm.storePhone}
                            onChange={(e) => updateField('storePhone', e.target.value)}
                            placeholder="Opcional"
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-500">Departamento</Label>
                            <Input
                              value={editForm.department}
                              onChange={(e) => updateField('department', e.target.value)}
                              placeholder="Ej: Antioquia"
                              className="h-8 text-sm bg-zinc-800 border-zinc-700"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-500">Ciudad</Label>
                            <Input
                              value={editForm.cityName}
                              onChange={(e) => updateField('cityName', e.target.value)}
                              placeholder="Ej: Medellín"
                              className="h-8 text-sm bg-zinc-800 border-zinc-700"
                            />
                          </div>
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-500">Dirección</Label>
                          <Input
                            value={editForm.address}
                            onChange={(e) => updateField('address', e.target.value)}
                            placeholder="Calle 1 # 2-3"
                            className="h-8 text-sm bg-zinc-800 border-zinc-700"
                          />
                        </div>
                      </div>
                    </section>

                    {/* ── Documentos (Edit) ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <FileText className="h-4 w-4" />Documentos
                      </h3>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-4">
                        {/* RUT */}
                        <div className="space-y-2">
                          <Label className="text-xs text-zinc-400 font-medium">RUT / Documento tributario</Label>
                          <FileUploadArea
                            label="RUT"
                            currentFileName={selectedLead.rutFileName}
                            currentFileSize={selectedLead.rutFileSize}
                            currentFileType={selectedLead.rutFileType}
                            fileBase64={editForm.rutFileBase64}
                            fileName={editForm.rutFileName}
                            onFileSelect={(base64, name, type) => {
                              setEditForm(prev => ({ ...prev, rutFileBase64: base64, rutFileName: name, rutFileType: type }))
                            }}
                            onRemoveFile={() => {
                              setEditForm(prev => ({ ...prev, rutFileBase64: '', rutFileName: '', rutFileType: '' }))
                            }}
                            leadId={selectedLead.id}
                            fileType="rut"
                          />
                        </div>

                        <Separator className="bg-zinc-800" />

                        {/* Cámara de Comercio */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-zinc-400 font-medium">Cámara de Comercio</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={editForm.hasCamaraComercio}
                                onCheckedChange={(v) => updateField('hasCamaraComercio', v)}
                                className="data-[state=checked]:bg-emerald-600"
                              />
                              <span className="text-[10px] text-zinc-500">
                                {editForm.hasCamaraComercio ? 'Sí' : 'No'}
                              </span>
                            </div>
                          </div>
                          {editForm.hasCamaraComercio && (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-500">Nro. de matrícula</Label>
                                <Input
                                  value={editForm.registrationNumber}
                                  onChange={(e) => updateField('registrationNumber', e.target.value)}
                                  placeholder="Número de matrícula"
                                  className="h-8 text-sm bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <FileUploadArea
                                label="Cámara de Comercio"
                                currentFileName={selectedLead.camaraFileName}
                                currentFileSize={selectedLead.camaraFileSize}
                                currentFileType={selectedLead.camaraFileType}
                                fileBase64={editForm.camaraFileBase64}
                                fileName={editForm.camaraFileName}
                                onFileSelect={(base64, name, type) => {
                                  setEditForm(prev => ({ ...prev, camaraFileBase64: base64, camaraFileName: name, camaraFileType: type }))
                                }}
                                onRemoveFile={() => {
                                  setEditForm(prev => ({ ...prev, camaraFileBase64: '', camaraFileName: '', camaraFileType: '' }))
                                }}
                                leadId={selectedLead.id}
                                fileType="camara"
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* ── Notas (Edit) ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <FileText className="h-4 w-4" />Notas
                      </h3>
                      <Textarea
                        value={editForm.notes}
                        onChange={(e) => updateField('notes', e.target.value)}
                        placeholder="Agregar notas sobre este lead..."
                        className="min-h-[100px] bg-zinc-900/50 border-zinc-800 text-sm resize-none"
                      />
                    </section>
                  </>
                ) : (
                  <>
                    {/* ═══════════════════ VIEW MODE ═══════════════════ */}

                    {/* ── Contacto ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <Users className="h-4 w-4" />Contacto
                      </h3>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Nombre completo</span>
                          <span className="text-sm text-zinc-200 font-medium">{selectedLead.ownerFullName}</span>
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Cédula</span>
                          <span className="text-sm text-zinc-200 font-mono">{selectedLead.ownerCedula}</span>
                        </div>
                        <Separator className="bg-zinc-800" />
                        {selectedLead.ownerPhone ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Teléfono</span>
                              <a
                                href={waLink(selectedLead.ownerPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-green-400 hover:underline flex items-center gap-1"
                              >
                                <MessageCircle className="h-3 w-3" />
                                {selectedLead.ownerPhone}
                              </a>
                            </div>
                            <Separator className="bg-zinc-800" />
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Teléfono</span>
                              <span className="text-xs text-zinc-600">No proporcionado</span>
                            </div>
                            <Separator className="bg-zinc-800" />
                          </>
                        )}
                        {selectedLead.ownerEmail ? (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Email</span>
                            <a
                              href={`mailto:${selectedLead.ownerEmail}`}
                              className="text-sm text-sky-400 hover:underline flex items-center gap-1"
                            >
                              <Mail className="h-3 w-3" />
                              {selectedLead.ownerEmail}
                            </a>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Email</span>
                            <span className="text-xs text-zinc-600">No proporcionado</span>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* ── Empresa ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <Building2 className="h-4 w-4" />Empresa
                      </h3>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Nombre tienda</span>
                          <span className="text-sm text-zinc-200 font-medium">{selectedLead.storeName}</span>
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">NIT</span>
                          <span className="text-sm text-zinc-200 font-mono">{selectedLead.nit}</span>
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Razón social</span>
                          <span className="text-sm text-zinc-200">{selectedLead.legalName}</span>
                        </div>
                        <Separator className="bg-zinc-800" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Tipo empresa</span>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                            {selectedLead.businessType === 'JURIDICA' ? 'Jurídica' : 'Natural'}
                          </Badge>
                        </div>
                        {selectedLead.storePhone && (
                          <>
                            <Separator className="bg-zinc-800" />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Teléfono tienda</span>
                              <span className="text-sm text-zinc-200">{selectedLead.storePhone}</span>
                            </div>
                          </>
                        )}
                        {(selectedLead.department || selectedLead.cityName) && (
                          <>
                            <Separator className="bg-zinc-800" />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Ubicación</span>
                              <span className="text-sm text-zinc-200 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[selectedLead.department, selectedLead.cityName].filter(Boolean).join(', ')}
                              </span>
                            </div>
                          </>
                        )}
                        {selectedLead.address && (
                          <>
                            <Separator className="bg-zinc-800" />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Dirección</span>
                              <span className="text-sm text-zinc-200 text-right max-w-[200px]">{selectedLead.address}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </section>

                    {/* ── Documentos ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <FileText className="h-4 w-4" />Documentos
                      </h3>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
                        {/* RUT */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {selectedLead.rutFilePath
                              ? <FileCheck className="h-4 w-4 text-emerald-400" />
                              : <FileWarning className="h-4 w-4 text-amber-500/60" />}
                            <div>
                              <p className="text-xs text-zinc-300">RUT / Documento tributario</p>
                              {selectedLead.rutFileName && (
                                <p className="text-[10px] text-zinc-500">
                                  {selectedLead.rutFileName} · {formatFileSize(selectedLead.rutFileSize)} · {selectedLead.rutFileType}
                                </p>
                              )}
                            </div>
                          </div>
                          {selectedLead.rutFilePath ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 border-zinc-700"
                              onClick={() => viewDocument(selectedLead.id, 'rut', selectedLead.rutFileName)}
                            >
                              <ExternalLink className="h-3 w-3" />Ver documento
                            </Button>
                          ) : (
                            <span className="text-[10px] text-amber-500/60 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />Pendiente
                            </span>
                          )}
                        </div>

                        <Separator className="bg-zinc-800" />

                        {/* Cámara de Comercio */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {selectedLead.hasCamaraComercio
                              ? <FileCheck className="h-4 w-4 text-emerald-400" />
                              : <FileWarning className="h-4 w-4 text-amber-500/60" />}
                            <div>
                              <p className="text-xs text-zinc-300">Cámara de Comercio</p>
                              {selectedLead.registrationNumber && (
                                <p className="text-[10px] text-zinc-500">
                                  Matrícula: {selectedLead.registrationNumber}
                                </p>
                              )}
                              {selectedLead.camaraFileName && (
                                <p className="text-[10px] text-zinc-500">
                                  {selectedLead.camaraFileName} · {formatFileSize(selectedLead.camaraFileSize)} · {selectedLead.camaraFileType}
                                </p>
                              )}
                            </div>
                          </div>
                          {selectedLead.camaraFilePath ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 border-zinc-700"
                              onClick={() => viewDocument(selectedLead.id, 'camara', selectedLead.camaraFileName)}
                            >
                              <ExternalLink className="h-3 w-3" />Ver documento
                            </Button>
                          ) : (
                            <span className="text-[10px] text-amber-500/60 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />Pendiente
                            </span>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* ── Notas ── */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                        <FileText className="h-4 w-4" />Notas
                      </h3>
                      <div className="space-y-2">
                        <Textarea
                          value={notesText}
                          onChange={(e) => setNotesText(e.target.value)}
                          onBlur={saveNotes}
                          placeholder="Agregar notas sobre este lead..."
                          className="min-h-[80px] bg-zinc-900/50 border-zinc-800 text-sm resize-none"
                          disabled={notesSaving}
                        />
                        {notesSaving && (
                          <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />Guardando...
                          </p>
                        )}
                      </div>
                    </section>
                  </>
                )}

                {/* ── Acciones contextuales ── */}
                {!isEditing && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />Acciones
                    </h3>
                    <div className="space-y-2">
                      {/* NEW actions */}
                      {selectedLead.status === 'NEW' && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
                            disabled={actionLoading}
                            onClick={() => changeStatus(selectedLead.id, 'CONTACTED')}
                          >
                            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                            Contactar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 border-emerald-700 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                            disabled={actionLoading}
                            onClick={() => changeStatus(selectedLead.id, 'APPROVED')}
                          >
                            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 border-red-800 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            disabled={actionLoading}
                            onClick={() => changeStatus(selectedLead.id, 'REJECTED')}
                          >
                            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Rechazar
                          </Button>
                        </div>
                      )}

                      {/* CONTACTED actions */}
                      {selectedLead.status === 'CONTACTED' && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 border-emerald-700 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                            disabled={actionLoading}
                            onClick={() => changeStatus(selectedLead.id, 'APPROVED')}
                          >
                            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 border-red-800 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            disabled={actionLoading}
                            onClick={() => changeStatus(selectedLead.id, 'REJECTED')}
                          >
                            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Rechazar
                          </Button>
                        </div>
                      )}

                      {/* APPROVED — Big Convert Button */}
                      {selectedLead.status === 'APPROVED' && (
                        <div className="space-y-2">
                          <Button
                            size="lg"
                            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                            disabled={actionLoading}
                            onClick={() => approveLead(selectedLead.id)}
                          >
                            {actionLoading ? (
                              <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Creando cuenta...
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="h-5 w-5" />
                                Convertir en Cuenta
                                <ArrowRight className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                          <p className="text-[10px] text-zinc-500 text-center">
                            Se creará la tienda con suscripción Trial de 7 días
                          </p>
                        </div>
                      )}

                      {/* CONVERTED — Success Message */}
                      {selectedLead.status === 'CONVERTED' && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <CheckCircle2 className="h-5 w-5" />
                            <p className="text-sm font-semibold">Cuenta creada exitosamente</p>
                          </div>
                          {selectedLead.convertedStoreId && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-zinc-400">
                                Tienda ID: <span className="font-mono text-zinc-200">{selectedLead.convertedStoreId}</span>
                              </p>
                              <p className="text-xs text-zinc-400">
                                Credenciales de acceso:
                              </p>
                              <div className="rounded bg-zinc-900 p-2 space-y-1">
                                <p className="text-xs text-zinc-300">
                                  <span className="text-zinc-500">Cédula:</span> {selectedLead.ownerCedula}
                                </p>
                                <p className="text-xs text-zinc-300">
                                  <span className="text-zinc-500">Contraseña:</span> La contraseña que proporcionó al registrarse
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* REJECTED info */}
                      {selectedLead.status === 'REJECTED' && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                          <div className="flex items-center gap-2 text-red-400">
                            <XCircle className="h-5 w-5" />
                            <p className="text-sm font-semibold">Lead rechazado</p>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            Este lead fue rechazado. Puede cambiar el estado si necesita reconsiderarlo.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Eliminar Lead</DialogTitle>
            <DialogDescription className="text-zinc-400">
              ¿Estás seguro de que deseas eliminar este lead? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="rounded-lg bg-zinc-900 p-3 text-sm">
              <p className="text-zinc-200 font-medium">{selectedLead.storeName}</p>
              <p className="text-xs text-zinc-500">{selectedLead.ownerFullName} · CC: {selectedLead.ownerCedula}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="text-zinc-400">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedLead && deleteLead(selectedLead.id)}
              disabled={actionLoading}
              className="gap-1.5"
            >
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
