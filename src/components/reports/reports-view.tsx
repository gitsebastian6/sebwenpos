'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { KPIBar } from '@/components/shared/kpi-bar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Store, Package, TrendingUp, ShoppingCart, AlertTriangle, Target,
  RotateCcw, Wallet, Percent, SlidersHorizontal, Receipt,
  PackageSearch, Tag, Route, Truck, ArrowDownUp, FileText,
  CalendarDays, DollarSign, Users, RefreshCw, ChevronRight,
  Plus, Filter, Loader2,
} from 'lucide-react'

// ── Payment labels ──
const PM: Record<string, string> = {
  CASH: 'Efectivo', NEQUI: 'Nequi', CARD: 'Tarjeta', DAVIPLATA: 'Daviplata',
  TRANSFER: 'Transferencia', MIXED: 'Mixto', CREDIT: 'Fiado',
}

const MOV_TYPE: Record<string, string> = {
  PURCHASE: 'Compra', SALE: 'Venta', ADJUSTMENT: 'Ajuste', RETURN: 'Devolución', LOSS: 'Pérdida',
}

const MOV_BADGE: Record<string, string> = {
  PURCHASE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  SALE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  ADJUSTMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  RETURN: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
  LOSS: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}

const EXP_CAT: Record<string, string> = {
  ARRIENDO: 'Arriendo', SERVICIOS: 'Servicios', NOMINA: 'Nómina', INSUMOS: 'Insumos',
  LICENCIAS: 'Licencias', IMPUESTOS: 'Impuestos', TRANSPORTE: 'Transporte',
  MANTENIMIENTO: 'Mantenimiento', OTRO: 'Otro',
}

const LOSS_REASONS: Record<string, string> = {
  EXPIRED: 'Vencido', DAMAGED: 'Dañado', THEFT: 'Robo/Hurto', SPILL: 'Derrame',
  COUNT_DIFF: 'Conteo diferencial', OTHER: 'Otro',
}

function fdate(d: string) { return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) }
function fdatetime(d: string) { return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }

// ── Skeleton ──
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full rounded" /></CardContent></Card>)}
      </div>
      <Card><CardContent className="p-6"><Skeleton className="h-[400px] w-full rounded" /></CardContent></Card>
    </div>
  )
}

// ── Empty State ──
function EmptyState({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {desc && <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">{desc}</p>}
    </div>
  )
}

// ── Stat Card ──
function Stat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon?: React.ComponentType<{ className?: string }>; color?: string }) {
  return (
    <Card className="gap-2">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          {Icon && <Icon className={`h-4 w-4 ${color || 'text-muted-foreground'}`} />}
        </div>
        <p className={`text-lg font-bold mt-1 ${color || ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

// ── Product Search Select ──
function ProductSearchSelect({
  products, value, onValueChange, placeholder = 'Buscar producto...',
}: {
  products: any[]; value: string; onValueChange: (v: string) => void; placeholder?: string;
}) {
  const [search, setSearch] = useState('')
  const filtered = products.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="space-y-1.5">
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9 text-xs"
      />
      <div className="max-h-40 overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">Sin resultados</div>
        ) : (
          filtered.map((p: any) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onValueChange(p.id); setSearch('') }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between ${value === p.id ? 'bg-muted' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                {p.sku && <span className="text-muted-foreground font-mono text-[10px]">{p.sku}</span>}
              </div>
              <span className="text-muted-foreground">Stock: {p.currentStock ?? 0}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── Main Component ──
export function ReportsView() {
  const store = useAuthStore((s) => s.store)
  const cc = store?.currencyCode || 'COP'

  // Date state
  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
  const [to, setTo] = useState(now.toISOString().split('T')[0])
  const [tab, setTab] = useState('cifras')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [showAdjustDialog, setShowAdjustDialog] = useState(false)
  const [showLossDialog, setShowLossDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Products for dialogs
  const [products, setProducts] = useState<any[]>([])

  // Return form
  const [returnForm, setReturnForm] = useState({ productId: '', quantity: '', notes: '' })

  // Adjust form
  const [adjustForm, setAdjustForm] = useState({ productId: '', quantity: '', mode: 'delta' as 'delta' | 'set', notes: '' })
  const [selectedProductStock, setSelectedProductStock] = useState<number | null>(null)

  // Loss form
  const [lossForm, setLossForm] = useState({ productId: '', quantity: '', reason: 'EXPIRED', notes: '' })

  // Trazabilidad filter
  const [trazFilter, setTrazFilter] = useState<string>('ALL')

  const fetchReports = useCallback(async () => {
    if (!store) return
    try {
      setLoading(true); setError(null)
      const res = await fetch(`/api/reports/informes?storeId=${store.id}&from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Error al cargar informes')
      setData(await res.json())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [store, from, to])

  const fetchProducts = useCallback(async () => {
    if (!store) return
    try {
      const res = await fetch(`/api/products?storeId=${store.id}`)
      if (res.ok) {
        const json = await res.json()
        setProducts(Array.isArray(json) ? json : json.products || json.data || [])
      }
    } catch { /* ignore */ }
  }, [store])

  useEffect(() => { fetchReports() }, [fetchReports])

  const quickRange = (range: 'today' | 'week' | 'month') => {
    const d = new Date()
    if (range === 'today') { setFrom(d.toISOString().split('T')[0]); setTo(d.toISOString().split('T')[0]) }
    else if (range === 'week') {
      const w = new Date(d.getTime() - 6 * 86400000); w.setHours(0, 0, 0, 0)
      setFrom(w.toISOString().split('T')[0]); setTo(d.toISOString().split('T')[0])
    } else {
      setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0])
      setTo(d.toISOString().split('T')[0])
    }
  }

  // ── Open dialogs and fetch products ──
  const openReturnDialog = () => { fetchProducts(); setReturnForm({ productId: '', quantity: '', notes: '' }); setShowReturnDialog(true) }
  const openAdjustDialog = () => { fetchProducts(); setAdjustForm({ productId: '', quantity: '', mode: 'delta', notes: '' }); setSelectedProductStock(null); setShowAdjustDialog(true) }
  const openLossDialog = () => { fetchProducts(); setLossForm({ productId: '', quantity: '', reason: 'EXPIRED', notes: '' }); setShowLossDialog(true) }

  // ── Submit handlers ──
  const handleSubmitReturn = async () => {
    if (!returnForm.productId || !returnForm.quantity || Number(returnForm.quantity) <= 0) {
      toast.error('Selecciona un producto y una cantidad válida')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inventory/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store!.id, productId: returnForm.productId, quantity: Number(returnForm.quantity), notes: returnForm.notes }),
      })
      if (!res.ok) throw new Error('Error al registrar devolución')
      toast.success('Devolución registrada correctamente')
      setShowReturnDialog(false)
      fetchReports()
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar devolución')
    } finally { setIsSubmitting(false) }
  }

  const handleSubmitAdjust = async () => {
    if (!adjustForm.productId || !adjustForm.quantity || Number(adjustForm.quantity) === 0) {
      toast.error('Selecciona un producto y una cantidad')
      return
    }
    if (!adjustForm.notes.trim()) {
      toast.error('Las notas son obligatorias para ajustes')
      return
    }
    setIsSubmitting(true)
    try {
      const payload: any = { storeId: store!.id, productId: adjustForm.productId, quantity: Number(adjustForm.quantity), notes: adjustForm.notes }
      if (adjustForm.mode === 'set') {
        payload.mode = 'set'
      } else {
        payload.mode = 'delta'
      }
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Error al registrar ajuste')
      toast.success('Ajuste registrado correctamente')
      setShowAdjustDialog(false)
      fetchReports()
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar ajuste')
    } finally { setIsSubmitting(false) }
  }

  const handleSubmitLoss = async () => {
    if (!lossForm.productId || !lossForm.quantity || Number(lossForm.quantity) <= 0) {
      toast.error('Selecciona un producto y una cantidad válida')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inventory/losses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store!.id, productId: lossForm.productId, quantity: Number(lossForm.quantity), reason: lossForm.reason, notes: lossForm.notes }),
      })
      if (!res.ok) throw new Error('Error al registrar pérdida')
      toast.success('Pérdida registrada correctamente')
      setShowLossDialog(false)
      fetchReports()
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar pérdida')
    } finally { setIsSubmitting(false) }
  }

  // Get selected product for adjust dialog
  const getSelectedProduct = (productId: string) => products.find((p: any) => p.id === productId)

  if (loading) return <LoadingSkeleton />
  if (error) return (
    <Card className="border-destructive/50"><CardContent className="p-6 flex flex-col items-center gap-3">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="font-semibold text-sm">{error}</p>
      <Button onClick={fetchReports} size="sm" variant="outline"><RefreshCw className="h-3 w-3 mr-1" />Reintentar</Button>
    </CardContent></Card>
  )
  if (!data) return null

  const d = data

  // ── Trazabilidad computed data ──
  const trazData = d.traceability || []
  const filteredTraz = trazFilter === 'ALL' ? trazData : trazData.filter((m: any) => m.movementType === trazFilter)
  const trazCounts: Record<string, number> = { PURCHASE: 0, SALE: 0, ADJUSTMENT: 0, RETURN: 0, LOSS: 0 }
  trazData.forEach((m: any) => { if (trazCounts[m.movementType] !== undefined) trazCounts[m.movementType]++ })

  // ── Registered losses from traceability ──
  const registeredLosses = trazData.filter((m: any) => m.movementType === 'LOSS')
  const totalLossesValue = registeredLosses.reduce((s: number, m: any) => s + ((m.quantity || 0) * (m.product?.costPrice || m.product?.salePrice || 0)), 0)

  return (
    <div className="space-y-4">
      <KPIBar context="default" />

      {/* ── Date Selector ── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <label className="text-xs font-medium text-muted-foreground">Desde:</label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Hasta:</label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36 text-xs" />
            </div>
            <Button onClick={fetchReports} size="sm"><RefreshCw className="h-3 w-3 mr-1" />Actualizar</Button>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="flex flex-wrap gap-1.5">
              {[['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']].map(([k, l]) => (
                <Button key={k} variant="outline" size="sm" className="h-7 text-xs" onClick={() => quickRange(k as any)}>{l}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="flex-wrap gap-1 h-auto bg-transparent p-0">
            {[
              ['cifras', 'Cifras', Store], ['ventas', 'Ventas', ShoppingCart], ['rentabilidad', 'Rentabilidad', TrendingUp],
              ['compras', 'Compras', Truck], ['inventario', 'Inventario', Package],
              ['perdidas', 'Pérdidas', AlertTriangle], ['punto-eq', 'Punto Eq.', Target],
              ['descuentos', 'Descuentos', Tag], ['cierres', 'Cierres', Wallet],
              ['comisiones', 'Comisiones', Percent], ['gastos', 'Gastos', ArrowDownUp],
              ['impuestos', 'Impuestos', Receipt], ['devoluciones', 'Devoluciones', RotateCcw],
              ['ajustes', 'Ajustes', SlidersHorizontal], ['trazabilidad', 'Trazabilidad', Route],
              ['cotizaciones', 'Cotizaciones', FileText], ['cxc', 'CxC', Users],
            ].map(([key, label, Icon]) => (
              <TabsTrigger key={key} value={key} className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-1.5 rounded-md border">
                <Icon className="h-3.5 w-3.5" />{label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 1. TU LOCAL EN CIFRAS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="cifras" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Ventas Hoy" value={formatCurrency(d.localEnCifras.salesToday, cc)} icon={DollarSign} color="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Órdenes Hoy" value={`${d.localEnCifras.ordersToday}`} icon={ShoppingCart} />
            <Stat label="Ventas del Mes" value={formatCurrency(d.localEnCifras.salesMonth, cc)} icon={TrendingUp} color="text-emerald-600 dark:text-emerald-400" />
            <Stat label={`vs Mes Anterior ${d.localEnCifras.monthVariance >= 0 ? '↑' : '↓'}`} value={`${Math.abs(d.localEnCifras.monthVariance)}%`} color={d.localEnCifras.monthVariance >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <Stat label="Tips del Mes" value={formatCurrency(d.localEnCifras.tipsMonth, cc)} icon={DollarSign} />
            <Stat label="Órdenes del Mes" value={`${d.localEnCifras.ordersMonth}`} icon={ShoppingCart} />
            <Stat label="Mesas Abiertas" value={`${d.localEnCifras.openTables}`} icon={Package} color={d.localEnCifras.openTables > 0 ? 'text-amber-600' : ''} />
            <Stat label="Cuentas por Cobrar" value={formatCurrency(d.localEnCifras.totalDebt, cc)} icon={Users} color={d.localEnCifras.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : ''} />
          </div>
          <Card className="border-dashed"><CardContent className="p-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-muted-foreground text-xs">Ticket Prom. Mes:</span> <span className="font-bold">{formatCurrency(d.localEnCifras.ordersMonth > 0 ? Math.round(d.localEnCifras.salesMonth / d.localEnCifras.ordersMonth) : 0, cc)}</span></div>
              <div><span className="text-muted-foreground text-xs">Clientes con Deuda:</span> <span className="font-bold">{d.localEnCifras.debtCount}</span></div>
              <div><span className="text-muted-foreground text-xs">Ventas Mes Anterior:</span> <span className="font-bold">{formatCurrency(d.localEnCifras.lastMonthSales, cc)}</span></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 2. VENTAS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="ventas" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total Ventas" value={formatCurrency(d.sales.total, cc)} icon={DollarSign} color="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Órdenes" value={d.sales.orderCount} icon={ShoppingCart} />
            <Stat label="Ticket Promedio" value={formatCurrency(d.sales.avgTicket, cc)} icon={Receipt} />
            <Stat label="POS vs Mesa" value={`Mesa ${Math.round(d.sales.bySource.MESA.total / (d.sales.total || 1) * 100)}%`} icon={Package} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Por Método de Pago</CardTitle></CardHeader><CardContent>
              {Object.entries(d.sales.byPayment).length === 0 ? <EmptyState icon={Receipt} title="Sin ventas" /> : (
                <div className="space-y-2">
                  {Object.entries(d.sales.byPayment).sort((a, b) => b[1].total - a[1].total).map(([method, info]: any) => (
                    <div key={method} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">{PM[method] || method}</Badge><span className="text-xs text-muted-foreground">{info.count} órdenes</span></div>
                      <span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Top Productos</CardTitle></CardHeader><CardContent>
              <div className="max-h-80 overflow-y-auto space-y-1.5">
                {d.sales.topProducts.length === 0 ? <EmptyState icon={Package} title="Sin datos" /> : d.sales.topProducts.map((p: any, i: number) => (
                  <div key={p.name + i} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                    <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-muted text-[10px] flex items-center justify-center font-bold">{i + 1}</span><span className="truncate">{p.name}</span></div>
                    <div className="text-right shrink-0"><span className="font-bold">{formatCurrency(p.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">{p.qty} uds</span></div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </div>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Ventas por Categoría</CardTitle></CardHeader><CardContent>
            {Object.entries(d.sales.byCategory).length === 0 ? <EmptyState icon={Package} title="Sin datos" /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(d.sales.byCategory).sort((a, b) => b[1].total - a[1].total).map(([cat, info]: any) => (
                  <div key={cat} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm font-medium truncate">{cat}</span>
                    <div className="text-right shrink-0"><span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">{info.qty} uds</span></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 3. RENTABILIDAD ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="rentabilidad" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Ingresos Brutos" value={formatCurrency(d.profitability.revenue, cc)} icon={DollarSign} color="text-emerald-600" />
            <Stat label="Costos (COGS)" value={formatCurrency(d.profitability.cogs, cc)} icon={TrendingUp} color="text-red-600" />
            <Stat label="Utilidad Bruta" value={formatCurrency(d.profitability.grossProfit, cc)} icon={TrendingUp} color={d.profitability.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <Stat label="Margen Bruto" value={`${d.profitability.grossMargin}%`} color={d.profitability.grossMargin >= 40 ? 'text-emerald-600' : d.profitability.grossMargin >= 20 ? 'text-amber-600' : 'text-red-600'} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Descuentos" value={formatCurrency(d.profitability.discounts, cc)} icon={Tag} color="text-amber-600" />
            <Stat label="Ingresos Netos" value={formatCurrency(d.profitability.netRevenue, cc)} icon={DollarSign} />
            <Stat label="Utilidad Neta" value={formatCurrency(d.profitability.netProfit, cc)} icon={TrendingUp} color={d.profitability.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <Stat label="Margen Neto" value={`${d.profitability.netMargin}%`} color={d.profitability.netMargin >= 20 ? 'text-emerald-600' : 'text-red-600'} />
          </div>
          <Stat label="Propinas del Período" value={formatCurrency(d.profitability.tips, cc)} icon={DollarSign} />
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 4. COMPRAS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="compras" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Total Compras" value={formatCurrency(d.purchases.total, cc)} icon={Truck} color="text-sky-600" />
            <Stat label="Compras Realizadas" value={d.purchases.items.length} icon={ShoppingCart} />
          </div>
          {d.purchases.byProvider && Object.keys(d.purchases.byProvider).length > 0 && (
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Por Proveedor</CardTitle></CardHeader><CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(d.purchases.byProvider).sort((a: any, b: any) => b[1].total - a[1].total).map(([prov, info]: any) => (
                  <div key={prov} className="flex items-center justify-between p-2.5 rounded-lg border"><span className="text-sm">{prov}</span><div className="text-right"><span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">({info.count})</span></div></div>
                ))}
              </div>
            </CardContent></Card>
          )}
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial de Compras</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Proveedor</TableHead><TableHead className="text-xs">Factura</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader><TableBody>
                {d.purchases.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={Truck} title="Sin compras en el período" /></TableCell></TableRow> :
                d.purchases.items.map((p: any) => (
                  <TableRow key={p.id}><TableCell className="text-xs">{fdate(p.date)}</TableCell><TableCell className="text-xs">{p.provider?.name || '—'}</TableCell><TableCell className="text-xs font-mono">{p.invoiceNumber || '—'}</TableCell><TableCell className="text-right text-sm font-medium">{formatCurrency(p.total, cc)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 5. INVENTARIO ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="inventario" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Stat label="Costo Inventario" value={formatCurrency(d.inventory.totalCostValue, cc)} icon={Package} />
            <Stat label="Valor Retail" value={formatCurrency(d.inventory.totalRetailValue, cc)} icon={DollarSign} />
            <Stat label="Productos Totales" value={d.inventory.totalProducts} icon={PackageSearch} />
            <Stat label="Días de Inventario" value={`${d.inventory.daysOfInventory} días`} icon={CalendarDays} color={d.inventory.daysOfInventory > 30 ? 'text-red-600' : d.inventory.daysOfInventory > 15 ? 'text-amber-600' : 'text-emerald-600'} />
            <Stat label="Agotados" value={d.inventory.outOfStockCount} icon={AlertTriangle} color={d.inventory.outOfStockCount > 0 ? 'text-red-600' : ''} />
            <Stat label="Stock Bajo" value={d.inventory.lowStockCount} icon={Package} color={d.inventory.lowStockCount > 0 ? 'text-amber-600' : ''} />
          </div>
          <Card className="border-dashed"><CardContent className="p-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-xs text-muted-foreground">COGS Promedio/Día:</span> <span className="font-bold">{formatCurrency(d.inventory.avgDailyCOGS, cc)}</span></div>
              <div><span className="text-xs text-muted-foreground">Margen Retail:</span> <span className="font-bold">{d.inventory.totalCostValue > 0 ? Math.round(((d.inventory.totalRetailValue - d.inventory.totalCostValue) / d.inventory.totalCostValue) * 100) : 0}%</span></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 6. VENTAS PERDIDAS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="perdidas" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Productos Agotados" value={d.lostSales.length} icon={AlertTriangle} color="text-red-600" />
            <Stat label="Venta Perdida Est./Día" value={formatCurrency(d.lostSales.reduce((s: number, p: any) => s + (p.avgDaily * p.salePrice), 0), cc)} icon={TrendingUp} color="text-red-600" />
          </div>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Productos sin Stock (30 días velocidad)</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs text-right">Precio</TableHead><TableHead className="text-xs text-right">Vendidos 30d</TableHead><TableHead className="text-xs text-right">Prom/Día</TableHead><TableHead className="text-xs text-right">Pérdida/Día</TableHead></TableRow></TableHeader><TableBody>
                {d.lostSales.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={PackageSearch} title="¡Sin productos agotados! 🎉" /></TableCell></TableRow> :
                d.lostSales.map((p: any) => (
                  <TableRow key={p.id}><TableCell className="text-xs font-medium">{p.name}</TableCell><TableCell className="text-right text-xs">{formatCurrency(p.salePrice, cc)}</TableCell><TableCell className="text-right text-xs">{p.sold30d}</TableCell><TableCell className="text-right text-xs">{p.avgDaily}</TableCell><TableCell className="text-right text-xs font-medium text-red-600">{formatCurrency(Math.round(p.avgDaily * p.salePrice), cc)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>

          {/* ── 6b. PÉRDIDAS REGISTRADAS ── */}
          <Card><CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />Pérdidas Registradas
              </CardTitle>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={openLossDialog}>
                <Plus className="h-3 w-3" />Registrar Pérdida
              </Button>
            </div>
          </CardHeader><CardContent>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
                <p className="text-[10px] text-muted-foreground font-medium">Total Pérdidas</p>
                <p className="text-lg font-bold text-red-600">{registeredLosses.length}</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
                <p className="text-[10px] text-muted-foreground font-medium">Valor Perdido</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalLossesValue, cc)}</p>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs">Motivo</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
                {registeredLosses.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={AlertTriangle} title="Sin pérdidas registradas en el período" desc="Registra mercancía perdida, vencida o dañada" /></TableCell></TableRow> :
                registeredLosses.map((m: any, i: number) => (
                  <TableRow key={m.id + '-' + i}>
                    <TableCell className="text-xs">{fdatetime(m.createdAt)}</TableCell>
                    <TableCell className="text-xs font-medium">{m.product?.name || `ID ${m.productId}`}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{LOSS_REASONS[m.reason] || m.reason || '—'}</Badge></TableCell>
                    <TableCell className="text-right text-xs font-medium text-red-600">-{Math.abs(m.quantity)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{m.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 7. PUNTO DE EQUILIBRIO ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="punto-eq" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Punto de Equilibrio" value={formatCurrency(d.breakEven.breakEvenPoint, cc)} icon={Target} />
            <Stat label="Ventas del Período" value={formatCurrency(d.sales.total, cc)} icon={DollarSign} color="text-emerald-600" />
            <Stat label="Distancia al Equilibrio" value={d.breakEven.distanceToBreakEven > 0 ? formatCurrency(d.breakEven.distanceToBreakEven, cc) : '¡Superado! ✓'} color={d.breakEven.distanceToBreakEven > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <Stat label="% Alcanzado" value={`${d.breakEven.achievedPercent}%`} icon={Percent} color={d.breakEven.achievedPercent >= 100 ? 'text-emerald-600' : 'text-amber-600'} />
          </div>
          <Card className="border-2 border-dashed"><CardContent className="p-4 space-y-4">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5"><span>Progreso</span><span>{d.breakEven.achievedPercent}%</span></div>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full transition-all ${d.breakEven.achievedPercent >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, d.breakEven.achievedPercent)}%` }} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Costos Fijos</p><p className="font-bold text-sm mt-1">{formatCurrency(d.breakEven.fixedCosts, cc)}</p></div>
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Costo Variable</p><p className="font-bold text-sm mt-1">{(d.breakEven.variableCostRatio * 100).toFixed(1)}%</p></div>
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Margen Contribución</p><p className="font-bold text-sm mt-1">{(d.breakEven.contributionMargin * 100).toFixed(1)}%</p></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 8. DESCUENTOS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="descuentos" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Total Descuentos" value={formatCurrency(d.discounts.total, cc)} icon={Tag} color="text-amber-600" />
            <Stat label="Órdenes con Descuento" value={d.discounts.count} icon={ShoppingCart} />
          </div>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Detalle de Descuentos</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs">Tipo</TableHead><TableHead className="text-xs">Razón</TableHead><TableHead className="text-xs text-right">Descuento</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader><TableBody>
                {d.discounts.items.length === 0 ? <TableRow><TableCell colSpan={6}><EmptyState icon={Tag} title="Sin descuentos en el período" /></TableCell></TableRow> :
                d.discounts.items.map((o: any) => (
                  <TableRow key={o.id}><TableCell className="text-xs">{fdate(o.createdAt)}</TableCell><TableCell className="text-xs">{o.customer?.name || 'General'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{o.discountType === 'PERCENTAGE' ? '%' : 'Fijo'}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{o.discountReason || '—'}</TableCell><TableCell className="text-right text-xs font-medium text-amber-600">-{formatCurrency(o.discountAmount, cc)}</TableCell><TableCell className="text-right text-sm">{formatCurrency(o.total, cc)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 9. CIERRE DE CAJAS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="cierres" className="space-y-4 mt-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial de Cajas</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Apertura</TableHead><TableHead className="text-xs">Cierre</TableHead><TableHead className="text-xs">Responsable</TableHead><TableHead className="text-xs text-right">Base</TableHead><TableHead className="text-xs text-right">Esperado</TableHead><TableHead className="text-xs text-right">Real</TableHead><TableHead className="text-xs text-right">Diferencia</TableHead><TableHead className="text-xs">Estado</TableHead></TableRow></TableHeader><TableBody>
                {d.cashRegisters.length === 0 ? <TableRow><TableCell colSpan={8}><EmptyState icon={Wallet} title="Sin registros de caja" /></TableCell></TableRow> :
                d.cashRegisters.map((c: any) => (
                  <TableRow key={c.id}><TableCell className="text-xs">{fdatetime(c.openedAt)}</TableCell><TableCell className="text-xs">{c.closedAt ? fdatetime(c.closedAt) : '—'}</TableCell><TableCell className="text-xs">{c.user}</TableCell><TableCell className="text-right text-xs">{formatCurrency(c.openingBalance, cc)}</TableCell><TableCell className="text-right text-xs">{c.expectedCash ? formatCurrency(c.expectedCash, cc) : '—'}</TableCell><TableCell className="text-right text-xs">{c.closingBalance ? formatCurrency(c.closingBalance, cc) : '—'}</TableCell><TableCell className={`text-right text-xs font-medium ${c.difference !== null && c.difference !== 0 ? (c.difference > 0 ? 'text-emerald-600' : 'text-red-600') : ''}`}>{c.difference !== null ? formatCurrency(c.difference, cc) : '—'}</TableCell><TableCell><Badge className={`text-[10px] ${c.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>{c.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</Badge></TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 10. COMISIONES ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="comisiones" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Ingreso por Servicios" value={formatCurrency(d.commissions.total, cc)} icon={DollarSign} color="text-emerald-600" />
            <Stat label="Transacciones" value={d.commissions.count} icon={Percent} />
          </div>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Ingresos por Servicios del Bar</CardTitle><CardDescription>Transacciones de servicios (billar, mesa de juegos, etc.)</CardDescription></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Servicio</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs text-right">Unitario</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader><TableBody>
                {d.commissions.items.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={Percent} title="Sin servicios en el período" /></TableCell></TableRow> :
                d.commissions.items.map((c: any) => (
                  <TableRow key={c.id}><TableCell className="text-xs">{fdatetime(c.createdAt)}</TableCell><TableCell className="text-xs font-medium">{c.service?.name || '—'}</TableCell><TableCell className="text-right text-xs">{c.quantity}</TableCell><TableCell className="text-right text-xs">{formatCurrency(c.unitPrice, cc)}</TableCell><TableCell className="text-right text-sm font-medium">{formatCurrency(c.totalAmount, cc)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 11. GASTOS / SALIDAS DE CAJA ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="gastos" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Stat label="Total Gastos" value={formatCurrency(d.expenses.total, cc)} icon={ArrowDownUp} color="text-red-600" />
            <Stat label="Categorías" value={Object.keys(d.expenses.byCategory).length} icon={Receipt} />
            <Stat label="Gastos Registrados" value={d.expenses.items.length} icon={ShoppingCart} />
          </div>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Por Categoría</CardTitle></CardHeader><CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(d.expenses.byCategory).sort((a: any, b: any) => b[1].total - a[1].total).map(([cat, info]: any) => (
                <div key={cat} className="flex items-center justify-between p-2.5 rounded-lg border"><span className="text-sm">{EXP_CAT[cat] || cat}</span><div className="text-right"><span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">({info.count})</span></div></div>
              ))}
            </div>
          </CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Detalle de Gastos</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Categoría</TableHead><TableHead className="text-xs">Descripción</TableHead><TableHead className="text-xs text-right">Monto</TableHead></TableRow></TableHeader><TableBody>
                {d.expenses.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={ArrowDownUp} title="Sin gastos en el período" /></TableCell></TableRow> :
                d.expenses.items.map((e: any) => (
                  <TableRow key={e.id}><TableCell className="text-xs">{fdate(e.date)}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{EXP_CAT[e.category] || e.category}</Badge></TableCell><TableCell className="text-xs truncate max-w-[200px]">{e.description}</TableCell><TableCell className="text-right text-sm font-medium text-red-600">-{formatCurrency(e.amount, cc)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 12. IMPUESTOS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="impuestos" className="space-y-4 mt-4">
          {/* IVA Recaudado por Ventas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-emerald-600" />
                IVA Recaudado por Ventas
              </CardTitle>
              <CardDescription>Impuestos IVA cobrados a clientes en ventas completadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total IVA</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(d.ivaCollected?.total || 0, cc)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Base Gravable</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(d.ivaCollected?.totalBase || 0, cc)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Órdenes con IVA</p>
                  <p className="text-lg font-bold">{d.ivaCollected?.count || 0}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">IVA Promedio / Orden</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(
                      (d.ivaCollected?.count || 0) > 0 ? Math.round((d.ivaCollected?.total || 0) / (d.ivaCollected?.count || 1)) : 0,
                      cc
                    )}
                  </p>
                </div>
              </div>
              {/* Breakdown by tax code */}
              {d.ivaCollected?.byCode && d.ivaCollected.byCode.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Desglose por Tipo de Impuesto</h4>
                  <div className="grid gap-2">
                    {d.ivaCollected.byCode.map((tax: any) => (
                      <div key={tax.code} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <p className="font-medium text-sm">{tax.name}</p>
                          <p className="text-xs text-muted-foreground">Tasa: {tax.rate}% · Base: {formatCurrency(tax.base, cc)}</p>
                        </div>
                        <p className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(tax.amount, cc)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Recent orders with IVA */}
              {d.ivaCollected?.orders && d.ivaCollected.orders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Últimas Órdenes con IVA</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Orden</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Base</TableHead>
                          <TableHead className="text-right">IVA</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.ivaCollected.orders.slice(0, 20).map((order: any) => (
                          <TableRow key={order.id}>
                            <TableCell className="text-sm">{new Date(order.createdAt).toLocaleDateString('es-CO')}</TableCell>
                            <TableCell className="font-mono text-sm">#{order.orderNumber}</TableCell>
                            <TableCell className="text-sm">{order.customer?.name || 'General'}</TableCell>
                            <TableCell className="text-sm">{formatCurrency(order.subtotal, cc)}</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(order.taxAmount, cc)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(order.total, cc)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {(!d.ivaCollected?.count || d.ivaCollected.count === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sin ventas con IVA en el período seleccionado
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gastos de Impuestos (existing section) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-amber-600" />
                Gastos de Impuestos
              </CardTitle>
              <CardDescription>Impuestos pagados por el negocio (outflow)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Stat label="Total Gastos Impuestos" value={formatCurrency(d.taxes.total, cc)} icon={Receipt} color="text-red-600" />
                <Stat label="Registros" value={d.taxes.count} icon={Receipt} />
              </div>
              <div className="max-h-96 overflow-y-auto">
                <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Descripción</TableHead><TableHead className="text-xs text-right">Monto</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
                  {d.taxes.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={Receipt} title="Sin impuestos registrados" desc="Registra gastos con categoría 'Impuestos' desde Contabilidad > Gastos" /></TableCell></TableRow> :
                  d.taxes.items.map((t: any) => (
                    <TableRow key={t.id}><TableCell className="text-xs">{fdate(t.date)}</TableCell><TableCell className="text-xs">{t.description}</TableCell><TableCell className="text-right text-sm font-medium text-red-600">-{formatCurrency(t.amount, cc)}</TableCell><TableCell className="text-xs text-muted-foreground">{t.notes || '—'}</TableCell></TableRow>
                  ))}
                </TableBody></Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 13. DEVOLUCIONES ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="devoluciones" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Devoluciones" value={d.returns.items.length} icon={RotateCcw} />
            <Stat label="Valor Devuelto" value={formatCurrency(d.returns.totalValue, cc)} icon={DollarSign} color="text-amber-600" />
          </div>
          <Card><CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Registro de Devoluciones</CardTitle>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={openReturnDialog}>
                <Plus className="h-3 w-3" />Registrar Devolución
              </Button>
            </div>
          </CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
                {d.returns.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={RotateCcw} title="Sin devoluciones en el período" /></TableCell></TableRow> :
                d.returns.items.map((r: any) => (
                  <TableRow key={r.id}><TableCell className="text-xs">{fdatetime(r.createdAt)}</TableCell><TableCell className="text-xs font-medium">{r.product?.name || 'Eliminado'}</TableCell><TableCell className={`text-right text-xs font-medium ${r.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.quantity > 0 ? '+' : ''}{r.quantity}</TableCell><TableCell className="text-xs text-muted-foreground">{r.notes || '—'}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 14. AJUSTES DE INVENTARIO ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="ajustes" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <Stat label="Ajustes Realizados" value={d.adjustments.count} icon={SlidersHorizontal} />
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={openAdjustDialog}>
              <Plus className="h-3 w-3" />Registrar Ajuste
            </Button>
          </div>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial de Ajustes</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs">Stock Actual</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
                {d.adjustments.items.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={SlidersHorizontal} title="Sin ajustes en el período" /></TableCell></TableRow> :
                d.adjustments.items.map((a: any) => (
                  <TableRow key={a.id}><TableCell className="text-xs">{fdatetime(a.createdAt)}</TableCell><TableCell className="text-xs font-medium">{a.product?.name || '—'}</TableCell><TableCell className={`text-right text-xs font-medium ${a.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{a.quantity > 0 ? '+' : ''}{a.quantity}</TableCell><TableCell className="text-right text-xs">{a.product?.currentStock ?? '—'}</TableCell><TableCell className="text-xs text-muted-foreground">{a.notes || '—'}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 15. TRAZABILIDAD ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="trazabilidad" className="space-y-4 mt-4">
          <Stat label="Movimientos Registrados" value={d.traceability.length} icon={Route} />

          {/* ── Summary Row ── */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <div className="rounded-lg border p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Compra</Badge>
              </div>
              <p className="text-sm font-bold">{trazCounts.PURCHASE}</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Venta</Badge>
              </div>
              <p className="text-sm font-bold">{trazCounts.SALE}</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Ajuste</Badge>
              </div>
              <p className="text-sm font-bold">{trazCounts.ADJUSTMENT}</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Badge className="text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">Devolución</Badge>
              </div>
              <p className="text-sm font-bold">{trazCounts.RETURN}</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center col-span-3 sm:col-span-1">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Pérdida</Badge>
              </div>
              <p className="text-sm font-bold">{trazCounts.LOSS}</p>
            </div>
          </div>

          {/* ── Filter Buttons ── */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium mr-1">Filtrar:</span>
                {[
                  ['ALL', 'Todos'],
                  ['PURCHASE', 'Compras'],
                  ['SALE', 'Ventas'],
                  ['ADJUSTMENT', 'Ajustes'],
                  ['RETURN', 'Devoluciones'],
                  ['LOSS', 'Pérdidas'],
                ].map(([key, label]) => (
                  <Button
                    key={key}
                    variant={trazFilter === key ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setTrazFilter(key)}
                  >
                    {label}
                    {trazCounts[key as string] > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{trazCounts[key as string]}</Badge>
                    )}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial Completo de Movimientos</CardTitle></CardHeader><CardContent>
            <div className="max-h-[500px] overflow-y-auto">
              <Table><TableHeader><TableRow>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs">Categoría</TableHead>
                <TableHead className="text-xs">Referencia</TableHead>
                <TableHead className="text-xs text-right">Cantidad</TableHead>
                <TableHead className="text-xs">Notas</TableHead>
              </TableRow></TableHeader><TableBody>
                {filteredTraz.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState icon={Route} title="Sin movimientos para el filtro seleccionado" /></TableCell></TableRow> :
                filteredTraz.map((m: any, i: number) => (
                  <TableRow key={m.id + '-' + i}>
                    <TableCell className="text-xs whitespace-nowrap">{fdatetime(m.createdAt)}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${MOV_BADGE[m.movementType] || ''}`}>
                        {MOV_TYPE[m.movementType] || m.movementType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{m.product?.name || `ID ${m.productId}`}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.product?.category?.name || '—'}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{m.referenceId || '—'}</TableCell>
                    <TableCell className={`text-right text-xs font-medium ${m.movementType === 'SALE' || m.movementType === 'RETURN' || m.movementType === 'LOSS' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{m.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 16. COTIZACIONES ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="cotizaciones" className="space-y-4 mt-4">
          <Card className="border-2 border-dashed"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Órdenes Pendientes (Cotizaciones)</CardTitle><CardDescription>Las órdenes en estado PENDIENTE actúan como cotizaciones</CardDescription></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Orden</TableHead><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs text-right">Total</TableHead><TableHead className="text-xs">Items</TableHead></TableRow></TableHeader><TableBody>
                {d.quotes.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={FileText} title="Sin cotizaciones pendientes" /></TableCell></TableRow> :
                d.quotes.map((q: any) => (
                  <TableRow key={q.id}><TableCell className="text-xs">{fdatetime(q.createdAt)}</TableCell><TableCell className="text-xs font-mono">{q.orderNumber}</TableCell><TableCell className="text-xs">{q.customer?.name || 'General'}</TableCell><TableCell className="text-right text-sm font-medium">{formatCurrency(q.total, cc)}</TableCell><TableCell className="text-xs">{q.orderItems?.length || 0} items</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── 17. CUENTAS POR COBRAR ── */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="cxc" className="space-y-4 mt-4">
          <Stat label="Deuda Total" value={formatCurrency(d.debts.reduce((s: number, c: any) => s + c.totalDebt, 0), cc)} icon={Users} color="text-red-600" />
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Clientes con Deuda</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table><TableHeader><TableRow><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs">Teléfono</TableHead><TableHead className="text-xs text-right">Deuda</TableHead></TableRow></TableHeader><TableBody>
                {d.debts.length === 0 ? <TableRow><TableCell colSpan={3}><EmptyState icon={Users} title="¡Sin deudas pendientes! 🎉" /></TableCell></TableRow> :
                d.debts.map((c: any) => (
                  <TableRow key={c.id}><TableCell className="text-xs font-medium">{c.name}</TableCell><TableCell className="text-xs text-muted-foreground">{c.phone || '—'}</TableCell><TableCell className="text-right text-sm font-bold text-red-600">{formatCurrency(c.totalDebt, cc)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════ */}
      {/* ── DIALOG: Registrar Devolución ── */}
      {/* ═══════════════════════════════════════════════ */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <RotateCcw className="h-4 w-4" />Registrar Devolución
            </DialogTitle>
            <DialogDescription className="text-xs">Agrega stock devuelto a un producto</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Producto</Label>
              <ProductSearchSelect
                products={products}
                value={returnForm.productId}
                onValueChange={(v) => setReturnForm(f => ({ ...f, productId: v }))}
                placeholder="Buscar producto para devolver..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cantidad</Label>
              <Input
                type="number"
                min="1"
                placeholder="Cantidad devuelta"
                value={returnForm.quantity}
                onChange={(e) => setReturnForm(f => ({ ...f, quantity: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notas (opcional)</Label>
              <Textarea
                placeholder="Razón de la devolución..."
                value={returnForm.notes}
                onChange={(e) => setReturnForm(f => ({ ...f, notes: e.target.value }))}
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowReturnDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmitReturn} disabled={isSubmitting} className="gap-1.5">
              {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════ */}
      {/* ── DIALOG: Registrar Ajuste ── */}
      {/* ═══════════════════════════════════════════════ */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <SlidersHorizontal className="h-4 w-4" />Registrar Ajuste
            </DialogTitle>
            <DialogDescription className="text-xs">Ajusta el inventario de un producto</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Producto</Label>
              <ProductSearchSelect
                products={products}
                value={adjustForm.productId}
                onValueChange={(v) => {
                  const prod = products.find((p: any) => p.id === v)
                  setSelectedProductStock(prod?.currentStock ?? null)
                  setAdjustForm(f => ({ ...f, productId: v }))
                }}
                placeholder="Buscar producto para ajustar..."
              />
            </div>
            {selectedProductStock !== null && (
              <div className="rounded-lg bg-muted/50 p-2.5">
                <span className="text-[10px] text-muted-foreground">Stock actual: </span>
                <span className="text-sm font-bold">{selectedProductStock}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Modo</Label>
              <Select value={adjustForm.mode} onValueChange={(v) => setAdjustForm(f => ({ ...f, mode: v as 'delta' | 'set' }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delta" className="text-xs">Agregar/Quitar (+/-)</SelectItem>
                  <SelectItem value="set" className="text-xs">Establecer cantidad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {adjustForm.mode === 'set' ? 'Nueva cantidad' : 'Cantidad (+ para agregar, - para quitar)'}
              </Label>
              <Input
                type="number"
                placeholder={adjustForm.mode === 'set' ? 'Nueva cantidad total' : 'Ej: +5 o -3'}
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm(f => ({ ...f, quantity: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notas <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Motivo del ajuste (obligatorio)..."
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdjustDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmitAdjust} disabled={isSubmitting} className="gap-1.5">
              {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════ */}
      {/* ── DIALOG: Registrar Pérdida ── */}
      {/* ═══════════════════════════════════════════════ */}
      <Dialog open={showLossDialog} onOpenChange={setShowLossDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-500" />Registrar Pérdida
            </DialogTitle>
            <DialogDescription className="text-xs">Registra mercancía perdida, vencida o dañada</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Producto</Label>
              <ProductSearchSelect
                products={products}
                value={lossForm.productId}
                onValueChange={(v) => setLossForm(f => ({ ...f, productId: v }))}
                placeholder="Buscar producto con pérdida..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cantidad</Label>
              <Input
                type="number"
                min="1"
                placeholder="Cantidad perdida"
                value={lossForm.quantity}
                onChange={(e) => setLossForm(f => ({ ...f, quantity: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Motivo</Label>
              <Select value={lossForm.reason} onValueChange={(v) => setLossForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LOSS_REASONS).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notas (opcional)</Label>
              <Textarea
                placeholder="Detalles adicionales..."
                value={lossForm.notes}
                onChange={(e) => setLossForm(f => ({ ...f, notes: e.target.value }))}
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowLossDialog(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={handleSubmitLoss} disabled={isSubmitting} className="gap-1.5">
              {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Registrar Pérdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
