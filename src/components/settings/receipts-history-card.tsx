'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Receipt,
  FileText,
  BadgeCheck,
  Plus,
  AlertTriangle,
  Clock,
  ArrowRight,
  MessageCircle,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'

export interface ReceiptItem {
  id: number; fileName: string; amount: number; paymentMethod: string
  reference: string | null; notes: string | null; status: string
  reviewNotes: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string
}

interface ReceiptsHistoryCardProps {
  receipts: ReceiptItem[]
  onUpload: () => void
  canUpload: boolean
  hasPendingReceipt: boolean
}

const VENTIFY_SUPPORT_PHONE = '573012695457'
const SUPPORT_WHATSAPP = `https://wa.me/${VENTIFY_SUPPORT_PHONE}?text=${encodeURIComponent('Hola, quiero actualizar mi plan de suscripción en Ventify POS')}`

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

export function ReceiptsHistoryCard({ receipts, onUpload, canUpload, hasPendingReceipt }: ReceiptsHistoryCardProps) {
  return (
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Comprobantes de Pago
            </CardTitle>
            <CardDescription className="mt-1">Historial de comprobantes registrados</CardDescription>
          </div>
          {canUpload && !hasPendingReceipt && (
            <Button
              onClick={onUpload}
              size="sm"
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Subir Comprobante
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {receipts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm">No hay comprobantes registrados</p>
            <p className="text-xs mt-1">
              Sube tu comprobante de pago cuando realices el pago por tu plan elegido. El administrador lo revisará y activará tu suscripción.
            </p>
          </div>
        ) : (
          <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                <BadgeCheck className="h-3 w-3" />Total Aprobado
              </div>
              <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatCOP(receipts.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0))}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Receipt className="h-3 w-3" />Comprobantes
              </div>
              <p className="text-lg font-bold">{receipts.length}</p>
            </div>
          </div>

          {/* Receipt Cards */}
          <div className="space-y-4">
            {receipts.map((r) => (
              <div key={r.id} className={`rounded-xl border p-4 ${
                r.status === 'APPROVED'
                  ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/10'
                  : r.status === 'REJECTED'
                  ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/10'
                  : 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10'
              }`}>
                {/* Top row: icon, amount, badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      r.status === 'APPROVED' ? 'bg-emerald-100 dark:bg-emerald-500/15'
                      : r.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-500/15'
                      : 'bg-amber-100 dark:bg-amber-500/15'
                    }`}>
                      {r.status === 'APPROVED' ? <BadgeCheck className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                       : r.status === 'REJECTED' ? <AlertTriangle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
                       : <Clock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold font-mono truncate ${
                        r.status === 'APPROVED' ? 'text-emerald-700 dark:text-emerald-300'
                        : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                        : 'text-foreground'
                      }`}>
                        {r.status === 'APPROVED' && '✅ Pago confirmado — '}{formatCOP(r.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.paymentMethod}{r.reference ? ` · Ref: ${r.reference}` : ''} · {new Date(r.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <Badge className={`shrink-0 text-[11px] font-semibold ${
                    r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20'
                    : r.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20'
                  }`}>
                    {r.status === 'APPROVED' ? 'Confirmado' : r.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                  </Badge>
                </div>

                {/* File name */}
                {r.fileName && (
                  <div className="flex items-center gap-1.5 mt-2.5 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{r.fileName}</span>
                  </div>
                )}

                {/* Plan Change Request Badge */}
                {(() => {
                  const planChange = parsePlanChangeNotes(r.notes)
                  if (!planChange) return null
                  return (
                    <div className={`mt-2.5 p-2.5 rounded-lg border ${
                      r.status === 'APPROVED'
                        ? 'bg-violet-50 dark:bg-violet-500/5 border-violet-200/60 dark:border-violet-800/30'
                        : r.status === 'REJECTED'
                        ? 'bg-red-50 dark:bg-red-500/5 border-red-200/60 dark:border-red-800/30'
                        : 'bg-sky-50 dark:bg-sky-500/5 border-sky-200/60 dark:border-sky-800/30'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <ArrowRight className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                        <p className={`text-xs font-semibold ${
                          r.status === 'APPROVED' ? 'text-violet-700 dark:text-violet-300'
                          : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                          : 'text-sky-700 dark:text-sky-300'
                        }`}>
                          Solicitud de cambio a {planChange.requestedPlanName}
                        </p>
                      </div>
                      {planChange.userNotes && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 italic">&quot;{planChange.userNotes}&quot;</p>
                      )}
                      {r.status === 'PENDING' && (
                        <p className="text-[11px] text-sky-600/70 dark:text-sky-400/60 mt-0.5">
                          Esperando aprobación del administrador para activar el nuevo plan.
                        </p>
                      )}
                      {r.status === 'APPROVED' && (
                        <p className="text-[11px] text-violet-600/70 dark:text-violet-400/60 mt-0.5">
                          ✅ Cambio de plan aprobado y aplicado.
                        </p>
                      )}
                      {r.status === 'REJECTED' && (
                        <p className="text-[11px] text-red-600/70 dark:text-red-400/60 mt-0.5">
                          Solicitud rechazada. Puedes intentar nuevamente.
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* Status-specific detail messages */}
                {r.status === 'APPROVED' && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-100/60 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-800/30">
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      ✅ Pago verificado por administrador
                    </p>
                    {r.reviewedAt && (
                      <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
                        Confirmado el {new Date(r.reviewedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {r.reviewNotes && r.reviewedBy !== 'SUPER_ADMIN' && (
                      <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5 italic">{r.reviewNotes}</p>
                    )}
                  </div>
                )}

                {r.status === 'PENDING' && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-amber-100/60 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-800/30">
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                      ⏳ En revisión
                    </p>
                    <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                      El administrador verificará tu pago y activará tu suscripción. Esto puede tardar unas horas.
                    </p>
                  </div>
                )}

                {r.status === 'REJECTED' && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-red-100/60 dark:bg-red-500/10 border border-red-200/60 dark:border-red-800/30">
                    <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                      ❌ Pago rechazado
                    </p>
                    {r.reviewNotes && (
                      <p className="text-[11px] text-red-600/70 dark:text-red-400/60 mt-0.5">
                        Motivo: {r.reviewNotes}
                      </p>
                    )}
                    {r.reviewedAt && (
                      <p className="text-[11px] text-red-600/60 dark:text-red-400/50 mt-0.5">
                        Revisado el {new Date(r.reviewedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                    <a
                      href={SUPPORT_WHATSAPP}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 font-semibold mt-1.5 hover:underline"
                    >
                      <MessageCircle className="h-3 w-3" />
                      Contactar soporte para resolver
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
