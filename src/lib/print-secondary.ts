// ─── Secondary Print Functions ────────────────────────────────────────────────
// Cash register close, daily summary, product catalog, and kardex printing

import type { CashRegisterCloseData, DailySummaryData, ProductCatalogData, KardexData } from './print-ticket-types'
import { PAYMENT_LABELS } from './print-ticket-types'
import { fmt, fmtDate, truncate, openPrintWindow } from './print-ticket-helpers'

// ─── Print Cash Register Close ────────────────────────────────────────────────

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
      <div class="footer-brand">SEBWEN POS</div>
    </div>
  `

  openPrintWindow('Cierre de Caja - Informe AZ', body)
}

// ─── Print Daily Summary (Corte Z) ────────────────────────────────────────────

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
      <div class="footer-brand">SEBWEN POS</div>
    </div>
  `

  openPrintWindow('Corte Z', body)
}

// ─── Print Product Catalog (A-Z) ──────────────────────────────────────────────

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
      <div class="footer-brand">SEBWEN POS</div>
    </div>
  `

  openPrintWindow('Catálogo de Productos', body)
}

// ─── Print Kardex ─────────────────────────────────────────────────────────────

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
      <div class="footer-brand">SEBWEN POS</div>
    </div>
  `

  openPrintWindow(`Kardex - ${data.productName}`, body)
}
