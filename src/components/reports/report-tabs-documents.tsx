import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { FileText, DollarSign, CheckCircle2, ClipboardList, FileCheck, Users } from 'lucide-react'
import type { ReportsData, QuoteItem, InvoiceItem, CreditNoteItem, DebtItem } from './reports-export'
import { fdate, fdatetime } from './reports-export'
import { Stat, EmptyState } from './report-shared'

interface TabProps { d: ReportsData; cc: string }

// ── 16. COTIZACIONES ──
export function CotizacionesTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="cotizaciones" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Cotizaciones Activas" value={`${d.quotesSummary?.activeCount ?? 0}`} icon={FileText} color="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Valor Total Activas" value={formatCurrency(d.quotesSummary?.activeTotal ?? 0, cc)} icon={DollarSign} color="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Convertidas a Orden" value={`${d.quotesSummary?.convertedCount ?? 0}`} icon={CheckCircle2} color="text-sky-600 dark:text-sky-400" />
        <Stat label="Total en Período" value={`${d.quotesSummary?.totalCount ?? 0}`} icon={ClipboardList} />
      </div>
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Cotizaciones</CardTitle><CardDescription>Todas las cotizaciones generadas en el período</CardDescription></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Cotización</TableHead><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs text-right">Total</TableHead><TableHead className="text-xs">Items</TableHead><TableHead className="text-xs">Estado</TableHead><TableHead className="text-xs">Válido Hasta</TableHead></TableRow></TableHeader><TableBody>
            {d.quotes.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState icon={FileText} title="Sin cotizaciones en el período" /></TableCell></TableRow> :
            d.quotes.map((q: QuoteItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={q.id}>
                <TableCell className="text-xs">{fdatetime(q.createdAt)}</TableCell>
                <TableCell className="text-xs font-mono">{q.quotationNumber}</TableCell>
                <TableCell className="text-xs">{q.customerName || q.customer?.name || 'General'}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatCurrency(q.total, cc)}</TableCell>
                <TableCell className="text-xs">{q.items?.length || 0}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                    q.status === 'ACTIVE' ? 'border-emerald-500/30 text-emerald-400' :
                    q.status === 'CONVERTED' ? 'border-sky-500/30 text-sky-400' :
                    q.status === 'CANCELLED' ? 'border-red-500/30 text-red-400' :
                    'border-amber-500/30 text-amber-400'
                  }`}>
                    {q.status === 'ACTIVE' ? 'Activa' : q.status === 'CONVERTED' ? 'Convertida' : q.status === 'CANCELLED' ? 'Cancelada' : 'Expirada'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{q.validUntil ? fdate(q.validUntil) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 17. FACTURAS ELECTRÓNICAS ──
export function FacturasTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="facturas" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Facturado" value={formatCurrency(d.invoicesSummary?.total ?? 0, cc)} icon={DollarSign} color="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Facturas Emitidas" value={`${d.invoicesSummary?.count ?? 0}`} icon={FileCheck} />
        <Stat label="Validadas DIAN" value={`${d.invoicesSummary?.validated ?? 0}`} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Pendientes/Rechazadas" value={`${d.invoicesSummary?.pending ?? 0}/${d.invoicesSummary?.rejected ?? 0}`} color="text-amber-600 dark:text-amber-400" />
      </div>
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileCheck className="h-4 w-4" />Facturas Electrónicas</CardTitle><CardDescription>Historial de facturas electrónicas enviadas a la DIAN</CardDescription></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Factura</TableHead><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs text-right">Total</TableHead><TableHead className="text-xs">Estado</TableHead><TableHead className="text-xs">Ambiente</TableHead><TableHead className="text-xs">CUFE</TableHead></TableRow></TableHeader><TableBody>
            {d.invoices.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState icon={FileCheck} title="Sin facturas electrónicas" /></TableCell></TableRow> :
            d.invoices.map((inv: InvoiceItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={inv.id}>
                <TableCell className="text-xs">{fdatetime(inv.createdAt)}</TableCell>
                <TableCell className="text-xs font-mono">{inv.invoiceNumber}</TableCell>
                <TableCell className="text-xs">{inv.customerName}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatCurrency(inv.grandTotal, cc)}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                    inv.status === 'VALIDATED' || inv.status === 'DELIVERED' ? 'border-emerald-500/30 text-emerald-400' :
                    inv.status === 'REJECTED' ? 'border-red-500/30 text-red-400' :
                    'border-amber-500/30 text-amber-400'
                  }`}>
                    {inv.status === 'VALIDATED' ? 'Validada' : inv.status === 'DELIVERED' ? 'Entregada' : inv.status === 'REJECTED' ? 'Rechazada' : inv.status === 'DRAFT' ? 'Borrador' : 'Pendiente'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${inv.testMode ? 'border-amber-500/30 text-amber-400' : 'border-emerald-500/30 text-emerald-400'}`}>
                    {inv.testMode ? 'Hab.' : 'Prod.'}
                  </Badge>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground font-mono max-w-[80px] truncate">{inv.cufe ? `${inv.cufe.slice(0, 8)}...` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 18. NOTAS CRÉDITO/DÉBITO ──
export function NotasCreditoTab({ d, cc }: TabProps) {
  return (
    <TabsContent value="notas-credito" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Notas" value={formatCurrency(d.creditNotesSummary?.total ?? 0, cc)} icon={DollarSign} color="text-red-600 dark:text-red-400" />
        <Stat label="Notas Emitidas" value={`${d.creditNotesSummary?.count ?? 0}`} icon={FileText} />
        <Stat label="Notas Crédito" value={`${d.creditNotesSummary?.creditCount ?? 0}`} color="text-red-600 dark:text-red-400" />
        <Stat label="Notas Débito" value={`${d.creditNotesSummary?.debitCount ?? 0}`} color="text-amber-600 dark:text-amber-400" />
      </div>
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Notas Crédito / Débito</CardTitle><CardDescription>Historial de notas crédito y débito emitidas</CardDescription></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Nota</TableHead><TableHead className="text-xs">Tipo</TableHead><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs text-right">Monto</TableHead><TableHead className="text-xs">Estado</TableHead><TableHead className="text-xs">Factura Ref.</TableHead></TableRow></TableHeader><TableBody>
            {d.creditNotes.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState icon={FileText} title="Sin notas crédito/débito" /></TableCell></TableRow> :
            d.creditNotes.map((cn: CreditNoteItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={cn.id}>
                <TableCell className="text-xs">{fdatetime(cn.createdAt)}</TableCell>
                <TableCell className="text-xs font-mono">{cn.noteNumber}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cn.noteType === 'CREDIT' ? 'border-red-500/30 text-red-400' : 'border-amber-500/30 text-amber-400'}`}>
                    {cn.noteType === 'CREDIT' ? 'NC' : 'ND'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{cn.customerName}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatCurrency(cn.totalAmount, cc)}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                    cn.status === 'APPROVED' || cn.status === 'VALIDATED' ? 'border-emerald-500/30 text-emerald-400' :
                    cn.status === 'REJECTED' ? 'border-red-500/30 text-red-400' :
                    'border-amber-500/30 text-amber-400'
                  }`}>
                    {cn.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{cn.invoiceNumber || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}

// ── 19. CUENTAS POR COBRAR ──
export function CxcTab({ d, cc }: TabProps) {
  const overdueDays = d.delinquencyIndex.overdueDays
  const isOverdue = (c: DebtItem) => !!c.debtSince && (Date.now() - new Date(c.debtSince).getTime()) / 86400000 >= overdueDays
  return (
    <TabsContent value="cxc" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Deuda Total" value={formatCurrency(d.delinquencyIndex.totalDebtTotal, cc)} icon={Users} color="text-red-600" />
        <Stat label={`Cartera Vencida (+${overdueDays}d)`} value={formatCurrency(d.delinquencyIndex.overdueDebtTotal, cc)} icon={Users} color="text-red-600" />
        <Stat label="Índice de Morosidad" value={`${d.delinquencyIndex.rate}%`} icon={Users} color={d.delinquencyIndex.rate >= 30 ? 'text-red-600' : d.delinquencyIndex.rate >= 10 ? 'text-amber-600' : 'text-emerald-600'} />
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Clientes con Deuda</CardTitle></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs">Teléfono</TableHead><TableHead className="text-xs">Estado</TableHead><TableHead className="text-xs text-right">Deuda</TableHead></TableRow></TableHeader><TableBody>
            {d.debts.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState icon={Users} title="¡Sin deudas pendientes! 🎉" /></TableCell></TableRow> :
            d.debts.map((c: DebtItem) => (
              <TableRow className="hover:bg-muted/30 transition-colors" key={c.id}>
                <TableCell className="text-xs font-medium">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.phone || '—'}</TableCell>
                <TableCell>{isOverdue(c) ? <Badge variant="destructive" className="text-[10px]">Vencida</Badge> : <Badge variant="outline" className="text-[10px]">Al día</Badge>}</TableCell>
                <TableCell className="text-right text-sm font-bold text-red-600">{formatCurrency(c.totalDebt, cc)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </TabsContent>
  )
}
