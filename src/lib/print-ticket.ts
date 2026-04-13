// ─── POS Ticket / Thermal Receipt Printer (58mm / 80mm) ───────────────────
// Generates a POS-style receipt/factura and opens a print dialog
// Supports both 58mm (~48 chars) and 80mm (~32 chars) thermal paper

export interface TicketItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
  isService?: boolean
}

export interface TicketData {
  storeName: string
  storeAddress?: string
  storePhone?: string
  storeNIT?: string
  orderNumber: string
  date: string // ISO string
  customer?: string
  tableName?: string
  items: TicketItem[]
  subtotal: number
  tipAmount: number
  total: number
  discountAmount?: number
  taxAmount?: number
  taxBreakdown?: Array<{ name: string; code: string; rate: number; base: number; amount: number }>
  paymentMethod: string
  currencyCode: string
  notes?: string
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  EFECTIVO: 'Efectivo',
  DAVIPLATA: 'Daviplata',
  NEQUI: 'Nequi',
  CARD: 'Tarjeta',
  TARJETA: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
  CREDIT: 'Fiado',
  FIADO: 'Fiado',
}

function fmt(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtDate(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

export function printTicket(data: TicketData) {
  const win = window.open('', '_blank', 'width=400,height=700')
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir la factura')
    return
  }

  const paymentLabel = PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod
  const hasTip = data.tipAmount > 0
  const now = new Date()

  // Build items
  const itemsRows = data.items
    .map((item) => {
      const name = truncate(item.name, 22)
      const isSvc = item.isService ? ' *' : ''
      return `
        <tr>
          <td class="item-name">${item.quantity} ${name}${isSvc}</td>
          <td class="item-total">${fmt(item.total, data.currencyCode)}</td>
        </tr>
        <tr>
          <td class="item-detail" colspan="2">&nbsp;&nbsp;&nbsp;${fmt(item.unitPrice, data.currencyCode)} c/u</td>
        </tr>`
    })
    .join('')

  // Count summary
  const totalItems = data.items.reduce((s, i) => s + i.quantity, 0)

  // Customer info
  const customerBlock = data.customer
    ? `<div class="info-row"><span>Cliente:</span><span>${data.customer}</span></div>`
    : ''

  // Table info
  const tableBlock = data.tableName
    ? `<div class="info-row"><span>Mesa:</span><span>${data.tableName}</span></div>`
    : ''

  // Notes
  const notesBlock = data.notes
    ? `<div class="notes">${data.notes}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Factura ${data.orderNumber}</title>
<style>
  @page {
    margin: 0;
    size: 80mm auto;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 11px;
    line-height: 1.35;
    width: 72mm;
    max-width: 280px;
    padding: 4mm 3mm;
    color: #111;
    background: #fff;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    padding-bottom: 6px;
    border-bottom: 2px solid #111;
    margin-bottom: 6px;
  }
  .store-name {
    font-size: 15px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 2px;
  }
  .store-subtitle {
    font-size: 9px;
    letter-spacing: 0.5px;
    color: #555;
    margin-bottom: 4px;
  }
  .store-detail {
    font-size: 10px;
    color: #333;
    margin: 1px 0;
  }

  /* ── Order Info ── */
  .order-info {
    border-bottom: 1px dashed #999;
    padding-bottom: 6px;
    margin-bottom: 6px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    font-size: 11px;
  }
  .info-row span:first-child {
    color: #555;
  }
  .info-row span:last-child {
    font-weight: 600;
    text-align: right;
  }
  .order-number {
    font-size: 13px;
    font-weight: bold;
    text-align: center;
    padding: 3px 0;
    letter-spacing: 1px;
  }

  /* ── Items ── */
  .items-header {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #999;
    padding-bottom: 2px;
    margin-bottom: 2px;
    color: #555;
  }
  table { width: 100%; border-collapse: collapse; }
  td.item-name {
    padding: 1px 0;
    font-size: 11px;
    vertical-align: top;
  }
  td.item-total {
    text-align: right;
    padding: 1px 0;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    vertical-align: top;
  }
  td.item-detail {
    font-size: 9px;
    color: #888;
    padding: 0 0 3px 0;
  }

  /* ── Totals ── */
  .totals-section {
    border-top: 1px dashed #999;
    border-bottom: 2px solid #111;
    padding: 6px 0;
    margin: 4px 0 6px 0;
  }
  .total-row-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
  }
  .total-row-main .label {
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .total-row-main .value {
    font-size: 16px;
    font-weight: bold;
  }
  .subtotal-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    font-size: 11px;
    color: #555;
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    font-size: 11px;
    color: #be185d;
    font-weight: 600;
  }
  .tax-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    font-size: 11px;
    color: #15803d;
    font-weight: 600;
  }
  .tax-detail-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5px 0;
    font-size: 9px;
    color: #888;
    padding-left: 8px;
  }
  .discount-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    font-size: 11px;
    color: #dc2626;
    font-weight: 600;
  }
  .items-count {
    font-size: 9px;
    color: #888;
    text-align: right;
    margin-bottom: 2px;
  }

  /* ── Payment ── */
  .payment-section {
    border-bottom: 1px dashed #999;
    padding-bottom: 6px;
    margin-bottom: 6px;
  }
  .payment-method {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    padding: 2px 0;
  }
  .payment-method .method {
    font-weight: 600;
  }
  .payment-method .amount {
    font-weight: bold;
  }

  /* ── Notes ── */
  .notes {
    font-size: 10px;
    color: #666;
    font-style: italic;
    padding: 4px 0;
    border-bottom: 1px dashed #ccc;
    margin-bottom: 4px;
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    padding-top: 6px;
  }
  .footer-msg {
    font-size: 10px;
    color: #555;
    margin: 2px 0;
  }
  .footer-brand {
    font-size: 8px;
    color: #bbb;
    margin-top: 4px;
    letter-spacing: 0.5px;
  }

  /* ── Print helpers ── */
  .dashed { border: none; border-top: 1px dashed #999; margin: 4px 0; }
  @media print {
    body { padding: 2mm; }
  }
</style>
</head>
<body>

  <!-- ═══ HEADER ═══ -->
  <div class="header">
    <div class="store-name">${data.storeName}</div>
    <div class="store-subtitle">Factura de Venta</div>
    ${data.storeNIT ? `<div class="store-detail">NIT: ${data.storeNIT}</div>` : ''}
    ${data.storeAddress ? `<div class="store-detail">${data.storeAddress}</div>` : ''}
    ${data.storePhone ? `<div class="store-detail">Tel: ${data.storePhone}</div>` : ''}
  </div>

  <!-- ═══ ORDER INFO ═══ -->
  <div class="order-info">
    <div class="order-number">${data.orderNumber}</div>
    <div class="info-row">
      <span>Fecha</span>
      <span>${fmtDate(data.date)}</span>
    </div>
    ${customerBlock}
    ${tableBlock}
  </div>

  <!-- ═══ ITEMS ═══ -->
  <div class="items-header">
    <span>Cant / Producto</span>
    <span>Valor</span>
  </div>
  <table>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>
  <div class="items-count">${totalItems} artículo${totalItems !== 1 ? 's' : ''}</div>

  <!-- ═══ TOTALS ═══ -->
  <div class="totals-section">
    <div class="subtotal-row">
      <span>Subtotal</span>
      <span>${fmt(data.subtotal, data.currencyCode)}</span>
    </div>
    ${data.discountAmount && data.discountAmount > 0 ? `<div class="discount-row">
      <span>Descuento</span>
      <span>- ${fmt(data.discountAmount, data.currencyCode)}</span>
    </div>` : ''}
    ${data.taxAmount && data.taxAmount > 0 ? `
      <div class="tax-row">
        <span>IVA Incluido</span>
        <span>+ ${fmt(data.taxAmount, data.currencyCode)}</span>
      </div>
      ${data.taxBreakdown && data.taxBreakdown.length > 0 ? data.taxBreakdown.map(tax => `
        <div class="tax-detail-row">
          <span>${tax.name} (${tax.rate}%) — Base: ${fmt(tax.base, data.currencyCode)}</span>
          <span>${fmt(tax.amount, data.currencyCode)}</span>
        </div>
      `).join('') : ''}
    ` : ''}
    ${hasTip ? `<div class="tip-row">
      <span>Propina</span>
      <span>+ ${fmt(data.tipAmount, data.currencyCode)}</span>
    </div>` : ''}
    <div class="total-row-main">
      <span class="label">Total</span>
      <span class="value">${fmt(data.total, data.currencyCode)}</span>
    </div>
  </div>

  <!-- ═══ PAYMENT ═══ -->
  <div class="payment-section">
    <div class="payment-method">
      <span class="method">Forma de pago:</span>
      <span class="amount">${paymentLabel}</span>
    </div>
    <div class="payment-method">
      <span>Pagado con:</span>
      <span class="amount">${fmt(data.total, data.currencyCode)}</span>
    </div>
    ${data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO'
      ? '<div style="font-size:9px;color:#b45309;margin-top:2px;">* Venta a crédito - pendiente de pago</div>'
      : ''}
  </div>

  ${notesBlock}

  <!-- ═══ FOOTER ═══ -->
  <div class="footer">
    <hr class="dashed">
    <div class="footer-msg">Gracias por su compra</div>
    <div class="footer-msg">¡Vuelva pronto!</div>
    <hr class="dashed">
    <div class="footer-brand">VENTIFY POS &bull; ${now.toLocaleDateString('es-CO')}</div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>`

  win.document.write(html)
  win.document.close()
}

// ─── Shared thermal styles ────────────────────────────────────────────────────

const THERMAL_STYLE = `
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 11px;
    line-height: 1.35;
    width: 72mm;
    max-width: 280px;
    padding: 4mm 3mm;
    color: #111;
    background: #fff;
  }
  .header {
    text-align: center;
    padding-bottom: 6px;
    border-bottom: 2px solid #111;
    margin-bottom: 6px;
  }
  .store-name {
    font-size: 15px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 2px;
  }
  .store-subtitle {
    font-size: 9px;
    letter-spacing: 0.5px;
    color: #555;
    margin-bottom: 4px;
  }
  .store-detail {
    font-size: 10px;
    color: #333;
    margin: 1px 0;
  }
  .title {
    text-align: center;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1px;
    margin: 6px 0;
    padding: 3px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    font-size: 11px;
  }
  .row span:first-child { color: #555; }
  .row span:last-child { font-weight: 600; text-align: right; }
  .dashed { border: none; border-top: 1px dashed #999; margin: 4px 0; }
  .solid { border: none; border-top: 2px solid #111; margin: 4px 0; }
  .section-title {
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #999;
    padding-bottom: 2px;
    margin-bottom: 2px;
    color: #555;
  }
  .table-row {
    display: flex;
    padding: 1px 0;
    font-size: 10px;
  }
  .table-header {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #999;
    padding-bottom: 2px;
    margin-bottom: 2px;
    color: #555;
  }
  .footer {
    text-align: center;
    padding-top: 6px;
  }
  .footer-msg {
    font-size: 10px;
    color: #555;
    margin: 2px 0;
  }
  .footer-brand {
    font-size: 8px;
    color: #bbb;
    margin-top: 4px;
    letter-spacing: 0.5px;
  }
  .notes {
    font-size: 10px;
    color: #666;
    font-style: italic;
    padding: 4px 0;
    border-bottom: 1px dashed #ccc;
    margin-bottom: 4px;
  }
  @media print { body { padding: 2mm; } }
`

function openPrintWindow(title: string, body: string) {
  const win = window.open('', '_blank', 'width=400,height=700')
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir')
    return
  }
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>${THERMAL_STYLE}</style></head><body>${body}<script>window.onload=function(){window.print();}</script></body></html>`
  win.document.write(html)
  win.document.close()
}

// ─── Print Cash Register Close ────────────────────────────────────────────────

export interface CashRegisterCloseData {
  storeName: string
  storeNIT?: string
  storeAddress?: string
  openedAt: string
  closedAt: string
  responsibleName: string
  openingBalance: number
  totalCashSales: number
  totalOtherSales: number
  expectedCash: number
  actualCash: number
  difference: number
  totalTips: number
  paymentBreakdown: Array<{ method: string; count: number; total: number }>
  countBreakdown?: Record<string, number>
  currencyCode: string
}

export function printCashRegisterClose(data: CashRegisterCloseData) {
  const f = (n: number) => fmt(n, data.currencyCode)
  const payLabel = (m: string) => PAYMENT_LABELS[m] || m
  const totalSales = data.totalCashSales + data.totalOtherSales

  // Sort payment methods alphabetically (AZ)
  const sortedPayments = [...data.paymentBreakdown].sort((a, b) => payLabel(a.method).localeCompare(payLabel(b.method), 'es'))

  const payRows = sortedPayments.map(p => `
    <div class="table-row"><span>${payLabel(p.method)}</span><span>${p.count}</span><span>${f(p.total)}</span></div>
  `).join('')

  const diffColor = data.difference >= 0 ? '#16a34a' : '#dc2626'
  const diffSign = data.difference >= 0 ? '+' : ''
  const diffLabel = data.difference === 0 ? '✓ CUADRA' : (data.difference > 0 ? 'SOBRANTE' : 'FALTANTE')

  // Detailed count breakdown (physical count reported by user)
  let countRows = ''
  let countTotal = 0
  if (data.countBreakdown && Object.keys(data.countBreakdown).length > 0) {
    const sortedCount = Object.entries(data.countBreakdown)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => payLabel(a).localeCompare(payLabel(b), 'es'))
    sortedCount.forEach(([, v]) => { countTotal += v })
    const countLines = sortedCount.map(([method, amount]) => `
      <div class="table-row"><span>${payLabel(method)}</span><span></span><span>${f(amount)}</span></div>
    `).join('')
    countRows = `
      <hr class="dashed">
      <div class="section-title">CONTEO FÍSICO REPORTADO</div>
      <div class="table-row table-header"><span>Método</span><span></span><span>Total</span></div>
      ${countLines}
      <div class="table-row" style="font-weight:bold;"><span>TOTAL CONTEO</span><span></span><span>${f(countTotal)}</span></div>
      <hr class="dashed">
    `
  }

  const body = `
    <div class="header">
      <div class="store-name">${data.storeName}</div>
      ${data.storeNIT ? `<div class="store-detail">NIT: ${data.storeNIT}</div>` : ''}
      ${data.storeAddress ? `<div class="store-detail">${data.storeAddress}</div>` : ''}
    </div>

    <div class="title">INFORME DE CIERRE DE CAJA</div>

    <hr class="dashed">
    <div class="row"><span>Hora Apertura</span><span>${fmtDate(data.openedAt)}</span></div>
    <div class="row"><span>Hora Cierre</span><span>${fmtDate(data.closedAt)}</span></div>
    <div class="row"><span>Responsable</span><span>${data.responsibleName}</span></div>
    <hr class="dashed">

    <div class="section-title">SALDOS DE CAJA</div>
    <div class="row"><span>Con cuánto se inició</span><span>${f(data.openingBalance)}</span></div>
    <div class="row"><span>Ventas en Efectivo</span><span>${f(data.totalCashSales)}</span></div>
    <div class="row"><span>Otras Ventas</span><span>${f(data.totalOtherSales)}</span></div>
    <div class="row" style="font-weight:bold;"><span>Total Ventas</span><span>${f(totalSales)}</span></div>
    <hr class="dashed">

    <div class="section-title">CONSOLIDADO DE EFECTIVO</div>
    <div class="row" style="font-weight:bold;font-size:12px;"><span>Efectivo Esperado</span><span>${f(data.expectedCash)}</span></div>
    <div class="row" style="font-weight:bold;font-size:12px;"><span>Efectivo Real (Con cuánto terminó)</span><span>${f(data.actualCash)}</span></div>
    <div class="row" style="font-weight:bold;font-size:13px;color:${diffColor};"><span>${diffLabel}</span><span>${diffSign}${f(Math.abs(data.difference))}</span></div>
    ${countRows}
    <hr class="solid">

    <div class="section-title">VENTAS POR MÉTODO DE PAGO (A-Z)</div>
    <div class="table-row table-header"><span>Método</span><span>Ordenes</span><span>Total</span></div>
    ${payRows}
    ${data.totalTips > 0 ? `
      <hr class="dashed">
      <div class="row" style="font-weight:bold;"><span>Total Propinas</span><span>${f(data.totalTips)}</span></div>
    ` : ''}
    <hr class="solid">

    <div class="footer">
      <div class="footer-msg">Este informe se generó automáticamente al cerrar la caja</div>
      <hr class="dashed">
      <div class="footer-brand">VENTIFY POS</div>
    </div>
  `

  openPrintWindow('Cierre de Caja - Informe AZ', body)
}

// ─── Print Daily Summary (Corte Z) ────────────────────────────────────────────

export interface DailySummaryData {
  storeName: string
  storeNIT?: string
  date: string
  totalOrders: number
  completedOrders: number
  cancelledOrders: number
  totalSales: number
  subtotal: number
  tips: number
  paymentBreakdown: Array<{ method: string; count: number; total: number; tips: number }>
  topProducts: Array<{ name: string; quantity: number; total: number }>
  openingBalance: number
  expectedCash: number
  services: number
  currencyCode: string
}

export function printDailySummary(data: DailySummaryData) {
  const f = (n: number) => fmt(n, data.currencyCode)
  const payLabel = (m: string) => PAYMENT_LABELS[m] || m

  const payRows = data.paymentBreakdown.map(p => `
    <div class="row"><span>${payLabel(p.method)}</span><span>${f(p.total)}</span></div>
    <div class="row" style="padding-left:8px;font-size:9px;color:#888;"><span>${p.count} órdenes</span><span></span></div>
  `).join('')

  const prodRows = data.topProducts.map(p => `
    <div class="row"><span>${truncate(p.name, 22)} x${p.quantity}</span><span>${f(p.total)}</span></div>
  `).join('')

  const body = `
    <div class="header">
      <div class="store-name">${data.storeName}</div>
      ${data.storeNIT ? `<div class="store-detail">NIT: ${data.storeNIT}</div>` : ''}
    </div>

    <div class="title">CORTE Z - RESUMEN DEL DÍA</div>
    <div class="row"><span>Fecha</span><span>${data.date}</span></div>
    <hr class="dashed">

    <div class="section-title">ÓRDENES</div>
    <div class="row"><span>Total</span><span>${data.totalOrders}</span></div>
    <div class="row"><span>Completadas</span><span>${data.completedOrders}</span></div>
    <div class="row"><span>Canceladas</span><span>${data.cancelledOrders}</span></div>
    <hr class="dashed">

    <div class="section-title">VENTAS</div>
    <div class="row" style="font-weight:bold;font-size:12px;"><span>Total Ventas</span><span>${f(data.totalSales)}</span></div>
    <div class="row"><span>Subtotal</span><span>${f(data.subtotal)}</span></div>
    <div class="row"><span>Propinas</span><span>${f(data.tips)}</span></div>
    <div class="row"><span>Servicios</span><span>${f(data.services)}</span></div>
    <hr class="solid">

    <div class="section-title">POR MÉTODO DE PAGO</div>
    ${payRows}
    <hr class="dashed">

    <div class="section-title">TOP 5 PRODUCTOS</div>
    ${prodRows}
    <hr class="dashed">

    <div class="section-title">RESUMEN EFECTIVO</div>
    <div class="row"><span>Saldo Inicial</span><span>${f(data.openingBalance)}</span></div>
    <div class="row" style="font-weight:bold;"><span>Efectivo Esperado</span><span>${f(data.expectedCash)}</span></div>
    <hr class="solid">

    <div class="footer">
      <hr class="dashed">
      <div class="footer-brand">VENTIFY POS</div>
    </div>
  `

  openPrintWindow('Corte Z', body)
}

// ─── Print Product Catalog (A-Z) ──────────────────────────────────────────────

export interface ProductCatalogData {
  storeName: string
  storeNIT?: string
  products: Array<{
    name: string
    category: string
    price: number
    stock: number
    sku?: string | null
  }>
  currencyCode: string
}

export function printProductCatalog(data: ProductCatalogData) {
  const f = (n: number) => fmt(n, data.currencyCode)

  // Group by category
  const groups: Record<string, typeof data.products> = {}
  for (const p of data.products) {
    const cat = p.category || 'Sin Categoría'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(p)
  }

  const categorySections = Object.entries(groups).map(([cat, prods]) => {
    const rows = prods.map(p => `
      <div class="row">
        <span>${truncate(p.name, 24)}</span>
        <span style="min-width:70px;text-align:right;">${f(p.price)}</span>
      </div>
      <div class="row" style="padding-left:8px;font-size:9px;color:#888;">
        <span>Stock: ${p.stock}${p.sku ? ` · ${p.sku}` : ''}</span>
        <span></span>
      </div>
    `).join('')

    return `
      <hr class="dashed">
      <div style="text-align:center;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:4px 0;">— ${cat} (${prods.length}) —</div>
      ${rows}
    `
  }).join('')

  const now = new Date().toLocaleDateString('es-CO')

  const body = `
    <div class="header">
      <div class="store-name">${data.storeName}</div>
      ${data.storeNIT ? `<div class="store-detail">NIT: ${data.storeNIT}</div>` : ''}
    </div>

    <div class="title">CATÁLOGO DE PRODUCTOS</div>
    <div class="row" style="justify-content:center;"><span style="color:#888;">${data.products.length} productos</span></div>

    ${categorySections}

    <hr class="solid">
    <div class="footer">
      <div class="footer-msg">${now}</div>
      <div class="footer-brand">VENTIFY POS</div>
    </div>
  `

  openPrintWindow('Catálogo de Productos', body)
}

// ─── Print Kardex ─────────────────────────────────────────────────────────────

export interface KardexData {
  storeName: string
  productName: string
  category: string
  sku?: string | null
  movements: Array<{
    date: string
    type: string
    qty: number
    balance: number
    notes: string
  }>
  currencyCode: string
}

const KARDEX_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'COMP',
  SALE: 'VENTA',
  ADJUSTMENT: 'AJUS',
  RETURN: 'DEV',
}

export function printKardex(data: KardexData) {
  const typeLabel = (t: string) => KARDEX_TYPE_LABELS[t] || t.slice(0, 4)
  const fmtQty = (q: number) => (q > 0 ? '+' : '') + q

  const movementRows = data.movements.map(m => `
    <div class="table-row" style="font-size:10px;">
      <span style="width:68px;">${fmtDate(m.date).slice(0, 5)}</span>
      <span style="width:35px;">${typeLabel(m.type)}</span>
      <span style="width:40px;text-align:right;">${fmtQty(m.qty)}</span>
      <span style="width:40px;text-align:right;font-weight:bold;">${m.balance}</span>
    </div>
  `).join('')

  const body = `
    <div class="header">
      <div class="store-name">${data.storeName}</div>
    </div>

    <div class="title">KARDEX - PRODUCTO</div>
    <hr class="dashed">

    <div class="row"><span>Producto</span><span style="font-weight:bold;text-transform:uppercase;">${data.productName}</span></div>
    <div class="row"><span>Categoría</span><span>${data.category}</span></div>
    ${data.sku ? `<div class="row"><span>SKU</span><span>${data.sku}</span></div>` : ''}
    <hr class="dashed">

    <div class="table-header" style="display:flex;font-size:9px;">
      <span style="width:68px;">Fecha</span>
      <span style="width:35px;">Tipo</span>
      <span style="width:40px;text-align:right;">Cant</span>
      <span style="width:40px;text-align:right;">Saldo</span>
    </div>
    ${movementRows}
    <hr class="solid">

    ${data.movements.length > 0 ? `
      <div class="row" style="font-weight:bold;">
        <span>Stock Final</span>
        <span>${data.movements[data.movements.length - 1].balance}</span>
      </div>
    ` : '<div style="text-align:center;color:#888;font-size:10px;">Sin movimientos</div>'}

    <div class="footer">
      <hr class="dashed">
      <div class="footer-brand">VENTIFY POS</div>
    </div>
  `

  openPrintWindow(`Kardex - ${data.productName}`, body)
}
