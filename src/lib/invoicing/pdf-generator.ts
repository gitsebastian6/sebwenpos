import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { formatQty } from '../format'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvoicePDFData {
  // Invoice
  invoiceNumber: string        // "FE-00000001"
  consecutive: number
  cufe: string
  issueDate: string            // "2024-06-15"
  issueTime: string            // "14:30:00"
  status: string               // DRAFT, PENDING_VALIDATE, VALIDATED, etc.
  dianMessage?: string
  notes?: string

  // Resolution
  resolutionNumber: string     // "18764"
  resolutionDate: string       // "2024-01-01"
  startDate: string            // "2024-01-01"
  endDate: string              // "2025-12-31"
  prefix: string               // "FE"
  startNumber: number
  endNumber: number

  // Supplier (emisor)
  supplierNit: string          // "900123456-7"
  supplierName: string         // "Bar La Terraza"
  supplierLegalName: string    // "Bar La Terraza S.A.S"
  supplierAddress: string
  supplierPhone: string
  supplierEmail?: string

  // Customer (receptor)
  customerNit: string          // "222222222222"
  customerName: string         // "Consumidor Final"
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  customerRegime?: string

  // Items
  items: Array<{
    lineNumber: number
    description: string
    quantity: number
    unitPrice: number          // Price per unit (COP)
    totalRow: number           // quantity * unitPrice
    taxCode?: string
    taxRate?: number
    taxAmount?: number
    notes?: string
  }>

  // Totals
  subtotalBase: number         // Base gravable
  totalTaxAmount: number       // Total impuestos
  totalWithTax: number         // Total con impuestos
  discountAmount: number       // Descuento
  tipAmount: number            // Propina
  grandTotal: number           // Total final
  currencyCode: string         // "COP"

  // Tax breakdown
  taxBreakdown: Array<{
    code: string
    name: string
    base: number
    rate: number
    amount: number
  }>

  // Payment
  paymentMethod: string        // DIAN code "1", "2", etc.

  // QR
  qrCodeUrl: string            // DIAN catalog URL with CUFE

  // Test mode
  testMode: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  primary: '#1a1a2e',
  text: '#333333',
  green: '#16a34a',
  red: '#dc2626',
  orange: '#ea580c',
  white: '#ffffff',
  muted: '#6b7280',
  lightGray: '#f3f4f6',
  border: '#e5e7eb',
  tableHeaderBg: '#374151',
  tableHeaderFg: '#ffffff',
  accentBar: '#1a1a2e',
} as const

const MARGIN = 40

// ─── Utility Exports ────────────────────────────────────────────────────────

/**
 * Format a number as Colombian pesos: "$50.000"
 */
export function formatCOP(amount: number): string {
  const rounded = Math.round(amount)
  const formatted = rounded.toLocaleString('es-CO')
  return `$${formatted}`
}

/**
 * Convert a PDF buffer to a base64-encoded string.
 */
export function pdfToBase64(pdfBuffer: Buffer): string {
  return pdfBuffer.toString('base64')
}

/**
 * Generate a QR code as a data URL (base64 PNG).
 */
export async function generateQRCodeDataURL(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    type: 'image/png',
    width: 256,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/**
 * Map DIAN payment method codes to Spanish display names.
 */
export function getPaymentMethodName(code: string): string {
  const map: Record<string, string> = {
    '1': 'Efectivo',
    '2': 'Tarjeta',
    '10': 'Transferencia/Consignación',
    '42': 'Daviplata/Nequi',
    '99': 'Otro/Mixto',
  }
  return map[code] ?? 'No especificado'
}

/**
 * Map invoice status codes to Spanish display names.
 */
export function getStatusDisplayName(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    PENDING_VALIDATE: 'Pendiente de validación',
    VALIDATED: 'Validada',
    DELIVERED: 'Entregada',
    REJECTED: 'Rechazada',
    CANCELLED: 'Anulada',
  }
  return map[status] ?? status
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Format "YYYY-MM-DD" to "15 de Junio de 2024".
 */
function formatDate(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const day = parseInt(parts[2], 10)
  const month = MONTH_NAMES[parseInt(parts[1], 10) - 1] ?? parts[1]
  return `${day} de ${month} de ${parts[0]}`
}

/**
 * Safe accessor — returns em-dash when the value is empty.
 */
function orDash(value: string | undefined | null): string {
  return value && value.trim().length > 0 ? value.trim() : '—'
}

/**
 * Draw a horizontal rule across the page.
 */
function drawHR(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  color: string = COLORS.border,
  thickness: number = 0.5,
): void {
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(thickness)
    .strokeColor(color)
    .stroke()
}

/**
 * Check whether we need a new page for `requiredHeight` and add one if so.
 * Returns the current Y position (may have changed after addPage).
 */
function ensureSpace(doc: InstanceType<typeof PDFDocument>, requiredHeight: number): number {
  const bottom = doc.page.height - MARGIN
  if (doc.y + requiredHeight > bottom) {
    doc.addPage()
  }
  return doc.y
}

/**
 * Draw a table header row with dark background.
 * Returns the X positions for each column (useful for row rendering).
 */
function drawTableHeader(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  totalWidth: number,
  columns: Array<{ header: string; width: number; align: 'left' | 'center' | 'right' }>,
  height: number = 18,
): number[] {
  doc.rect(x, y, totalWidth, height).fill(COLORS.tableHeaderBg)
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.tableHeaderFg)

  const positions: number[] = []
  let cx = x
  for (const col of columns) {
    positions.push(cx)
    doc.text(col.header, cx + 4, y + 5, { width: col.width - 8, align: col.align })
    cx += col.width
  }
  return positions
}

/**
 * Draw a single data row in a table with alternating background.
 */
function drawTableRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  totalWidth: number,
  columns: Array<{ width: number; align: 'left' | 'center' | 'right' }>,
  positions: number[],
  values: Array<{ text: string; bold?: boolean }>,
  isEven: boolean,
  height: number = 16,
): void {
  doc.rect(x, y, totalWidth, height).fillAndStroke(
    isEven ? COLORS.white : COLORS.lightGray,
    COLORS.border,
  )

  for (let i = 0; i < values.length; i++) {
    const val = values[i]
    const col = columns[i]
    doc.font(val.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(COLORS.text)
    doc.text(val.text, positions[i] + 4, y + 4, {
      width: col.width - 8,
      align: col.align,
      lineBreak: false,
      ellipsis: true,
    })
  }
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

/**
 * Generate a professional A4 PDF representation of a Colombian electronic invoice
 * compliant with DIAN Resolution 000042 of 2020 (all 12 mandatory elements).
 *
 * **12 Mandatory DIAN Elements:**
 *  1. Datos del emisor (NIT, nombre, dirección, teléfono, correo)
 *  2. Datos del receptor (NIT, nombre, régimen)
 *  3. Número de factura (Prefijo + Consecutivo)
 *  4. Fecha y hora de emisión
 *  5. Número de resolución (Resolución, fecha, rango autorizado)
 *  6. CUFE/CUDFE
 *  7. Desglose de items (Descripción, cantidad, precio unitario, total)
 *  8. Desglose de impuestos (Base, tasa, monto por tipo)
 *  9. Totales (Subtotal, impuestos, descuento, total a pagar)
 * 10. Método de pago
 * 11. Código QR (con URL del catálogo DIAN)
 * 12. "Representación gráfica de la factura electrónica de venta"
 */
export async function generateInvoicePDF(data: InvoicePDFData): Promise<Buffer> {
  // ── Generate QR code as PNG buffer ──────────────────────────────────
  const qrPngBuffer = await QRCode.toBuffer(data.qrCodeUrl, {
    type: 'png',
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  // ── Create document ─────────────────────────────────────────────────
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `Factura Electrónica ${data.invoiceNumber}`,
      Author: data.supplierName,
      Subject: `Factura Electrónica de Venta – ${data.invoiceNumber}`,
      Creator: 'Sistema de Facturación Electrónica – DIAN',
    },
  })

  const pageWidth = doc.page.width - MARGIN - MARGIN

  // ════════════════════════════════════════════════════════════════════
  // RENDER ALL CONTENT
  // ════════════════════════════════════════════════════════════════════

  // ── Element 1: HEADER — Emisor name ────────────────────────────────
  // Accent bar at top
  doc.rect(MARGIN, MARGIN, pageWidth, 4).fill(COLORS.accentBar)
  doc.y = MARGIN + 12

  // Company name — large, bold, centered
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.primary)
  doc.text(data.supplierName, MARGIN, doc.y, { width: pageWidth, align: 'center' })
  doc.moveDown(0.15)

  // Legal name (if different from trade name)
  if (data.supplierLegalName && data.supplierLegalName !== data.supplierName) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
    doc.text(data.supplierLegalName, MARGIN, doc.y, { width: pageWidth, align: 'center' })
    doc.moveDown(0.15)
  }

  // "FACTURA ELECTRÓNICA DE VENTA"
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary)
  doc.text('FACTURA ELECTRÓNICA DE VENTA', MARGIN, doc.y, {
    width: pageWidth,
    align: 'center',
  })
  doc.moveDown(0.2)

  // ── Element 3: Invoice number — large, bold, centered ──────────────
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.primary)
  doc.text(data.invoiceNumber, MARGIN, doc.y, {
    width: pageWidth,
    align: 'center',
  })
  doc.moveDown(0.3)

  // Test mode banner
  if (data.testMode) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.orange)
    doc.text('DOCUMENTO DE PRUEBA — HABILITACIÓN DIAN', MARGIN, doc.y, {
      width: pageWidth,
      align: 'center',
    })
    doc.moveDown(0.2)
  }

  // Status display
  const statusName = getStatusDisplayName(data.status)
  const statusColor =
    data.status === 'VALIDATED' || data.status === 'DELIVERED'
      ? COLORS.green
      : data.status === 'REJECTED' || data.status === 'CANCELLED'
        ? COLORS.red
        : COLORS.muted
  doc.font('Helvetica-Bold').fontSize(8).fillColor(statusColor)
  doc.text(`Estado: ${statusName}`, MARGIN, doc.y, { width: pageWidth, align: 'center' })
  if (data.dianMessage) {
    doc.font('Helvetica').fontSize(7).fillColor(statusColor)
    doc.text(data.dianMessage, MARGIN, doc.y, { width: pageWidth, align: 'center' })
  }

  doc.moveDown(0.4)
  drawHR(doc, MARGIN, doc.y, pageWidth, COLORS.border, 0.5)
  doc.moveDown(0.5)

  // ── Element 4: Date and time ───────────────────────────────────────
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
  doc.text(
    `Fecha: ${formatDate(data.issueDate)}    Hora: ${data.issueTime}`,
    MARGIN,
    doc.y,
    { width: pageWidth, align: 'center' },
  )
  doc.moveDown(0.6)

  // ── Elements 1 & 2: EMISOR / RECEPTOR — two-column boxes ──────────
  const colGap = 16
  const halfWidth = (pageWidth - colGap) / 2
  const leftX = MARGIN
  const rightX = MARGIN + halfWidth + colGap
  const boxHeight = 80

  ensureSpace(doc, boxHeight + 10)
  const sectionY = doc.y

  // ── Emisor box (left) ──
  doc.rect(leftX, sectionY, halfWidth, boxHeight).fillAndStroke(COLORS.lightGray, COLORS.border)
  let tx = leftX + 8
  let ty = sectionY + 6

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.primary)
  doc.text('DATOS DEL EMISOR', tx, ty, { width: halfWidth - 16 })
  ty += 13

  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.text)
  doc.text(`Razón Social: ${data.supplierName}`, tx, ty, { width: halfWidth - 16 })
  ty += 11

  doc.text(`NIT: ${data.supplierNit}`, tx, ty, { width: halfWidth - 16 })
  ty += 11

  if (data.supplierLegalName && data.supplierLegalName !== data.supplierName) {
    doc.text(data.supplierLegalName, tx, ty, { width: halfWidth - 16 })
    ty += 11
  }

  doc.text(`Dirección: ${orDash(data.supplierAddress)}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  doc.text(`Teléfono: ${orDash(data.supplierPhone)}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  if (data.supplierEmail) {
    doc.text(`Correo: ${data.supplierEmail}`, tx, ty, { width: halfWidth - 16 })
  }

  // ── Receptor box (right) ──
  doc.rect(rightX, sectionY, halfWidth, boxHeight).fillAndStroke(COLORS.lightGray, COLORS.border)
  tx = rightX + 8
  ty = sectionY + 6

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.primary)
  doc.text('DATOS DEL RECEPTOR', tx, ty, { width: halfWidth - 16 })
  ty += 13

  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.text)
  doc.text(`Nombre: ${data.customerName}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  doc.text(`NIT / CC: ${data.customerNit}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  doc.text(`Régimen: ${orDash(data.customerRegime)}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  doc.text(`Dirección: ${orDash(data.customerAddress)}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  doc.text(`Teléfono: ${orDash(data.customerPhone)}`, tx, ty, { width: halfWidth - 16 })
  ty += 11
  if (data.customerEmail) {
    doc.text(`Correo: ${data.customerEmail}`, tx, ty, { width: halfWidth - 16 })
  }

  doc.y = sectionY + boxHeight + 6
  doc.moveDown(0.3)

  // ── Element 5: RESOLUTION INFO ────────────────────────────────────
  const resBoxH = 36
  ensureSpace(doc, resBoxH + 6)

  doc.rect(MARGIN, doc.y, pageWidth, resBoxH).fillAndStroke('#f0f9ff', COLORS.border)
  const resY = doc.y + 6

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.primary)
  doc.text('RESOLUCIÓN DIAN', MARGIN + 8, resY, { width: pageWidth - 16 })

  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.text)
  doc.text(
    `Resolución: ${data.resolutionNumber} del ${formatDate(data.resolutionDate)}`,
    MARGIN + 8,
    resY + 12,
    { width: pageWidth - 16 },
  )
  doc.text(
    `Rango autorizado: ${data.prefix} ${String(data.startNumber).padStart(8, '0')} a ${data.prefix} ${String(data.endNumber).padStart(8, '0')}    |    Vigencia: ${formatDate(data.startDate)} al ${formatDate(data.endDate)}`,
    MARGIN + 8,
    resY + 23,
    { width: pageWidth - 16 },
  )

  doc.y = resY + resBoxH + 6
  doc.moveDown(0.3)

  // ── Element 7: ITEMS TABLE ────────────────────────────────────────
  ensureSpace(doc, 50)

  const tableHeaderH = 18
  const tableRowH = 16

  const hasTaxColumns = data.items.some(
    (i) => i.taxRate !== undefined && i.taxRate !== null,
  )

  // Column definitions — 5 columns normally, 6 when tax rates are present
  const itemColumns: Array<{ header: string; width: number; align: 'left' | 'center' | 'right' }> =
    hasTaxColumns
      ? (() => {
          const fixedTotal = 22 + 32 + 64 + 32 + 64 // 214
          const descWidth = pageWidth - fixedTotal
          return [
            { header: '#', width: 22, align: 'center' as const },
            { header: 'Descripción', width: descWidth, align: 'left' as const },
            { header: 'Cant', width: 32, align: 'center' as const },
            { header: 'P. Unit', width: 64, align: 'right' as const },
            { header: 'IVA %', width: 32, align: 'right' as const },
            { header: 'Total', width: 64, align: 'right' as const },
          ]
        })()
      : (() => {
          const fixedTotal = 22 + 32 + 64 + 64 // 182
          const descWidth = pageWidth - fixedTotal
          return [
            { header: '#', width: 22, align: 'center' as const },
            { header: 'Descripción', width: descWidth, align: 'left' as const },
            { header: 'Cant', width: 32, align: 'center' as const },
            { header: 'P. Unit', width: 64, align: 'right' as const },
            { header: 'Total', width: 64, align: 'right' as const },
          ]
        })()

  // Render column width-only subset for drawTableRow
  const colWidths = itemColumns.map((c) => ({ width: c.width, align: c.align }))

  // Table header
  let currentY = doc.y
  let colPositions = drawTableHeader(doc, MARGIN, currentY, pageWidth, itemColumns, tableHeaderH)
  currentY += tableHeaderH

  // Empty items notice
  if (data.items.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted)
    doc.text('No hay ítems en esta factura.', MARGIN + 4, currentY, {
      width: pageWidth - 8,
      align: 'center',
    })
    currentY += 20
  } else {
    // Table rows
    for (let idx = 0; idx < data.items.length; idx++) {
      const item = data.items[idx]
      const isEven = idx % 2 === 0
      const rowHeight = item.notes ? 22 : tableRowH

      // Page break check — re-draw header if new page
      const prevY = doc.y
      ensureSpace(doc, rowHeight + 4)
      if (doc.y < prevY) {
        currentY = doc.y
        colPositions = drawTableHeader(
          doc,
          MARGIN,
          currentY,
          pageWidth,
          itemColumns,
          tableHeaderH,
        )
        currentY += tableHeaderH
      }

      // Build row values
      const rowValues: Array<{ text: string; bold?: boolean }> = [
        { text: String(item.lineNumber || idx + 1) },
        {
          text: item.notes
            ? `${item.description} (${item.notes})`
            : item.description,
        },
        { text: formatQty(item.quantity) },
        { text: formatCOP(item.unitPrice) },
      ]

      if (hasTaxColumns) {
        rowValues.push({
          text: item.taxRate !== undefined ? `${item.taxRate}%` : '0%',
        })
      }

      rowValues.push({ text: formatCOP(item.totalRow), bold: true })

      drawTableRow(
        doc,
        MARGIN,
        currentY,
        pageWidth,
        colWidths,
        colPositions,
        rowValues,
        isEven,
        rowHeight,
      )

      currentY += rowHeight
    }

    // Summary row
    const summaryH = 14
    doc.rect(MARGIN, currentY, pageWidth, summaryH).fillAndStroke('#e9ecef', COLORS.border)
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.primary)

    const itemCount = data.items.length
    doc.text(
      `${itemCount} artículo${itemCount !== 1 ? 's' : ''}`,
      colPositions[1] + 4,
      currentY + 3,
      { width: itemColumns[1].width - 8, align: 'left' },
    )

    const itemsTotal = data.items.reduce((sum, i) => sum + i.totalRow, 0)
    const lastColIdx = colPositions.length - 1
    doc.text(
      formatCOP(itemsTotal),
      colPositions[lastColIdx] + 4,
      currentY + 3,
      { width: itemColumns[lastColIdx].width - 8, align: 'right' },
    )

    currentY += summaryH + 4
  }

  doc.y = currentY

  // ── Element 8: TAX BREAKDOWN ─────────────────────────────────────
  if (data.taxBreakdown.length > 0) {
    ensureSpace(doc, 16 + data.taxBreakdown.length * 14 + 10)
    doc.moveDown(0.4)

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primary)
    doc.text('Desglose de Impuestos', MARGIN, doc.y, { width: pageWidth })
    doc.moveDown(0.3)

    const taxHeaderH = 16
    const taxRowH = 14
    const taxCols: Array<{
      header: string
      width: number
      align: 'left' | 'center' | 'right'
    }> = [
      { header: 'Impuesto', width: Math.floor(pageWidth * 0.35), align: 'left' },
      { header: 'Base', width: Math.floor(pageWidth * 0.25), align: 'right' },
      { header: 'Tasa', width: Math.floor(pageWidth * 0.15), align: 'center' },
      { header: 'Valor', width: Math.floor(pageWidth * 0.25), align: 'right' },
    ]

    // Tax table header
    const taxTableY = doc.y
    const taxColPositions = drawTableHeader(
      doc,
      MARGIN,
      taxTableY,
      pageWidth,
      taxCols,
      taxHeaderH,
    )
    const taxColWidths = taxCols.map((c) => ({ width: c.width, align: c.align }))

    let taxRowY = taxTableY + taxHeaderH
    for (let ti = 0; ti < data.taxBreakdown.length; ti++) {
      const tax = data.taxBreakdown[ti]
      const isEven = ti % 2 === 0
      drawTableRow(
        doc,
        MARGIN,
        taxRowY,
        pageWidth,
        taxColWidths,
        taxColPositions,
        [
          { text: `${tax.name} (${tax.code})` },
          { text: formatCOP(tax.base) },
          { text: `${tax.rate}%` },
          { text: formatCOP(tax.amount) },
        ],
        isEven,
        taxRowH,
      )
      taxRowY += taxRowH
    }

    doc.y = taxRowY + 6
  }

  // ── Element 9: TOTALS SECTION (right-aligned) ─────────────────────
  ensureSpace(doc, 130)
  doc.moveDown(0.5)

  const totalsX = MARGIN + pageWidth * 0.45
  const totalsW = pageWidth * 0.55
  const totalLineH = 15

  // Subtotal
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
  doc.text('Subtotal (base gravable)', totalsX, doc.y, {
    width: totalsW * 0.55,
    align: 'right',
  })
  const subtotalLabelY = doc.y
  doc.text(
    formatCOP(data.subtotalBase),
    totalsX + totalsW * 0.58,
    subtotalLabelY - totalLineH,
    { width: totalsW * 0.42, align: 'right' },
  )
  doc.moveDown(0.2)

  // Taxes
  if (data.totalTaxAmount > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
    doc.text('(+/-) Impuestos', totalsX, doc.y, {
      width: totalsW * 0.55,
      align: 'right',
    })
    const taxLabelY = doc.y
    doc.text(
      formatCOP(data.totalTaxAmount),
      totalsX + totalsW * 0.58,
      taxLabelY - totalLineH,
      { width: totalsW * 0.42, align: 'right' },
    )
    doc.moveDown(0.2)
  }

  // Discount
  if (data.discountAmount > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.red)
    doc.text('(-) Descuento', totalsX, doc.y, {
      width: totalsW * 0.55,
      align: 'right',
    })
    const discLabelY = doc.y
    doc.text(
      `- ${formatCOP(data.discountAmount)}`,
      totalsX + totalsW * 0.58,
      discLabelY - totalLineH,
      { width: totalsW * 0.42, align: 'right' },
    )
    doc.moveDown(0.2)
  }

  // Tip
  if (data.tipAmount > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
    doc.text('(+) Propina', totalsX, doc.y, {
      width: totalsW * 0.55,
      align: 'right',
    })
    const tipLabelY = doc.y
    doc.text(
      formatCOP(data.tipAmount),
      totalsX + totalsW * 0.58,
      tipLabelY - totalLineH,
      { width: totalsW * 0.42, align: 'right' },
    )
    doc.moveDown(0.2)
  }

  // Total separator
  doc.moveDown(0.3)
  drawHR(doc, totalsX, doc.y, totalsW, COLORS.primary, 1.5)
  doc.moveDown(0.3)

  // TOTAL A PAGAR
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.primary)
  doc.text('TOTAL A PAGAR', totalsX, doc.y, {
    width: totalsW * 0.48,
    align: 'right',
  })
  const totalLabelY = doc.y
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.primary)
  doc.text(
    formatCOP(data.grandTotal),
    totalsX + totalsW * 0.50,
    totalLabelY - 20,
    { width: totalsW * 0.50, align: 'right' },
  )
  doc.moveDown(0.1)

  // Currency code
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
  doc.text(data.currencyCode, totalsX, doc.y, { width: totalsW, align: 'right' })
  doc.moveDown(0.6)

  // ── Element 10: PAYMENT METHOD ────────────────────────────────────
  drawHR(doc, MARGIN, doc.y, pageWidth, COLORS.border, 0.5)
  doc.moveDown(0.3)

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
  doc.text(
    `Forma de pago: ${getPaymentMethodName(data.paymentMethod)}`,
    MARGIN,
    doc.y,
    { width: pageWidth },
  )
  doc.moveDown(0.6)

  // ── Elements 6 & 11: CUFE + QR CODE ───────────────────────────────
  ensureSpace(doc, 180)
  drawHR(doc, MARGIN, doc.y, pageWidth, COLORS.border, 0.5)
  doc.moveDown(0.4)

  const qrSectionY = doc.y
  const qrDisplaySize = 100

  // QR Code image (left side)
  doc.image(qrPngBuffer, MARGIN, qrSectionY, {
    width: qrDisplaySize,
    height: qrDisplaySize,
  })

  // CUFE label + truncated value (right of QR)
  const cufeX = MARGIN + qrDisplaySize + 12
  const cufeWidth = pageWidth - qrDisplaySize - 12

  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.primary)
  doc.text('CUFE / CUDFE:', cufeX, qrSectionY, { width: cufeWidth })

  // Truncate CUFE to fit — show up to ~190 chars, then ellipsis
  const maxCufeChars = 190
  const displayCufe =
    data.cufe.length > maxCufeChars
      ? `${data.cufe.substring(0, maxCufeChars)}…`
      : data.cufe
  doc.font('Helvetica').fontSize(5.5).fillColor(COLORS.muted)
  doc.text(displayCufe, cufeX, doc.y + 2, { width: cufeWidth, lineGap: 0.5 })

  doc.y = qrSectionY + qrDisplaySize + 10

  // ── Element 12: Mandatory representation text ─────────────────────
  doc.moveDown(0.3)
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLORS.muted)
  doc.text(
    'Representación gráfica de la factura electrónica de venta',
    MARGIN,
    doc.y,
    { width: pageWidth, align: 'center' },
  )
  doc.moveDown(0.15)

  const catalogUrl = data.testMode
    ? 'https://catalogo-vpfe-hab.dian.gov.co'
    : 'https://catalogo-vpfe.dian.gov.co'
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
  doc.text(
    `Consulte la autenticidad en: ${catalogUrl}`,
    MARGIN,
    doc.y,
    { width: pageWidth, align: 'center' },
  )
  doc.moveDown(0.2)

  // Validated status note
  if (data.status === 'VALIDATED' || data.status === 'DELIVERED') {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.green)
    doc.text(
      '✓ Factura VALIDADA por la DIAN',
      MARGIN,
      doc.y,
      { width: pageWidth, align: 'center' },
    )
    doc.moveDown(0.2)
  }

  // Notes
  if (data.notes) {
    doc.moveDown(0.2)
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLORS.muted)
    doc.text(`Notas: ${data.notes}`, MARGIN, doc.y, {
      width: pageWidth,
      align: 'center',
    })
  }

  // ── PAGE NUMBERS (before finalize) ────────────────────────────────
  const pages = doc.bufferedPageRange()
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i)
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    doc.text(
      `Página ${i + 1} de ${pages.count}`,
      MARGIN,
      doc.page.height - MARGIN + 10,
      { width: doc.page.width - MARGIN * 2, align: 'center' },
    )
  }

  // ── Collect PDF bytes ─────────────────────────────────────────────
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}
