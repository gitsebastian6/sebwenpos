import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  generateCUFE,
  generateQRCodeURL,
  getDIANPaymentCode,
  formatInvoiceNumber,
  calculateInvoiceFromOrder,
} from '@/lib/invoice-utils'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validacion ───────────────────────────────────────────────

const createInvoiceSchema = z.object({
  orderId: z.number().int().positive('El orderId es requerido y debe ser positivo'),
  customerNit: z.string().max(20).optional().default('222222222222'),
  customerName: z.string().max(200).optional().default('Consumidor Final'),
  customerAddress: z.string().max(300).optional(),
  customerPhone: z.string().max(30).optional(),
  customerEmail: z.string().email('Email invalido').max(200).optional().or(z.literal('')),
  customerRegime: z.enum(['RESPONSABLE', 'NO_RESPONSABLE', 'SIMPLIFICADO']).optional().default('NO_RESPONSABLE'),
  customerType: z.enum(['CC', 'NIT', 'CE', 'TI', 'PP']).optional().default('CC'),
  notes: z.string().max(500).optional(),
  testMode: z.boolean().optional().default(true),
})

// ─── GET: Listar facturas ────────────────────────────────────────────────
// GET /api/invoices?storeId=X&status=Y&from=DATE&to=DATE&q=CONSECUTIVE

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const q = searchParams.get('q')?.trim()

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const where: any = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (from || to) {
      where.createdAt = {}
      if (from) {
        where.createdAt.gte = new Date(from)
      }
      if (to) {
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = endDate
      }
    }

    if (q) {
      // Buscar por numero consecutivo formateado (ej: "FE-00000001")
      where.OR = [
        { prefix: { contains: q } },
      ]
      // Si el query es numerico, buscar por consecutivo exacto
      const numericQ = parseInt(q, 10)
      if (!isNaN(numericQ)) {
        where.OR.push({ consecutive: numericQ })
      }
    }

    const invoices = await db.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prefix: true,
        consecutive: true,
        customerNit: true,
        customerName: true,
        subtotalBase: true,
        totalTaxAmount: true,
        grandTotal: true,
        status: true,
        testMode: true,
        cufe: true,
        createdAt: true,
        validatedAt: true,
        order: {
          select: {
            orderNumber: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    const result = invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: formatInvoiceNumber(inv.prefix, inv.consecutive),
      prefix: inv.prefix,
      consecutive: inv.consecutive,
      customerNit: inv.customerNit,
      customerName: inv.customerName ?? inv.order?.customer?.name ?? 'Consumidor Final',
      orderNumber: inv.order?.orderNumber ?? null,
      subtotalBase: Number(inv.subtotalBase),
      totalTaxAmount: Number(inv.totalTaxAmount),
      grandTotal: Number(inv.grandTotal),
      status: inv.status,
      testMode: inv.testMode,
      hasCUFE: !!inv.cufe,
      createdAt: inv.createdAt.toISOString(),
      validatedAt: inv.validatedAt?.toISOString() ?? null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/invoices error:', error)
    return NextResponse.json({ error: 'Error interno al consultar facturas' }, { status: 500 })
  }
}

// ─── POST: Crear factura desde una orden existente ────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createInvoiceSchema.parse(body)

    // 1. Buscar la orden con todos sus items
    const order = await db.order.findUnique({
      where: { id: data.orderId },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true } },
            service: { select: { name: true } },
          },
        },
        customer: { select: { name: true, nit: true, address: true, phone: true, email: true, regime: true, documentType: true } },
        store: { select: { id: true, name: true, legalName: true, nit: true, address: true, currencyCode: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.status === 'CANCELLED') {
      return NextResponse.json({ error: 'No se puede facturar una orden cancelada' }, { status: 400 })
    }

    // 2. Verificar que la orden no tenga ya una factura
    const existingInvoice = await db.invoice.findFirst({
      where: { orderId: data.orderId },
    })
    if (existingInvoice) {
      return NextResponse.json(
        { error: `Esta orden ya tiene una factura asociada: ${formatInvoiceNumber(existingInvoice.prefix, existingInvoice.consecutive)}` },
        { status: 409 },
      )
    }

    // 3. Informacion de la tienda
    const store = order.store
    if (!store.nit) {
      return NextResponse.json(
        { error: 'La tienda no tiene NIT configurado. Configure el NIT en la configuracion de la tienda.' },
        { status: 400 },
      )
    }

    // 4. Calcular consecutivo (ultimo consecutivo de la tienda + 1)
    const lastInvoice = await db.invoice.findFirst({
      where: { storeId: store.id },
      orderBy: { consecutive: 'desc' },
      select: { consecutive: true },
    })
    const nextConsecutive = (lastInvoice?.consecutive ?? 0) + 1
    const prefix = 'FE'

    // 5. Calcular campos tributarios desde la orden
    const calculation = calculateInvoiceFromOrder(order, order.orderItems)
    const paymentMethodCode = getDIANPaymentCode(order.paymentMethod)

    // 6. Generar fecha/hora para CUFE
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const issueTime = `${hours}${minutes}${seconds}000` // HHmmssSSS

    // 7. Generar CUFE
    const customerNit = data.customerNit || order.customer?.nit || '222222222222'
    const cufe = generateCUFE({
      storeNit: store.nit,
      issueDate,
      issueTime,
      prefix,
      consecutive: nextConsecutive,
      customerNit,
      subtotalBase: calculation.subtotalBase,
      totalTaxAmount: calculation.totalTaxAmount,
      discountAmount: calculation.discountAmount,
      grandTotal: calculation.grandTotal,
      currencyCode: store.currencyCode || 'COP',
    })

    // 8. Generar URL del codigo QR
    const dateFormatted = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const qrCode = generateQRCodeURL({
      storeNit: store.nit,
      prefix,
      consecutive: nextConsecutive,
      date: dateFormatted,
      grandTotal: calculation.grandTotal,
      cufe,
    })

    // 9. Determinar estado
    const status = data.testMode ? 'DRAFT' : 'PENDING_VALIDATE'

    // 10. Crear la factura
    const invoice = await db.invoice.create({
      data: {
        storeId: store.id,
        orderId: data.orderId,
        prefix,
        consecutive: nextConsecutive,
        customerNit: customerNit,
        customerName: data.customerName || order.customer?.name || 'Consumidor Final',
        customerAddress: data.customerAddress || order.customer?.address || null,
        customerPhone: data.customerPhone || order.customer?.phone || null,
        customerEmail: (data.customerEmail && data.customerEmail !== '') ? data.customerEmail : (order.customer?.email || null),
        customerRegime: data.customerRegime || order.customer?.regime || 'NO_RESPONSABLE',
        customerType: data.customerType || (order.customer?.documentType as any) || 'CC',
        subtotalBase: calculation.subtotalBase,
        taxExemptAmount: calculation.taxExemptAmount,
        taxBreakdown: JSON.stringify(calculation.taxBreakdown),
        totalTaxAmount: calculation.totalTaxAmount,
        totalWithTax: calculation.totalWithTax,
        discountAmount: calculation.discountAmount,
        tipAmount: calculation.tipAmount,
        grandTotal: calculation.grandTotal,
        paymentMethod: paymentMethodCode,
        cufe,
        qrCode,
        notes: data.notes || null,
        status,
        testMode: data.testMode,
      },
    })

    return NextResponse.json(
      {
        id: invoice.id,
        invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
        prefix: invoice.prefix,
        consecutive: invoice.consecutive,
        customerNit: invoice.customerNit,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerPhone: invoice.customerPhone,
        customerEmail: invoice.customerEmail,
        customerRegime: invoice.customerRegime,
        customerType: invoice.customerType,
        subtotalBase: Number(invoice.subtotalBase),
        taxExemptAmount: Number(invoice.taxExemptAmount),
        taxBreakdown: JSON.parse(invoice.taxBreakdown || '[]'),
        totalTaxAmount: Number(invoice.totalTaxAmount),
        totalWithTax: Number(invoice.totalWithTax),
        discountAmount: Number(invoice.discountAmount),
        tipAmount: Number(invoice.tipAmount),
        grandTotal: Number(invoice.grandTotal),
        paymentMethod: invoice.paymentMethod,
        cufe: invoice.cufe,
        qrCode: invoice.qrCode,
        notes: invoice.notes,
        status: invoice.status,
        testMode: invoice.testMode,
        orderId: invoice.orderId,
        createdAt: invoice.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Error interno al crear la factura' }, { status: 500 })
  }
}
