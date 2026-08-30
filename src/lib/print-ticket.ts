// ─── POS Ticket / Thermal Receipt Printer (58mm / 80mm) ───────────────────
// Generates a POS-style receipt/factura and opens a print dialog
// Supports both 58mm (~48 chars) and 80mm (~32 chars) thermal paper

import type { TicketData } from './print-ticket-types'
import { PAYMENT_LABELS } from './print-ticket-types'
import { fmt, fmtDate, truncate, normalizePaperWidth, paperColumns } from './print-ticket-helpers'
import { formatQty } from './format'

// ─── Re-exports for backward compatibility ─────────────────────────────────
export type { TicketItem, TicketData, CashRegisterCloseData, DailySummaryData, ProductCatalogData, KardexData } from './print-ticket-types'
export { PAYMENT_LABELS } from './print-ticket-types'
export { printCashRegisterClose, printDailySummary, printProductCatalog, printKardex } from './print-secondary'

// ─── Main Ticket Function ──────────────────────────────────────────────────

export function printTicket(data: TicketData) {
  const win = window.open('', '_blank', 'width=400,height=700')
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir la factura')
    return
  }

  const paymentLabel = PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod
  const hasTip = data.tipAmount > 0
  const now = new Date()

  // ─── Ancho del rollo (Configuración → Tirilla) ──────────────────────────────
  const width = normalizePaperWidth(data.paperWidth)
  const cols = paperColumns(width)
  const pageMm = width === '58' ? '58mm' : '80mm'
  const bodyMm = width === '58' ? '54mm' : '72mm'
  const baseFontPx = width === '58' ? '10px' : '11px'
  const storeNamePx = width === '58' ? '13px' : '15px'
  const padX = width === '58' ? '2mm' : '3mm'

  const isElectronic = data.isElectronic || !!data.cufe
  const isDocEquivalente = data.isDocEquivalente || false

  // Resolución DIAN a imprimir:
  //  - Factura electrónica  → resolución de FE (invoiceResolution / resolutionNumber).
  //  - Tirilla / doc. equivalente POS → resolución propia del documento POS.
  const effectiveResolution = isElectronic
    ? (data.invoiceResolution || data.resolutionNumber)
    : (data.posResolutionNumber || data.invoiceResolution || data.resolutionNumber)
  const effectiveStart = isElectronic
    ? (data.invoiceStartNumber ?? data.resolutionStart)
    : (data.posResolutionFrom ?? data.invoiceStartNumber ?? data.resolutionStart)
  const effectiveEnd = isElectronic
    ? (data.invoiceEndNumber ?? data.resolutionEnd)
    : (data.posResolutionTo ?? data.invoiceEndNumber ?? data.resolutionEnd)
  const effectivePrefix = isElectronic
    ? data.invoicePrefix
    : (data.posResolutionPrefix || data.invoicePrefix)

  const REGIME_LABELS: Record<string, string> = {
    RESPONSABLE: 'Responsable del IVA',
    NO_RESPONSABLE: 'No responsable de IVA',
    SIMPLIFICADO: 'Régimen Simple de Tributación (SIMPLE)',
  }
  // If no regime specified but store has NIT, default to RESPONSABLE per DIAN rules
  const effectiveRegime = data.storeRegime || (data.storeNIT ? 'RESPONSABLE' : '')
  const regimeLabel = effectiveRegime ? (REGIME_LABELS[effectiveRegime] || effectiveRegime) : ''
  // Solo un responsable de IVA discrimina el impuesto en la tirilla. Un "No
  // responsable de IVA" NO debe imprimir IVA ni la leyenda de responsable
  // (Res. DIAN 000042/2020 art. 13; E.T. art. 437 par. 3).
  const isResponsable = effectiveRegime === 'RESPONSABLE'
  const taxAmt = data.taxAmount ?? 0
  const showTax = isResponsable && taxAmt > 0

  // Leyendas de calidad tributaria (Res. DIAN 000042/2020 art. 13 num. 8)
  const qualityLegends: string[] = []
  if (data.isIvaWithholdingAgent) qualityLegends.push('Agente retenedor de IVA')
  if (data.isSelfWithholdingAgent) qualityLegends.push('Autorretenedor')
  if (data.isIncResponsible) qualityLegends.push('Responsable del impuesto nacional al consumo')
  const extraLegendLines = (data.extraLegend || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // Format NIT for display: 222222222222 -> 222.222.222-222
  function formatNIT(nit: string): string {
    const clean = nit.replace(/[^0-9]/g, '')
    if (clean.length <= 1) return nit
    const digits = clean.slice(0, -1)
    const checkDigit = clean.slice(-1)
    // Add dots every 3 digits from the right
    const parts: string[] = []
    let remaining = digits
    while (remaining.length > 3) {
      parts.unshift(remaining.slice(-3))
      remaining = remaining.slice(0, -3)
    }
    parts.unshift(remaining)
    return `${parts.join('.')}-${checkDigit}`
  }

  // Determine customer NIT display
  const isConsumidorFinal = !data.customerNit || data.customerNit === '222222222222'
  const customerNitDisplay = isConsumidorFinal
    ? 'NIT: 222.222.222-222 (Consumidor Final)'
    : data.customerNit
      ? `NIT: ${formatNIT(data.customerNit)}${data.customer ? ` — ${data.customer}` : ''}`
      : ''

  // Contingency type labels
  const CONTINGENCY_LABELS: Record<string, string> = {
    '03': 'FACTURA ELECTRÓNICA DE CONTINGENCIA (TIPO 03)',
    '04': 'FACTURA ELECTRÓNICA SIN VALIDACIÓN PREVIA (TIPO 04)',
  }
  const contingencyLabel = data.invoiceType && data.invoiceType !== '01' ? (CONTINGENCY_LABELS[data.invoiceType] || '') : ''
  // Determine document subtitle. Para la tirilla no electrónica la denominación
  // es configurable (Configuración → Tirilla): una "tirilla de venta" a secas no
  // es denominación válida ante la DIAN si se usa como documento equivalente.
  const docSubtitle = contingencyLabel
    || (isElectronic
      ? 'FACTURA ELECTRÓNICA DE VENTA'
      : isDocEquivalente
        ? 'DOCUMENTO EQUIVALENTE DE POS'
        : (data.docDenomination || 'Tirilla de Venta'))

  // Build items — nombre completo (sin truncado agresivo) en su propia fila,
  // y el detalle de cantidad x precio unitario en un renglón aparte para que
  // el nombre nunca pelee espacio con la cantidad y siempre se vea entero.
  const itemsRows = data.items
    .map((item) => {
      const name = truncate(item.name, cols)
      const isSvc = item.isService ? ' *' : ''
      return `
        <tr>
          <td class="item-name">${name}${isSvc}</td>
          <td class="item-total">${fmt(item.total, data.currencyCode)}</td>
        </tr>
        <tr>
          <td class="item-detail" colspan="2">&nbsp;&nbsp;&nbsp;${formatQty(item.quantity)} x ${fmt(item.unitPrice, data.currencyCode)} c/u</td>
        </tr>`
    })
    .join('')

  // Count summary
  const totalItems = data.items.reduce((s, i) => s + i.quantity, 0)

  // Customer info
  const customerBlock = data.customer && !isConsumidorFinal
    ? `<div class="info-row"><span>Cliente:</span><span>${data.customer}</span></div>`
    : ''

  // Table info
  const tableBlock = data.tableName
    ? `<div class="info-row"><span>Mesa:</span><span>${data.tableName}</span></div>`
    : ''

  const deliveryBlock = data.fulfillmentType === 'DELIVERY'
    ? `<div class="info-row"><span>Entrega:</span><span>Domicilio</span></div>${data.deliveryAddress ? `<div class="info-row"><span>Dirección:</span><span>${data.deliveryAddress}</span></div>` : ''}`
    : data.fulfillmentType === 'PICKUP'
      ? `<div class="info-row"><span>Entrega:</span><span>Recoge en tienda</span></div>`
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
    size: ${pageMm} auto;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: ${baseFontPx};
    line-height: 1.35;
    width: ${bodyMm};
    max-width: 100%;
    padding: 4mm ${padX};
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
    font-size: ${storeNamePx};
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
    word-break: break-word;
    white-space: normal;
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
  .tax-info {
    font-size: 8px;
    color: #888;
    text-align: center;
    margin: 3px 0;
    letter-spacing: 0.3px;
  }
  .tributary-msg {
    font-size: 8px;
    color: #555;
    text-align: center;
    font-weight: 600;
    margin: 4px 0 2px 0;
    padding: 3px 0;
    border-top: 1px dotted #bbb;
    border-bottom: 1px dotted #bbb;
  }

  /* ── CUFE Section (electronic invoice) ── */
  .cufe-section {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 6px 8px;
    margin: 4px 0;
  }
  .cufe-label {
    font-size: 8px;
    font-weight: bold;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .cufe-value {
    font-size: 7px;
    color: #111;
    word-break: break-all;
    line-height: 1.4;
    font-family: 'Courier New', monospace;
  }

  /* ── QR Code Section (electronic invoice) ── */
  .qr-section {
    text-align: center;
    padding: 6px 0;
    margin: 4px 0;
  }
  .qr-label {
    font-size: 8px;
    font-weight: 600;
    color: #555;
    margin-bottom: 4px;
  }
  .qr-image {
    width: 150px;
    height: 150px;
    margin: 4px auto;
    display: block;
  }

  /* ── Print helpers ── */
  .dashed { border: none; border-top: 1px dashed #999; margin: 4px 0; }
  .paper-hint {
    font-size: 10px;
    color: #92400e;
    background: #fffbeb;
    border: 1px dashed #f59e0b;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 8px;
    text-align: center;
  }
  @media print {
    body { padding: 2mm; }
    .paper-hint { display: none !important; }
  }
</style>
</head>
<body>

  <div class="paper-hint">
    Tirilla de ${width} mm. En el diálogo elige «Tamaño de papel: ${pageMm}»
    (o «Recibo» / el predeterminado del rollo) y márgenes «Ninguno».
  </div>

  <!-- ═══ HEADER ═══ -->
  <div class="header">
    <div class="store-name">${data.storeName}</div>
    <div class="store-subtitle">${docSubtitle}</div>
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
    ${deliveryBlock}
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

  <!-- ═══ TRIBUTARY INFO ═══ -->
  ${regimeLabel ? `<div class="tax-info">${regimeLabel}</div>` : ''}
  ${qualityLegends.map((l) => `<div class="tax-info">${l}</div>`).join('')}
  ${effectiveResolution ? `<div class="tax-info">Resolución DIAN ${effectiveResolution}${effectivePrefix ? ` Prefijo: ${effectivePrefix}` : ''}${effectiveStart != null && effectiveEnd != null ? ` Del ${String(effectiveStart).padStart(6, '0')} al ${String(effectiveEnd).padStart(6, '0')}` : ''}</div>` : ''}
  ${isElectronic ? `<div class="tributary-msg">Venta sujeta al régimen de facturación electrónica</div>` : ''}
  ${customerNitDisplay ? `<div class="tax-info">${customerNitDisplay}</div>` : ''}
  ${extraLegendLines.map((l) => `<div class="tax-info">${l}</div>`).join('')}

  <!-- ═══ CUFE (only for electronic invoices) ═══ -->
  ${isElectronic && data.cufe ? `
  <div class="cufe-section">
    <div class="cufe-label">CUFE:</div>
    <div class="cufe-value">${data.cufe}</div>
  </div>` : ''}

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
    ${showTax ? `
      <div class="tax-row">
        <span>IVA Incluido</span>
        <span>+ ${fmt(taxAmt, data.currencyCode)}</span>
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
    ${data.deliveryFee && data.deliveryFee > 0 ? `<div class="tip-row">
      <span>Domicilio</span>
      <span>+ ${fmt(data.deliveryFee, data.currencyCode)}</span>
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
    ${data.paymentSplits && data.paymentSplits.length > 0
      ? data.paymentSplits.map((s) => `
          <div class="payment-method">
            <span class="method">${PAYMENT_LABELS[s.method] || s.method}${s.reference ? ` (${s.reference})` : ''}</span>
            <span class="amount">${fmt(s.amount, data.currencyCode)}</span>
          </div>`).join('')
      : `
        <div class="payment-method">
          <span>Pagado con:</span>
          <span class="amount">${fmt(data.total, data.currencyCode)}</span>
        </div>`}
    ${data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO'
      ? '<div style="font-size:9px;color:#b45309;margin-top:2px;">* Venta a crédito - pendiente de pago</div>'
      : ''}
  </div>

  ${notesBlock}

  <!-- ═══ FOOTER ═══ -->
  <div class="footer">
    <hr class="dashed">
    ${!customerNitDisplay && data.storeNIT ? `<div class="tax-info">NIT del adquirente: 222.222.222-222 (consumidor final)</div>` : ''}
    ${isElectronic && data.qrCodeUrl ? `
    <div class="qr-section">
      <div class="qr-label">Verifique su factura en la DIAN:</div>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.qrCodeUrl)}" class="qr-image" alt="QR DIAN" />
      <div class="qr-url" style="font-size:6px;color:#888;word-break:break-all;">${data.qrCodeUrl}</div>
    </div>` : ''}
    <div class="footer-msg">${isElectronic ? 'Representación gráfica de la factura electrónica de venta' : isDocEquivalente ? 'Documento equivalente de POS autorizado por la DIAN' : (data.footerText || 'Gracias por su compra')}</div>
    ${isElectronic ? '<div class="footer-msg">Autorizada mediante resolución DIAN</div>' : ''}
    ${isDocEquivalente && !isElectronic ? '<div class="footer-msg">Autorizado mediante resolución DIAN como documento equivalente</div>' : ''}
    <div class="footer-msg">¡Vuelva pronto!</div>
    <hr class="dashed">
    <div class="footer-brand">SEBWEN POS &bull; ${now.toLocaleDateString('es-CO')}</div>
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
