import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  formatInvoiceNumber,
  generateCUFE,
  generateQRCodeURL,
  getAppBaseUrl,
} from '@/lib/invoice-utils'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validación ───────────────────────────────────────────────

const createDebitNoteSchema = z.object({
  amount: z.number().int().positive('El monto debe ser positivo'),
  taxRate: z.number().int().min(0).max(99).optional().default(19),
  reason: z.string().max(500).optional(),
  debitCode: z.enum(['01', '02', '03', '04', '05']).optional().default('01'),
  notes: z.string().max(1000).optional(),
})

// ─── GET: Listar notas débito de una factura ─────────────────────────────
// GET /api/invoices/[id]/debit-notes?storeId=X

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const debitNotes = await db.debitNote.findMany({
      where: { invoiceId: Number(id), storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prefix: true,
        consecutive: true,
        reason: true,
        debitCode: true,
        grandTotal: true,
        status: true,
        testMode: true,
        createdAt: true,
      },
    })

    const result = debitNotes.map((dn) => ({
      id: dn.id,
      debitNoteNumber: formatInvoiceNumber(dn.prefix, dn.consecutive),
      reason: dn.reason,
      debitCode: dn.debitCode,
      grandTotal: Number(dn.grandTotal),
      status: dn.status,
      testMode: dn.testMode,
      createdAt: dn.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/invoices/[id]/debit-notes error:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar notas débito' },
      { status: 500 },
    )
  }
}

// ─── POST: Crear nota débito ────────────────────────────────────────────
// POST /api/invoices/[id]/debit-notes?storeId=X

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const invoiceId = Number(id)
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    // Parse y validar body
    let body: {
      amount: number
      taxRate?: number
      reason?: string
      debitCode?: string
      notes?: string
    }
    try {
      const raw = await request.json()
      body = createDebitNoteSchema.parse(raw)
    } catch (e: unknown) {
      const msg = (e instanceof z.ZodError) ? e.issues[0].message : 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // 1. Fetch invoice with order and store
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, storeId },
      include: {
        store: {
          select: {
            nit: true,
            name: true,
            legalName: true,
            address: true,
            phone: true,
            user: { select: { email: true } },
            invoicePrefix: true,
            resolutionNumber: true,
            resolutionStartDate: true,
            resolutionEndDate: true,
            resolutionStartNumber: true,
            resolutionEndNumber: true,
            invoiceTestMode: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // 2. Validate invoice status (can only debit VALIDATED or DELIVERED)
    if (!['VALIDATED', 'DELIVERED'].includes(invoice.status)) {
      return NextResponse.json(
        {
          error: `No se puede generar nota débito para una factura en estado "${invoice.status}". ` +
            `Solo se permiten facturas VALIDATED o DELIVERED.`,
        },
        { status: 400 },
      )
    }

    const store = invoice.store

    if (!store.resolutionNumber) {
      return NextResponse.json(
        { error: 'La tienda no tiene configurada una resolución de numeración DIAN.' },
        { status: 400 },
      )
    }

    // 3. Calculate tax from amount
    const taxRate = body.taxRate ?? 19
    const taxBase = taxRate > 0 ? Math.round(body.amount / (1 + taxRate / 100)) : body.amount
    const taxAmount = body.amount - taxBase
    const grandTotal = body.amount

    // 4. Get next consecutive for ND prefix
    const lastDebitNote = await db.debitNote.findFirst({
      where: { storeId },
      orderBy: { consecutive: 'desc' },
      select: { consecutive: true },
    })

    const nextConsecutive = (lastDebitNote?.consecutive ?? 0) + 1

    if (store.resolutionStartNumber != null && nextConsecutive < store.resolutionStartNumber) {
      return NextResponse.json(
        { error: `El consecutivo calculado (${nextConsecutive}) es menor al inicio del rango autorizado (${store.resolutionStartNumber}).` },
        { status: 400 },
      )
    }
    if (store.resolutionEndNumber != null && nextConsecutive > store.resolutionEndNumber) {
      return NextResponse.json(
        { error: `Se ha agotado el rango de numeración autorizado por la resolución ${store.resolutionNumber}.` },
        { status: 400 },
      )
    }

    // 5. Generate CUFE
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '')
    const issueTime = now.toTimeString().slice(0, 8).replace(/:/g, '') + '000'

    const cufe = generateCUFE({
      storeNit: store.nit ?? '',
      issueDate,
      issueTime,
      prefix: 'ND',
      consecutive: nextConsecutive,
      customerNit: invoice.customerNit ?? '222222222222',
      subtotalBase: taxBase,
      totalTaxAmount: taxAmount,
      discountAmount: 0,
      grandTotal,
    })

    // 6. Generate QR code URL
    const appBaseUrl = getAppBaseUrl(request)
    const qrCode = generateQRCodeURL({
      storeNit: store.nit ?? '',
      prefix: 'ND',
      consecutive: nextConsecutive,
      date: now.toISOString().slice(0, 10),
      grandTotal,
      cufe,
      appBaseUrl,
    })

    // 7. Create debit note
    const debitNote = await db.debitNote.create({
      data: {
        storeId,
        invoiceId,
        // Numeración DIAN
        prefix: 'ND',
        consecutive: nextConsecutive,
        resolutionNumber: store.resolutionNumber,
        resolutionDate: store.resolutionStartDate ? new Date(store.resolutionStartDate) : null,
        startDate: store.resolutionStartDate,
        endDate: store.resolutionEndDate,
        startNumber: store.resolutionStartNumber,
        endNumber: store.resolutionEndNumber,
        // Emisor
        supplierNit: store.nit,
        supplierName: store.legalName || store.name,
        supplierAddress: store.address,
        supplierPhone: store.phone,
        supplierEmail: store.user?.email || '',
        // Cliente (copiado de factura original)
        customerNit: invoice.customerNit,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerPhone: invoice.customerPhone,
        customerEmail: invoice.customerEmail,
        customerRegime: invoice.customerRegime,
        customerType: invoice.customerType,
        // Desglose tributario
        subtotalBase: taxBase,
        taxBreakdown: taxRate > 0
          ? JSON.stringify([{ code: '01', name: 'IVA 19%', base: taxBase, rate: taxRate, amount: taxAmount }])
          : null,
        totalTaxAmount: taxAmount,
        totalWithTax: grandTotal,
        grandTotal,
        // Motivo
        reason: body.reason ?? null,
        debitCode: body.debitCode ?? '01',
        // DIAN
        cufe,
        qrCode,
        notes: body.notes ?? null,
        // Estado
        status: store.invoiceTestMode ? 'DRAFT' : 'PENDING_VALIDATE',
        testMode: store.invoiceTestMode,
      },
    })

    return NextResponse.json(
      {
        id: debitNote.id,
        debitNoteNumber: formatInvoiceNumber(debitNote.prefix, debitNote.consecutive),
        storeId: debitNote.storeId,
        invoiceId: debitNote.invoiceId,
        prefix: debitNote.prefix,
        consecutive: debitNote.consecutive,
        resolutionNumber: debitNote.resolutionNumber,
        customerNit: debitNote.customerNit,
        customerName: debitNote.customerName,
        subtotalBase: Number(debitNote.subtotalBase),
        totalTaxAmount: Number(debitNote.totalTaxAmount),
        grandTotal: Number(debitNote.grandTotal),
        reason: debitNote.reason,
        debitCode: debitNote.debitCode,
        cufe: debitNote.cufe,
        qrCode: debitNote.qrCode,
        status: debitNote.status,
        testMode: debitNote.testMode,
        createdAt: debitNote.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/invoices/[id]/debit-notes error:', error)
    const message = error instanceof Error ? error.message : 'Error al crear la nota débito'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
