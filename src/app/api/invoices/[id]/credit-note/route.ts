import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { decryptField } from '@/lib/field-encryption'
import { requireStoreAccess } from '@/lib/api-auth'
import { getSoftwareProviderNIT, DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validación ───────────────────────────────────────────────

const creditNoteFromInvoiceSchema = z.object({
  noteType: z.enum(['CREDIT', 'DEBIT']),
  concept: z.string().min(3, 'El concepto debe tener al menos 3 caracteres').max(200),
  description: z.string().max(1000).optional(),
  // Montos de la nota (pueden ser parciales del total de la factura)
  subtotalBase: z.number().int().min(0),
  taxExemptAmount: z.number().int().min(0).optional().default(0),
  taxBreakdown: z.string().max(2000).optional().default('[]'),
  totalTaxAmount: z.number().int().min(0),
  totalWithTax: z.number().int().min(0),
  discountAmount: z.number().int().min(0).optional().default(0),
  grandTotal: z.number().int().min(0),
  // Items afectados (opcional — si no se proporciona, es una nota global)
  items: z.array(z.object({
    description: z.string().max(500),
    quantity: z.number().int().positive(),
    unitPrice: z.number().int().min(0),
    taxCode: z.string().max(10).optional().default('01'),
    taxRate: z.number().int().min(0).max(100).optional().default(0),
    taxAmount: z.number().int().min(0).optional().default(0),
    taxBase: z.number().int().min(0).optional().default(0),
  })).optional(),
  // Opciones
  testMode: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  // Datos del cliente (se pre-llenan desde la factura)
  customerNit: z.string().max(20).optional(),
  customerName: z.string().max(200).optional(),
  customerEmail: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  customerAddress: z.string().max(300).optional(),
})

// ─── POST: Crear nota crédito/débito desde una factura ────────────────────
// POST /api/invoices/[id]/credit-note?storeId=X
//
// Endpoint de conveniencia que crea una NC/ND referenciando directamente
// una factura por su ID. Pre-llena los datos del cliente desde la factura.

export async function POST(
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

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const body = await request.json()
    const data = creditNoteFromInvoiceSchema.parse(body)

    // 1. Buscar la factura con datos de tienda
    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            legalName: true,
            nit: true,
            currencyCode: true,
            invoiceTestMode: true,
            resolutionNumber: true,
            resolutionStartDate: true,
            resolutionEndDate: true,
            resolutionStartNumber: true,
            resolutionEndNumber: true,
            softwarePin: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Factura no encontrada o no pertenece a esta tienda' },
        { status: 404 },
      )
    }

    // 2. Validar que la factura tenga CUFE (necesario para generar CUDFE)
    if (!invoice.cufe) {
      return NextResponse.json(
        {
          error: 'La factura original no tiene CUFE generado. No se puede crear una nota crédito/débito electrónica sin CUFE de la factura original.',
        },
        { status: 400 },
      )
    }

    // 3. Validar montos para NC
    if (data.noteType === 'CREDIT') {
      const existingCreditNotes = await db.creditNote.aggregate({
        where: {
          storeId,
          invoiceId: invoice.id,
          noteType: 'CREDIT',
          status: { in: ['DRAFT', 'PENDING_VALIDATE', 'VALIDATED'] },
        },
        _sum: { grandTotal: true },
      })

      const usedAmount = existingCreditNotes._sum.grandTotal ?? 0
      const remaining = Number(invoice.grandTotal) - usedAmount

      if (data.grandTotal > remaining) {
        return NextResponse.json(
          {
            error: `El monto de la nota ($${data.grandTotal.toLocaleString()}) excede el saldo disponible de la factura ($${remaining.toLocaleString()}). Ya se han emitido notas por $${usedAmount.toLocaleString()}.`,
          },
          { status: 400 },
        )
      }
    }

    // 4. Crear la nota usando la API principal de credit-notes (forward)
    // Construimos el payload equivalente al POST /api/credit-notes
    const createPayload = {
      storeId,
      invoiceId: invoice.id,
      noteType: data.noteType,
      concept: data.concept,
      description: data.description,
      customerNit: data.customerNit || invoice.customerNit || undefined,
      customerName: data.customerName || invoice.customerName || undefined,
      customerEmail: data.customerEmail || invoice.customerEmail || undefined,
      customerPhone: data.customerPhone || invoice.customerPhone || undefined,
      customerAddress: data.customerAddress || invoice.customerAddress || undefined,
      customerRegime: invoice.customerRegime || undefined,
      customerType: invoice.customerType || undefined,
      items: data.items || [{
        description: data.concept,
        quantity: 1,
        unitPrice: data.grandTotal,
        taxCode: '01',
        taxRate: data.totalTaxAmount > 0 && data.subtotalBase > 0
          ? Math.round((data.totalTaxAmount / data.subtotalBase) * 100)
          : 0,
        taxAmount: data.totalTaxAmount,
        taxBase: data.subtotalBase,
      }],
      subtotalBase: data.subtotalBase,
      taxExemptAmount: data.taxExemptAmount,
      taxBreakdown: data.taxBreakdown,
      totalTaxAmount: data.totalTaxAmount,
      totalWithTax: data.totalWithTax,
      discountAmount: data.discountAmount,
      grandTotal: data.grandTotal,
      testMode: data.testMode,
      notes: data.notes,
    }

    // Crear la nota crédito/débito directamente (sin llamar a la API interna)
    const {
      generateCUDFE,
      generateQRCodeURL,
      validateNITDV,
    } = await import('@/lib/invoice-utils')
    const { getNextCreditNoteConsecutive } = await import('@/lib/invoicing/credit-note-counter')

    // Crear la nota crédito/débito dentro de transacción atómica
    // (consecutivo + create en la misma tx para evitar race conditions)
    const creditNote = await db.$transaction(async (tx) => {
      // Obtener consecutivo dentro de la transacción
      const consecutiveResult = await getNextCreditNoteConsecutive(storeId, data.noteType, tx)

    // Generar CUDFE (cálculo puro, sin DB)
    const store = invoice.store
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const issueTime = `${hours}${minutes}${seconds}000`

    const softwarePIN = decryptField(store.softwarePin) || process.env.DIAN_SOFTWARE_PIN || ''
    const providerNit = getSoftwareProviderNIT()
    const resolutionNumber = store.resolutionNumber || ''
    const resolutionDate = store.resolutionStartDate
      ? store.resolutionStartDate.toISOString().slice(0, 10).replace(/-/g, '')
      : ''

    const customerNit = createPayload.customerNit || invoice.customerNit || DIAN_CONSUMIDOR_FINAL_NIT
    const customerName = createPayload.customerName || invoice.customerName || 'Consumidor Final'

    let cudfe: string | null = null
    let qrCode: string | null = null

    try {
      cudfe = generateCUDFE({
        storeNit: store.nit || '',
        issueDate,
        issueTime,
        prefix: consecutiveResult.prefix,
        consecutive: consecutiveResult.consecutive,
        customerNit,
        subtotalBase: data.subtotalBase,
        totalTaxAmount: data.totalTaxAmount,
        discountAmount: data.discountAmount,
        grandTotal: data.grandTotal,
        currencyCode: store.currencyCode || 'COP',
        resolutionNumber,
        resolutionDate,
        pinSoftware: softwarePIN,
        providerNit,
        cude: invoice.cufe || '',
      })

      const testMode = data.testMode !== undefined ? data.testMode : (store.invoiceTestMode ?? true)
      const dateFormatted = now.toISOString().slice(0, 10)
      qrCode = generateQRCodeURL({
        storeNit: store.nit || '',
        prefix: consecutiveResult.prefix,
        consecutive: consecutiveResult.consecutive,
        date: dateFormatted,
        grandTotal: data.grandTotal,
        cufe: cudfe,
        testMode,
      })
    } catch (cudfeError) {
      logger.warn(
        '[CreditNote from Invoice] Error generando CUDFE:',
        cudfeError instanceof Error ? cudfeError.message : 'Desconocido',
      )
    }

    // Crear en BD (dentro de la transacción)
    const createdNote = await tx.creditNote.create({
      data: {
        storeId,
        invoiceId: invoice.id,
        prefix: consecutiveResult.prefix,
        consecutive: consecutiveResult.consecutive,
        resolutionNumber: store.resolutionNumber || null,
        resolutionDate: store.resolutionStartDate ? new Date(store.resolutionStartDate) : null,
        startDate: store.resolutionStartDate || null,
        endDate: store.resolutionEndDate || null,
        startNumber: store.resolutionStartNumber,
        endNumber: store.resolutionEndNumber,
        noteType: data.noteType,
        concept: data.concept,
        description: data.description || null,
        customerNit,
        customerName,
        customerEmail: createPayload.customerEmail || invoice.customerEmail || null,
        customerPhone: createPayload.customerPhone || invoice.customerPhone || null,
        customerAddress: createPayload.customerAddress || invoice.customerAddress || null,
        customerRegime: invoice.customerRegime || null,
        customerType: invoice.customerType || null,
        subtotalBase: data.subtotalBase,
        taxExemptAmount: data.taxExemptAmount,
        taxBreakdown: data.taxBreakdown,
        totalTaxAmount: data.totalTaxAmount,
        totalWithTax: data.totalWithTax,
        discountAmount: data.discountAmount,
        grandTotal: data.grandTotal,
        cufe: cudfe,
        qrCode,
        referencedInvoiceId: invoice.cufe || null,
        referencedPrefix: invoice.prefix,
        referencedConsec: invoice.consecutive,
        // Detalle de items (PDF/API leen "productName"; el payload de entrada usa "description")
        items: JSON.stringify(createPayload.items.map((i) => ({ ...i, productName: i.description }))),
        status: 'DRAFT',
        testMode: data.testMode !== undefined ? data.testMode : (store.invoiceTestMode ?? true),
        notes: data.notes || null,
      },
    })

      return createdNote
    }) // fin de $transaction

    return NextResponse.json(
      {
        id: creditNote.id,
        noteNumber: formatInvoiceNumber(creditNote.prefix, creditNote.consecutive),
        noteType: creditNote.noteType,
        prefix: creditNote.prefix,
        consecutive: creditNote.consecutive,
        concept: creditNote.concept,
        description: creditNote.description,
        customerNit: creditNote.customerNit,
        customerName: creditNote.customerName,
        subtotalBase: Number(creditNote.subtotalBase),
        totalTaxAmount: Number(creditNote.totalTaxAmount),
        totalWithTax: Number(creditNote.totalWithTax),
        discountAmount: Number(creditNote.discountAmount),
        grandTotal: Number(creditNote.grandTotal),
        cufe: creditNote.cufe,
        qrCode: creditNote.qrCode,
        status: creditNote.status,
        testMode: creditNote.testMode,
        invoiceId: creditNote.invoiceId,
        referencedInvoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
        createdAt: creditNote.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/invoices/[id]/credit-note error:', error)
    return NextResponse.json(
      { error: 'Error interno al crear la nota crédito/débito' },
      { status: 500 },
    )
  }
}
