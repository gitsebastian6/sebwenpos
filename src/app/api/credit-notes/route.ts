import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { DIAN_CONSUMIDOR_FINAL_NIT, getSoftwareProviderNIT } from '@/lib/constants'
import { db } from '@/lib/db'
import { decryptField } from '@/lib/field-encryption'
import {
    formatInvoiceNumber,
    generateCUDFE,
    generateQRCodeURL,
    validateNITDV,
} from '@/lib/invoice-utils'
import { getNextCreditNoteConsecutive } from '@/lib/invoicing/credit-note-counter'
import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validación ───────────────────────────────────────────────

const creditNoteItemSchema = z.object({
  description: z.string().max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().int().min(0),
  taxCode: z.string().max(10).optional().default('01'),
  taxRate: z.number().int().min(0).max(100).optional().default(0),
  taxAmount: z.number().int().min(0).optional().default(0),
  taxBase: z.number().int().min(0).optional().default(0),
})

const createCreditNoteSchema = z.object({
  storeId: z.number().int().positive('El storeId es requerido'),
  invoiceId: z.number().int().positive('El invoiceId es requerido'),
  noteType: z.enum(['CREDIT', 'DEBIT']),
  concept: z.string().min(3, 'El concepto debe tener al menos 3 caracteres').max(200, 'El concepto máximo es 200 caracteres'),
  description: z.string().max(1000).optional(),
  // Cliente (se pre-llena desde la factura original si no se proporciona)
  customerNit: z.string().max(20).optional(),
  customerName: z.string().max(200).optional(),
  customerEmail: z.string().email('Email inválido').max(200).optional().or(z.literal('')),
  customerPhone: z.string().max(30).optional(),
  customerAddress: z.string().max(300).optional(),
  customerRegime: z.enum(['RESPONSABLE', 'NO_RESPONSABLE', 'SIMPLIFICADO']).optional(),
  customerType: z.enum(['CC', 'NIT', 'CE', 'TI', 'PP']).optional(),
  // Items afectados por la nota
  items: z.array(creditNoteItemSchema).min(1, 'Debe incluir al menos un item'),
  // Montos
  subtotalBase: z.number().int().min(0),
  taxExemptAmount: z.number().int().min(0).optional().default(0),
  taxBreakdown: z.string().max(2000).optional().default('[]'),
  totalTaxAmount: z.number().int().min(0),
  totalWithTax: z.number().int().min(0),
  discountAmount: z.number().int().min(0).optional().default(0),
  grandTotal: z.number().int().min(0),
  // Opciones
  testMode: z.boolean().optional(),
  notes: z.string().max(500).optional(),
})

// ─── GET: Listar notas crédito/débito ─────────────────────────────────────
// GET /api/credit-notes?storeId=X&noteType=Y&status=Z&from=DATE&to=DATE&q=QUERY

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const noteType = searchParams.get('noteType')
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const q = searchParams.get('q')?.trim()

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'invoices')
    if (permErr) return permErr

    const where: Record<string, unknown> = { storeId }

    if (noteType && noteType !== 'ALL') {
      where.noteType = noteType
    }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (from || to) {
      const dateFilter: Record<string, unknown> = {}
      if (from) {
        dateFilter.gte = new Date(from)
      }
      if (to) {
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        dateFilter.lte = endDate
      }
      where.createdAt = dateFilter
    }

    if (q) {
      const orConditions: Record<string, unknown>[] = [
        { concept: { contains: q } },
        { customerName: { contains: q } },
        { customerNit: { contains: q } },
      ]
      const numericQ = parseInt(q, 10)
      if (!isNaN(numericQ)) {
        orConditions.push({ consecutive: numericQ })
      }
      where.OR = orConditions
    }

    const creditNotes = await db.creditNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        noteType: true,
        prefix: true,
        consecutive: true,
        concept: true,
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
        invoice: {
          select: {
            prefix: true,
            consecutive: true,
          },
        },
      },
    })

    const result = creditNotes.map((cn) => ({
      id: cn.id,
      noteNumber: formatInvoiceNumber(cn.prefix, cn.consecutive),
      noteType: cn.noteType,
      prefix: cn.prefix,
      consecutive: cn.consecutive,
      concept: cn.concept,
      customerNit: cn.customerNit,
      customerName: cn.customerName ?? 'Consumidor Final',
      subtotalBase: Number(cn.subtotalBase),
      totalTaxAmount: Number(cn.totalTaxAmount),
      grandTotal: Number(cn.grandTotal),
      status: cn.status,
      testMode: cn.testMode,
      hasCUDFE: !!cn.cufe,
      createdAt: cn.createdAt.toISOString(),
      validatedAt: cn.validatedAt?.toISOString() ?? null,
      referencedInvoice: cn.invoice
        ? formatInvoiceNumber(cn.invoice.prefix, cn.invoice.consecutive)
        : null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    logger.error('GET /api/credit-notes error:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar notas crédito/débito' },
      { status: 500 },
    )
  }
}

// ─── POST: Crear nota crédito/débito ──────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createCreditNoteSchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError
    const permErr = await requirePermission(req, 'invoices')
    if (permErr) return permErr

    // 1. Buscar la factura original
    const invoice = await db.invoice.findFirst({
      where: { id: data.invoiceId, storeId: data.storeId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            legalName: true,
            nit: true,
            address: true,
            phone: true,
            currencyCode: true,
            countryCode: true,
            invoicePrefix: true,
            resolutionNumber: true,
            resolutionStartDate: true,
            resolutionEndDate: true,
            resolutionStartNumber: true,
            resolutionEndNumber: true,
            invoiceTestMode: true,
            softwarePin: true,
            divipolaCode: true,
            cityName: true,
            user: { select: { email: true } },
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

    // 2. Pre-llenar datos del cliente desde la factura original si no se proporcionan
    const customerNit = data.customerNit || invoice.customerNit || DIAN_CONSUMIDOR_FINAL_NIT
    const customerName = data.customerName || invoice.customerName || 'Consumidor Final'
    const customerEmail = data.customerEmail && data.customerEmail !== ''
      ? data.customerEmail
      : (invoice.customerEmail || null)
    const customerPhone = data.customerPhone || invoice.customerPhone || null
    const customerAddress = data.customerAddress || invoice.customerAddress || null
    const customerRegime = data.customerRegime || invoice.customerRegime || 'NO_RESPONSABLE'
    const customerType = data.customerType || invoice.customerType || 'CC'

    // Validar DV del NIT del cliente (excepto consumidor final)
    if (customerNit !== DIAN_CONSUMIDOR_FINAL_NIT && !validateNITDV(customerNit)) {
      return NextResponse.json(
        {
          error: `El NIT del cliente "${customerNit}" tiene un dígito de verificación (DV) inválido.`,
        },
        { status: 400 },
      )
    }

    // 3. Validar montos para notas crédito (no deben exceder el total de la factura)
    if (data.noteType === 'CREDIT') {
      // Verificar que el total de la nota no exceda el total de la factura
      const existingCreditNotes = await db.creditNote.aggregate({
        where: {
          storeId: data.storeId,
          invoiceId: data.invoiceId,
          noteType: 'CREDIT',
          status: { in: ['DRAFT', 'PENDING_VALIDATE', 'VALIDATED'] },
        },
        _sum: { grandTotal: true },
      })

      const usedCreditAmount = existingCreditNotes._sum.grandTotal ?? 0
      const remaining = Number(invoice.grandTotal) - usedCreditAmount

      if (data.grandTotal > remaining) {
        return NextResponse.json(
          {
            error: `El monto de la nota crédito ($${data.grandTotal.toLocaleString()}) excede el saldo disponible de la factura ($${remaining.toLocaleString()}). Ya se han emitido notas crédito por $${usedCreditAmount.toLocaleString()} del total de $${Number(invoice.grandTotal).toLocaleString()}.`,
          },
          { status: 400 },
        )
      }
    }

    // 4-7. Obtener consecutivo + crear nota crédito/débito dentro de transacción atómica
    //    Esto previene race conditions donde dos requests obtienen el mismo consecutivo
    const creditNote = await db.$transaction(async (tx) => {
      // 4. Obtener consecutivo NC/ND dentro de la transacción
      const consecutiveResult = await getNextCreditNoteConsecutive(data.storeId, data.noteType, tx)

      // 5. Generar CUDFE (cálculo puro, sin DB)
      const store = invoice.store
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const issueTime = `${hours}${minutes}${seconds}000` // HHmmssSSS

    const softwarePIN = decryptField(store.softwarePin) || process.env.DIAN_SOFTWARE_PIN || ''
    const providerNit = getSoftwareProviderNIT()

    // El CUDE de la factura original (se usa para generar el CUDFE de la NC/ND)
    const originalCUDE = invoice.cufe || ''

    const resolutionNumber = store.resolutionNumber || ''
    const resolutionDate = store.resolutionStartDate
      ? store.resolutionStartDate.toISOString().slice(0, 10).replace(/-/g, '')
      : ''

    let cudfe: string | null = null
    let qrCode: string | null = null

    try {
      if (originalCUDE) {
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
          cude: originalCUDE,
        })

        // Generar QR
        const dateFormatted = now.toISOString().slice(0, 10)
        const testMode = data.testMode !== undefined ? data.testMode : (store.invoiceTestMode ?? true)
        qrCode = generateQRCodeURL({
          storeNit: store.nit || '',
          prefix: consecutiveResult.prefix,
          consecutive: consecutiveResult.consecutive,
          date: dateFormatted,
          grandTotal: data.grandTotal,
          cufe: cudfe,
          testMode,
        })
      }
    } catch (cudfeError) {
      logger.warn(
        '[CreditNote] Error generando CUDFE:',
        cudfeError instanceof Error ? cudfeError.message : 'Desconocido',
      )
      // Continuar sin CUDFE — se puede generar después
    }

    // 6. Determinar estado y modo test
    const testMode = data.testMode !== undefined ? data.testMode : (store.invoiceTestMode ?? true)
    const status = 'DRAFT'

    // 7. Crear la nota crédito/débito (dentro de la transacción)
    const createdNote = await tx.creditNote.create({
      data: {
        storeId: data.storeId,
        invoiceId: data.invoiceId,
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
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        customerAddress: customerAddress || null,
        customerRegime,
        customerType,
        subtotalBase: data.subtotalBase,
        taxExemptAmount: data.taxExemptAmount,
        taxBreakdown: data.taxBreakdown,
        totalTaxAmount: data.totalTaxAmount,
        totalWithTax: data.totalWithTax,
        discountAmount: data.discountAmount,
        grandTotal: data.grandTotal,
        cufe: cudfe,
        qrCode,
        // Referencia a la factura original
        referencedInvoiceId: invoice.cufe || null,
        referencedPrefix: invoice.prefix,
        referencedConsec: invoice.consecutive,
        // Estado
        status,
        testMode,
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
        customerEmail: creditNote.customerEmail,
        customerPhone: creditNote.customerPhone,
        customerAddress: creditNote.customerAddress,
        customerRegime: creditNote.customerRegime,
        customerType: creditNote.customerType,
        subtotalBase: Number(creditNote.subtotalBase),
        taxExemptAmount: Number(creditNote.taxExemptAmount),
        taxBreakdown: JSON.parse(creditNote.taxBreakdown || '[]'),
        totalTaxAmount: Number(creditNote.totalTaxAmount),
        totalWithTax: Number(creditNote.totalWithTax),
        discountAmount: Number(creditNote.discountAmount),
        grandTotal: Number(creditNote.grandTotal),
        cufe: creditNote.cufe,
        qrCode: creditNote.qrCode,
        status: creditNote.status,
        testMode: creditNote.testMode,
        invoiceId: creditNote.invoiceId,
        referencedPrefix: creditNote.referencedPrefix,
        referencedConsec: creditNote.referencedConsec,
        resolutionNumber: creditNote.resolutionNumber,
        startDate: creditNote.startDate?.toISOString() ?? null,
        endDate: creditNote.endDate?.toISOString() ?? null,
        notes: creditNote.notes,
        createdAt: creditNote.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/credit-notes error:', error)
    return NextResponse.json(
      { error: 'Error interno al crear la nota crédito/débito' },
      { status: 500 },
    )
  }
}
