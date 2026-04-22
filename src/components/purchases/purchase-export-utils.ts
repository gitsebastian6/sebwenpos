import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { formatCurrency } from '@/lib/auth'
import { printReport, printThermal80mm } from '@/lib/print-report'
import type { Purchase, StatusFilter } from '@/hooks/api/use-purchases'
import { getDocBadge } from './purchase-types'

// ── Print purchases list ──

export function handlePrintPurchases(
  purchases: Purchase[],
  statusFilter: StatusFilter,
  search: string,
  currencyCode: string,
  thermal = false,
) {
  const filterLabel = statusFilter === 'ALL' ? 'Todas' : statusFilter === 'COMPLETED' ? 'Completadas' : statusFilter === 'PENDING' ? 'Pendientes' : 'Canceladas'
  const subtitle = search || statusFilter !== 'ALL' ? `${search ? `"${search}" · ` : ''}${filterLabel}` : 'Todas las compras'

  if (thermal) {
    const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
    lines.push({ left: subtitle, separator: true })
    purchases.forEach(p => {
      const doc = getDocBadge(p.documentType)
      lines.push({ left: `${p.consecutiveNumber || `#${p.id}`} [${doc.short}] ${p.provider?.name || 'Sin prov.'}`, right: formatCurrency(p.total, currencyCode), bold: true, separator: true })
      lines.push({ left: `${format(new Date(p.date), 'dd/MM/yy', { locale: es })} · ${p.itemCount} prod. · IVA: ${formatCurrency(p.totalIva, currencyCode)}` })
      lines.push({ left: p.paymentStatus === 'PAID' ? '✓ Pagado' : p.paymentStatus === 'PARTIAL' ? '◐ Parcial' : '○ Pendiente', separator: true })
    })
    printThermal80mm({ title: 'COMPRAS', lines, footer: `Total: ${purchases.length}` })
  } else {
    printReport({
      title: 'Reporte de Compras', subtitle,
      headers: ['#', 'Consecutivo', 'Tipo', 'Fecha', 'Vencimiento', 'Proveedor', 'Total', 'IVA', 'Pago', 'Estado'],
      columnAligns: ['center', 'center', 'center', 'center', 'center', 'left', 'right', 'right', 'center', 'center'],
      columnWidths: ['25px', '70px', '35px', '70px', '70px', '1fr', '80px', '70px', '60px', '70px'],
      rows: purchases.map((p, i) => [
        i + 1,
        p.consecutiveNumber || `#${p.id}`,
        getDocBadge(p.documentType).short,
        format(new Date(p.date), 'd MMM yy', { locale: es }),
        p.dueDate ? format(new Date(p.dueDate), 'd MMM yy', { locale: es }) : '—',
        p.provider?.name || 'Sin proveedor',
        formatCurrency(p.total, currencyCode),
        formatCurrency(p.totalIva, currencyCode),
        p.paymentStatus === 'PAID' ? 'Pagado' : p.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Pendiente',
        p.status === 'COMPLETED' ? 'Completada' : p.status === 'PENDING' ? 'Pendiente' : 'Cancelada',
      ]),
      footer: `Total compras: ${purchases.length} · Valor total: ${formatCurrency(purchases.filter(p => p.status !== 'CANCELLED').reduce((s, p) => s + p.total, 0), currencyCode)}`,
      orientation: 'landscape',
    })
  }
}

// ── Print single purchase detail ──

export function handlePrintPurchaseDetail(purchase: Purchase, currencyCode: string) {
  const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
  const doc = getDocBadge(purchase.documentType)
  lines.push({ left: `${purchase.consecutiveNumber || `#${purchase.id}`} [${doc.short}]`, bold: true, separator: true })
  lines.push({ left: `Fecha: ${format(new Date(purchase.date), 'dd/MM/yyyy', { locale: es })}` })
  if (purchase.dueDate) lines.push({ left: `Vencimiento: ${format(new Date(purchase.dueDate), 'dd/MM/yyyy', { locale: es })}` })
  lines.push({ left: `Proveedor: ${purchase.provider?.name || 'Sin proveedor'}` })
  if (purchase.invoiceNumber) lines.push({ left: `Factura: ${purchase.invoiceNumber}` })
  if (purchase.notes) lines.push({ left: `Notas: ${purchase.notes}` })
  lines.push({ separator: true })
  lines.push({ left: 'PRODUCTO', right: 'IVA', bold: true, separator: true })
  purchase.purchaseItems.forEach(item => {
    const name = (item.product?.name || 'Producto').slice(0, 22)
    lines.push({ left: `${item.quantity}x ${name}`, right: `${formatCurrency(item.ivaAmount, currencyCode)}` })
  })
  lines.push({ left: '────────────────────────────────' })
  lines.push({ left: `Subtotal:`, right: formatCurrency(purchase.subtotal, currencyCode) })
  lines.push({ left: `IVA:`, right: formatCurrency(purchase.totalIva, currencyCode) })
  if (purchase.totalReteFuente > 0) lines.push({ left: `ReteFuente:`, right: formatCurrency(purchase.totalReteFuente, currencyCode) })
  if (purchase.totalReteIca > 0) lines.push({ left: `ReteICA:`, right: formatCurrency(purchase.totalReteIca, currencyCode) })
  if (purchase.totalDiscount > 0) lines.push({ left: `Descuento:`, right: formatCurrency(purchase.totalDiscount, currencyCode) })
  lines.push({ left: `TOTAL:`, right: formatCurrency(purchase.total, currencyCode), bold: true, separator: true })
  lines.push({ left: `Pagado: ${formatCurrency(purchase.amountPaid, currencyCode)} / ${formatCurrency(purchase.total, currencyCode)}`, separator: true })
  printThermal80mm({ title: 'COMPRA DETALLE', lines, footer: `Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}` })
}

// ── Print thermal detail (compact) ──

export function handlePrintThermalDetail(purchase: Purchase, currencyCode: string) {
  const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
  const doc = getDocBadge(purchase.documentType)
  lines.push({ left: `${purchase.consecutiveNumber || `#${purchase.id}`} [${doc.short}]`, bold: true, separator: true })
  lines.push({ left: `Fecha: ${format(new Date(purchase.date), 'dd/MM/yyyy')}` })
  if (purchase.dueDate) lines.push({ left: `Vence: ${format(new Date(purchase.dueDate), 'dd/MM/yyyy')}` })
  lines.push({ left: `Prov: ${purchase.provider?.name || 'N/A'}` })
  if (purchase.invoiceNumber) lines.push({ left: `Factura: ${purchase.invoiceNumber}` })
  lines.push({ separator: true })
  purchase.purchaseItems.forEach(item => {
    const n = (item.product?.name || 'Prod').slice(0, 22)
    lines.push({ left: `${item.quantity}x ${n}`, right: formatCurrency(item.total, currencyCode) })
  })
  lines.push({ left: '────────────────────────────────' })
  lines.push({ left: 'Subtotal:', right: formatCurrency(purchase.subtotal, currencyCode) })
  lines.push({ left: 'IVA:', right: formatCurrency(purchase.totalIva, currencyCode) })
  if (purchase.totalReteFuente > 0) lines.push({ left: 'ReteFuente:', right: `-${formatCurrency(purchase.totalReteFuente, currencyCode)}` })
  if (purchase.totalReteIca > 0) lines.push({ left: 'ReteICA:', right: `-${formatCurrency(purchase.totalReteIca, currencyCode)}` })
  if (purchase.totalDiscount > 0) lines.push({ left: 'Desc:', right: `-${formatCurrency(purchase.totalDiscount, currencyCode)}` })
  lines.push({ left: 'TOTAL:', right: formatCurrency(purchase.total, currencyCode), bold: true, separator: true })
  lines.push({ left: `Pagado: ${formatCurrency(purchase.amountPaid, currencyCode)}/${formatCurrency(purchase.total, currencyCode)}` })
  printThermal80mm({ title: 'COMPRA DETALLE', lines, footer: `${format(new Date(), 'dd/MM/yyyy HH:mm')}` })
}

// ── Excel export ──

export function handleExportExcel(purchases: Purchase[], currencyCode: string) {
  const rows = purchases.map((p, i) => ({
    '#': i + 1,
    'Consecutivo': p.consecutiveNumber || '',
    'Tipo Doc': getDocBadge(p.documentType).short,
    'Fecha': format(new Date(p.date), 'yyyy-MM-dd'),
    'Vencimiento': p.dueDate ? format(new Date(p.dueDate), 'yyyy-MM-dd') : '',
    'Factura': p.invoiceNumber || '',
    'Proveedor': p.provider?.name || 'Sin proveedor',
    'N° Productos': p.itemCount,
    'Subtotal': p.subtotal,
    'IVA': p.totalIva,
    'ReteFuente': p.totalReteFuente,
    'ReteICA': p.totalReteIca,
    'Descuento': p.totalDiscount,
    'Total': p.total,
    'Pagado': p.amountPaid,
    'Estado Pago': p.paymentStatus === 'PAID' ? 'Pagado' : p.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Pendiente',
    'Forma Pago': p.paymentTerms === 'CONTADO' ? 'Contado' : p.paymentTerms === 'CREDITO_30' ? 'Crédito 30' : p.paymentTerms === 'CREDITO_60' ? 'Crédito 60' : p.paymentTerms === 'CREDITO_90' ? 'Crédito 90' : p.paymentTerms,
    'Estado': p.status === 'COMPLETED' ? 'Completada' : p.status === 'CANCELLED' ? 'Cancelada' : 'Pendiente',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Array(19).fill({ wch: 14 })
  ws['!cols'][0] = { wch: 5 }
  ws['!cols'][7] = { wch: 22 }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Compras')
  const fileName = `Compras_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  XLSX.writeFile(wb, fileName)
  return fileName
}
