'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search, Plus, ShoppingCart, Ban, Eye, Printer, Download,
  FileSpreadsheet, Upload, Info, Pencil, DollarSign, AlertTriangle,
  TrendingDown, TrendingUp, Receipt, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/auth'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  usePurchases, useDeletePurchase,
  type Purchase, type StatusFilter, type ProviderOption,
} from '@/hooks/api/use-purchases'
import {
  getDocBadge, getPaymentStatusBadge, getStatusBadge, isOverdue,
} from './purchase-types'
import { handlePrintPurchases, handleExportExcel } from './purchase-export-utils'
import { PurchaseFormDialog } from './purchase-form-dialog'
import { PurchaseDetailDialog } from './purchase-detail-dialog'
import { PurchaseXmlImport, PurchaseXmlHelpDialog } from './purchase-xml-import'

// ══════════════════════════════════════════════════════════════════════
// MAIN VIEW (orchestrator)
// ══════════════════════════════════════════════════════════════════════

export function PurchasesView() {
  const { store } = useAuthStore()
  const currencyCode = store?.currencyCode || 'COP'

  // ─── Search with debounce ──
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(t) }, [searchInput])

  // ─── Data ──
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const { data: purchases = [], isLoading: loading } = usePurchases(store?.id, { q: search, status: statusFilter })
  const deletePurchase = useDeletePurchase()

  // ─── Dialogs state ──
  const [formOpen, setFormOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [cancelPurchase, setCancelPurchase] = useState<Purchase | null>(null)

  // XML import state (lifted for file input trigger)
  const [xmlParsing, setXmlParsing] = useState(false)
  const [xmlPreview, setXmlPreview] = useState<{
    fileName: string; items: { name: string; quantity: number; unitCost: number }[]
    invoiceNumber?: string; invoiceDate?: string; providerName?: string; providerNit?: string; xmlFormat?: string
  } | null>(null)
  const [xmlNotes, setXmlNotes] = useState('')
  const [xmlProviderId, setXmlProviderId] = useState<string>('none')
  const [xmlProviders, setXmlProviders] = useState<ProviderOption[]>([])
  const [showXmlHelp, setShowXmlHelp] = useState(false)

  // ─── KPIs ──
  const kpiData = useMemo(() => {
    const active = purchases.filter(p => p.status !== 'CANCELLED')
    return {
      totalCompras: active.reduce((s, p) => s + p.total, 0),
      totalIva: active.reduce((s, p) => s + p.totalIva, 0),
      totalRetenciones: active.reduce((s, p) => s + p.totalReteFuente + p.totalReteIca, 0),
      pendientesPago: purchases.filter(p => p.paymentStatus !== 'PAID' && p.status !== 'CANCELLED').length,
    }
  }, [purchases])

  const completedCount = purchases.filter(p => p.status === 'COMPLETED').length
  const pendingCount = purchases.filter(p => p.status === 'PENDING').length
  const cancelledCount = purchases.filter(p => p.status === 'CANCELLED').length

  // ─── Handlers ──
  function handleCancel() {
    if (!cancelPurchase) return
    deletePurchase.mutate({ id: cancelPurchase.id }, {
      onSuccess: () => { toast.success('Compra cancelada exitosamente'); setCancelPurchase(null) },
      onError: (err) => toast.error(err.message),
    })
  }

  // ─── XML upload handler ──
  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Trigger the hidden file input via PurchaseXmlImport component
    // We dispatch a synthetic click on the hidden input
    const input = document.getElementById('xml-purchase-input') as HTMLInputElement
    if (input) {
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><ShoppingCart className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl font-semibold">Compras</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : `${completedCount} completada${completedCount !== 1 ? 's' : ''}, ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}, ${cancelledCount} cancelada${cancelledCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="hidden sm:block flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading || purchases.length === 0} className="gap-1.5">
                <Printer className="h-4 w-4" /><span className="text-xs hidden sm:inline">Imprimir</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePrintPurchases(purchases, statusFilter, search, currencyCode, false)}><FileSpreadsheet className="h-4 w-4 mr-2" />Impresora Normal</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrintPurchases(purchases, statusFilter, search, currencyCode, true)}><Printer className="h-4 w-4 mr-2" />Térmica 80mm</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => { const fn = handleExportExcel(purchases, currencyCode); toast.success(`Archivo ${fn} descargado`) }} disabled={loading || purchases.length === 0} className="gap-1.5">
            <Download className="h-4 w-4" /><span className="text-xs hidden sm:inline">Excel</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => document.getElementById('xml-purchase-input')?.click()} disabled={xmlParsing} className="gap-1.5">
            <Upload className="h-4 w-4" /><span className="text-xs hidden sm:inline">XML</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ayuda XML" onClick={() => setShowXmlHelp(true)} aria-label="Ayuda XML"><Info className="h-4 w-4" /></Button>
          <Button onClick={() => { setEditingPurchase(null); setFormOpen(true) }} size="sm"><Plus className="h-4 w-4" />Nueva Compra</Button>
        </div>
      </div>

      {/* ── KPI Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Total Compras</div><p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(kpiData.totalCompras, currencyCode)}</p></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Receipt className="h-3.5 w-3.5 text-blue-500" />IVA Descontable</div><p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(kpiData.totalIva, currencyCode)}</p></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingDown className="h-3.5 w-3.5 text-orange-500" />Retenciones</div><p className="text-lg font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(kpiData.totalRetenciones, currencyCode)}</p></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Pendientes de Pago</div><p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{kpiData.pendientesPago}</p></Card>
      </div>

      {/* ── Search + Filter ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por factura, proveedor, notas..." className="pl-9" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'ALL' as const, label: 'TODAS' }, { key: 'COMPLETED' as const, label: 'COMPLETADAS' },
                { key: 'PENDING' as const, label: 'PENDIENTES' }, { key: 'CANCELLED' as const, label: 'CANCELADAS' },
              ]).map(f => (
                <Button key={f.key} variant={statusFilter === f.key ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(f.key)} className="text-xs h-8">{f.label}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Purchases List ── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}</div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No se encontraron compras</p>
              <p className="text-sm text-muted-foreground/70">{search || statusFilter !== 'ALL' ? 'Intenta con otra búsqueda o filtro' : 'Registra tu primera compra de inventario'}</p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-[80px]">Consecutivo</TableHead><TableHead className="w-[50px]">Tipo</TableHead>
                    <TableHead className="w-[95px]">Fecha</TableHead><TableHead className="w-[95px]">Vencimiento</TableHead>
                    <TableHead>Proveedor</TableHead><TableHead className="text-right w-[100px]">Total</TableHead>
                    <TableHead className="text-center w-[80px]">Pago</TableHead><TableHead className="text-center w-[80px]">Estado</TableHead>
                    <TableHead className="text-center w-[120px]">Acciones</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {purchases.map(purchase => {
                      const doc = getDocBadge(purchase.documentType)
                      const overdue = isOverdue(purchase)
                      return (
                        <TableRow key={purchase.id} className={purchase.status === 'CANCELLED' ? 'opacity-60' : ''}>
                          <TableCell className="font-mono text-xs font-medium">{purchase.consecutiveNumber || `#${purchase.id}`}</TableCell>
                          <TableCell><span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${doc.color}`}>{doc.short}</span></TableCell>
                          <TableCell className="text-xs">{format(new Date(purchase.date), 'd MMM yy', { locale: es })}</TableCell>
                          <TableCell className="text-xs">
                            {purchase.dueDate ? (
                              <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                                {format(new Date(purchase.dueDate), 'd MMM yy', { locale: es })}{overdue && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{purchase.provider?.name || <span className="text-muted-foreground">Sin proveedor</span>}</TableCell>
                          <TableCell className="text-right font-semibold text-sm">{formatCurrency(purchase.total, currencyCode)}</TableCell>
                          <TableCell className="text-center">{getPaymentStatusBadge(purchase.paymentStatus)}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(purchase.status)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalle" onClick={() => { setDetailId(purchase.id); setDetailOpen(true) }} aria-label="Ver detalles"><Eye className="h-3.5 w-3.5" /></Button>
                              {(purchase.status === 'PENDING' || purchase.status === 'COMPLETED') && <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => { setEditingPurchase(purchase); setFormOpen(true) }} aria-label="Editar compra"><Pencil className="h-3.5 w-3.5" /></Button>}
                              {purchase.paymentStatus !== 'PAID' && purchase.status !== 'CANCELLED' && <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Pagar" onClick={() => { setDetailId(purchase.id); setDetailOpen(true) }} aria-label="Registrar pago"><DollarSign className="h-3.5 w-3.5" /></Button>}
                              {purchase.status === 'COMPLETED' && <Button variant="ghost" size="icon" className="h-7 w-7" title="Devolver" onClick={() => { setDetailId(purchase.id); setDetailOpen(true) }} aria-label="Devolver compra"><Pencil className="h-3.5 w-3.5" /></Button>}
                              {purchase.status !== 'CANCELLED' && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" title="Cancelar" onClick={() => setCancelPurchase(purchase)} aria-label="Cancelar compra"><Ban className="h-3.5 w-3.5" /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="lg:hidden divide-y">
                {purchases.map(purchase => {
                  const doc = getDocBadge(purchase.documentType)
                  const overdue = isOverdue(purchase)
                  return (
                    <div key={purchase.id} className={`p-4 space-y-2 ${purchase.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-sm font-semibold">{purchase.consecutiveNumber || `#${purchase.id}`}</span>
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${doc.color}`}>{doc.short}</span>
                          </div>
                          <p className="text-sm font-medium">{purchase.provider?.name || 'Sin proveedor'}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}
                            {purchase.dueDate && <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold ml-2' : ' ml-2'}>· Vence: {format(new Date(purchase.dueDate), 'd MMM yy', { locale: es })}{overdue && ' ⚠'}</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(purchase.total, currencyCode)}</p>
                          <div className="flex flex-col items-end gap-0.5 mt-1">{getStatusBadge(purchase.status)}{getPaymentStatusBadge(purchase.paymentStatus)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDetailId(purchase.id); setDetailOpen(true) }}><Eye className="h-3 w-3 mr-1" />Ver</Button>
                        {(purchase.status === 'PENDING' || purchase.status === 'COMPLETED') && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingPurchase(purchase); setFormOpen(true) }}><Pencil className="h-3 w-3 mr-1" />Editar</Button>}
                        {purchase.paymentStatus !== 'PAID' && purchase.status !== 'CANCELLED' && <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => { setDetailId(purchase.id); setDetailOpen(true) }}><DollarSign className="h-3 w-3 mr-1" />Pagar</Button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Sub-components ── */}
      <PurchaseFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingPurchase(null) }}
        editingPurchase={editingPurchase}
        currencyCode={currencyCode}
        onSaved={() => {}}
      />

      <PurchaseDetailDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailId(null) }}
        purchaseId={detailId}
        currencyCode={currencyCode}
        onEdit={(p) => { setDetailOpen(false); setEditingPurchase(p); setFormOpen(true) }}
        onCancel={(p) => { setDetailOpen(false); setCancelPurchase(p) }}
      />

      <PurchaseXmlImport
        xmlParsing={xmlParsing} xmlPreview={xmlPreview} xmlNotes={xmlNotes}
        xmlProviderId={xmlProviderId} xmlProviders={xmlProviders}
        setXmlParsing={setXmlParsing} setXmlPreview={setXmlPreview}
        setXmlNotes={setXmlNotes} setXmlProviderId={setXmlProviderId}
      />

      <PurchaseXmlHelpDialog open={showXmlHelp} onOpenChange={setShowXmlHelp} />

      {/* ── Cancel Dialog ── */}
      <AlertDialog open={!!cancelPurchase} onOpenChange={open => { if (!open) setCancelPurchase(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar Compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancelará la compra {cancelPurchase?.consecutiveNumber || `#${cancelPurchase?.id}`} y reducirá el inventario de los productos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePurchase.isPending}>No, mantener</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={deletePurchase.isPending} className="bg-red-600 hover:bg-red-700">
              {deletePurchase.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Sí, cancelar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
