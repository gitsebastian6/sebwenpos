import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateInvoicePDF, type InvoicePDFData } from '@/lib/invoicing/pdf-generator'
import { formatInvoiceNumber } from '@/lib/invoice-utils'

export const dynamic = 'force-dynamic'

// ─── GET: Generar y devolver PDF de la factura ───────────────────────────────
// GET /api/invoices/[id]/pdf?storeId=X
//
// Genera una representacion grafica PDF de la factura electronica
// conforme a los 12 elementos obligatorios de la DIAN (Resolucion 000042/2020).
// Devuelve el archivo PDF para descarga directa.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    // 1. Obtener factura completa con orden, items y tienda
    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                product: { select: { name: true } },
                service: { select: { name: true } },
              },
            },
          },
        },
        store: {
          select: {
            name: true,
            legalName: true,
            nit: true,
            address: true,
            phone: true,
            email: true,
            currencyCode: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const store = invoice.store
    const order = invoice.order

    // 2. Construir datos para el PDF
    const createdAt = invoice.createdAt

    // Desglose de impuestos
    const taxBreakdown: Array<{
      code: string
      name: string
      base: number
      rate: number
      amount: number
    }> = JSON.parse(invoice.taxBreakdown || '[]')

    // Items de la orden
    const items = (order?.orderItems || []).map((item: any, idx: number) => ({
      lineNumber: idx + 1,
      description: item.product?.name ?? item.service?.name ?? 'Eliminado',
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalRow: Number(item.totalRow),
      taxCode: item.taxCode || undefined,
      taxRate: item.taxRate || undefined,
      taxAmount: item.taxAmount > 0 ? Number(item.taxAmount) : undefined,
      notes: item.notes || undefined,
    }))

    // Mensaje DIAN
    let dianMessage: string | undefined
    if (invoice.dianResponse) {
      try {
        const dianData = JSON.parse(invoice.dianResponse)
        const pollResult = dianData.pollResult
        if (pollResult?.statusMessage) {
          dianMessage = pollResult.statusMessage
        } else if (dianData.errorMessage) {
          dianMessage = dianData.errorMessage
        }
      } catch {
        // No es JSON valido, ignorar
      }
    }

    // URL del codigo QR (usar la almacenada o generar una por defecto)
    const qrCodeUrl = invoice.qrCode || `https://catalogo-vpfe-hab.dian.gov.co/documento/consultar?uuid=${invoice.cufe || ''}`

    const pdfData: InvoicePDFData = {
      invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
      consecutive: invoice.consecutive,
      cufe: invoice.cufe || 'Sin CUFE',
      issueDate: createdAt.toISOString().slice(0, 10),
      issueTime: `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`,
      status: invoice.status,
      dianMessage,
      notes: invoice.notes || undefined,
      // Resolucion
      resolutionNumber: invoice.resolutionNumber || 'N/A',
      resolutionDate: invoice.resolutionDate?.toISOString().slice(0, 10) || createdAt.toISOString().slice(0, 10),
      startDate: invoice.startDate?.toISOString().slice(0, 10) || '',
      endDate: invoice.endDate?.toISOString().slice(0, 10) || '',
      prefix: invoice.prefix,
      startNumber: invoice.startNumber || 1,
      endNumber: invoice.endNumber || 99999,
      // Emisor
      supplierNit: store.nit || '',
      supplierName: store.name || '',
      supplierLegalName: store.legalName || store.name || '',
      supplierAddress: store.address || '',
      supplierPhone: store.phone || '',
      supplierEmail: store.email || undefined,
      // Receptor
      customerNit: invoice.customerNit || '',
      customerName: invoice.customerName || 'Consumidor Final',
      customerAddress: invoice.customerAddress || undefined,
      customerPhone: invoice.customerPhone || undefined,
      customerEmail: invoice.customerEmail || undefined,
      customerRegime: invoice.customerRegime || undefined,
      // Items
      items,
      // Totales
      subtotalBase: Number(invoice.subtotalBase),
      totalTaxAmount: Number(invoice.totalTaxAmount),
      totalWithTax: Number(invoice.totalWithTax),
      discountAmount: Number(invoice.discountAmount),
      tipAmount: Number(invoice.tipAmount),
      grandTotal: Number(invoice.grandTotal),
      currencyCode: store.currencyCode || 'COP',
      // Desglose de impuestos
      taxBreakdown,
      // Metodo de pago
      paymentMethod: invoice.paymentMethod || '1',
      // QR
      qrCodeUrl,
      // Test mode
      testMode: invoice.testMode,
    }

    // 3. Generar PDF
    const pdfBuffer = await generateInvoicePDF(pdfData)

    // 4. Devolver como archivo descargable
    const filename = `Factura_${pdfData.invoiceNumber}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error('GET /api/invoices/[id]/pdf error:', error)
    return NextResponse.json(
      { error: 'Error interno al generar el PDF de la factura' },
      { status: 500 },
    )
  }
}
