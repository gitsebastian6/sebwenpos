'use client'

import React from 'react'
import { useState, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useQuery } from '@tanstack/react-query'
import { unwrapArray, queryFetch } from '@/hooks/api/query-helpers'
import { useInformes, useExportPdf } from '@/hooks/api/use-reports'
import { KPIBar } from '@/components/shared/kpi-bar'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Store, ShoppingCart, TrendingUp, Package, AlertTriangle, Target,
  RotateCcw, Wallet, Percent, SlidersHorizontal, Receipt,
  Tag, Route, Truck, ArrowDownUp, FileText,
  CalendarDays, Users, RefreshCw, FileCheck,
  Download, FileSpreadsheet,
} from 'lucide-react'
import { exportToExcel } from '@/lib/export-excel'
import { InventoryActionDialogs } from './inventory-action-dialogs'
import type { InventoryDialogsHandle } from './inventory-action-dialogs'
import {
  tabLabelMap, getExportData, fdate,
  type ReportsData, type ReportProduct, type TraceabilityItem,
} from './reports-export'
import { LoadingSkeleton } from './report-shared'
import { CifrasTab, VentasTab, RentabilidadTab, PuntoEqTab } from './report-tabs-overview'
import { ComprasTab, InventarioTab, PerdidasTab } from './report-tabs-inventory'
import { DescuentosTab, CierresTab, ComisionesTab, GastosTab } from './report-tabs-transactions'
import { ImpuestosTab, DevolucionesTab, AjustesTab, TrazabilidadTab } from './report-tabs-operations'
import { CotizacionesTab, FacturasTab, NotasCreditoTab, CxcTab } from './report-tabs-documents'

interface TabIconProps { className?: string }
type ReportTabEntry = [string, string, React.ComponentType<TabIconProps>]

// ── Main Component ──
export function ReportsView() {
  const store = useAuthStore((s) => s.store)
  const cc = store?.currencyCode || 'COP'

  // Date state
  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
  const [to, setTo] = useState(now.toISOString().split('T')[0])
  const [tab, setTab] = useState('cifras')

  // Trazabilidad filter
  const [trazFilter, setTrazFilter] = useState<string>('ALL')

  // Ref for inventory dialogs
  const dialogsRef = useRef<InventoryDialogsHandle>(null)

  // ─── TanStack Query hooks ───────────────────────────────────────────────
  const { data: rawData, isLoading: loading, error: queryError, refetch: fetchReports } = useInformes(store?.id, from, to)
  const data = rawData as unknown as ReportsData | undefined

  const { data: productsData, refetch: fetchProducts } = useQuery<ReportProduct[]>({
    queryKey: ['products-for-reports', store?.id],
    queryFn: async () => {
      const res = await fetch(`/api/products?storeId=${store?.id}`)
      return unwrapArray<ReportProduct>(res)
    },
    enabled: !!store?.id,
    staleTime: 120_000,
  })
  const products = productsData ?? []

  const exportPdf = useExportPdf()

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

  // ── Open dialogs ──
  const openReturnDialog = () => { fetchProducts(); setTimeout(() => dialogsRef.current?.openReturnDialog(), 0) }
  const openAdjustDialog = () => { fetchProducts(); setTimeout(() => dialogsRef.current?.openAdjustDialog(), 0) }
  const openLossDialog = () => { fetchProducts(); setTimeout(() => dialogsRef.current?.openLossDialog(), 0) }

  // ── Export helpers ──
  const dateRangeStr = `${fdate(from)} - ${fdate(to)}`
  const storeName = store?.name || 'Viva POS'

  const handleExportExcel = () => {
    const exportData = getExportData(tab, data!, [])
    if (!exportData) {
      toast.error('No hay datos para exportar en esta pestaña')
      return
    }
    const label = tabLabelMap[tab] || tab
    exportToExcel({
      filename: `${label}_${from}_${to}`,
      sheetName: label.slice(0, 31),
      headers: exportData.headers,
      rows: exportData.rows,
      columnWidths: exportData.headers.map(() => 20),
    })
    toast.success('Reporte exportado a Excel')
  }

  const handleExportPDF = () => {
    const exportData = getExportData(tab, data!, [])
    if (!exportData) {
      toast.error('No hay datos para exportar en esta pestaña')
      return
    }
    const label = tabLabelMap[tab] || tab
    exportPdf.mutate({
      storeName,
      title: `Reporte: ${label}`,
      subtitle: dateRangeStr,
      headers: exportData.headers,
      rows: exportData.rows,
      columnAligns: exportData.columnAligns,
    }, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${label}_${from}_${to}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Reporte exportado a PDF')
      },
      onError: (e) => {
        toast.error(e instanceof Error ? e.message : 'Error al exportar PDF')
      },
    })
  }

  if (loading) return <LoadingSkeleton />
  if (queryError) return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-destructive/50"><CardContent className="p-6 flex flex-col items-center gap-3">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="font-semibold text-sm">{queryError.message}</p>
      <Button className="active:scale-[0.98] transition-all" onClick={() => fetchReports()} size="sm" variant="outline"><RefreshCw className="h-3 w-3 mr-1" />Reintentar</Button>
    </CardContent></Card>
  )
  if (!data) return null

  const d = data

  // ── Trazabilidad computed data ──
  const trazData = d.traceability || []
  const filteredTraz = trazFilter === 'ALL' ? trazData : trazData.filter((m: TraceabilityItem) => m.movementType === trazFilter)
  const trazCounts: Record<string, number> = { PURCHASE: 0, SALE: 0, ADJUSTMENT: 0, RETURN: 0, LOSS: 0 }
  trazData.forEach((m: TraceabilityItem) => { if (trazCounts[m.movementType] !== undefined) trazCounts[m.movementType]++ })

  // ── Registered losses from traceability ──
  const registeredLosses = trazData.filter((m: TraceabilityItem) => m.movementType === 'LOSS')
  const totalLossesValue = registeredLosses.reduce((s: number, m: TraceabilityItem) => s + ((m.quantity || 0) * (m.product?.costPrice || m.product?.salePrice || 0)), 0)

  return (
    <div className="space-y-4">
      <KPIBar context="default" />

      {/* ── Date Selector ── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
            <Button className="active:scale-[0.98] transition-all" onClick={() => fetchReports()} size="sm"><RefreshCw className="h-3 w-3 mr-1" />Actualizar</Button>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 active:scale-[0.98] transition-all" onClick={handleExportPDF} title="Exportar PDF">
                <Download className="h-3 w-3" /><span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 active:scale-[0.98] transition-all" onClick={handleExportExcel} title="Exportar Excel">
                <FileSpreadsheet className="h-3 w-3" /><span className="hidden sm:inline">Excel</span>
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="flex flex-wrap gap-1.5">
              {[['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']].map(([k, l]) => (
                <Button key={k} variant="outline" size="sm" className="h-7 text-xs active:scale-[0.98] transition-all" onClick={() => quickRange(k as 'today' | 'week' | 'month')}>{l}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="flex-wrap gap-1 h-auto bg-transparent p-0">
            {([
              ['cifras', 'Cifras', Store], ['ventas', 'Ventas', ShoppingCart], ['rentabilidad', 'Rentabilidad', TrendingUp],
              ['compras', 'Compras', Truck], ['inventario', 'Inventario', Package],
              ['perdidas', 'Pérdidas', AlertTriangle], ['punto-eq', 'Punto Eq.', Target],
              ['descuentos', 'Descuentos', Tag], ['cierres', 'Cierres', Wallet],
              ['comisiones', 'Comisiones', Percent], ['gastos', 'Gastos', ArrowDownUp],
              ['impuestos', 'Impuestos', Receipt], ['devoluciones', 'Devoluciones', RotateCcw],
              ['ajustes', 'Ajustes', SlidersHorizontal], ['trazabilidad', 'Trazabilidad', Route],
              ['cotizaciones', 'Cotizaciones', FileText], ['facturas', 'Facturas', FileCheck], ['notas-credito', 'Notas Cr/Dt', FileText], ['cxc', 'CxC', Users],
            ] as any).map(([key, label, Icon]: any) => (
              <TabsTrigger key={String(key)} value={String(key)} className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-1.5 rounded-md border">
                {'className' in Icon ? <Icon className="h-3.5 w-3.5" /> : null}{label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <CifrasTab d={d} cc={cc} />
        <VentasTab d={d} cc={cc} />
        <RentabilidadTab d={d} cc={cc} />
        <ComprasTab d={d} cc={cc} />
        <InventarioTab d={d} cc={cc} />
        <PerdidasTab d={d} cc={cc} registeredLosses={registeredLosses} totalLossesValue={totalLossesValue} openLossDialog={openLossDialog} />
        <PuntoEqTab d={d} cc={cc} />
        <DescuentosTab d={d} cc={cc} />
        <CierresTab d={d} cc={cc} />
        <ComisionesTab d={d} cc={cc} />
        <GastosTab d={d} cc={cc} />
        <ImpuestosTab d={d} cc={cc} />
        <DevolucionesTab d={d} cc={cc} openReturnDialog={openReturnDialog} />
        <AjustesTab d={d} cc={cc} openAdjustDialog={openAdjustDialog} />
        <TrazabilidadTab d={d} cc={cc} trazFilter={trazFilter} setTrazFilter={setTrazFilter} filteredTraz={filteredTraz} trazCounts={trazCounts} />
        <CotizacionesTab d={d} cc={cc} />
        <FacturasTab d={d} cc={cc} />
        <NotasCreditoTab d={d} cc={cc} />
        <CxcTab d={d} cc={cc} />
      </Tabs>

      {/* ── Inventory Action Dialogs ── */}
      <InventoryActionDialogs
        ref={dialogsRef}
        storeId={store!.id}
        products={products}
        onSuccess={fetchReports}
      />
    </div>
  )
}
