'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Wallet, Upload, CheckCircle2, XCircle, Download, Clock, Filter,
  Eye as EyeIcon, FileCheck2, Banknote, CircleDollarSign,
  BadgeCheck, CalendarDays, Hash, FileText, Plus, AlertTriangle, ArrowRight,
} from 'lucide-react'
import { formatCOP, formatDateTime } from './helpers'
import type { PaymentReceiptData } from './types'

interface PaymentReceiptsSectionProps {
  storeId: number
  storeName: string
  onRefresh?: (storeId: number) => void
  onCountChange?: (count: number) => void
}

export function PaymentReceiptsSection({ storeId, storeName, onRefresh, onCountChange }: PaymentReceiptsSectionProps) {
  const queryClient = useQueryClient()

  // Payment receipts state
  const [receipts, setReceipts] = useState<PaymentReceiptData[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceiptData | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // Upload receipt state (super admin)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null)
  const [uploadForm, setUploadForm] = useState({
    amount: '',
    paymentMethod: 'NEQUI',
    reference: '',
    notes: '',
    autoApprove: true,
  })
  // Receipt preview dialog
  const [showReceiptPreviewDialog, setShowReceiptPreviewDialog] = useState(false)
  const [receiptPreviewData, setReceiptPreviewData] = useState<PaymentReceiptData | null>(null)
  const [receiptPreviewImage, setReceiptPreviewImage] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  // Receipt filter
  const [receiptFilter, setReceiptFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')

  const loadReceipts = useCallback(async () => {
    try {
      setReceiptsLoading(true)
      const res = await fetch('/api/super-admin/payment-receipts')
      if (!res.ok) { return }
      const data = await res.json()
      const filtered = (data || []).filter((r: PaymentReceiptData) => r.storeId === storeId)
      setReceipts(filtered)
      onCountChange?.(filtered.length)
    } catch { /* non-critical */ }
    finally { setReceiptsLoading(false) }
  }, [storeId, onCountChange])

  useEffect(() => { loadReceipts() }, [loadReceipts])

  function openUploadDialog() {
    setSelectedFile(null)
    setSelectedFilePreview(null)
    setUploadForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '', autoApprove: true })
    setShowUploadDialog(true)
  }

  async function handleReviewReceipt(receiptId: number, action: 'APPROVE' | 'REJECT') {
    setReviewing(true)
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receiptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNotes }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al procesar comprobante'); return }
      toast.success(data.message)
      setPreviewReceipt(null)
      setReviewNotes('')
      loadReceipts()
      onRefresh?.(storeId)
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      queryClient.invalidateQueries({ queryKey: ['store-detail', storeId] })
    } catch { toast.error('Error de conexión') }
    finally { setReviewing(false) }
  }

  async function handleDeleteReceipt(receiptId: number) {
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receiptId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al eliminar'); return }
      toast.success(data.message)
      loadReceipts()
      queryClient.invalidateQueries({ queryKey: ['stores'] })
    } catch { toast.error('Error de conexión') }
  }

  async function handleUploadReceipt() {
    if (!selectedFile || !uploadForm.amount || !storeId) {
      toast.error('Selecciona un archivo e indica el monto del pago')
      return
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error('El archivo excede 5MB. Selecciona uno más pequeño.')
      return
    }
    setUploading(true)
    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          if (base64) resolve(base64)
          else reject(new Error('No se pudo leer el archivo'))
        }
        reader.onerror = () => reject(new Error('Error leyendo archivo'))
        reader.readAsDataURL(selectedFile)
      })

      const fileData = await base64Promise

      const res = await fetch('/api/super-admin/payment-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          amount: parseInt(uploadForm.amount),
          paymentMethod: uploadForm.paymentMethod,
          reference: uploadForm.reference || undefined,
          notes: uploadForm.notes || undefined,
          fileData,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type || 'application/octet-stream',
          autoApprove: uploadForm.autoApprove,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al registrar comprobante')
        return
      }
      toast.success(data.message)
      setShowUploadDialog(false)
      setSelectedFile(null)
      setSelectedFilePreview(null)
      setUploadForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '', autoApprove: true })
      loadReceipts()
      onRefresh?.(storeId)
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      queryClient.invalidateQueries({ queryKey: ['store-detail', storeId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al registrar')
    }
    finally { setUploading(false) }
  }

  async function handleViewReceipt(receipt: PaymentReceiptData) {
    setLoadingPreview(true)
    setShowReceiptPreviewDialog(true)
    setReceiptPreviewData(receipt)
    setReceiptPreviewImage(null)
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receipt.id}`)
      const data = await res.json()
      if (res.ok && data.fileData) {
        const mime = data.fileType || 'application/octet-stream'
        if (mime.startsWith('image/')) {
          setReceiptPreviewImage(`data:${mime};base64,${data.fileData}`)
        } else {
          setReceiptPreviewImage(null)
        }
      }
    } catch { /* preview unavailable */ }
    finally { setLoadingPreview(false) }
  }

  function handleDownloadReceipt(receipt: PaymentReceiptData) {
    const download = async () => {
      try {
        const res = await fetch(`/api/super-admin/payment-receipts/${receipt.id}`)
        const data = await res.json()
        if (res.ok && data.fileData) {
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
    <>
      {/* COMPROBANTES DE PAGO */}
      <TabsContent value="receipts">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Comprobantes de Pago</h3>
                <p className="text-xs text-muted-foreground">Historial y gestión de pagos de {storeName}</p>
              </div>
            </div>
            <Button onClick={openUploadDialog} className="gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20" size="sm">
              <Plus className="h-4 w-4" />Registrar Comprobante
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Banknote className="h-3 w-3" />Total</div>
              <p className="text-lg font-bold">{receipts.length}</p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-1"><Clock className="h-3 w-3" />Pendientes</div>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{receipts.filter(r => r.status === 'PENDING').length}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1"><BadgeCheck className="h-3 w-3" />Aprobados</div>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{receipts.filter(r => r.status === 'APPROVED').length}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CircleDollarSign className="h-3 w-3" />Total aprobado</div>
              <p className="text-lg font-bold font-mono">{formatCOP(receipts.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0))}</p>
            </div>
          </div>

          {receipts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
                <Button key={f} variant={receiptFilter === f ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setReceiptFilter(f)}>
                  {f === 'ALL' ? 'Todos' : f === 'PENDING' ? 'Pendientes' : f === 'APPROVED' ? 'Aprobados' : 'Rechazados'}
                  <span className="text-[10px] opacity-70">({f === 'ALL' ? receipts.length : receipts.filter(r => r.status === f).length})</span>
                </Button>
              ))}
            </div>
          )}

          {receiptsLoading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (() => {
            const filtered = receiptFilter === 'ALL' ? receipts : receipts.filter(r => r.status === receiptFilter)
            return filtered.length === 0 ? (
              <Card className="rounded-xl border-border/50 border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4"><FileCheck2 className="h-8 w-8 text-muted-foreground/30" /></div>
                  <p className="text-sm font-medium text-muted-foreground">{receipts.length === 0 ? 'Sin comprobantes de pago' : 'Sin comprobantes en esta categoría'}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">{receipts.length === 0 ? 'Registra el primer comprobante cuando el cliente realice el pago por Nequi, Daviplata o consignación.' : 'Cambia el filtro para ver otros comprobantes.'}</p>
                  {receipts.length === 0 && (
                    <Button onClick={openUploadDialog} size="sm" className="gap-2 mt-4 active:scale-[0.98] transition-all"><Upload className="h-3.5 w-3.5" />Registrar Primer Comprobante</Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <Card key={r.id} className={`rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${r.status === 'PENDING' ? 'border-amber-500/30 bg-amber-500/[0.02]' : r.status === 'APPROVED' ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row">
                        <div className={`w-1.5 shrink-0 ${r.status === 'PENDING' ? 'bg-amber-500' : r.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <div className="flex-1 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold font-mono text-lg">{formatCOP(r.amount)}</span>
                                <Badge variant="outline" className="text-[10px] gap-1"><Wallet className="h-2.5 w-2.5" />{r.paymentMethod}</Badge>
                                {r.status === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Pendiente</Badge>}
                                {r.status === 'APPROVED' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px] gap-1"><BadgeCheck className="h-2.5 w-2.5" />Aprobado</Badge>}
                                {r.status === 'REJECTED' && <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 text-[10px] gap-1"><XCircle className="h-2.5 w-2.5" />Rechazado</Badge>}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDateTime(r.createdAt)}</span>
                                {r.reference && <span className="font-mono flex items-center gap-1"><Hash className="h-3 w-3" />Ref: {r.reference}</span>}
                                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{r.fileName}</span>
                                <span className="flex items-center gap-1">{(r.fileSize / 1024).toFixed(0)} KB</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                {(() => {
                                  let planChange: { planChangeRequest: boolean; requestedPlanId: number; requestedPlanName: string; requestedBillingPeriod: string; userNotes: string | null } | null = null
                                  if (r.notes) {
                                    try {
                                      const parsed = JSON.parse(r.notes)
                                      if (parsed.planChangeRequest && parsed.requestedPlanName) planChange = parsed
                                    } catch { /* not JSON */ }
                                  }
                                  if (!planChange) {
                                    return r.notes ? <p className="text-xs text-muted-foreground italic">&#128221; {r.notes}</p> : null
                                  }
                                  return (
                                    <div className={`mt-1 p-2 rounded-lg border ${
                                      r.status === 'APPROVED' ? 'bg-violet-50 dark:bg-violet-500/5 border-violet-200/60 dark:border-violet-800/30'
                                      : r.status === 'REJECTED' ? 'bg-red-50 dark:bg-red-500/5 border-red-200/60 dark:border-red-800/30'
                                      : 'bg-sky-50 dark:bg-sky-500/5 border-sky-200/60 dark:border-sky-800/30'
                                    }`}>
                                      <div className="flex items-center gap-1.5">
                                        <ArrowRight className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                                        <p className={`text-xs font-semibold ${
                                          r.status === 'APPROVED' ? 'text-violet-700 dark:text-violet-300'
                                          : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                                          : 'text-sky-700 dark:text-sky-300'
                                        }`}>
                                          &#x1f504; Solicitud de cambio a <span className="font-bold">{planChange.requestedPlanName}</span>
                                        </p>
                                      </div>
                                      {planChange.userNotes && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5 italic">&quot;{planChange.userNotes}&quot;</p>
                                      )}
                                      {r.status === 'PENDING' && (
                                        <p className="text-[11px] text-sky-600/70 dark:text-sky-400/60 mt-0.5">
                                          &#x26a0;&#xfe0f; Al aprobar, el plan se cambiará automáticamente.
                                        </p>
                                      )}
                                    </div>
                                  )
                                })()}
                                {r.reviewNotes && <p className="text-xs text-muted-foreground"><span className="font-medium">Revisión:</span> {r.reviewNotes}{r.reviewedAt && <span className="ml-1">· {formatDateTime(r.reviewedAt)}</span>}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleViewReceipt(r)}><EyeIcon className="h-3.5 w-3.5" />Ver</Button>
                              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleDownloadReceipt(r)}><Download className="h-3.5 w-3.5" />Descargar</Button>
                              {r.status === 'PENDING' && (<>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Aprobar" aria-label="Aprobar comprobante" onClick={() => { setPreviewReceipt(r); setReviewNotes('') }}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Rechazar" aria-label="Rechazar comprobante" onClick={() => { setPreviewReceipt(r); setReviewNotes('') }}><XCircle className="h-4 w-4 text-red-500" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar" aria-label="Eliminar comprobante" onClick={() => handleDeleteReceipt(r.id)}><XCircle className="h-4 w-4 text-destructive" /></Button>
                              </>)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          })()}
        </div>
      </TabsContent>

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
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Monto</p>
                    <p className="font-bold font-mono text-xl text-emerald-600 dark:text-emerald-400">{formatCOP(previewReceipt.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Método</p>
                    <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{previewReceipt.paymentMethod}</Badge>
                  </div>
                  {previewReceipt.reference && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Referencia</p>
                      <p className="font-mono text-sm">{previewReceipt.reference}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fecha registro</p>
                    <p className="text-sm">{formatDateTime(previewReceipt.createdAt)}</p>
                  </div>
                  {previewReceipt.notes && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Notas del cliente</p>
                      <p className="text-sm bg-muted/50 rounded px-2 py-1">{previewReceipt.notes}</p>
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
            <Button variant="destructive" onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'REJECT')} disabled={reviewing} className="gap-2 active:scale-[0.98] transition-all">
              {reviewing ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
              Rechazar
            </Button>
            <Button onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'APPROVE')} disabled={reviewing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all">
              {reviewing ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Receipt Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => { if (!open) { setShowUploadDialog(false); setSelectedFile(null); setSelectedFilePreview(null) }}}>
        <DialogContent className="max-w-md rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                <Upload className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Registrar Comprobante de Pago
            </DialogTitle>
            <DialogDescription>Sube el comprobante del pago realizado por el cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Archivo del comprobante <span className="text-destructive">*</span></Label>
              {!selectedFile ? (
                <div
                  className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 hover:bg-muted/20 transition-all cursor-pointer group"
                  onClick={() => document.getElementById('sa-receipt-file')?.click()}
                >
                  <div className="h-12 w-12 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/10 transition-colors">
                    <Upload className="h-6 w-6 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Haz clic o arrastra para subir</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">PNG, JPG, WebP, HEIC, PDF · Máximo 5MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedFilePreview && (
                    <div className="relative rounded-lg overflow-hidden border bg-muted/20">
                      <img src={selectedFilePreview} alt="Preview" className="max-h-40 mx-auto object-contain" />
                      <button
                        type="button" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}
                        className="absolute top-2 right-2 h-6 w-6 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-destructive/80 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}>
                      Cambiar
                    </Button>
                  </div>
                </div>
              )}
              <input id="sa-receipt-file" type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { toast.error('El archivo excede 5MB'); return }
                  setSelectedFile(file)
                  if (file.type.startsWith('image/')) {
                    const reader = new FileReader()
                    reader.onload = () => setSelectedFilePreview(reader.result as string)
                    reader.readAsDataURL(file)
                  } else {
                    setSelectedFilePreview(null)
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Monto del pago (COP) <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground font-medium">$</span>
                <Input type="number" placeholder="69.000" className="pl-7 font-mono" value={uploadForm.amount} onChange={(e) => setUploadForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Método de pago</Label>
              <Select value={uploadForm.paymentMethod} onValueChange={(v) => setUploadForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEQUI">Nequi</SelectItem>
                  <SelectItem value="DAVIPLATA">Davivienda (Daviplata)</SelectItem>
                  <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                  <SelectItem value="BANCARY">Consignación Bancaria</SelectItem>
                  <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                  <SelectItem value="OTHER">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Referencia / N. transacción</Label>
              <Input placeholder="Ej: 000123456789" className="font-mono text-sm" value={uploadForm.reference} onChange={(e) => setUploadForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Notas adicionales</Label>
              <Textarea placeholder="Observaciones sobre el pago..." rows={2} value={uploadForm.notes} onChange={(e) => setUploadForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${uploadForm.autoApprove ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'}`}>
                  {uploadForm.autoApprove ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                </div>
                <div>
                  <p className="text-xs font-medium">Aprobar automáticamente</p>
                  <p className="text-[10px] text-muted-foreground">
                    {uploadForm.autoApprove
                      ? 'Se extenderá la suscripción del cliente inmediatamente'
                      : 'Quedará pendiente para revisión manual posterior'}
                  </p>
                </div>
              </div>
              <Switch
                checked={uploadForm.autoApprove}
                onCheckedChange={(checked) => setUploadForm(f => ({ ...f, autoApprove: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); setSelectedFile(null); setSelectedFilePreview(null) }}>Cancelar</Button>
            <Button onClick={handleUploadReceipt} disabled={uploading || !selectedFile || !uploadForm.amount} className={`gap-2 active:scale-[0.98] transition-all ${uploadForm.autoApprove ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20' : ''}`}>
              {uploading ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{uploadForm.autoApprove ? 'Aprobando...' : 'Registrando...'}</>
              ) : uploadForm.autoApprove ? (
                <><CheckCircle2 className="h-4 w-4" />Registrar y Aprobar</>
              ) : (
                <><Upload className="h-4 w-4" />Registrar como Pendiente</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Image Preview Dialog */}
      <Dialog open={showReceiptPreviewDialog} onOpenChange={(open) => { if (!open) { setShowReceiptPreviewDialog(false); setReceiptPreviewData(null); setReceiptPreviewImage(null) } }}>
        <DialogContent className="max-w-2xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
                <EyeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Vista Previa del Comprobante
            </DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : receiptPreviewData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
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
    </>
  )
}
