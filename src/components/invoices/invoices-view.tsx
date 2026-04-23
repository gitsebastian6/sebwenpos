'use client'

import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useInvoices, useResolutionStatus, useSendInvoice, useEmailInvoice, useInvoicePdf, useInvoiceStatus } from '@/hooks/api/use-invoices'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  FileText,
  Plus,
  Filter,
  X as XIcon,
  Eye,
  Download,
  Send,
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  Hash,
  Shield,
  Receipt,
  User,
  CalendarDays,
  MoreHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/lib/format'
import { STATUS_FILTERS, InvoiceStatusBadge, ResolutionStatusBadge } from './invoices-types'
import type { InvoiceSummary, ResolutionStatus } from './invoices-types'
import { CreateInvoiceDialog } from './create-invoice-dialog'
import { InvoiceDetailDialog } from './invoice-detail-dialog'

// ── Component ───────────────────────────────────────────────────────────────

export function InvoicesView() {
  const { store } = useAuthStore()
  const storeIdNum = store?.id

  // ── Filter state ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ── Dialog state ──
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // ── Query hooks ──
  const invoicesQuery = useInvoices(storeIdNum, {
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    q: search.trim() || undefined,
  })

  const resolutionQuery = useResolutionStatus(storeIdNum)

  // ── Mutation hooks (for table row actions) ──
  const sendInvoiceMutation = useSendInvoice()
  const emailInvoiceMutation = useEmailInvoice()
  const pdfMutation = useInvoicePdf()
  const statusMutation = useInvoiceStatus()

  // ── Derived data ──
  const invoices = useMemo<InvoiceSummary[]>(() => {
    if (!invoicesQuery.data) return []
    return Array.isArray(invoicesQuery.data) ? invoicesQuery.data : (invoicesQuery.data.data || [])
  }, [invoicesQuery.data])

  const resolutionStatus: ResolutionStatus | null = resolutionQuery.data ?? null

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = invoices.length
    const validated = invoices.filter(i => i.status === 'VALIDATED' || i.status === 'DELIVERED').length
    const pending = invoices.filter(i => i.status === 'DRAFT' || i.status === 'PENDING_VALIDATE').length
    return { total, validated, pending }
  }, [invoices])

  // ── Action handlers ──
  async function handleAction(action: string, invoiceId: number, invoiceNumber?: string) {
    if (!storeIdNum) return
    try {
      if (action === 'pdf') {
        const blob = await pdfMutation.mutateAsync({ id: invoiceId, storeId: storeIdNum })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Factura_${invoiceNumber || invoiceId}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        toast.success('PDF descargado')
      } else if (action === 'send') {
        await sendInvoiceMutation.mutateAsync({ id: invoiceId, storeId: storeIdNum })
        toast.success('Factura enviada a DIAN')
      } else if (action === 'status') {
        const data = await statusMutation.mutateAsync({ id: invoiceId, storeId: storeIdNum })
        toast.success(`Estado DIAN: ${data.dianStatus || data.status || 'Consultado'}`)
      } else if (action === 'email') {
        await emailInvoiceMutation.mutateAsync({ id: invoiceId, storeId: storeIdNum })
        toast.success('Factura enviada por email')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en la acción')
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('ALL')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = statusFilter !== 'ALL' || dateFrom || dateTo || search.trim()

  // ── Resolution info ──
  const resolutionPercent = useMemo(() => {
    if (!resolutionStatus || resolutionStatus.consecutiveStart == null || resolutionStatus.consecutiveEnd == null) return 0
    const total = resolutionStatus.consecutiveEnd - resolutionStatus.consecutiveStart + 1
    const used = (resolutionStatus.currentConsecutive || resolutionStatus.consecutiveStart) - resolutionStatus.consecutiveStart + 1
    return Math.min(100, Math.round((used / total) * 100))
  }, [resolutionStatus])

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Facturación Electrónica</h2>
            <p className="text-sm text-muted-foreground">
              {invoicesQuery.isPending ? '...' : `Gestión de facturas electrónicas DIAN`}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2 active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" /> Crear Factura
        </Button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Facturas</p>
                <p className="text-2xl font-bold mt-1">{kpis.total}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-800 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Facturas Validadas</p>
                <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{kpis.validated}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Facturas Pendientes</p>
                <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-300">{kpis.pending}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={clearFilters}>
                <XIcon className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar factura..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo || undefined} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom || undefined} />
          </div>
        </CardContent>
      </Card>

      {/* ── Invoices Table ─────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-0">
          {invoicesQuery.isPending ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-4 animate-pulse">
                <FileText className="h-10 w-10 text-muted-foreground/60" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Sin facturas</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No se encontraron facturas con los filtros actuales. Crea tu primera factura electrónica desde una orden completada.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} variant="outline" className="mt-4 gap-2 active:scale-[0.98] transition-all">
                <Plus className="h-4 w-4" /> Crear Factura
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs w-10">#</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Factura</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Total</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Estado</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Creada</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv, idx) => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedInvoiceId(inv.id)}>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs font-medium">{inv.invoiceNumber}</span>
                          {inv.testMode && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                              TEST
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]" title={inv.customerName}>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{inv.customerName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">{formatCOP(inv.grandTotal)}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 shrink-0" />
                          {format(new Date(inv.createdAt), 'dd MMM HH:mm', { locale: es })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Más opciones">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setSelectedInvoiceId(inv.id)} className="gap-2">
                              <Eye className="h-4 w-4" /> Ver Detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleAction('pdf', inv.id, inv.invoiceNumber)}
                              disabled={pdfMutation.isPending}
                              className="gap-2"
                            >
                              {pdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              Generar PDF
                            </DropdownMenuItem>
                            {(inv.status === 'DRAFT' || inv.status === 'REJECTED') && (
                              <DropdownMenuItem
                                onClick={() => handleAction('send', inv.id, inv.invoiceNumber)}
                                disabled={sendInvoiceMutation.isPending}
                                className="gap-2"
                              >
                                {sendInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Enviar a DIAN
                              </DropdownMenuItem>
                            )}
                            {inv.status === 'PENDING_VALIDATE' && (
                              <DropdownMenuItem
                                onClick={() => handleAction('status', inv.id, inv.invoiceNumber)}
                                disabled={statusMutation.isPending}
                                className="gap-2"
                              >
                                {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Consultar Estado
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleAction('email', inv.id, inv.invoiceNumber)}
                              disabled={emailInvoiceMutation.isPending}
                              className="gap-2"
                            >
                              {emailInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                              Enviar por Email
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Resolution Status ──────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Estado de Resolución DIAN
          </CardTitle>
        </CardHeader>
        <CardContent>
          {resolutionQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ) : resolutionStatus ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Resolución</p>
                <p className="font-mono text-sm font-medium mt-0.5">
                  {resolutionStatus.resolutionNumber || 'No configurada'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rango Utilizado</p>
                <p className="text-sm font-medium mt-0.5">
                  {resolutionStatus.consecutiveStart != null && resolutionStatus.currentConsecutive != null
                    ? `${resolutionStatus.consecutiveStart} - ${resolutionStatus.currentConsecutive}`
                    : 'N/A'}
                  <span className="text-xs text-muted-foreground ml-1">
                    (de {resolutionStatus.consecutiveEnd ?? 'N/A'})
                  </span>
                </p>
                <Progress value={resolutionPercent} className="h-2 mt-2" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Facturas Restantes</p>
                <p className={`text-sm font-semibold mt-0.5 ${
                  resolutionStatus.remaining < 50 ? 'text-red-600 dark:text-red-400' :
                  resolutionStatus.remaining < 200 ? 'text-amber-600 dark:text-amber-400' :
                  'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {resolutionStatus.remaining ?? 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <div className="mt-0.5">
                  <ResolutionStatusBadge status={resolutionStatus.status} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se pudo consultar el estado de la resolución. Verifica la configuración en Configuración &gt; Facturación.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ────────────────────────────────────── */}
      <CreateInvoiceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        storeId={storeIdNum!}
      />
      <InvoiceDetailDialog
        open={!!selectedInvoiceId}
        onOpenChange={(open) => { if (!open) setSelectedInvoiceId(null) }}
        storeId={storeIdNum!}
        invoiceId={selectedInvoiceId}
      />
    </div>
  )
}
