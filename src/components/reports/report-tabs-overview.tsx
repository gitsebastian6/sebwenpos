import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DollarSign, ShoppingCart, TrendingUp, Package, Users, Receipt, Percent, Target, Tag } from 'lucide-react'
import type { ReportsData, PaymentInfoEntry, CategoryInfoEntry, TopProduct } from './reports-export'
import { PM } from './reports-export'
import { Stat, EmptyState } from './report-shared'

interface TabProps { d: ReportsData; cc: string }

// ── 1. TU LOCAL EN CIFRAS ──
export function CifrasTab({ d, cc }: TabProps) {
  return (
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
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-dashed"><CardContent className="p-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div><span className="text-muted-foreground text-xs">Ticket Prom. Mes:</span> <span className="font-bold">{formatCurrency(d.localEnCifras.ordersMonth > 0 ? Math.round(d.localEnCifras.salesMonth / d.localEnCifras.ordersMonth) : 0, cc)}</span></div>
          <div><span className="text-muted-foreground text-xs">Clientes con Deuda:</span> <span className="font-bold">{d.localEnCifras.debtCount}</span></div>
          <div><span className="text-muted-foreground text-xs">Ventas Mes Anterior:</span> <span className="font-bold">{formatCurrency(d.localEnCifras.lastMonthSales, cc)}</span></div>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 2. VENTAS ──
export function VentasTab({ d, cc }: TabProps) {
  return (
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
              {Object.entries(d.sales.byPayment).sort((a, b) => b[1].total - a[1].total).map(([method, info]: PaymentInfoEntry) => (
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
            {d.sales.topProducts.length === 0 ? <EmptyState icon={Package} title="Sin datos" /> : d.sales.topProducts.map((p: TopProduct, i: number) => (
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
            {Object.entries(d.sales.byCategory).sort((a, b) => b[1].total - a[1].total).map(([cat, info]: CategoryInfoEntry) => (
              <div key={cat} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium truncate">{cat}</span>
                <div className="text-right shrink-0"><span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">{info.qty} uds</span></div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 3. RENTABILIDAD ──
export function RentabilidadTab({ d, cc }: TabProps) {
  return (
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
  )
}

// ── 7. PUNTO DE EQUILIBRIO ──
export function PuntoEqTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="punto-eq" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Punto de Equilibrio" value={formatCurrency(d.breakEven.breakEvenPoint, cc)} icon={Target} />
        <Stat label="Ventas del Período" value={formatCurrency(d.sales.total, cc)} icon={DollarSign} color="text-emerald-600" />
        <Stat label="Distancia al Equilibrio" value={d.breakEven.distanceToBreakEven > 0 ? formatCurrency(d.breakEven.distanceToBreakEven, cc) : '¡Superado! ✓'} color={d.breakEven.distanceToBreakEven > 0 ? 'text-amber-600' : 'text-emerald-600'} />
        <Stat label="% Alcanzado" value={`${d.breakEven.achievedPercent}%`} icon={Percent} color={d.breakEven.achievedPercent >= 100 ? 'text-emerald-600' : 'text-amber-600'} />
      </div>
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-2 border-dashed"><CardContent className="p-4 space-y-4">
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
  )
}
