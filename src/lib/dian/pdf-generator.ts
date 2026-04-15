import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvoicePDFData {
  // Store data
  storeName: string
  storeLegalName?: string
  storeNit: string
  storeAddress?: string
  storePhone?: string
  storeEmail?: string

  // Resolution
  prefix: string
  consecutive: number
  resolutionNumber: string
  resolutionStartDate: string   // YYYY-MM-DD
  resolutionEndDate: string
  resolutionStartNumber: number
  resolutionEndNumber: number

  // Customer
  customerNit: string
  customerName: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  customerRegime?: string

  // Invoice
  invoiceNumber: string          // formatted "FE-00000001"
  issueDate: string              // YYYY-MM-DD
  issueTime: string              // HH:mm
  currencyCode: string

  // Monetary (integers in COP)
  subtotalBase: number
  taxExemptAmount: number
  totalTaxAmount: number
  totalWithTax: number
  discountAmount: number
  tipAmount: number
  grandTotal: number

  // Tax breakdown
  taxBreakdown: Array<{
    code: string
    name: string
    base: number
    rate: number
    amount: number
  }>

  // Items
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
    taxRate: number
    taxAmount: number
    notes?: string
  }>

  // DIAN
  cufe: string
  qrCodeURL: string
  paymentMethod: string          // DIAN code
  status: string
  notes?: string
  testMode: boolean
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  primary: '#1a1a2e',      // dark navy
  accent: '#e94560',       // red for totals and warnings
  lightGray: '#f8f9fa',    // table alternate rows
  border: '#dee2e6',       // borders
  white: '#ffffff',
  muted: '#6c757d',        // secondary text
  darkBorder: '#343a40',   // stronger border
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format number as COP currency: "$50.000" (dots for thousands).
 */
function formatCOP(value: number): string {
  const rounded = Math.round(value)
  const withDots = rounded.toLocaleString('es-CO')
  return `$${withDots}`
}

/**
 * DIAN payment method code → human-readable label.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  '1': 'Efectivo',
  '2': 'Tarjeta',
  '10': 'Transferencia / Consignación',
  '42': 'Daviplata / Nequi / Billetera Móvil',
  '99': 'Otro',
}

function getPaymentLabel(code: string): string {
  return PAYMENT_METHOD_LABELS[code] ?? 'No especificado'
}

/**
 * Format YYYY-MM-DD to a human-readable Colombian date.
 */
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${parseInt(d, 10)} de ${months[parseInt(m, 10) - 1]} de ${y}`
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

/**
 * Generate a professional PDF representation of a Colombian electronic invoice.
 * Uses letter/A4 size with proper DIAN-required fields and layout.
 */
export async function generateInvoicePDF(data: InvoicePDFData): Promise<Buffer> {
  return new Promise<Buffer>(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: false,
        info: {
          Title: `Factura Electrónica ${data.invoiceNumber}`,
          Author: data.storeName,
          Subject: `Factura Electrónica de Venta - ${data.invoiceNumber}`,
          Creator: 'DIAN Electronic Invoicing System',
        },
      })

      const buffers: Buffer[] = []
      doc.on('data', (chunk) => buffers.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
      const margin = doc.page.margins.left

      // ─── QR Code ───────────────────────────────────────────────────
      const qrBuffer = await QRCode.toBuffer(data.qrCodeURL, {
        type: 'png',
        width: 150,
      })

      // ─── 1. HEADER ─────────────────────────────────────────────────
      // Store name – large bold
      doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.primary)
      doc.text(data.storeName, margin, 40, { width: pageWidth })

      if (data.storeLegalName && data.storeLegalName !== data.storeName) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
        doc.text(data.storeLegalName, margin, doc.y + 2, { width: pageWidth })
      }

      // Store details row
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      const storeDetails = [
        data.storeNit ? `NIT: ${data.storeNit}` : '',
        data.storeAddress ? data.storeAddress : '',
        data.storePhone ? `Tel: ${data.storePhone}` : '',
        data.storeEmail ? data.storeEmail : '',
      ].filter(Boolean).join('  |  ')
      doc.text(storeDetails, margin, doc.y + 3, { width: pageWidth })

      // Separator line
      doc.moveDown(0.5)
      doc.moveTo(margin, doc.y).lineTo(margin + pageWidth, doc.y)
        .lineWidth(1).strokeColor(COLORS.accent).stroke()
      doc.moveDown(0.5)

      // ─── 2. TITLE ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.primary)
      doc.text('FACTURA ELECTRÓNICA DE VENTA', margin, doc.y, {
        width: pageWidth,
        align: 'center',
      })
      doc.moveDown(0.3)

      // ─── 3. INVOICE NUMBER ─────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.accent)
      doc.text(data.invoiceNumber, margin, doc.y, {
        width: pageWidth,
        align: 'center',
      })
      doc.moveDown(0.3)

      // ─── 4. DATE / TIME ────────────────────────────────────────────
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
      doc.text(`Fecha: ${formatDate(data.issueDate)}  Hora: ${data.issueTime}`, margin, doc.y, {
        width: pageWidth,
        align: 'center',
      })
      doc.moveDown(0.4)

      // ─── 5. RESOLUTION INFO ────────────────────────────────────────
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
      const resText = `Resolución DIAN ${data.resolutionNumber} del ${formatDate(data.resolutionStartDate)} — Rango autorizado: ${data.resolutionStartNumber} a ${data.resolutionEndNumber} — Vencimiento: ${formatDate(data.resolutionEndDate)}`
      doc.text(resText, margin, doc.y, { width: pageWidth, align: 'center' })
      doc.moveDown(0.6)

      // ─── 6. CUSTOMER SECTION ───────────────────────────────────────
      // Customer box
      const custY = doc.y
      doc.moveTo(margin, custY).lineTo(margin + pageWidth, custY)
        .lineWidth(0.5).strokeColor(COLORS.border).stroke()
      doc.rect(margin, custY, pageWidth, 52).fillAndStroke(COLORS.lightGray, COLORS.border)
      doc.fillColor(COLORS.primary)

      doc.font('Helvetica-Bold').fontSize(8)
      doc.text('DATOS DEL CLIENTE', margin + 6, custY + 4)

      doc.font('Helvetica').fontSize(8)
      doc.text(`NIT / CC: ${data.customerNit}`, margin + 6, custY + 16)
      doc.text(`Nombre: ${data.customerName}`, margin + 6, custY + 28)

      const custLine3 = [
        data.customerRegime ? `Régimen: ${data.customerRegime}` : '',
        data.customerPhone ? `Tel: ${data.customerPhone}` : '',
        data.customerEmail ? data.customerEmail : '',
      ].filter(Boolean).join('  |  ')
      if (custLine3) {
        doc.text(custLine3, margin + 6, custY + 40, { width: pageWidth - 12 })
      }

      doc.y = custY + 58

      // ─── 7. ITEMS TABLE ────────────────────────────────────────────
      doc.moveDown(0.3)
      const tableY = doc.y

      // Table header
      const colWidths = [22, pageWidth * 0.32, 30, 58, 32, 60, 50, 60]
      // Adjust to match exactly pageWidth
      const totalColWidth = colWidths.reduce((a, b) => a + b, 0)
      const diff = pageWidth - totalColWidth
      colWidths[1] += diff // absorb rounding difference into description column

      const headers = ['#', 'Descripción', 'Cant', 'P. Unit', 'IVA %', 'Base', 'IVA', 'Total']
      const headerX: number[] = []
      let cx = margin
      for (const w of colWidths) {
        headerX.push(cx)
        cx += w
      }

      // Header background
      doc.rect(margin, tableY, pageWidth, 16).fill('#2d2d44')
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.white)

      for (let i = 0; i < headers.length; i++) {
        const align = i === 0 || i === 2 ? 'center' : i === 1 ? 'left' : 'right'
        doc.text(headers[i], headerX[i] + 3, tableY + 4, {
          width: colWidths[i] - 6,
          align: align as any,
        })
      }

      let rowY = tableY + 16

      // Table rows
      doc.font('Helvetica').fontSize(7)
      for (let idx = 0; idx < data.items.length; idx++) {
        const item = data.items[idx]
        const isEven = idx % 2 === 0

        // Row background
        const rowH = item.notes ? 22 : 16
        doc.rect(margin, rowY, pageWidth, rowH)
          .fillAndStroke(isEven ? COLORS.white : COLORS.lightGray, COLORS.border)

        doc.fillColor(COLORS.primary)

        // Row number
        doc.font('Helvetica').fontSize(7)
        doc.text(String(idx + 1), headerX[0] + 3, rowY + 4, {
          width: colWidths[0] - 6,
          align: 'center',
        })

        // Description
        const descText = item.notes ? `${item.description} (${item.notes})` : item.description
        doc.text(descText, headerX[1] + 3, rowY + 4, {
          width: colWidths[1] - 6,
          align: 'left',
          lineBreak: false,
          ellipsis: true,
        })

        // Quantity
        doc.text(String(item.quantity), headerX[2] + 3, rowY + 4, {
          width: colWidths[2] - 6,
          align: 'center',
        })

        // Unit price
        doc.text(formatCOP(item.unitPrice), headerX[3] + 3, rowY + 4, {
          width: colWidths[3] - 6,
          align: 'right',
        })

        // IVA %
        doc.text(`${item.taxRate}%`, headerX[4] + 3, rowY + 4, {
          width: colWidths[4] - 6,
          align: 'right',
        })

        // Base
        doc.text(formatCOP(item.unitPrice * item.quantity - item.taxAmount), headerX[5] + 3, rowY + 4, {
          width: colWidths[5] - 6,
          align: 'right',
        })

        // IVA amount
        doc.text(formatCOP(item.taxAmount), headerX[6] + 3, rowY + 4, {
          width: colWidths[6] - 6,
          align: 'right',
        })

        // Total
        doc.font('Helvetica-Bold').fontSize(7)
        doc.text(formatCOP(item.total), headerX[7] + 3, rowY + 4, {
          width: colWidths[7] - 6,
          align: 'right',
        })

        rowY += rowH
      }

      // Summary row
      const summaryItems = data.items.length
      doc.rect(margin, rowY, pageWidth, 14).fillAndStroke('#e9ecef', COLORS.border)
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.primary)
      doc.text(`${summaryItems} artículo${summaryItems !== 1 ? 's' : ''}`, headerX[1] + 3, rowY + 3, {
        width: colWidths[1] - 6,
        align: 'left',
      })

      // Subtotal in summary
      const itemsTotal = data.items.reduce((s, i) => s + i.total, 0)
      doc.text(formatCOP(itemsTotal), headerX[7] + 3, rowY + 3, {
        width: colWidths[7] - 6,
        align: 'right',
      })

      rowY += 18

      // ─── 8. TOTALS SECTION ─────────────────────────────────────────
      doc.y = rowY
      doc.moveDown(0.3)

      const totalsX = margin + pageWidth * 0.42
      const totalsW = pageWidth * 0.58
      const lineH = 14

      // Subtotal
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
      doc.text('Subtotal (base gravable)', totalsX, doc.y, { width: totalsW * 0.6, align: 'right' })
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
      doc.text(formatCOP(data.subtotalBase), totalsX + totalsW * 0.62, doc.y - lineH, {
        width: totalsW * 0.38,
        align: 'right',
      })
      doc.moveDown(0.2)

      // Exento
      if (data.taxExemptAmount > 0) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
        doc.text('Exento', totalsX, doc.y, { width: totalsW * 0.6, align: 'right' })
        doc.text(formatCOP(data.taxExemptAmount), totalsX + totalsW * 0.62, doc.y - lineH, {
          width: totalsW * 0.38,
          align: 'right',
        })
        doc.moveDown(0.2)
      }

      // IVA breakdown by rate
      for (const tax of data.taxBreakdown) {
        if (tax.code === '03' || tax.code === '04') continue // skip exempt/excluded
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
        doc.text(`IVA ${tax.rate}% (sobre ${formatCOP(tax.base)})`, totalsX, doc.y, {
          width: totalsW * 0.6,
          align: 'right',
        })
        doc.text(formatCOP(tax.amount), totalsX + totalsW * 0.62, doc.y - lineH, {
          width: totalsW * 0.38,
          align: 'right',
        })
        doc.moveDown(0.2)
      }

      // Descuento
      if (data.discountAmount > 0) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
        doc.text('Descuento', totalsX, doc.y, { width: totalsW * 0.6, align: 'right' })
        doc.text(`- ${formatCOP(data.discountAmount)}`, totalsX + totalsW * 0.62, doc.y - lineH, {
          width: totalsW * 0.38,
          align: 'right',
        })
        doc.moveDown(0.2)
      }

      // Propina
      if (data.tipAmount > 0) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
        doc.text('Propina', totalsX, doc.y, { width: totalsW * 0.6, align: 'right' })
        doc.text(formatCOP(data.tipAmount), totalsX + totalsW * 0.62, doc.y - lineH, {
          width: totalsW * 0.38,
          align: 'right',
        })
        doc.moveDown(0.2)
      }

      // Separator before total
      doc.moveDown(0.2)
      doc.moveTo(totalsX, doc.y).lineTo(totalsX + totalsW, doc.y)
        .lineWidth(1.5).strokeColor(COLORS.accent).stroke()
      doc.moveDown(0.3)

      // TOTAL A PAGAR
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.accent)
      doc.text('TOTAL A PAGAR', totalsX, doc.y, { width: totalsW * 0.5, align: 'right' })
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.accent)
      doc.text(formatCOP(data.grandTotal), totalsX + totalsW * 0.52, doc.y - 18, {
        width: totalsW * 0.48,
        align: 'right',
      })
      doc.moveDown(0.3)

      // ─── 9. PAYMENT METHOD ─────────────────────────────────────────
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary)
      doc.text(`Método de pago: ${getPaymentLabel(data.paymentMethod)}`, margin, doc.y)
      doc.moveDown(0.6)

      // ─── 10. QR CODE + CUFE ────────────────────────────────────────
      // Check if we need a new page
      const qrSize = 120
      const bottomSpace = doc.page.height - doc.page.margins.bottom
      if (doc.y + qrSize + 80 > bottomSpace) {
        doc.addPage()
      }

      const qrY = doc.y

      // QR Code image on the left
      doc.image(qrBuffer, margin, qrY, { width: qrSize, height: qrSize })

      // CUFE on the right of QR
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.primary)
      doc.text('CUFE:', margin + qrSize + 10, qrY + 4)

      doc.font('Helvetica').fontSize(5.5).fillColor(COLORS.muted)
      // Split CUFE into multiple lines if needed
      doc.text(data.cufe, margin + qrSize + 10, qrY + 14, {
        width: pageWidth - qrSize - 20,
        lineGap: 1,
      })

      doc.y = qrY + qrSize + 8

      // ─── 12. FOOTER ────────────────────────────────────────────────
      doc.moveDown(0.4)
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLORS.muted)
      const footerText1 = 'Representación gráfica de la factura electrónica de venta'
      doc.text(footerText1, margin, doc.y, { width: pageWidth, align: 'center' })

      const verifyUrl = data.testMode
        ? 'https://catalogo-vpfe-hab.dian.gov.co/documento/consultar'
        : 'https://catalogo-vpfe.dian.gov.co/documento/consultar'
      const footerText2 = `Consulte la autenticidad en: ${verifyUrl}`
      doc.text(footerText2, margin, doc.y + 2, { width: pageWidth, align: 'center' })

      // Test mode warning
      if (data.testMode) {
        doc.moveDown(0.3)
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.accent)
        doc.text('DOCUMENTO DE PRUEBA - SIN VALOR COMERCIAL', margin, doc.y, {
          width: pageWidth,
          align: 'center',
        })
      }

      // Notes
      if (data.notes) {
        doc.moveDown(0.3)
        doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLORS.muted)
        doc.text(`Notas: ${data.notes}`, margin, doc.y, { width: pageWidth })
      }

      // ─── Finalize ──────────────────────────────────────────────────
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Generate invoice PDF and return as base64 string.
 */
export async function generateInvoicePDFBase64(data: InvoicePDFData): Promise<string> {
  const buffer = await generateInvoicePDF(data)
  return buffer.toString('base64')
}
