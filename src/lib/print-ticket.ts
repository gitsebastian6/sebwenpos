// ─── POS Ticket / Thermal Receipt Printer ─────────────────────────────────
// Generates a POS-style receipt and opens a print dialog

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
  DAVIPLATA: 'Daviplata',
  NEQUI: 'Nequi',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
  CREDIT: 'Fiado',
  FIADO: 'Fiado',
}

function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(isoDate: string): string {
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

export function printTicket(data: TicketData) {
  const win = window.open('', '_blank', 'width=350,height=600')
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir el ticket')
    return
  }

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="text-align:left;padding:2px 0;">
          ${item.quantity}x ${item.name}${item.isService ? ' (Svc)' : ''}
        </td>
        <td style="text-align:right;padding:2px 0;white-space:nowrap;">
          ${formatMoney(item.total, data.currencyCode)}
        </td>
      </tr>
      <tr>
        <td style="text-align:right;padding:0 0 4px 0;font-size:11px;color:#666;" colspan="2">
          &nbsp;&nbsp;&nbsp;&nbsp;${formatMoney(item.unitPrice, data.currencyCode)} c/u
        </td>
      </tr>
    `
    )
    .join('')

  const tipHtml =
    data.tipAmount > 0
      ? `
    <tr>
      <td style="text-align:left;padding:4px 0;">Propina</td>
      <td style="text-align:right;padding:4px 0;color:#e11d48;font-weight:600;">
        ${formatMoney(data.tipAmount, data.currencyCode)}
      </td>
    </tr>`
      : ''

  const customerHtml = data.customer
    ? `<p style="margin:2px 0;font-size:12px;">Cliente: <strong>${data.customer}</strong></p>`
    : ''

  const tableHtml = data.tableName
    ? `<p style="margin:2px 0;font-size:12px;">Mesa: <strong>${data.tableName}</strong></p>`
    : ''

  const notesHtml = data.notes
    ? `<p style="margin:4px 0 0 0;font-size:11px;color:#666;font-style:italic;">${data.notes}</p>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket ${data.orderNumber}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', 'Lucida Console', monospace;
      font-size: 12px;
      width: 280px;
      padding: 8px;
      color: #111;
      background: #fff;
    }
    @media print {
      body { width: 72mm; }
    }
    .header { text-align: center; padding-bottom: 6px; border-bottom: 1px dashed #333; }
    .store-name { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .store-info { font-size: 11px; color: #444; margin-top: 2px; }
    .order-info { padding: 6px 0; border-bottom: 1px dashed #333; }
    .order-info p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    .items-section { padding: 4px 0; border-bottom: 1px dashed #333; }
    .totals { padding: 6px 0; border-bottom: 1px dashed #333; }
    .total-row { font-size: 16px; font-weight: bold; }
    .footer { text-align: center; padding-top: 8px; }
    .footer p { font-size: 11px; color: #666; margin: 2px 0; }
    .dashed { border: none; border-top: 1px dashed #333; margin: 6px 0; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="store-name">${data.storeName}</div>
    ${data.storeNIT ? `<div class="store-info">NIT: ${data.storeNIT}</div>` : ''}
    ${data.storeAddress ? `<div class="store-info">${data.storeAddress}</div>` : ''}
    ${data.storePhone ? `<div class="store-info">Tel: ${data.storePhone}</div>` : ''}
  </div>

  <!-- Order Info -->
  <div class="order-info">
    <p><strong>Orden:</strong> ${data.orderNumber}</p>
    <p><strong>Fecha:</strong> ${formatDate(data.date)}</p>
    <p><strong>Pago:</strong> ${PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}</p>
    ${customerHtml}
    ${tableHtml}
  </div>

  <!-- Items -->
  <div class="items-section">
    <table>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals">
    <table>
      <tbody>
        <tr>
          <td style="text-align:left;padding:4px 0;">Subtotal</td>
          <td style="text-align:right;padding:4px 0;">${formatMoney(data.subtotal, data.currencyCode)}</td>
        </tr>
        ${tipHtml}
        <tr class="total-row">
          <td style="text-align:left;padding:6px 0 0 0;">TOTAL</td>
          <td style="text-align:right;padding:6px 0 0 0;">${formatMoney(data.total, data.currencyCode)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${notesHtml}

  <!-- Footer -->
  <div class="footer">
    <hr class="dashed">
    <p>Gracias por su visita</p>
    <p>¡Vuelva pronto!</p>
    <hr class="dashed">
    <p style="font-size:10px;">Generado por VENTIFY POS</p>
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
