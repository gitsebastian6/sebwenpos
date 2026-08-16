// ── Report Types (shared with reports-view) ──
export interface ReportProduct { id: string; name: string; sku: string | null; currentStock: number }
export interface SalesPaymentEntry { count: number; total: number }
export interface SalesCategoryEntry { qty: number; total: number }
export interface TopProduct { name: string; total: number; qty: number }
export interface PurchaseItem { id: number; date: string; provider?: { name: string } | null; invoiceNumber: string | null; total: number }
export interface LostSaleItem { id: number; name: string; salePrice: number; sold30d: number; avgDaily: number }
export interface DiscountItem { id: number; createdAt: string; customer?: { name: string } | null; discountType: string; discountReason: string | null; discountAmount: number; total: number }
export interface CashRegister { id: number; openedAt: string; closedAt: string | null; user: string; openingBalance: number; expectedCash: number | null; closingBalance: number | null; difference: number | null; status: string; notes?: string }
export interface CommissionItem { id: number; createdAt: string; service?: { name: string; price: number } | null; quantity: number; unitPrice: number; totalAmount: number }
export interface ExpenseItem { id: number; date: string; category: string; description: string; amount: number; notes?: string }
export interface ReturnItem { id: number; createdAt: string; product?: { name: string; salePrice: number } | null; quantity: number; notes: string | null }
export interface AdjustmentItem { id: number; createdAt: string; product?: { name: string; currentStock: number; salePrice: number } | null; quantity: number; notes: string | null }
export interface TraceabilityItem { id: number; createdAt: string; movementType: string; productId: number; quantity: number; notes: string | null; referenceId?: string; product?: { name: string; costPrice: number; salePrice: number; category?: { name: string } | null } | null }
export interface QuoteItem { id: number; createdAt: string; quotationNumber: string; customerName: string | null; customer?: { name: string } | null; total: number; items?: unknown[]; status: string; validUntil?: string | null }
export interface InvoiceItem { id: number; createdAt: string; invoiceNumber: string; customerName: string; grandTotal: number; status: string; testMode: boolean; cufe?: string | null }
export interface CreditNoteItem { id: number; createdAt: string; noteNumber: string; noteType: string; customerName: string; totalAmount: number; status: string; invoiceNumber: string | null }
export interface DebtItem { id: number; name: string; phone: string | null; totalDebt: number; debtSince: string | null }
export interface IvaByCode { name: string; code: string; rate: number; base: number; amount: number }
export interface IvaOrder { id: number; orderNumber: string; createdAt: string; taxAmount: number; subtotal: number; total: number; customer?: { name: string } | null }
export interface TaxItem { id: number; date: string; description: string; amount: number; notes?: string }
export interface ExpenseCategoryEntry { count: number; total: number }
export type PaymentInfoEntry = [string, SalesPaymentEntry]
export type CategoryInfoEntry = [string, SalesCategoryEntry]

export interface ReportsData {
  localEnCifras: {
    salesToday: number; ordersToday: number; salesMonth: number; ordersMonth: number;
    lastMonthSales: number; monthVariance: number; tipsMonth: number;
    openTables: number; totalDebt: number; debtCount: number;
  }
  sales: {
    total: number; grossTotal: number; orderCount: number; avgTicket: number;
    byPayment: Record<string, SalesPaymentEntry>; byCategory: Record<string, SalesCategoryEntry>;
    bySource: Record<string, SalesPaymentEntry>; topProducts: TopProduct[];
  }
  purchases: { items: PurchaseItem[]; total: number; byProvider: Record<string, { count: number; total: number }> }
  inventory: {
    totalCostValue: number; totalRetailValue: number; totalProducts: number;
    daysOfInventory: number; outOfStockCount: number; lowStockCount: number; avgDailyCOGS: number;
  }
  profitability: {
    revenue: number; cogs: number; grossProfit: number; grossMargin: number;
    netRevenue: number; netProfit: number; netMargin: number; discounts: number; returns: number; losses: number; tips: number;
  }
  breakEven: {
    breakEvenPoint: number; distanceToBreakEven: number; achievedPercent: number;
    fixedCosts: number; variableCostRatio: number; contributionMargin: number;
  }
  lostSales: LostSaleItem[]
  returns: { items: ReturnItem[]; totalValue: number }
  cashRegisters: CashRegister[]
  commissions: { items: CommissionItem[]; total: number; count: number }
  employeeCommissions: { items: Array<{ employeeId: number; name: string; position: string | null; base: number; commission: number }>; total: number }
  adjustments: { items: AdjustmentItem[]; count: number }
  taxes: { items: TaxItem[]; total: number; count: number }
  expenses: { items: ExpenseItem[]; total: number; byCategory: Record<string, ExpenseCategoryEntry> }
  discounts: { items: DiscountItem[]; total: number; count: number }
  traceability: TraceabilityItem[]
  auditLog: Array<{ id: number; userName: string; action: string; entity: string; entityId: number | null; oldValue: string | null; newValue: string | null; createdAt: string }>
  debts: DebtItem[]
  delinquencyIndex: { overdueDebtTotal: number; totalDebtTotal: number; rate: number; overdueDays: number }
  quotes: QuoteItem[]
  quotesSummary: { activeCount: number; activeTotal: number; convertedCount: number; totalCount: number; conversionRate: number } | null
  invoices: InvoiceItem[]
  invoicesSummary: { total: number; count: number; validated: number; pending: number; rejected: number }
  creditNotes: CreditNoteItem[]
  creditNotesSummary: { total: number; count: number; creditCount: number; debitCount: number }
  ivaCollected: {
    total: number; totalBase: number; count: number;
    byCode: IvaByCode[]; orders: IvaOrder[];
  }
}

// ── Label constants ──
export const PM: Record<string, string> = {
  CASH: 'Efectivo', NEQUI: 'Nequi', CARD: 'Tarjeta', DAVIPLATA: 'Daviplata',
  TRANSFER: 'Transferencia', MIXED: 'Mixto', CREDIT: 'Fiado',
}

export const MOV_TYPE: Record<string, string> = {
  PURCHASE: 'Compra', SALE: 'Venta', ADJUSTMENT: 'Ajuste', RETURN: 'Devolución', LOSS: 'Pérdida',
}

export const MOV_BADGE: Record<string, string> = {
  PURCHASE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  SALE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ADJUSTMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  RETURN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  LOSS: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export const EXP_CAT: Record<string, string> = {
  ARRIENDO: 'Arriendo', SERVICIOS: 'Servicios', NOMINA: 'Nómina', INSUMOS: 'Insumos',
  LICENCIAS: 'Licencias', IMPUESTOS: 'Impuestos', TRANSPORTE: 'Transporte',
  MANTENIMIENTO: 'Mantenimiento', OTRO: 'Otro',
}

// ── Date helpers ──
export function fdate(d: string) { return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) }
export function fdatetime(d: string) { return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }

// ── Tab label map ──
export const tabLabelMap: Record<string, string> = {
  'cifras': 'Cifras', 'ventas': 'Ventas', 'rentabilidad': 'Rentabilidad',
  'compras': 'Compras', 'inventario': 'Inventario', 'perdidas': 'Pérdidas',
  'punto-eq': 'Punto de Equilibrio', 'descuentos': 'Descuentos', 'cierres': 'Cierres de Caja',
  'comisiones': 'Comisiones', 'gastos': 'Gastos', 'impuestos': 'Impuestos',
  'devoluciones': 'Devoluciones', 'ajustes': 'Ajustes', 'trazabilidad': 'Trazabilidad',
  'cotizaciones': 'Cotizaciones', 'facturas': 'Facturas', 'notas-credito': 'Notas Crédito/Débito', 'cxc': 'Cuentas por Cobrar',
}

// ── Export data mapper ──
export function getExportData(
  tab: string,
  d: ReportsData,
  filteredTraz: TraceabilityItem[],
): { headers: string[]; rows: (string | number)[][]; columnAligns: ('left' | 'center' | 'right')[] } | null {
  switch (tab) {
    case 'ventas': {
      const headers = ['Método Pago', 'Órdenes', 'Total']
      const rows = Object.entries(d.sales.byPayment)
        .sort((a: PaymentInfoEntry, b: PaymentInfoEntry) => b[1].total - a[1].total)
        .map(([method, info]: PaymentInfoEntry) => [PM[method] || method, info.count, info.total])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'center', 'right'] }
    }
    case 'compras': {
      const headers = ['Fecha', 'Proveedor', 'Factura', 'Total']
      const rows = d.purchases.items.map((p: PurchaseItem) => [fdate(p.date), p.provider?.name || '—', p.invoiceNumber || '—', p.total])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'left', 'right'] }
    }
    case 'inventario': {
      const headers = ['Indicador', 'Valor']
      const rows = [
        ['Costo Inventario', d.inventory.totalCostValue],
        ['Valor Retail', d.inventory.totalRetailValue],
        ['Productos Totales', d.inventory.totalProducts],
        ['Días de Inventario', d.inventory.daysOfInventory],
        ['Agotados', d.inventory.outOfStockCount],
        ['Stock Bajo', d.inventory.lowStockCount],
        ['COGS Promedio/Día', d.inventory.avgDailyCOGS],
      ]
      return { headers, rows, columnAligns: ['left', 'right'] }
    }
    case 'perdidas': {
      const headers = ['Fecha', 'Producto', 'Precio', 'Vendidos 30d', 'Prom/Día', 'Pérdida/Día']
      const rows = d.lostSales.map((p: LostSaleItem) => [
        p.name, p.salePrice, p.sold30d, p.avgDaily,
        Math.round(p.avgDaily * p.salePrice),
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'right', 'right', 'right', 'right', 'right'] }
    }
    case 'descuentos': {
      const headers = ['Fecha', 'Cliente', 'Tipo', 'Razón', 'Descuento', 'Total']
      const rows = d.discounts.items.map((o: DiscountItem) => [
        fdate(o.createdAt), o.customer?.name || 'General',
        o.discountType === 'PERCENTAGE' ? '%' : 'Fijo',
        o.discountReason || '—', o.discountAmount, o.total,
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'center', 'left', 'right', 'right'] }
    }
    case 'cierres': {
      const headers = ['Apertura', 'Cierre', 'Responsable', 'Base', 'Esperado', 'Real', 'Diferencia', 'Estado']
      const rows = d.cashRegisters.map((c: CashRegister) => [
        fdatetime(c.openedAt), c.closedAt ? fdatetime(c.closedAt) : '—', c.user,
        c.openingBalance, c.expectedCash ?? '—', c.closingBalance ?? '—',
        c.difference ?? '—', c.status === 'OPEN' ? 'Abierta' : 'Cerrada',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'center'] }
    }
    case 'comisiones': {
      const headers = ['Fecha', 'Servicio', 'Cantidad', 'Unitario', 'Total']
      const rows = d.commissions.items.map((c: CommissionItem) => [
        fdatetime(c.createdAt), c.service?.name || '—', c.quantity, c.unitPrice, c.totalAmount,
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'right', 'right', 'right'] }
    }
    case 'gastos': {
      const headers = ['Fecha', 'Categoría', 'Descripción', 'Monto']
      const rows = d.expenses.items.map((e: ExpenseItem) => [
        fdate(e.date), EXP_CAT[e.category] || e.category, e.description, e.amount,
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'left', 'right'] }
    }
    case 'impuestos': {
      // IVA recaudado summary
      const headers = ['Concepto', 'Valor']
      const rows: (string | number)[][] = [
        ['Total IVA Recaudado', d.ivaCollected?.total || 0],
        ['Base Gravable', d.ivaCollected?.totalBase || 0],
        ['Órdenes con IVA', d.ivaCollected?.count || 0],
        ['Total Gastos Impuestos', d.taxes.total || 0],
      ]
      return { headers, rows, columnAligns: ['left', 'right'] }
    }
    case 'devoluciones': {
      const headers = ['Fecha', 'Producto', 'Cantidad', 'Notas']
      const rows = d.returns.items.map((r: ReturnItem) => [
        fdatetime(r.createdAt), r.product?.name || 'Eliminado', r.quantity, r.notes || '—',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'right', 'left'] }
    }
    case 'ajustes': {
      const headers = ['Fecha', 'Producto', 'Cantidad', 'Stock Actual', 'Notas']
      const rows = d.adjustments.items.map((a: AdjustmentItem) => [
        fdatetime(a.createdAt), a.product?.name || '—', a.quantity,
        a.product?.currentStock ?? '—', a.notes || '—',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'right', 'right', 'left'] }
    }
    case 'trazabilidad': {
      const headers = ['Fecha', 'Tipo', 'Producto', 'Categoría', 'Cantidad', 'Notas']
      const rows = filteredTraz.map((m: TraceabilityItem) => [
        fdatetime(m.createdAt), MOV_TYPE[m.movementType] || m.movementType,
        m.product?.name || `ID ${m.productId}`, m.product?.category?.name || '—',
        m.quantity, m.notes || '—',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'center', 'left', 'left', 'right', 'left'] }
    }
    case 'cotizaciones': {
      const headers = ['Fecha', 'Cotización', 'Cliente', 'Total', 'Items', 'Estado']
      const rows = d.quotes.map((q: QuoteItem) => [
        fdatetime(q.createdAt), q.quotationNumber, q.customerName || q.customer?.name || 'General',
        q.total, q.items?.length || 0,
        q.status === 'ACTIVE' ? 'Activa' : q.status === 'CONVERTED' ? 'Convertida' : q.status === 'CANCELLED' ? 'Cancelada' : 'Expirada',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'left', 'right', 'center', 'center'] }
    }
    case 'facturas': {
      const headers = ['Fecha', 'Factura', 'Cliente', 'Total', 'Estado', 'Ambiente']
      const rows = d.invoices.map((inv: InvoiceItem) => [
        fdatetime(inv.createdAt), inv.invoiceNumber, inv.customerName, inv.grandTotal,
        inv.status === 'VALIDATED' ? 'Validada' : inv.status === 'DELIVERED' ? 'Entregada' : inv.status === 'REJECTED' ? 'Rechazada' : inv.status === 'DRAFT' ? 'Borrador' : 'Pendiente',
        inv.testMode ? 'Hab.' : 'Prod.',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'left', 'right', 'center', 'center'] }
    }
    case 'notas-credito': {
      const headers = ['Fecha', 'Nota', 'Tipo', 'Cliente', 'Monto', 'Estado', 'Factura Ref.']
      const rows = d.creditNotes.map((cn: CreditNoteItem) => [
        fdatetime(cn.createdAt), cn.noteNumber, cn.noteType === 'CREDIT' ? 'NC' : 'ND',
        cn.customerName, cn.totalAmount, cn.status, cn.invoiceNumber || '—',
      ])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'center', 'left', 'right', 'center', 'left'] }
    }
    case 'cxc': {
      const headers = ['Cliente', 'Teléfono', 'Deuda']
      const rows = d.debts.map((c: DebtItem) => [c.name, c.phone || '—', c.totalDebt])
      if (rows.length === 0) return null
      return { headers, rows, columnAligns: ['left', 'left', 'right'] }
    }
    case 'cifras': {
      const c = d.localEnCifras
      const headers = ['Indicador', 'Valor']
      const rows = [
        ['Ventas Hoy', c.salesToday],
        ['Órdenes Hoy', c.ordersToday],
        ['Ventas del Mes', c.salesMonth],
        ['vs Mes Anterior', `${c.monthVariance >= 0 ? '+' : ''}${c.monthVariance}%`],
        ['Tips del Mes', c.tipsMonth],
        ['Órdenes del Mes', c.ordersMonth],
        ['Mesas Abiertas', c.openTables],
        ['Cuentas por Cobrar', c.totalDebt],
        ['Ticket Promedio Mes', c.ordersMonth > 0 ? Math.round(c.salesMonth / c.ordersMonth) : 0],
        ['Clientes con Deuda', c.debtCount],
        ['Ventas Mes Anterior', c.lastMonthSales],
      ]
      return { headers, rows, columnAligns: ['left', 'right'] }
    }
    case 'rentabilidad': {
      const p = d.profitability
      const headers = ['Indicador', 'Valor']
      const rows = [
        ['Ingresos Brutos', p.revenue],
        ['Costos (COGS)', p.cogs],
        ['Utilidad Bruta', p.grossProfit],
        ['Margen Bruto', `${p.grossMargin}%`],
        ['Descuentos', p.discounts],
        ['Devoluciones', p.returns],
        ['Ingresos Netos', p.netRevenue],
        ['Pérdidas (merma)', p.losses],
        ['Utilidad Neta', p.netProfit],
        ['Margen Neto', `${p.netMargin}%`],
        ['Propinas del Período', p.tips],
      ]
      return { headers, rows, columnAligns: ['left', 'right'] }
    }
    case 'punto-eq': {
      const b = d.breakEven
      const headers = ['Indicador', 'Valor']
      const rows = [
        ['Punto de Equilibrio', b.breakEvenPoint],
        ['Ventas del Período', d.sales.total],
        ['Distancia al Equilibrio', b.distanceToBreakEven > 0 ? b.distanceToBreakEven : '¡Superado!'],
        ['% Alcanzado', `${b.achievedPercent}%`],
        ['Costos Fijos', b.fixedCosts],
        ['Costo Variable', `${(b.variableCostRatio * 100).toFixed(1)}%`],
        ['Margen Contribución', `${(b.contributionMargin * 100).toFixed(1)}%`],
      ]
      return { headers, rows, columnAligns: ['left', 'right'] }
    }
    default:
      return null
  }
}
