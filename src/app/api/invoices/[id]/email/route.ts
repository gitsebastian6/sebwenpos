import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { generateInvoicePDF, type InvoicePDFData } from '@/lib/invoicing/pdf-generator'
import { sendInvoiceEmail } from '@/lib/invoicing/email-sender'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// ─── Esquema de validacion ──────────────────────────────────────────────────

const sendEmailSchema = z.object({
  to: z.string().email('Email invalido').max(200).optional(),
})

// ─── POST: Enviar factura por correo electronico ────────────────────────────
// POST /api/invoices/[id]/email?storeId=X
//
// Genera el PDF de la factura y lo envia por correo electronico al cliente.
// Si se proporciona `to` en el body, usa ese email en lugar del del cliente.

export async function POST(
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

    // 1. Validar body
    const body = await request.json()
    const data = sendEmailSchema.parse(body)

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    // 2. Obtener factura completa con orden, items y tienda
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
            user: { select: { email: true } },
            currencyCode: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // 3. Determinar email de destino
    const recipientEmail = data.to || invoice.customerEmail

    if (!recipientEmail) {
      return NextResponse.json(
        {
          error: 'No se encontro correo electronico del cliente. Proporcione un email en el campo "to".',
        },
        { status: 400 },
      )
    }

    const store = invoice.store
    const order = invoice.order

    // 4. Construir datos para el PDF
    const createdAt = invoice.createdAt
    const taxBreakdown = JSON.parse(invoice.taxBreakdown || '[]')

    const items = (order?.orderItems || []).map((item, idx) => ({
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

    const qrCodeUrl = invoice.qrCode || `https://catalogo-vpfe-hab.dian.gov.co/documento/consultar?uuid=${invoice.cufe || ''}`

    const pdfData: InvoicePDFData = {
      invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
      consecutive: invoice.consecutive,
      cufe: invoice.cufe || 'Sin CUFE',
      issueDate: createdAt.toISOString().slice(0, 10),
      issueTime: `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`,
      status: invoice.status,
      notes: invoice.notes || undefined,
      resolutionNumber: invoice.resolutionNumber || 'N/A',
      resolutionDate: invoice.resolutionDate?.toISOString().slice(0, 10) || createdAt.toISOString().slice(0, 10),
      startDate: invoice.startDate?.toISOString().slice(0, 10) || '',
      endDate: invoice.endDate?.toISOString().slice(0, 10) || '',
      prefix: invoice.prefix,
      startNumber: invoice.startNumber || 1,
      endNumber: invoice.endNumber || 99999,
      supplierNit: store.nit || '',
      supplierName: store.name || '',
      supplierLegalName: store.legalName || store.name || '',
      supplierAddress: store.address || '',
      supplierPhone: store.phone || '',
      supplierEmail: store.user?.email || undefined,
      customerNit: invoice.customerNit || '',
      customerName: invoice.customerName || 'Consumidor Final',
      customerAddress: invoice.customerAddress || undefined,
      customerPhone: invoice.customerPhone || undefined,
      customerEmail: invoice.customerEmail || undefined,
      customerRegime: invoice.customerRegime || undefined,
      items,
      subtotalBase: Number(invoice.subtotalBase),
      totalTaxAmount: Number(invoice.totalTaxAmount),
      totalWithTax: Number(invoice.totalWithTax),
      discountAmount: Number(invoice.discountAmount),
      tipAmount: Number(invoice.tipAmount),
      grandTotal: Number(invoice.grandTotal),
      currencyCode: store.currencyCode || 'COP',
      taxBreakdown,
      paymentMethod: invoice.paymentMethod || '1',
      qrCodeUrl,
      testMode: invoice.testMode,
    }

    // 5. Generar PDF
    const pdfBuffer = await generateInvoicePDF(pdfData)

    // 6. Enviar email
    const emailResult = await sendInvoiceEmail({
      to: recipientEmail,
      customerName: invoice.customerName || 'Cliente',
      invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
      issueDate: createdAt.toISOString().slice(0, 10),
      grandTotal: Number(invoice.grandTotal),
      currencyCode: store.currencyCode || 'COP',
      supplierName: store.name || '',
      supplierPhone: store.phone || '',
      supplierEmail: store.user?.email || '',
      supplierNit: store.nit || '',
      cufe: invoice.cufe || '',
      status: invoice.status,
      xmlContent: invoice.xmlContent || undefined,
      pdfBuffer,
    })

    if (!emailResult.success) {
      return NextResponse.json(
        {
          error: `Error al enviar el correo: ${emailResult.error || 'Error desconocido'}`,
        },
        { status: 502 },
      )
    }

    // 7. Actualizar emailedAt
    await db.invoice.update({
      where: { id: Number(id) },
      data: { emailedAt: new Date() },
    })

    return NextResponse.json({
      message: `Factura ${formatInvoiceNumber(invoice.prefix, invoice.consecutive)} enviada exitosamente a ${recipientEmail}`,
      messageId: emailResult.messageId,
      emailedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/invoices/[id]/email error:', error)
    return NextResponse.json(
      { error: 'Error interno al enviar la factura por correo electronico' },
      { status: 500 },
    )
  }
}
