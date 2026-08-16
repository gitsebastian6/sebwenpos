'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Building2, MessageCircle, AlertTriangle, Upload, ExternalLink,
  CheckCircle2, XCircle, Clock, Loader2, FileText, ShieldCheck, UserCircle2,
  Send, ListTodo, Phone, Mail, StickyNote,
} from 'lucide-react'
import {
  useLeadDetail, useUpdateLead, useApproveLead,
  useLeadDocuments, useUploadLeadDocument, useReviewLeadDocument,
  useLeadActivities, useCreateLeadActivity,
  REQUIRED_DOCUMENT_TYPES, type DocumentType, type CrmStage,
} from '@/hooks/api/use-leads'
import type { LeadDocumentData, LeadActivityData } from './types'

const DOC_LABELS: Record<DocumentType, string> = {
  RUT: 'RUT', CAMARA_COMERCIO: 'Cámara de Comercio',
  CEDULA_REPRESENTANTE: 'Cédula Rep. Legal', RESOLUCION_DIAN: 'Resolución DIAN',
}

const STAGE_LABELS: Record<string, string> = {
  LEAD: 'Lead', CONTACTADO: 'Contactado', DOC_PENDIENTE: 'Documentación Pendiente',
  VALIDACION_LEGAL: 'Validación Legal', CLIENTE_ACTIVO: 'Cliente Activo', RECHAZADO: 'Rechazado',
}
const STAGE_BADGE: Record<string, string> = {
  LEAD: 'bg-slate-500/10 border-slate-500/20 text-slate-500',
  CONTACTADO: 'bg-sky-500/10 border-sky-500/20 text-sky-500',
  DOC_PENDIENTE: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
  VALIDACION_LEGAL: 'bg-violet-500/10 border-violet-500/20 text-violet-500',
  CLIENTE_ACTIVO: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
  RECHAZADO: 'bg-red-500/10 border-red-500/20 text-red-500',
}

function fileToBase64(file: File): Promise<{ base64: string; name: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ base64: reader.result as string, name: file.name, type: file.type })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface Props { leadId: number; onBack: () => void }

export function CrmClientDetailView({ leadId, onBack }: Props) {
  const { data: lead, isLoading: leadLoading } = useLeadDetail(leadId)
  const { data: docsData } = useLeadDocuments(leadId)
  const { data: activitiesData } = useLeadActivities(leadId)
  const updateLead = useUpdateLead()
  const approveLead = useApproveLead()
  const createActivity = useCreateLeadActivity()

  const [resForm, setResForm] = useState<Record<string, string>>({})
  const [fiscalForm, setFiscalForm] = useState<Record<string, string>>({})
  const [noteText, setNoteText] = useState('')

  const documents = docsData?.documents ?? []
  const activities = activitiesData?.activities ?? []

  if (leadLoading || !lead) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const stage = lead.stage as CrmStage
  const latestByType = (type: DocumentType): LeadDocumentData | undefined =>
    documents.filter((d) => d.documentType === type).sort((a, b) => b.version - a.version)[0]

  const allApproved = REQUIRED_DOCUMENT_TYPES.every((t) => latestByType(t)?.status === 'APPROVED')
  const resolutionEnd = lead.resolutionEndDate ? new Date(lead.resolutionEndDate) : null
  const resolutionValid = !!resolutionEnd && resolutionEnd > new Date()
  const alreadyHasStore = !!lead.convertedStoreId
  const readyToConvert = stage === 'VALIDACION_LEGAL' && allApproved && resolutionValid

  const daysToExpire = resolutionEnd ? Math.ceil((resolutionEnd.getTime() - Date.now()) / 86400000) : null
  const showExpiryAlert = stage !== 'CLIENTE_ACTIVO' && daysToExpire !== null && daysToExpire <= 30

  function changeStage(newStage: CrmStage) {
    updateLead.mutate({ id: leadId, body: { stage: newStage } }, {
      onSuccess: () => toast.success(`Etapa actualizada: ${STAGE_LABELS[newStage]}`),
      onError: (e) => toast.error(e.message || 'Error al actualizar etapa'),
    })
  }

  function saveResolution() {
    updateLead.mutate({
      id: leadId,
      body: {
        resolutionPrefix: resForm.resolutionPrefix ?? lead.resolutionPrefix,
        resolutionNumber: resForm.resolutionNumber ?? lead.resolutionNumber,
        resolutionStartNumber: resForm.resolutionStartNumber ? Number(resForm.resolutionStartNumber) : lead.resolutionStartNumber,
        resolutionEndNumber: resForm.resolutionEndNumber ? Number(resForm.resolutionEndNumber) : lead.resolutionEndNumber,
        resolutionStartDate: resForm.resolutionStartDate ?? lead.resolutionStartDate,
        resolutionEndDate: resForm.resolutionEndDate ?? lead.resolutionEndDate,
      },
    }, {
      onSuccess: () => toast.success('Resolución DIAN guardada'),
      onError: (e) => toast.error(e.message || 'Error al guardar'),
    })
  }

  function saveFiscal() {
    updateLead.mutate({
      id: leadId,
      body: {
        taxRegime: fiscalForm.taxRegime ?? lead.taxRegime,
        fiscalResponsibilities: fiscalForm.fiscalResponsibilities ?? lead.fiscalResponsibilities,
      },
    }, {
      onSuccess: () => toast.success('Datos fiscales guardados'),
      onError: (e) => toast.error(e.message || 'Error al guardar'),
    })
  }

  function handleConvert() {
    approveLead.mutate({ id: leadId }, {
      onSuccess: (res) => toast.success(res.message),
      onError: (e) => toast.error(e.message || 'Error al activar cuenta'),
    })
  }

  function addNote() {
    if (!noteText.trim()) return
    createActivity.mutate({ leadId, type: 'NOTE', title: noteText.trim() }, {
      onSuccess: () => setNoteText(''),
    })
  }

  const whatsappUrl = lead.ownerPhone
    ? `https://wa.me/57${lead.ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hola ${lead.ownerFullName}, te escribimos de Sebwen POS para continuar con la activación de ${lead.storeName}.`,
      )}`
    : null

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />Volver al pipeline
      </Button>

      {/* ── Header ── */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-base truncate">{lead.storeName}</h2>
                <Badge variant="outline" className={`text-[10px] ${STAGE_BADGE[stage]}`}>{STAGE_LABELS[stage]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">NIT {lead.nit} · {lead.ownerFullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {whatsappUrl && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
              </Button>
            )}
            {stage === 'LEAD' && <Button size="sm" onClick={() => changeStage('CONTACTADO')}>Marcar Contactado</Button>}
            {stage === 'CONTACTADO' && <Button size="sm" onClick={() => changeStage('DOC_PENDIENTE')}>Solicitar Documentos</Button>}
            {(stage === 'LEAD' || stage === 'CONTACTADO') && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => changeStage('RECHAZADO')}>Rechazar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Expiry alert ── */}
      {showExpiryAlert && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${daysToExpire! <= 0 ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'}`}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {daysToExpire! <= 0
              ? <><b>Resolución DIAN vencida</b> — venció hace {Math.abs(daysToExpire!)} días.</>
              : <><b>Resolución DIAN vence en {daysToExpire} días</b> — actualiza el rango de numeración antes de que expire.</>}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* ── Document grid ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Documentos requeridos</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {REQUIRED_DOCUMENT_TYPES.filter((t) => latestByType(t)?.status === 'APPROVED').length} / 4 aprobados
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REQUIRED_DOCUMENT_TYPES.map((type) => (
                <DocumentCard key={type} leadId={leadId} type={type} doc={latestByType(type)} disabled={stage === 'CLIENTE_ACTIVO'} />
              ))}
            </CardContent>
          </Card>

          {/* ── Resolución DIAN ── */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Datos de la Resolución DIAN</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prefijo</Label>
                  <Input className="h-8 text-sm" defaultValue={lead.resolutionPrefix || ''} onChange={(e) => setResForm((f) => ({ ...f, resolutionPrefix: e.target.value }))} placeholder="SETP" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número de resolución</Label>
                  <Input className="h-8 text-sm" defaultValue={lead.resolutionNumber || ''} onChange={(e) => setResForm((f) => ({ ...f, resolutionNumber: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Número inicial</Label>
                  <Input type="number" className="h-8 text-sm" defaultValue={lead.resolutionStartNumber ?? ''} onChange={(e) => setResForm((f) => ({ ...f, resolutionStartNumber: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número final</Label>
                  <Input type="number" className="h-8 text-sm" defaultValue={lead.resolutionEndNumber ?? ''} onChange={(e) => setResForm((f) => ({ ...f, resolutionEndNumber: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Vigente desde</Label>
                  <Input type="date" className="h-8 text-sm" defaultValue={lead.resolutionStartDate?.slice(0, 10) || ''} onChange={(e) => setResForm((f) => ({ ...f, resolutionStartDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Vigente hasta</Label>
                  <Input type="date" className="h-8 text-sm" defaultValue={lead.resolutionEndDate?.slice(0, 10) || ''} onChange={(e) => setResForm((f) => ({ ...f, resolutionEndDate: e.target.value }))} />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={saveResolution} disabled={updateLead.isPending}>Guardar Resolución</Button>
            </CardContent>
          </Card>

          {/* ── Datos fiscales ── */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Datos fiscales</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Régimen</Label>
                  <Select defaultValue={lead.taxRegime || undefined} onValueChange={(v) => setFiscalForm((f) => ({ ...f, taxRegime: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar régimen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RESPONSABLE_IVA">Responsable de IVA</SelectItem>
                      <SelectItem value="NO_RESPONSABLE">No Responsable de IVA</SelectItem>
                      <SelectItem value="REGIMEN_SIMPLE">Régimen Simple</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Responsabilidades RUT (separadas por coma)</Label>
                  <Input className="h-8 text-sm" defaultValue={lead.fiscalResponsibilities || ''} onChange={(e) => setFiscalForm((f) => ({ ...f, fiscalResponsibilities: e.target.value }))} placeholder="O-13, O-15, O-23" />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={saveFiscal} disabled={updateLead.isPending}>Guardar Datos Fiscales</Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Activity sidebar ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Actividad</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea placeholder="Agregar nota..." className="text-xs min-h-[60px]" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={addNote} disabled={!noteText.trim() || createActivity.isPending}>
                <Send className="h-3 w-3" />Registrar nota
              </Button>
              <div className="space-y-3 max-h-[420px] overflow-y-auto pt-2">
                {activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin actividad todavía</p>
                ) : (
                  activities.map((a) => <ActivityRow key={a.id} activity={a} />)
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── CTA footer ── */}
      {stage !== 'CLIENTE_ACTIVO' && stage !== 'RECHAZADO' && (
        <div className="sticky bottom-4 flex justify-end">
          {alreadyHasStore ? (
            <Button
              size="lg"
              className="gap-2 shadow-lg"
              disabled={!allApproved || !resolutionValid || updateLead.isPending}
              onClick={() => changeStage('CLIENTE_ACTIVO')}
            >
              {updateLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Marcar Expediente Completo
              {(!allApproved || !resolutionValid) && (
                <span className="text-[10px] opacity-80 ml-1">
                  ({REQUIRED_DOCUMENT_TYPES.filter((t) => latestByType(t)?.status === 'APPROVED').length}/4{!resolutionValid ? ' · resolución no vigente' : ''})
                </span>
              )}
            </Button>
          ) : (
            <Button
              size="lg"
              className="gap-2 shadow-lg"
              disabled={!readyToConvert || approveLead.isPending}
              onClick={handleConvert}
            >
              {approveLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Marcar como Listo para Facturar
              {!readyToConvert && (
                <span className="text-[10px] opacity-80 ml-1">
                  ({REQUIRED_DOCUMENT_TYPES.filter((t) => latestByType(t)?.status === 'APPROVED').length}/4{!resolutionValid ? ' · resolución no vigente' : ''})
                </span>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Document card ────────────────────────────────────────────────────────

function DocumentCard({ leadId, type, doc, disabled }: { leadId: number; type: DocumentType; doc?: LeadDocumentData; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const upload = useUploadLeadDocument()
  const review = useReviewLeadDocument()

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error('El archivo no puede ser mayor a 5MB'); return }
    const { base64, name, type: fileType } = await fileToBase64(file)
    upload.mutate({ leadId, documentType: type, fileBase64: base64, fileName: name, fileType }, {
      onSuccess: (res) => {
        toast.success(`${DOC_LABELS[type]} subido`)
        if (res.newStage) toast.info(`Etapa actualizada: Validación Legal`)
      },
      onError: (e) => toast.error(e.message || 'Error al subir documento'),
    })
  }

  function approve() {
    if (!doc) return
    review.mutate({ leadId, docId: doc.id, status: 'APPROVED' }, {
      onSuccess: () => toast.success(`${DOC_LABELS[type]} aprobado`),
      onError: (e) => toast.error(e.message || 'Error al aprobar'),
    })
  }

  function reject() {
    if (!doc || !rejectReason.trim()) return
    review.mutate({ leadId, docId: doc.id, status: 'REJECTED', rejectionReason: rejectReason.trim() }, {
      onSuccess: () => { toast.success(`${DOC_LABELS[type]} rechazado`); setRejectOpen(false); setRejectReason('') },
      onError: (e) => toast.error(e.message || 'Error al rechazar'),
    })
  }

  const status = doc?.status
  const statusBadge = status === 'APPROVED'
    ? <Badge variant="outline" className="text-[9px] bg-emerald-500/10 border-emerald-500/20 text-emerald-500 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Aprobado</Badge>
    : status === 'REJECTED'
    ? <Badge variant="outline" className="text-[9px] bg-red-500/10 border-red-500/20 text-red-500 gap-1"><XCircle className="h-2.5 w-2.5" />Rechazado</Badge>
    : status === 'PENDING'
    ? <Badge variant="outline" className="text-[9px] bg-amber-500/10 border-amber-500/20 text-amber-500 gap-1"><Clock className="h-2.5 w-2.5" />Pendiente</Badge>
    : <Badge variant="outline" className="text-[9px] text-muted-foreground gap-1"><FileText className="h-2.5 w-2.5" />Falta subir</Badge>

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{DOC_LABELS[type]}</p>
        {statusBadge}
      </div>

      {doc && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground bg-background rounded border p-1.5">
          <span className="truncate">{doc.fileName} · v{doc.version}</span>
          <a href={`/api/super-admin/leads/${leadId}/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="shrink-0 text-primary flex items-center gap-0.5">
            <ExternalLink className="h-2.5 w-2.5" />Ver
          </a>
        </div>
      )}

      {status === 'REJECTED' && doc?.rejectionReason && (
        <p className="text-[10px] text-red-500 bg-red-500/5 rounded p-1.5">Motivo: {doc.rejectionReason}</p>
      )}

      {!disabled && (
        <div
          className={`rounded border-2 border-dashed p-2 text-center text-[10px] cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : (
            <span className="flex items-center justify-center gap-1 text-muted-foreground"><Upload className="h-3 w-3" />Arrastra o haz clic para subir</span>
          )}
        </div>
      )}

      {status === 'PENDING' && !disabled && (
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 text-emerald-600 border-emerald-500/30" onClick={approve} disabled={review.isPending}>Aprobar</Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 text-red-600 border-red-500/30" onClick={() => setRejectOpen(true)} disabled={review.isPending}>Rechazar</Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Rechazar {DOC_LABELS[type]}</DialogTitle>
            <DialogDescription className="text-xs">El motivo se le muestra al cliente para que suba una versión corregida.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Ej: la foto está borrosa, sube ambas caras" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="text-sm" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={reject} disabled={!rejectReason.trim() || review.isPending}>Rechazar documento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Activity row ───────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<string, typeof StickyNote> = {
  NOTE: StickyNote, CALL: Phone, TASK: ListTodo, WHATSAPP: MessageCircle,
  EMAIL: Mail, STAGE_CHANGE: ShieldCheck, DOCUMENT_EVENT: FileText,
}

function ActivityRow({ activity }: { activity: LeadActivityData }) {
  const Icon = ACTIVITY_ICON[activity.type] || StickyNote
  return (
    <div className="flex gap-2">
      <div className="mt-0.5"><Icon className="h-3 w-3 text-primary" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{activity.title}</p>
        {activity.description && <p className="text-[10px] text-muted-foreground">{activity.description}</p>}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
          <span>{new Date(activity.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
          {activity.createdBy?.fullName && <><span>·</span><span className="flex items-center gap-0.5"><UserCircle2 className="h-2.5 w-2.5" />{activity.createdBy.fullName}</span></>}
          {!activity.createdBy && activity.createdById === null && <span>· sistema</span>}
        </div>
      </div>
    </div>
  )
}
