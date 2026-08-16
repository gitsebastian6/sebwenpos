import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Percent, Receipt, RotateCcw, SlidersHorizontal, DollarSign, Plus, Route, Filter, UserCog } from 'lucide-react'
import type { ReportsData, TaxItem, ReturnItem, AdjustmentItem, TraceabilityItem, IvaByCode, IvaOrder } from './reports-export'
import { fdate, fdatetime, MOV_TYPE, MOV_BADGE } from './reports-export'
import { Stat, EmptyState } from './report-shared'

interface TabProps { d: ReportsData; cc: string }

// ── 12. IMPUESTOS ──
export function ImpuestosTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="impuestos" className="space-y-4 mt-4">
      {/* IVA Recaudado por Ventas */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                {d.ivaCollected.byCode.map((tax: IvaByCode) => (
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
                    <TableRow className="hover:bg-muted/30 transition-colors">
                      <TableHead>Fecha</TableHead>
                      <TableHead>Orden</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.ivaCollected.orders.slice(0, 20).map((order: IvaOrder) => (
                      <TableRow className="hover:bg-muted/30 transition-colors" key={order.id}>
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
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
              d.taxes.items.map((t: TaxItem) => (
                <TableRow className="hover:bg-muted/30 transition-colors" key={t.id}><TableCell className="text-xs">{fdate(t.date)}</TableCell><TableCell className="text-xs">{t.description}</TableCell><TableCell className="text-right text-sm font-medium text-red-600">-{formatCurrency(t.amount, cc)}</TableCell><TableCell className="text-xs text-muted-foreground">{t.notes || '—'}</TableCell></TableRow>
              ))}
            </TableBody></Table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}

// ── 13. DEVOLUCIONES ──
interface DevolucionesTabProps { d: ReportsData; cc: string; openReturnDialog: () => void }

export function DevolucionesTab({ d, cc, openReturnDialog }: DevolucionesTabProps) {
  return (
    <TabsContent value="devoluciones" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Devoluciones" value={d.returns.items.length} icon={RotateCcw} />
        <Stat label="Valor Devuelto" value={formatCurrency(d.returns.totalValue, cc)} icon={DollarSign} color="text-amber-600" />
      </div>
      <Card><CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Registro de Devoluciones</CardTitle>
          <Button size="sm" className="h-7 text-xs gap-1.5 active:scale-[0.98] transition-all" onClick={openReturnDialog}>
            <Plus className="h-3 w-3" />Registrar Devolución
          </Button>
        </div>
      </CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
            {d.returns.items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={RotateCcw} title="Sin devoluciones en el período" /></TableCell></TableRow> :
            d.returns.items.map((r: ReturnItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={r.id}><TableCell className="text-xs">{fdatetime(r.createdAt)}</TableCell><TableCell className="text-xs font-medium">{r.product?.name || 'Eliminado'}</TableCell><TableCell className={`text-right text-xs font-medium ${r.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.quantity > 0 ? '+' : ''}{r.quantity}</TableCell><TableCell className="text-xs text-muted-foreground">{r.notes || '—'}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 14. AJUSTES DE INVENTARIO ──
interface AjustesTabProps { d: ReportsData; cc: string; openAdjustDialog: () => void }

export function AjustesTab({ d, cc, openAdjustDialog }: AjustesTabProps) {
  return (
    <TabsContent value="ajustes" className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <Stat label="Ajustes Realizados" value={d.adjustments.count} icon={SlidersHorizontal} />
        <Button size="sm" className="h-7 text-xs gap-1.5 active:scale-[0.98] transition-all" onClick={openAdjustDialog}>
          <Plus className="h-3 w-3" />Registrar Ajuste
        </Button>
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Historial de Ajustes</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Producto</TableHead><TableHead className="text-xs text-right">Cantidad</TableHead><TableHead className="text-xs">Stock Actual</TableHead><TableHead className="text-xs">Notas</TableHead></TableRow></TableHeader><TableBody>
            {d.adjustments.items.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={SlidersHorizontal} title="Sin ajustes en el período" /></TableCell></TableRow> :
            d.adjustments.items.map((a: AdjustmentItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={a.id}><TableCell className="text-xs">{fdatetime(a.createdAt)}</TableCell><TableCell className="text-xs font-medium">{a.product?.name || '—'}</TableCell><TableCell className={`text-right text-xs font-medium ${a.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{a.quantity > 0 ? '+' : ''}{a.quantity}</TableCell><TableCell className="text-right text-xs">{a.product?.currentStock ?? '—'}</TableCell><TableCell className="text-xs text-muted-foreground">{a.notes || '—'}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 15. TRAZABILIDAD ──
interface TrazabilidadTabProps {
  d: ReportsData; cc: string
  trazFilter: string; setTrazFilter: (v: string) => void
  filteredTraz: TraceabilityItem[]; trazCounts: Record<string, number>
}

export function TrazabilidadTab({ d, cc, trazFilter, setTrazFilter, filteredTraz, trazCounts }: TrazabilidadTabProps) {
  return (
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
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
              <Button key={key}
                variant={trazFilter === key ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs active:scale-[0.98] transition-all"
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
          <Table><TableHeader><TableRow className="hover:bg-muted/30 transition-colors">
            <TableHead className="text-xs">Fecha</TableHead>
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Producto</TableHead>
            <TableHead className="text-xs">Categoría</TableHead>
            <TableHead className="text-xs">Referencia</TableHead>
            <TableHead className="text-xs text-right">Cantidad</TableHead>
            <TableHead className="text-xs">Notas</TableHead>
          </TableRow></TableHeader><TableBody>
            {filteredTraz.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState icon={Route} title="Sin movimientos para el filtro seleccionado" /></TableCell></TableRow> :
            filteredTraz.map((m: TraceabilityItem, i: number) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={m.id + '-' + i}>
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

      {/* ── Log de Auditoría (quién hizo qué) ── */}
      <Card><CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><UserCog className="h-4 w-4" />Log de Auditoría</CardTitle>
        <CardDescription>Registro inmutable de acciones — usuario, fecha, acción, valor anterior y nuevo</CardDescription>
      </CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Usuario</TableHead><TableHead className="text-xs">Acción</TableHead><TableHead className="text-xs">Entidad</TableHead><TableHead className="text-xs">Cambio</TableHead></TableRow></TableHeader><TableBody>
            {d.auditLog.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState icon={UserCog} title="Sin eventos de auditoría en el período" /></TableCell></TableRow> :
            d.auditLog.map((a) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={a.id}>
                <TableCell className="text-xs whitespace-nowrap">{fdatetime(a.createdAt)}</TableCell>
                <TableCell className="text-xs font-medium">{a.userName}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{a.action}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.entity}{a.entityId ? ` #${a.entityId}` : ''}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                  {a.oldValue || a.newValue
                    ? `${a.oldValue ? a.oldValue.slice(0, 60) : '—'} → ${a.newValue ? a.newValue.slice(0, 60) : '—'}`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}
