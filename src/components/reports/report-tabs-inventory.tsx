import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Package, DollarSign, PackageSearch, CalendarDays, AlertTriangle, TrendingUp, ShoppingCart, Truck, Plus } from 'lucide-react'
import type { ReportsData, PurchaseItem, LostSaleItem, TraceabilityItem } from './reports-export'
import { fdate, fdatetime } from './reports-export'
import { LOSS_REASONS } from './inventory-action-dialogs'
import { Stat, EmptyState } from './report-shared'

interface TabProps { d: ReportsData; cc: string }

// ── 4. COMPRAS ──
export function ComprasTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="compras" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Total Compras" value={formatCurrency(d.purchases.total, cc)} icon={Truck} color="text-sky-600" />
        <Stat label="Compras Realizadas" value={d.purchases.items.length} icon={ShoppingCart} />
      </div>
      {d.purchases.byProvider && Object.keys(d.purchases.byProvider).length > 0 && (
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Por Proveedor</CardTitle></CardHeader><CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(d.purchases.byProvider).sort((a: [string, { count: number; total: number }], b: [string, { count: number; total: number }]) => b[1].total - a[1].total).map(([prov, info]: [string, { count: number; total: number }]) => (
              <div key={prov} className="flex items-center justify-between p-2.5 rounded-lg border"><span className="text-sm">{prov}</span><div className="text-right"><span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">({info.count})</span></div></div>
            ))}
          </div>
        </CardContent></Card>
      )}
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial de Compras</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Proveedor</TableHead><TableHead className="text-xs">Factura</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader><TableBody>
            {d.purchases.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={Truck} title="Sin compras en el período" /></TableCell></TableRow> :
            d.purchases.items.map((p: PurchaseItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={p.id}><TableCell className="text-xs">{fdate(p.date)}</TableCell><TableCell className="text-xs">{p.provider?.name || '—'}</TableCell><TableCell className="text-xs font-mono">{p.invoiceNumber || '—'}</TableCell><TableCell className="text-right text-sm font-medium">{formatCurrency(p.total, cc)}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 5. INVENTARIO ──
export function InventarioTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="inventario" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Costo Inventario" value={formatCurrency(d.inventory.totalCostValue, cc)} icon={Package} />
        <Stat label="Valor Retail" value={formatCurrency(d.inventory.totalRetailValue, cc)} icon={DollarSign} />
        <Stat label="Productos Totales" value={d.inventory.totalProducts} icon={PackageSearch} />
        <Stat label="Días de Inventario" value={`${d.inventory.daysOfInventory} días`} icon={CalendarDays} color={d.inventory.daysOfInventory > 30 ? 'text-red-600' : d.inventory.daysOfInventory > 15 ? 'text-amber-600' : 'text-emerald-600'} />
        <Stat label="Agotados" value={d.inventory.outOfStockCount} icon={AlertTriangle} color={d.inventory.outOfStockCount > 0 ? 'text-red-600' : ''} />
        <Stat label="Stock Bajo" value={d.inventory.lowStockCount} icon={Package} color={d.inventory.lowStockCount > 0 ? 'text-amber-600' : ''} />
      </div>
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-dashed"><CardContent className="p-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div><span className="text-xs text-muted-foreground">COGS Promedio/Día:</span> <span className="font-bold">{formatCurrency(d.inventory.avgDailyCOGS, cc)}</span></div>
          <div><span className="text-xs text-muted-foreground">Margen Retail:</span> <span className="font-bold">{d.inventory.totalCostValue > 0 ? Math.round(((d.inventory.totalRetailValue - d.inventory.totalCostValue) / d.inventory.totalCostValue) * 100) : 0}%</span></div>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 6. VENTAS PERDIDAS ──
interface PerdidasTabProps { d: ReportsData; cc: string; registeredLosses: TraceabilityItem[]; totalLossesValue: number; openLossDialog: () => void }

export function PerdidasTab({ d, cc, registeredLosses, totalLossesValue, openLossDialog }: PerdidasTabProps) {
  return (
    <TabsContent value="perdidas" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Productos Agotados" value={d.lostSales.length} icon={AlertTriangle} color="text-red-600" />
        <Stat label="Venta Perdida Est./Día" value={formatCurrency(d.lostSales.reduce((s: number, p: LostSaleItem) => s + (p.avgDaily * p.salePrice), 0), cc)} icon={TrendingUp} color="text-red-600" />
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Productos sin Stock (30 días velocidad)</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs text-right">Precio</TableHead><TableHead className="text-xs text-right">Vendidos 30d</TableHead><TableHead className="text-xs text-right">Prom/Día</TableHead><TableHead className="text-xs text-right">Pérdida/Día</TableHead></TableRow></TableHeader><TableBody>
            {d.lostSales.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={PackageSearch} title="¡Sin productos agotados! 🎉" /></TableCell></TableRow> :
            d.lostSales.map((p: LostSaleItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={p.id}><TableCell className="text-xs font-medium">{p.name}</TableCell><TableCell className="text-right text-xs">{formatCurrency(p.salePrice, cc)}</TableCell><TableCell className="text-right text-xs">{p.sold30d}</TableCell><TableCell className="text-right text-xs">{p.avgDaily}</TableCell><TableCell className="text-right text-xs font-medium text-red-600">{formatCurrency(Math.round(p.avgDaily * p.salePrice), cc)}</TableCell></TableRow>
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
          <Button size="sm" className="h-7 text-xs gap-1.5 active:scale-[0.98] transition-all" onClick={openLossDialog}>
            <Plus className="h-3 w-3" />Registrar Pérdida
          </Button>
        </div>
      </CardHeader><CardContent>
        <p className="text-[11px] text-muted-foreground -mt-2 mb-3">Cada pérdida registrada se descuenta de la Utilidad Neta (pestaña Rentabilidad) y se registra como gasto en Contabilidad.</p>
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
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs">Motivo</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs text-right">Valor</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
            {registeredLosses.length === 0 ? <TableRow><TableCell colSpan={6}><EmptyState icon={AlertTriangle} title="Sin pérdidas registradas en el período" desc="Registra mercancía perdida, vencida o dañada" /></TableCell></TableRow> :
            registeredLosses.map((m: TraceabilityItem, i: number) => {
              // notes field contains "REASON — user notes" (reason first)
              const rawNotes = m.notes || ''
              const parts = rawNotes.includes(' — ') ? rawNotes.split(' — ') : [rawNotes, '']
              const reasonCode = parts[0]
              const userNotes = parts.slice(1).join(' — ')
              return (
              <TableRow className="hover:bg-muted/30 transition-colors" key={m.id + '-' + i}>
                <TableCell className="text-xs">{fdatetime(m.createdAt)}</TableCell>
                <TableCell className="text-xs font-medium">{m.product?.name || `ID ${m.productId}`}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{LOSS_REASONS[reasonCode] || reasonCode || '—'}</Badge></TableCell>
                <TableCell className="text-right text-xs font-medium text-red-600">-{Math.abs(m.quantity)}</TableCell>
                <TableCell className="text-right text-xs font-medium text-red-600">{formatCurrency((Math.abs(m.quantity) * (m.product?.costPrice || 0)), cc)}</TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{userNotes || '—'}</TableCell>
              </TableRow>
              )
            })}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}
