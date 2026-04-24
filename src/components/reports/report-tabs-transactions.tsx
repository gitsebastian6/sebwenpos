import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tag, ShoppingCart, Wallet, DollarSign, Percent, ArrowDownUp, Receipt } from 'lucide-react'
import type { ReportsData, DiscountItem, CashRegister, CommissionItem, ExpenseItem, ExpenseCategoryEntry } from './reports-export'
import { fdate, fdatetime, EXP_CAT } from './reports-export'
import { Stat, EmptyState } from './report-shared'

interface TabProps { d: ReportsData; cc: string }

// ── 8. DESCUENTOS ──
export function DescuentosTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="descuentos" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Total Descuentos" value={formatCurrency(d.discounts.total, cc)} icon={Tag} color="text-amber-600" />
        <Stat label="Órdenes con Descuento" value={d.discounts.count} icon={ShoppingCart} />
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Detalle de Descuentos</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs">Tipo</TableHead><TableHead className="text-xs">Razón</TableHead><TableHead className="text-xs text-right">Descuento</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader><TableBody>
            {d.discounts.items.length === 0 ? <TableRow><TableCell colSpan={6}><EmptyState icon={Tag} title="Sin descuentos en el período" /></TableCell></TableRow> :
            d.discounts.items.map((o: DiscountItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={o.id}><TableCell className="text-xs">{fdate(o.createdAt)}</TableCell><TableCell className="text-xs">{o.customer?.name || 'General'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{o.discountType === 'PERCENTAGE' ? '%' : 'Fijo'}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{o.discountReason || '—'}</TableCell><TableCell className="text-right text-xs font-medium text-amber-600">-{formatCurrency(o.discountAmount, cc)}</TableCell><TableCell className="text-right text-sm">{formatCurrency(o.total, cc)}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 9. CIERRE DE CAJAS ──
export function CierresTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="cierres" className="space-y-4 mt-4">
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial de Cajas</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Apertura</TableHead><TableHead className="text-xs">Cierre</TableHead><TableHead className="text-xs">Responsable</TableHead><TableHead className="text-xs text-right">Base</TableHead><TableHead className="text-xs text-right">Esperado</TableHead><TableHead className="text-xs text-right">Real</TableHead><TableHead className="text-xs text-right">Diferencia</TableHead><TableHead className="text-xs">Estado</TableHead></TableRow></TableHeader><TableBody>
            {d.cashRegisters.length === 0 ? <TableRow><TableCell colSpan={8}><EmptyState icon={Wallet} title="Sin registros de caja" /></TableCell></TableRow> :
            d.cashRegisters.map((c: CashRegister) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={c.id}><TableCell className="text-xs">{fdatetime(c.openedAt)}</TableCell><TableCell className="text-xs">{c.closedAt ? fdatetime(c.closedAt) : '—'}</TableCell><TableCell className="text-xs">{c.user}</TableCell><TableCell className="text-right text-xs">{formatCurrency(c.openingBalance, cc)}</TableCell><TableCell className="text-right text-xs">{c.expectedCash ? formatCurrency(c.expectedCash, cc) : '—'}</TableCell><TableCell className="text-right text-xs">{c.closingBalance ? formatCurrency(c.closingBalance, cc) : '—'}</TableCell><TableCell className={`text-right text-xs font-medium ${c.difference !== null && c.difference !== 0 ? (c.difference > 0 ? 'text-emerald-600' : 'text-red-600') : ''}`}>{c.difference !== null ? formatCurrency(c.difference, cc) : '—'}</TableCell><TableCell><Badge className={`text-[10px] ${c.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>{c.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</Badge></TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 10. COMISIONES ──
export function ComisionesTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="comisiones" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Ingreso por Servicios" value={formatCurrency(d.commissions.total, cc)} icon={DollarSign} color="text-emerald-600" />
        <Stat label="Transacciones" value={d.commissions.count} icon={Percent} />
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Ingresos por Servicios del Bar</CardTitle><CardDescription>Transacciones de servicios (billar, mesa de juegos, etc.)</CardDescription></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Servicio</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs text-right">Unitario</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader><TableBody>
            {d.commissions.items.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={Percent} title="Sin servicios en el período" /></TableCell></TableRow> :
            d.commissions.items.map((c: CommissionItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={c.id}><TableCell className="text-xs">{fdatetime(c.createdAt)}</TableCell><TableCell className="text-xs font-medium">{c.service?.name || '—'}</TableCell><TableCell className="text-right text-xs">{c.quantity}</TableCell><TableCell className="text-right text-xs">{formatCurrency(c.unitPrice, cc)}</TableCell><TableCell className="text-right text-sm font-medium">{formatCurrency(c.totalAmount, cc)}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 11. GASTOS / SALIDAS DE CAJA ──
export function GastosTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="gastos" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Total Gastos" value={formatCurrency(d.expenses.total, cc)} icon={ArrowDownUp} color="text-red-600" />
        <Stat label="Categorías" value={Object.keys(d.expenses.byCategory).length} icon={Receipt} />
        <Stat label="Gastos Registrados" value={d.expenses.items.length} icon={ShoppingCart} />
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Por Categoría</CardTitle></CardHeader><CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(d.expenses.byCategory).sort((a: [string, ExpenseCategoryEntry], b: [string, ExpenseCategoryEntry]) => b[1].total - a[1].total).map(([cat, info]: [string, ExpenseCategoryEntry]) => (
            <div key={cat} className="flex items-center justify-between p-2.5 rounded-lg border"><span className="text-sm">{EXP_CAT[cat] || cat}</span><div className="text-right"><span className="font-bold text-sm">{formatCurrency(info.total, cc)}</span><span className="text-[10px] text-muted-foreground ml-1">({info.count})</span></div></div>
          ))}
        </div>
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Detalle de Gastos</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Categoría</TableHead><TableHead className="text-xs">Descripción</TableHead><TableHead className="text-xs text-right">Monto</TableHead></TableRow></TableHeader><TableBody>
            {d.expenses.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={ArrowDownUp} title="Sin gastos en el período" /></TableCell></TableRow> :
            d.expenses.items.map((e: ExpenseItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={e.id}><TableCell className="text-xs">{fdate(e.date)}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{EXP_CAT[e.category] || e.category}</Badge></TableCell><TableCell className="text-xs truncate max-w-[200px]">{e.description}</TableCell><TableCell className="text-right text-sm font-medium text-red-600">-{formatCurrency(e.amount, cc)}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}
