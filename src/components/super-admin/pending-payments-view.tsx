'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Wallet, CheckCircle2, XCircle, Download, Clock, Filter,
  Eye as EyeIcon, FileCheck2, CircleDollarSign,
  BadgeCheck, CalendarDays, Hash, FileText, AlertTriangle,
  Building2, Search, Phone, ArrowRight, User, Sparkles, Users,
} from 'lucide-react'
import { queryFetch } from '@/hooks/api/query-helpers'
import { formatCOP, formatDateTime } from './helpers'
import type { PaymentReceiptData } from '@/hooks/api/use-super-admin'

// ── Parse plan change request from notes JSON ──
function parsePlanChangeNotes(notes: string | null) {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    if (parsed.planChangeRequest && parsed.requestedPlanName) {
      return parsed as { planChangeRequest: boolean; requestedPlanId: number; requestedPlanName: string; requestedBillingPeriod: string; userNotes: string | null }
    }
  } catch { /* not JSON */ }
  return null
}

// ── Parse self-service trial signup lead data from notes JSON ──
interface TrialLeadData {
  source: string
  ownerCedula: string
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
  businessType: string
  hasCamaraComercio: boolean
  registrationNumber: string
  department: string
  cityName: string
  signedUpAt: string
}

function parseLeadNotes(notes: string | null): TrialLeadData | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    if (parsed.source === 'SELF_SERVICE_TRIAL') {
      return parsed as TrialLeadData
    }
  } catch { /* not JSON */ }
  return null
}
import {
  useSuperAdminPaymentReceipts,
  useSuperAdminReceiptDetail,
  useUpdateReceipt,
  useDeleteReceipt,
} from '@/hooks/api/use-super-admin'

type FilterStatus = 'ALL' | 'LEAD' | 'PENDING' | 'APPROVED' | 'REJECTED'

export function PendingPaymentsView() {
  // Queries
  const { data: receipts = [], isLoading: receiptsLoading, refetch } = useSuperAdminPaymentReceipts({}, true)

  // Receipt detail for preview dialog
  const [viewingReceiptId, setViewingReceiptId] = useState<number | null>(null)
  const { data: receiptDetail, isLoading: detailLoading } = useSuperAdminReceiptDetail(viewingReceiptId)
  const receiptPreviewImage = (() => {
    if (!receiptDetail?.fileData) return null
    const mime = receiptDetail.fileType || 'application/octet-stream'
    if (mime.startsWith('image/')) return `data:${mime};base64,${receiptDetail.fileData}`
    return null
  })()

  // Mutations
  const updateReceipt = useUpdateReceipt()
  const deleteReceipt = useDeleteReceipt()

  // UI state
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceiptData | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [reviewNotes, setReviewNotes] = useState('')
  const [receiptFilter, setReceiptFilter] = useState<FilterStatus>('PENDING')
  const [searchQuery, setSearchQuery] = useState('')

  // Receipt preview dialog
  const [showReceiptPreviewDialog, setShowReceiptPreviewDialog] = useState(false)
  const [receiptPreviewData, setReceiptPreviewData] = useState<PaymentReceiptData | null>(null)

  // Computed
  const leadCount = receipts.filter(r => r.status === 'LEAD').length
  const pendingCount = receipts.filter(r => r.status === 'PENDING').length
  const approvedCount = receipts.filter(r => r.status === 'APPROVED').length
  const rejectedCount = receipts.filter(r => r.status === 'REJECTED').length
  const totalApproved = receipts.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0)

  // Filtered receipts (computed inline for React Compiler compatibility)
  function getFilteredReceipts() {
    let result = receiptFilter === 'ALL' ? receipts : receipts.filter(r => r.status === receiptFilter)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(r =>
        r.store?.name?.toLowerCase().includes(q) ||
        r.store?.user?.fullName?.toLowerCase().includes(q) ||
        r.reference?.toLowerCase().includes(q) ||
        r.paymentMethod?.toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      )
    }
    return result
  }
  const filtered = getFilteredReceipts()

  function openReviewDialog(receipt: PaymentReceiptData, action: 'APPROVE' | 'REJECT' = 'APPROVE') {
    setPreviewReceipt(receipt)
    setReviewAction(action)
    setReviewNotes('')
  }

  function handleReviewReceipt(receiptId: number, action: 'APPROVE' | 'REJECT') {
    updateReceipt.mutate(
      { id: receiptId, body: { action, reviewNotes } },
      {
        onSuccess: (data: any) => {
          toast.success(data?.message || (action === 'APPROVE' ? 'Comprobante aprobado' : 'Comprobante rechazado'))
          setPreviewReceipt(null)
          setReviewNotes('')
          refetch()
        },
        onError: (err) => toast.error(err.message || 'Error al procesar comprobante'),
      },
    )
  }

  function handleDeleteReceipt(receiptId: number) {
    deleteReceipt.mutate(
      { id: receiptId },
      {
        onSuccess: (data: any) => toast.success(data?.message || 'Comprobante eliminado'),
        onError: (err) => toast.error(err.message || 'Error al eliminar'),
      },
    )
  }

  function handleViewReceipt(receipt: PaymentReceiptData) {
    setShowReceiptPreviewDialog(true)
    setReceiptPreviewData(receipt)
    setViewingReceiptId(receipt.id)
  }

  function handleDownloadReceipt(receipt: PaymentReceiptData) {
    const download = async () => {
      try {
        const data = await queryFetch<{ fileData: string; fileType?: string; fileName?: string }>(`/api/super-admin/payment-receipts/${receipt.id}`)
        if (data.fileData) {
          const mime = data.fileType || 'application/octet-stream'
          const href = `data:${mime};base64,${data.fileData}`
          const a = document.createElement('a')
          a.href = href
          a.download = data.fileName || 'comprobante'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          toast.success('Descarga iniciada')
        } else {
          toast.error('No se pudo obtener el archivo')
        }
      } catch { toast.error('Error al descargar comprobante') }
    }
    download()
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="rounded-xl border-sky-500/20 bg-sky-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 mb-1"><Sparkles className="h-3 w-3" />Leads Trial</div>
          <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{leadCount}</p>
        </Card>
        <Card className="rounded-xl border-border/50 bg-muted/20 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Wallet className="h-3 w-3" />Total</div>
          <p className="text-2xl font-bold">{receipts.length}</p>
        </Card>
        <Card className="rounded-xl border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-1"><Clock className="h-3 w-3" />Pendientes</div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p>
        </Card>
        <Card className="rounded-xl border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1"><BadgeCheck className="h-3 w-3" />Aprobados</div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{approvedCount}</p>
        </Card>
        <Card className="rounded-xl border-border/50 bg-muted/20 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CircleDollarSign className="h-3 w-3" />Total Aprobado</div>
          <p className="text-2xl font-bold font-mono">{formatCOP(totalApproved)}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(['ALL', 'LEAD', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
            <Button key={f} variant={receiptFilter === f ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setReceiptFilter(f)}>
              {f === 'ALL' ? `Todos (${receipts.length})` : f === 'LEAD' ? `Leads (${leadCount})` : f === 'PENDING' ? `Pendientes (${pendingCount})` : f === 'APPROVED' ? `Aprobados (${approvedCount})` : `Rechazados (${rejectedCount})`}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar tienda, referencia..."
            className="pl-8 h-9 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Receipts List */}
      {receiptsLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-xl border-border/50 border-dashed">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileCheck2 className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {receipts.length === 0 ? 'Sin comprobantes de pago' : 'Sin comprobantes en esta categoría'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">
              {receipts.length === 0
                ? 'Los comprobantes aparecerán aquí cuando los clientes suban sus pagos.'
                : 'Cambia el filtro para ver otros comprobantes.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className={`rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${
                r.status === 'LEAD'
                  ? 'border-sky-500/30 bg-sky-500/[0.02]'
                  : r.status === 'PENDING'
                    ? 'border-amber-500/30 bg-amber-500/[0.02]'
                    : r.status === 'APPROVED'
                      ? 'border-emerald-500/20'
                      : 'border-red-500/20'
              }`}
            >
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  <div className={`w-1.5 shrink-0 ${
                    r.status === 'LEAD' ? 'bg-sky-500' : r.status === 'PENDING' ? 'bg-amber-500' : r.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Store name + Amount row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.store && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Building2 className="h-3 w-3" />
                                <span className="font-medium">{r.store.name}</span>
                              </div>
                              {r.store.user?.fullName && (
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                                  <User className="h-2.5 w-2.5" />{r.store.user.fullName}
                                </span>
                              )}
                              {r.store.user?.phone && (
                                <a
                                  href={`https://wa.me/57${r.store.user.phone.replace(/^0/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                                >
                                  <Phone className="h-2.5 w-2.5" />{r.store.user.phone}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold font-mono text-lg">{formatCOP(r.amount)}</span>
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Wallet className="h-2.5 w-2.5" />{r.paymentMethod}
                          </Badge>
                          {r.status === 'LEAD' && (
                            <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/20 text-[10px] gap-1">
                              <Sparkles className="h-2.5 w-2.5" />Lead Trial
                            </Badge>
                          )}
                          {r.status === 'PENDING' && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 text-[10px] gap-1">
                              <Clock className="h-2.5 w-2.5" />Pendiente
                            </Badge>
                          )}
                          {r.status === 'APPROVED' && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px] gap-1">
                              <BadgeCheck className="h-2.5 w-2.5" />Aprobado
                            </Badge>
                          )}
                          {r.status === 'REJECTED' && (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 text-[10px] gap-1">
                              <XCircle className="h-2.5 w-2.5" />Rechazado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />{formatDateTime(r.createdAt)}
                          </span>
                          {r.reference && (
                            <span className="font-mono flex items-center gap-1">
                              <Hash className="h-3 w-3" />Ref: {r.reference}
                            </span>
                          )}
                          {r.fileName ? (
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />{r.fileName}
                            </span>
                          ) : r.status === 'PENDING' ? (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                              <AlertTriangle className="h-3 w-3" />Sin comprobante
                            </span>
                          ) : null}
                          {r.fileSize > 0 && (
                            <span className="flex items-center gap-1">
                              {(r.fileSize / 1024).toFixed(0)} KB
                            </span>
                          )}
                          {r.subscription?.plan && (
                            <span className="flex items-center gap-1">
                              Plan: <span className="font-semibold">{r.subscription.plan.name}</span>
                            </span>
                          )}
                          {(() => {
                            const planChange = parsePlanChangeNotes(r.notes)
                            return planChange ? (
                              <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                                <ArrowRight className="h-3 w-3" />Cambio a {planChange.requestedPlanName}
                              </span>
                            ) : null
                          })()}
                          {(() => {
                            const lead = parseLeadNotes(r.notes)
                            return lead ? (
                              <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                                <Users className="h-3 w-3" />
                                {lead.cityName && lead.department ? `${lead.cityName}, ${lead.department}` : lead.cityName || lead.department || 'Auto-registro'}
                                {!lead.hasCamaraComercio && <span className="text-amber-500 ml-1">· Sin cámara</span>}
                              </span>
                            ) : null
                          })()}
                        </div>
                        {r.reviewNotes && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Revisión:</span> {r.reviewNotes}
                            {r.reviewedAt && <span className="ml-1">· {formatDateTime(r.reviewedAt)}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleViewReceipt(r)}>
                          <EyeIcon className="h-3.5 w-3.5" />Ver
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleDownloadReceipt(r)}>
                          <Download className="h-3.5 w-3.5" />Descargar
                        </Button>
                        {r.status === 'PENDING' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Aprobar"
                              aria-label="Aprobar comprobante"
                              onClick={() => openReviewDialog(r, 'APPROVE')}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Rechazar"
                              aria-label="Rechazar comprobante"
                              onClick={() => openReviewDialog(r, 'REJECT')}
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Receipt Dialog */}
      <Dialog open={!!previewReceipt} onOpenChange={(open) => { if (!open) { setPreviewReceipt(null); setReviewNotes('') } }}>
        <DialogContent className="max-w-xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              Revisar Comprobante de Pago
            </DialogTitle>
            <DialogDescription>Verifica el comprobante y decide aprobar o rechazar el pago</DialogDescription>
          </DialogHeader>
          {previewReceipt && (
            <div className="space-y-4 py-2">
              <div className={`rounded-lg border p-2.5 flex items-center gap-2 text-xs font-medium ${
                reviewAction === 'APPROVE'
                  ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200/60 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200/60 dark:border-red-800/30 text-red-700 dark:text-red-400'
              }`}>
                {reviewAction === 'APPROVE' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                Vas a {reviewAction === 'APPROVE' ? 'aprobar' : 'rechazar'} este comprobante — podés cambiar la acción con los botones de abajo.
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Tienda</p>
                    <p className="font-semibold text-sm">{previewReceipt.store?.name || '—'}</p>
                    {previewReceipt.store?.user?.fullName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <User className="h-3 w-3" />{previewReceipt.store.user.fullName}
                      </div>
                    )}
                    {previewReceipt.store?.user?.phone && (
                      <a
                        href={`https://wa.me/57${previewReceipt.store.user.phone.replace(/^0/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                      >
                        <Phone className="h-3 w-3" />{previewReceipt.store.user.phone} (WhatsApp)
                      </a>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Monto</p>
                    <p className="font-bold font-mono text-xl text-emerald-600 dark:text-emerald-400">{formatCOP(previewReceipt.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Método</p>
                    <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{previewReceipt.paymentMethod}</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fecha registro</p>
                    <p className="text-sm">{formatDateTime(previewReceipt.createdAt)}</p>
                  </div>
                  {previewReceipt.reference && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Referencia</p>
                      <p className="font-mono text-sm">{previewReceipt.reference}</p>
                    </div>
                  )}
                  {previewReceipt.subscription?.plan && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Plan</p>
                      <p className="text-sm font-semibold">{previewReceipt.subscription.plan.name} ({formatCOP(previewReceipt.subscription.plan.price)}/mes)</p>
                    </div>
                  )}
                  {previewReceipt.notes && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        {parsePlanChangeNotes(previewReceipt.notes) ? 'Solicitud de cambio de plan' : 'Notas del cliente'}
                      </p>
                      {(() => {
                        const planChange = parsePlanChangeNotes(previewReceipt.notes)
                        if (planChange) {
                          return (
                            <div className="rounded-lg bg-violet-50 dark:bg-violet-500/5 border border-violet-200/60 dark:border-violet-800/30 p-2.5 mt-1">
                              <div className="flex items-center gap-1.5">
                                <ArrowRight className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                                  Cambio a {planChange.requestedPlanName}
                                </p>
                              </div>
                              {planChange.userNotes && (
                                <p className="text-[11px] text-muted-foreground mt-1 italic">"{planChange.userNotes}"</p>
                              )}
                            </div>
                          )
                        }
                        return <p className="text-sm bg-muted/50 rounded px-2 py-1">{previewReceipt.notes}</p>
                      })()}
                    </div>
                  )}
                  {!previewReceipt.fileName && previewReceipt.status === 'PENDING' && (
                    <div className="col-span-2">
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/30 p-2.5 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-red-700 dark:text-red-400">Sin comprobante de pago</p>
                          <p className="text-[11px] text-red-600/70 dark:text-red-400/60 mt-0.5">
                            El cliente envió la solicitud sin comprobante. Puedes contactarlo por WhatsApp para validar.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { handleViewReceipt(previewReceipt) }}>
                  <EyeIcon className="h-3.5 w-3.5" />Ver imagen del comprobante
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownloadReceipt(previewReceipt)}>
                  <Download className="h-3.5 w-3.5" />Descargar archivo
                </Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Notas de revisión (opcional)</Label>
                <Textarea
                  placeholder="Ej: Pago verificado en cuenta bancaria..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="flex-1" />
            <Button
              variant="destructive"
              autoFocus={reviewAction === 'REJECT'}
              onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'REJECT')}
              disabled={updateReceipt.isPending}
              className={`gap-2 active:scale-[0.98] transition-all ${reviewAction === 'REJECT' ? 'ring-2 ring-red-500/40 ring-offset-2 ring-offset-background' : ''}`}
            >
              {updateReceipt.isPending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
              Rechazar
            </Button>
            <Button
              autoFocus={reviewAction === 'APPROVE'}
              onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'APPROVE')}
              disabled={updateReceipt.isPending}
              className={`gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all ${reviewAction === 'APPROVE' ? 'ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-background' : ''}`}
            >
              {updateReceipt.isPending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Image Preview Dialog */}
      <Dialog open={showReceiptPreviewDialog} onOpenChange={(open) => { if (!open) { setShowReceiptPreviewDialog(false); setReceiptPreviewData(null); setViewingReceiptId(null) } }}>
        <DialogContent className="max-w-2xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
                <EyeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Vista Previa del Comprobante
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : receiptPreviewData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                {receiptPreviewData.store && (
                  <span className="font-semibold text-sm">{receiptPreviewData.store.name}</span>
                )}
                <span className="font-bold font-mono text-lg text-emerald-600 dark:text-emerald-400">{formatCOP(receiptPreviewData.amount)}</span>
                <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{receiptPreviewData.paymentMethod}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(receiptPreviewData.createdAt)}</span>
              </div>
              {receiptPreviewImage ? (
                <div className="rounded-lg border bg-muted/20 overflow-hidden">
                  <img src={receiptPreviewImage} alt="Comprobante" className="max-h-[60vh] mx-auto object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Vista previa no disponible para este tipo de archivo</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{receiptPreviewData.fileName} ({(receiptPreviewData.fileSize / 1024).toFixed(0)} KB)</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => receiptPreviewData && handleDownloadReceipt(receiptPreviewData)}>
                  <Download className="h-3.5 w-3.5" />Descargar original
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
