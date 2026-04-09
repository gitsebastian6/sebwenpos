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
