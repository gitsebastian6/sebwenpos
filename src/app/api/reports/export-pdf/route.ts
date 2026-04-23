import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { requireStoreAccess } from '@/lib/api-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const MARGIN = 40
const ROW_HEIGHT = 18
const HEADER_HEIGHT = 22
const CELL_PADDING = 4

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const parsed = z.object({
      storeId: z.number().int().positive(),
      storeName: z.string().optional(),
      title: z.string(),
      subtitle: z.string().optional(),
      headers: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number()]))),
      columnAligns: z.array(z.enum(['left', 'center', 'right'])).optional(),
    }).safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { storeId, storeName, title, subtitle, headers, rows, columnAligns } = parsed.data

    const authError = requireStoreAccess(req, storeId)
    if (authError) return authError

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true })
    const buffers: Buffer[] = []
    doc.on('data', (chunk: Buffer) => buffers.push(chunk))

    const pageWidth = doc.page.width - MARGIN * 2
    const colCount = headers.length
    const colWidth = Math.min(pageWidth / colCount, 160)
    const tableWidth = colWidth * colCount

    // ── Header ──
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#111111')
    doc.text(storeName || 'Ventify POS', MARGIN, MARGIN, { width: pageWidth, align: 'center' })

    doc.moveDown(0.3)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#333333')
    doc.text(title, MARGIN, doc.y, { width: pageWidth, align: 'center' })

    if (subtitle) {
      doc.moveDown(0.2)
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
      doc.text(subtitle, MARGIN, doc.y, { width: pageWidth, align: 'center' })
    }

    doc.moveDown(0.8)

    // ── Table Header ──
    const tableStartX = MARGIN + (pageWidth - tableWidth) / 2
    const tableY = doc.y

    // Header background
    doc.rect(tableStartX, tableY, tableWidth, HEADER_HEIGHT).fill('#333333')

    // Header text
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
    headers.forEach((header, i) => {
      const align = (columnAligns?.[i] === 'right' || columnAligns?.[i] === 'center')
        ? columnAligns[i] as 'right' | 'center'
        : 'left'
      const x = tableStartX + i * colWidth + CELL_PADDING
      const y = tableY + 5
      doc.text(String(header), x, y, { width: colWidth - CELL_PADDING * 2, align })
    })

    // ── Table Rows ──
    doc.font('Helvetica').fontSize(7.5).fillColor('#222222')
    let currentY = tableY + HEADER_HEIGHT

    for (let r = 0; r < rows.length; r++) {
      // Check if we need a new page
      if (currentY + ROW_HEIGHT > doc.page.height - MARGIN - 40) {
        doc.addPage()
        currentY = MARGIN
      }

      const row = rows[r]

      // Alternating row background
      if (r % 2 === 1) {
        doc.rect(tableStartX, currentY, tableWidth, ROW_HEIGHT).fill('#F5F5F5')
      }

      // Row text
      row.forEach((cell, i) => {
        const align = columnAligns?.[i] || (typeof cell === 'number' ? 'right' : 'left')
        const x = tableStartX + i * colWidth + CELL_PADDING
        const y = currentY + 4
        doc.fillColor('#222222')
        doc.text(String(cell ?? ''), x, y, { width: colWidth - CELL_PADDING * 2, align: align as 'left' | 'right' | 'center' })
      })

      // Row border
      doc.rect(tableStartX, currentY, tableWidth, ROW_HEIGHT).stroke('#DDDDDD')
      currentY += ROW_HEIGHT
    }

    // ── Footer ──
    const footerY = Math.max(currentY + 20, doc.page.height - MARGIN - 30)
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
    doc.text(
      `Generado por Ventify POS · ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      MARGIN,
      footerY,
      { width: pageWidth, align: 'center' }
    )

    // ── Finalize ──
    doc.end()

    await new Promise<void>((resolve) => doc.on('end', () => resolve()))

    const pdfBuffer = Buffer.concat(buffers)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9áéíóúñ ]/g, '').replace(/\s+/g, '_')}.pdf"`,
      },
    })
  } catch (error: unknown) {
    console.error('PDF export error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error generando PDF' }, { status: 500 })
  }
}
