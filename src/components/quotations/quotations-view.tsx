'use client'

import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCOP } from '@/lib/format'
import { toast } from 'sonner'
import {
  Plus, Search, Eye, Pencil, ArrowRightLeft, XCircle, FileText,
} from 'lucide-react'
import { format, isAfter, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useQuotations, useQuotationDetail, useUpdateQuotation } from '@/hooks/api/use-quotations'
import {
  STATUS_TABS,
} from '@/components/quotations/quotation-types'
import type { QuotationListItem } from '@/components/quotations/quotation-types'
import { StatusBadge } from '@/components/quotations/status-badge'
import { CreateQuotationDialog } from '@/components/quotations/create-quotation-dialog'
import { QuotationDetailDialog } from '@/components/quotations/quotation-detail-dialog'
import { ConvertDialog } from '@/components/quotations/convert-dialog'

const cop = formatCOP

// ─── Main Component ─────────────────────────────────────

export function QuotationsView() {
  const store = useAuthStore((s) => s.store)

  // List state
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // ─── TanStack Query hooks ──────────────────────
  const quotationsQuery = useQuotations(store?.id, { q: searchQuery, status: statusFilter })

  // Detail
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pendingConvert, setPendingConvert] = useState(false)
  const detailQuery = useQuotationDetail(selectedId, store?.id)

  // Mutation hooks
  const updateQuotationMut = useUpdateQuotation()

  // ─── Dialog visibility ─────────────────────────
  const [showDetail, setShowDetail] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showConvert, setShowConvert] = useState(false)

  // ─── Derived state ──────────────────────────────
  const quotations = useMemo(() => {
    const data = quotationsQuery.data ?? []
    const now = new Date()
    return data.map(q => {
      if (q.status === 'ACTIVE' && q.validUntil && isAfter(now, parseISO(q.validUntil))) {
        return { ...q, status: 'EXPIRED' }
      }
      return q
    })
  }, [quotationsQuery.data])
  const loading = quotationsQuery.isLoading

  // Enrich detail with expired check
  const detail = useMemo(() => {
    if (!detailQuery.data) return null
    const d = detailQuery.data
    if (d.status === 'ACTIVE' && d.validUntil && isAfter(new Date(), parseISO(d.validUntil))) {
      return { ...d, status: 'EXPIRED' }
    }
    return d
  }, [detailQuery.data])
  const loadingDetail = detailQuery.isLoading

  // ─── React state adjustments (during render, not effects) ──────

  // Close detail dialog on query error
  const [prevDetailError, setPrevDetailError] = useState(false)
  if (detailQuery.isError && !prevDetailError && showDetail && !pendingConvert) {
    setPrevDetailError(true)
    toast.error('Error al cargar detalle')
    setShowDetail(false)
    setSelectedId(null)
  }
  if (!detailQuery.isError && prevDetailError) {
    setPrevDetailError(false)
  }

  // Auto-open convert dialog when detail loads for pending convert
  const [prevDetailLoading, setPrevDetailLoading] = useState(true)
  if (pendingConvert && detail && !detailQuery.isLoading && prevDetailLoading) {
    setPrevDetailLoading(false)
    setPendingConvert(false)
    setShowConvert(true)
  }
  if (detailQuery.isLoading && !prevDetailLoading) {
    setPrevDetailLoading(true)
  }

  // ─── Count by status ─────────────────────────────

  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = { ALL: quotations.length }
    for (const q of quotations) {
      counts[q.status] = (counts[q.status] || 0) + 1
    }
    return counts
  }, [quotations])

  // ─── Handlers ────────────────────────────────────

  const openDetail = (id: number) => {
    setSelectedId(id)
    setShowDetail(true)
  }

  const handleCancel = async (id: number) => {
    if (!store) return
    try {
      await updateQuotationMut.mutateAsync({ id, body: { storeId: store.id, status: 'CANCELLED' } })
      toast.success('Cotización cancelada')
      setShowDetail(false)
      setSelectedId(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
    }
  }

  const handleOpenConvert = () => {
    setShowConvert(true)
  }

  const handleConverted = () => {
    setShowConvert(false)
    setShowDetail(false)
    setSelectedId(null)
  }

  if (!store) return null

  // ─── Render ──────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cotizaciones</h2>
          <p className="text-sm text-muted-foreground">
            Gestiona las cotizaciones y presupuestos para tus clientes
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" />
          Nueva Cotización
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={statusFilter === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(tab.key)}
            className="gap-1.5"
          >
            {tab.label}
            {countByStatus[tab.key] !== undefined && (
              <span className="ml-0.5 text-xs opacity-70">({countByStatus[tab.key]})</span>
            )}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por número o cliente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : quotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-16 w-16 text-muted-foreground/40 mb-4 animate-bounce" />
              <h3 className="text-base font-medium text-muted-foreground">Sin cotizaciones</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {statusFilter !== 'ALL'
                  ? 'No hay cotizaciones con este estado'
                  : 'Crea tu primera cotización'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden md:table-cell">Fecha</TableHead>
                    <TableHead className="hidden lg:table-cell">Válida Hasta</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations.map((q) => (
                    <TableRow key={q.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-medium">{q.quotationNumber}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{q.customerName || '—'}</div>
                          {q.customerNit && (
                            <div className="text-xs text-muted-foreground">{q.customerNit}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {format(parseISO(q.createdAt), 'dd MMM yyyy', { locale: es })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {q.validUntil
                          ? format(parseISO(q.validUntil), 'dd MMM yyyy', { locale: es })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{cop(q.total)}</TableCell>
                      <TableCell><StatusBadge status={q.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(q.id)} aria-label="Ver detalles">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {q.status === 'ACTIVE' && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(q.id)} aria-label="Editar cotización">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:text-amber-700"
                                onClick={() => {
                                  setSelectedId(q.id)
                                  setPendingConvert(true)
                                }}
                                aria-label="Convertir a venta"
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleCancel(q.id)}
                                aria-label="Cancelar cotización"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ── */}
      <CreateQuotationDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        store={store}
      />

      <QuotationDetailDialog
        open={showDetail}
        onOpenChange={(v) => { if (!v) { setShowDetail(false); setSelectedId(null) } }}
        detail={detail}
        loading={loadingDetail}
        store={store}
        onCancel={handleCancel}
        onOpenConvert={handleOpenConvert}
      />

      <ConvertDialog
        open={showConvert}
        onOpenChange={setShowConvert}
        detail={detail}
        store={store}
        onConverted={handleConverted}
      />
    </div>
  )
}


