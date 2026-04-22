import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { formatInvoiceNumber, generateCUFE } from '@/lib/invoice-utils'
import { generateUBL21XML } from '@/lib/invoicing/xml-generator'
import { decryptField } from '@/lib/field-encryption'
import { getSoftwareProviderNIT, getSoftwareName, DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validacion ───────────────────────────────────────────────

const createContingencySchema = z.object({
  storeId: z.number().int().positive('El storeId es requerido y debe ser positivo'),
  invoiceId: z.number().int().positive('El invoiceId es requerido y debe ser positivo'),
  contingencyType: z.enum(['03', '04'], {
    message: 'El tipo de contingencia debe ser "03" (facturador) o "04" (DIAN)',
  }),
  reason: z.string().max(500, 'La razón no puede exceder 500 caracteres').optional(),
  notes: z.string().max(1000).optional(),
})

// ─── GET: Listar facturas de contingencia ─────────────────────────────────
// GET /api/contingency-invoices?storeId=X&contingencyType=03|04&status=DRAFT

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const contingencyType = searchParams.get('contingencyType')
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const where: Record<string, unknown> = { storeId }

    if (contingencyType && (contingencyType === '03' || contingencyType === '04')) {
      where.contingencyType = contingencyType
    }

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

    const contingencies = await db.contingencyInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: {
          select: {
            id: true,
            prefix: true,
            consecutive: true,
            cufe: true,
            order: {
              select: {
                orderNumber: true,
              },
            },
          },
        },
      },
    })

    const result = contingencies.map((c) => ({
      id: c.id,
      invoiceNumber: formatInvoiceNumber(c.prefix, c.consecutive),
      prefix: c.prefix,
      consecutive: c.consecutive,
      contingencyType: c.contingencyType,
      contingencyTypeLabel: c.contingencyType === '03'
        ? 'Contingencia del facturador'
        : 'Contingencia DIAN',
      reason: c.reason,
      customerNit: c.customerNit,
      customerName: c.customerName,
      grandTotal: Number(c.grandTotal),
      originalCufe: c.originalCufe,
      contingencyCufe: c.contingencyCufe,
      status: c.status,
      testMode: c.testMode,
      contingencyStart: c.contingencyStart.toISOString(),
      contingencyEnd: c.contingencyEnd?.toISOString() ?? null,
      retransmittedAt: c.retransmittedAt?.toISOString() ?? null,
      originalInvoice: c.invoice ? {
        id: c.invoice.id,
        invoiceNumber: formatInvoiceNumber(c.invoice.prefix, c.invoice.consecutive),
        cufe: c.invoice.cufe,
        orderNumber: c.invoice.order?.orderNumber ?? null,
      } : null,
      createdAt: c.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    logger.error('GET /api/contingency-invoices error:', error)
    return NextResponse.json({ error: 'Error interno al consultar facturas de contingencia' }, { status: 500 })
  }
}

// ─── POST: Crear factura de contingencia ──────────────────────────────────
// Crea una factura de contingencia a partir de una factura original existente.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createContingencySchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError

    // 1. Buscar la factura original con datos completos
    const invoice = await db.invoice.findUnique({
      where: { id: data.invoiceId },
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
            providerConfig: true,
            user: { select: { email: true } },
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura original no encontrada' }, { status: 404 })
    }

    if (invoice.storeId !== data.storeId) {
      return NextResponse.json({ error: 'La factura no pertenece a esta tienda' }, { status: 403 })
    }

    // 2. Verificar que no exista ya una contingencia activa para esta factura
    const existingContingency = await db.contingencyInvoice.findFirst({
      where: {
        invoiceId: data.invoiceId,
        status: { in: ['DRAFT', 'PENDING_RETRANSMIT'] },
      },
    })
    if (existingContingency) {
      return NextResponse.json(
        {
          error: `Ya existe una factura de contingencia activa para esta factura: ${formatInvoiceNumber(existingContingency.prefix, existingContingency.consecutive)}`,
        },
        { status: 409 },
      )
    }

    const store = invoice.store

    // 3. Obtener el siguiente consecutivo de contingencia (auto-increment)
    const lastContingency = await db.contingencyInvoice.findFirst({
      where: { storeId: data.storeId },
      orderBy: { consecutive: 'desc' },
      select: { consecutive: true },
    })
    const nextConsecutive = (lastContingency?.consecutive ?? 0) + 1
    const prefix = 'FC' // Prefijo fijo para facturas de contingencia

    // 4. Generar CUFE de contingencia
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const issueTime = `${hours}${minutes}${seconds}000`

    const softwarePIN = decryptField(store.softwarePin) || process.env.DIAN_SOFTWARE_PIN || ''
    const providerNit = getSoftwareProviderNIT()

    const contingencyNotes = data.reason
      ? `[CONTINGENCIA TIPO ${data.contingencyType}] ${data.reason}`
      : `[CONTINGENCIA TIPO ${data.contingencyType}] Factura de contingencia generada por falla ${data.contingencyType === '03' ? 'del facturador' : 'del sistema DIAN'}`

    // Para el CUFE de contingencia se usa la misma lógica pero con el prefijo FC
    const contingencyCufe = generateCUFE({
      storeNit: store.nit || '',
      issueDate,
      issueTime,
      prefix,
      consecutive: nextConsecutive,
      customerNit: invoice.customerNit || DIAN_CONSUMIDOR_FINAL_NIT,
      subtotalBase: Number(invoice.subtotalBase),
      totalTaxAmount: Number(invoice.totalTaxAmount),
      discountAmount: Number(invoice.discountAmount),
      grandTotal: Number(invoice.grandTotal),
      currencyCode: store.currencyCode || 'COP',
      resolutionNumber: store.resolutionNumber || '',
      resolutionDate: store.resolutionStartDate?.toISOString().slice(0, 10).replace(/-/g, '') || '',
      pinSoftware: softwarePIN,
      providerNit,
    })

    // 5. Generar XML UBL 2.1 para la factura de contingencia
    let xmlContent: string | undefined
    try {
      const taxBreakdown = JSON.parse(invoice.taxBreakdown || '[]')
      const xmlItems = (invoice.order?.orderItems || []).map((item, idx) => ({
        lineNumber: idx + 1,
        description: item.product?.name ?? item.service?.name ?? 'Eliminado',
        quantity: item.quantity,
        unitPrice: item.taxBase > 0 && item.quantity > 0
          ? Math.round(item.taxBase / item.quantity)
          : (Number(item.unitPrice) - (item.taxAmount > 0 ? Math.round(item.taxAmount / Math.max(item.quantity, 1)) : 0)),
        lineExtensionAmount: Number(item.totalRow) - Number(item.taxAmount),
        taxCode: item.taxCode || '01',
        taxRate: item.taxRate || 0,
        taxableAmount: Number(item.taxBase),
        taxAmount: Number(item.taxAmount),
        notes: item.notes || undefined,
      }))

      const softwareProviderNIT = getSoftwareProviderNIT()
      const softwareName = getSoftwareName()

      const paymentMethodNames: Record<string, string> = {
        '1': 'Efectivo', '2': 'Tarjeta', '10': 'Transferencia', '42': 'Daviplata/Nequi', '99': 'Otro/Mixto',
      }

      xmlContent = generateUBL21XML({
        invoiceNumber: formatInvoiceNumber(prefix, nextConsecutive),
        prefix,
        consecutive: nextConsecutive,
        issueDate: now.toISOString().slice(0, 10),
        issueTime: `${hours}:${minutes}:${seconds}-05:00`,
        invoiceTypeCode: '01',
        resolutionNumber: store.resolutionNumber || '',
        resolutionStartDate: store.resolutionStartDate?.toISOString().slice(0, 10) || '',
        resolutionEndDate: store.resolutionEndDate?.toISOString().slice(0, 10) || '',
        startNumber: store.resolutionStartNumber || 1,
        endNumber: store.resolutionEndNumber || 99999,
        currencyCode: store.currencyCode || 'COP',
        supplierNit: store.nit || '',
        supplierName: store.name || '',
        supplierLegalName: store.legalName || store.name || '',
        supplierAddress: store.address || '',
        supplierCityCode: store.divipolaCode || '',
        supplierCityName: store.cityName || store.address || 'Sin Ciudad',
        supplierPhone: store.phone || '',
        supplierEmail: store.user?.email || '',
        supplierTaxRegime: '01',
        supplierMunicipality: store.cityName || store.address || '',
        customerNit: invoice.customerNit || DIAN_CONSUMIDOR_FINAL_NIT,
        customerName: invoice.customerName || 'Consumidor Final',
        customerAddress: invoice.customerAddress || undefined,
        customerPhone: invoice.customerPhone || undefined,
        customerEmail: invoice.customerEmail || undefined,
        customerRegime: invoice.customerRegime || undefined,
        customerType: invoice.customerType || undefined,
        lineExtensionAmount: Number(invoice.subtotalBase),
        taxExclusiveAmount: Number(invoice.subtotalBase),
        taxInclusiveAmount: Number(invoice.totalWithTax),
        payableAmount: Number(invoice.grandTotal),
        discountAmount: Number(invoice.discountAmount),
        cufe: contingencyCufe,
        softwareProviderNIT,
        softwareName,
        softwarePIN,
        items: xmlItems,
        taxTotals: taxBreakdown.map((t) => ({
          taxCode: t.code, taxableAmount: t.base, taxAmount: t.amount, taxRate: t.rate, taxName: t.name,
        })),
        paymentMethodCode: invoice.paymentMethod || '1',
        paymentMethodName: paymentMethodNames[invoice.paymentMethod || '1'] || 'Otro',
        notes: contingencyNotes,
      })
    } catch (xmlError) {
      logger.warn('[ContingencyInvoice] Error generando XML UBL 2.1:', xmlError instanceof Error ? xmlError.message : 'Desconocido')
    }

    // 6. Crear la factura de contingencia en la base de datos
    const contingency = await db.contingencyInvoice.create({
      data: {
        storeId: data.storeId,
        invoiceId: data.invoiceId,
        prefix,
        consecutive: nextConsecutive,
        contingencyType: data.contingencyType,
        reason: data.reason || `Contingencia tipo ${data.contingencyType} — Factura original ${formatInvoiceNumber(invoice.prefix, invoice.consecutive)}`,
        // Copiar datos del cliente desde la factura original
        customerNit: invoice.customerNit,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        customerRegime: invoice.customerRegime,
        customerType: invoice.customerType,
        // Copiar montos desde la factura original
        subtotalBase: Number(invoice.subtotalBase),
        taxExemptAmount: Number(invoice.taxExemptAmount),
        taxBreakdown: invoice.taxBreakdown,
        totalTaxAmount: Number(invoice.totalTaxAmount),
        totalWithTax: Number(invoice.totalWithTax),
        discountAmount: Number(invoice.discountAmount),
        grandTotal: Number(invoice.grandTotal),
        // Cufe original de la factura que no se pudo enviar
        originalCufe: invoice.cufe,
        originalCufeQR: invoice.qrCode,
        // Cufe de la factura de contingencia
        contingencyCufe,
        xmlContent,
        // Estado inicial
        status: 'DRAFT',
        testMode: invoice.testMode,
        notes: data.notes || null,
      },
    })

    // 7. Retornar la factura de contingencia creada
    return NextResponse.json(
      {
        id: contingency.id,
        invoiceNumber: formatInvoiceNumber(contingency.prefix, contingency.consecutive),
        prefix: contingency.prefix,
        consecutive: contingency.consecutive,
        contingencyType: contingency.contingencyType,
        contingencyTypeLabel: contingency.contingencyType === '03'
          ? 'Contingencia del facturador'
          : 'Contingencia DIAN',
        reason: contingency.reason,
        customerNit: contingency.customerNit,
        customerName: contingency.customerName,
        customerEmail: contingency.customerEmail,
        customerPhone: contingency.customerPhone,
        customerAddress: contingency.customerAddress,
        subtotalBase: Number(contingency.subtotalBase),
        totalTaxAmount: Number(contingency.totalTaxAmount),
        totalWithTax: Number(contingency.totalWithTax),
        grandTotal: Number(contingency.grandTotal),
        originalCufe: contingency.originalCufe,
        originalCufeQR: contingency.originalCufeQR,
        contingencyCufe: contingency.contingencyCufe,
        status: contingency.status,
        testMode: contingency.testMode,
        contingencyStart: contingency.contingencyStart.toISOString(),
        originalInvoice: {
          id: invoice.id,
          invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
          cufe: invoice.cufe,
          status: invoice.status,
        },
        createdAt: contingency.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/contingency-invoices error:', error)
    return NextResponse.json({ error: 'Error interno al crear la factura de contingencia' }, { status: 500 })
  }
}
