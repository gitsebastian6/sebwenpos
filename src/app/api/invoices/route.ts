import { requireStoreAccess } from '@/lib/api-auth'
import { auditLogFromRequest } from '@/lib/audit-logger'
import { DIAN_CONSUMIDOR_FINAL_NIT, getSoftwareName, getSoftwareProviderNIT, unitCodeFor } from '@/lib/constants'
import { db } from '@/lib/db'
import { decryptField } from '@/lib/field-encryption'
import {
    calculateInvoiceFromOrder,
    formatInvoiceNumber,
    generateCUFE,
    generateQRCodeURL,
    getDIANPaymentCode,
    validateNITDV,
} from '@/lib/invoice-utils'
import { signXMLForDIAN } from '@/lib/invoicing/certificate'
import { getNextConsecutive } from '@/lib/invoicing/consecutive-counter'
import { pollForStatus, sendBillAsync } from '@/lib/invoicing/soap-client'
import { generateUBL21XML } from '@/lib/invoicing/xml-generator'
import { logger } from '@/lib/logger'
import { toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validacion ───────────────────────────────────────────────

const createInvoiceSchema = z.object({
  orderId: z.number().int().positive('El orderId es requerido y debe ser positivo'),
  customerNit: z.string().max(20).optional().default(DIAN_CONSUMIDOR_FINAL_NIT),
  customerName: z.string().max(200).optional().default('Consumidor Final'),
  customerAddress: z.string().max(300).optional(),
  customerPhone: z.string().max(30).optional(),
  customerEmail: z.string().email('Email invalido').max(200).optional().or(z.literal('')),
  customerRegime: z.enum(['RESPONSABLE', 'NO_RESPONSABLE', 'SIMPLIFICADO']).optional().default('NO_RESPONSABLE'),
  customerType: z.enum(['CC', 'NIT', 'CE', 'TI', 'PP']).optional().default('CC'),
  notes: z.string().max(500).optional(),
  testMode: z.boolean().optional().default(true),
  autoSend: z.boolean().optional().default(false),
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const skip = (page - 1) * limit

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(request, storeId)
    if (storeAccessError) return storeAccessError

    const where: Record<string, unknown> = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
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
      // Buscar por numero consecutivo formateado (ej: "FE-00000001")
      const orConditions: Record<string, unknown>[] = [
        { prefix: { contains: q } },
      ]
      // Si el query es numerico, buscar por consecutivo exacto
      const numericQ = parseInt(q, 10)
      if (!isNaN(numericQ)) {
        orConditions.push({ consecutive: numericQ })
      }
      where.OR = orConditions
    }

    const [total, invoices] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        skip,
        take: limit,
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
    }),
    ])

    const result = invoices.map((inv) => ({
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

    return NextResponse.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('GET /api/invoices error:', error)
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
            product: { select: { name: true, unitLabel: true } },
            presentation: { select: { unitLabel: true } },
            service: { select: { name: true } },
          },
        },
        customer: { select: { name: true, nit: true, address: true, phone: true, email: true, regime: true, documentType: true } },
        store: {
          select: {
            id: true,
            name: true,
            legalName: true,
            nit: true,
            address: true,
            phone: true,
            user: { select: { email: true } },
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
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, order.storeId)
    if (storeAccessError) return storeAccessError

    // Verify subscription has electronic invoicing feature enabled
    const subscription = await db.subscription.findFirst({
      where: { storeId: order.storeId, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true },
    })
    if (!subscription) {
      return NextResponse.json(
        { error: 'Suscripción no activa. Se requiere una suscripción activa para generar facturas electrónicas.' },
        { status: 403 },
      )
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

    // 4. Obtener consecutivo y crear factura de forma atomica en una sola transaccion
    //    para prevenir race conditions en la asignacion de consecutivos (H-02)
    let invoice, consecutiveResult, nextConsecutive, prefix, testMode
    let hours, minutes, seconds, paymentMethodCode, cufe, now, customerNit, calculation
    try {
      await db.$transaction(async (tx) => {
        // 4a. Obtener consecutivo usando el cliente de transaccion
        consecutiveResult = await getNextConsecutive(store.id, { store: tx.store, invoice: tx.invoice })
        if (consecutiveResult.warning) {
          logger.warn(`[Invoice] ${consecutiveResult.warning}`)
        }
        nextConsecutive = consecutiveResult.consecutive
        prefix = consecutiveResult.prefix

        // 5. Calcular campos tributarios desde la orden
        calculation = calculateInvoiceFromOrder(order, order.orderItems)
        paymentMethodCode = getDIANPaymentCode(order.paymentMethod)

        // 6. Generar fecha/hora para CUFE
        now = new Date()
        const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
        hours = String(now.getHours()).padStart(2, '0')
        minutes = String(now.getMinutes()).padStart(2, '0')
        seconds = String(now.getSeconds()).padStart(2, '0')
        const issueTime = `${hours}${minutes}${seconds}000` // HHmmssSSS

        // 7. Generar CUFE (DIAN v2.1 spec — sin separadores)
        customerNit = data.customerNit || order.customer?.nit || DIAN_CONSUMIDOR_FINAL_NIT

        // Validar DV del NIT del cliente (excepto consumidor final)
        if (customerNit !== DIAN_CONSUMIDOR_FINAL_NIT && !validateNITDV(customerNit)) {
          throw new Error(`El NIT del cliente "${customerNit}" tiene un dígito de verificación (DV) inválido. Verifique e intente de nuevo.`)
        }

        // Leer PIN del software y NIT proveedor desde la tienda
        const providerConfig = JSON.parse(store.providerConfig || '{}')
        const softwarePIN = decryptField(store.softwarePin) || process.env.DIAN_SOFTWARE_PIN || ''
        const providerNit = getSoftwareProviderNIT()
        const resolutionDate = consecutiveResult.resolutionDate
          ? consecutiveResult.resolutionDate.toISOString().slice(0, 10).replace(/-/g, '')
          : ''

        cufe = generateCUFE({
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
          resolutionNumber: consecutiveResult.resolutionNumber || '',
          resolutionDate,
          pinSoftware: softwarePIN,
          providerNit,
        })

        // 8. Determinar testMode y generar URL del codigo QR
        testMode = store.invoiceTestMode ?? true

        // Generar URL del codigo QR
        const dateFormatted = now.toISOString().slice(0, 10) // YYYY-MM-DD
        const qrCode = generateQRCodeURL({
          storeNit: store.nit,
          prefix,
          consecutive: nextConsecutive,
          date: dateFormatted,
          grandTotal: calculation.grandTotal,
          cufe,
          testMode,
        })

        const status = testMode ? 'DRAFT' : 'PENDING_VALIDATE'

        // 10. Crear la factura dentro de la misma transaccion
        invoice = await tx.invoice.create({
          data: {
            storeId: store.id,
            orderId: data.orderId,
            prefix,
            consecutive: nextConsecutive,
            resolutionNumber: consecutiveResult.resolutionNumber || null,
            resolutionDate: consecutiveResult.resolutionDate ? new Date(consecutiveResult.resolutionDate) : null,
            startDate: consecutiveResult.startDate || null,
            endDate: consecutiveResult.endDate || null,
            startNumber: consecutiveResult.startNumber,
            endNumber: consecutiveResult.endNumber,
            customerNit: customerNit,
            customerName: data.customerName || order.customer?.name || 'Consumidor Final',
            customerAddress: data.customerAddress || order.customer?.address || null,
            customerPhone: data.customerPhone || order.customer?.phone || null,
            customerEmail: (data.customerEmail && data.customerEmail !== '') ? data.customerEmail : (order.customer?.email || null),
            customerRegime: data.customerRegime || order.customer?.regime || 'NO_RESPONSABLE',
            customerType: data.customerType || (order.customer?.documentType as string) || 'CC',
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
            testMode,
          },
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // 11. Generar XML UBL 2.1 y almacenar
    try {
      const taxBreakdownForXml = JSON.parse(invoice.taxBreakdown || '[]')
      const xmlItems = (order.orderItems || []).map((item, idx) => ({
        lineNumber: idx + 1,
        description: (() => {
          const baseName = item.product?.name ?? item.service?.name ?? 'Eliminado'
          return item.presentationName ? `${baseName} — ${item.presentationName}` : baseName
        })(),
        quantity: toNum(item.quantity),
        // Código UN/ECE rec20 según la unidad de la línea (KG→KGM, L→LTR…)
        unitCode: unitCodeFor(item.presentation?.unitLabel ?? item.product?.unitLabel),
        unitPrice: item.taxBase > 0 && toNum(item.quantity) > 0
          ? Math.round(item.taxBase / toNum(item.quantity))
          : (Number(item.unitPrice) - (item.taxAmount > 0 ? Math.round(item.taxAmount / Math.max(toNum(item.quantity), 1)) : 0)),
        lineExtensionAmount: Number(item.totalRow) - Number(item.taxAmount),
        taxCode: item.taxCode || '01',
        taxRate: item.taxRate || 0,
        taxableAmount: Number(item.taxBase),
        taxAmount: Number(item.taxAmount),
        notes: item.notes || undefined,
      }))

      const softwareProviderNIT = getSoftwareProviderNIT()
      const softwareName = getSoftwareName()
      const softwarePIN = process.env.DIAN_SOFTWARE_PIN || ''

      const paymentMethodNames: Record<string, string> = {
        '1': 'Efectivo', '2': 'Tarjeta', '10': 'Transferencia', '42': 'Daviplata/Nequi', '99': 'Otro/Mixto',
      }

      const xmlContent = generateUBL21XML({
        invoiceNumber: formatInvoiceNumber(prefix, nextConsecutive),
        prefix,
        consecutive: nextConsecutive,
        issueDate: now.toISOString().slice(0, 10),
        issueTime: `${hours}:${minutes}:${seconds}-05:00`,
        invoiceTypeCode: '01',
        resolutionNumber: consecutiveResult.resolutionNumber || '',
        resolutionStartDate: consecutiveResult.resolutionDate?.slice(0, 10) || '',
        resolutionEndDate: consecutiveResult.endDate?.toISOString().slice(0, 10) || '',
        startNumber: consecutiveResult.startNumber,
        endNumber: consecutiveResult.endNumber,
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
        customerNit,
        customerName: data.customerName || order.customer?.name || 'Consumidor Final',
        customerAddress: data.customerAddress || order.customer?.address || undefined,
        customerPhone: data.customerPhone || order.customer?.phone || undefined,
        customerEmail: (data.customerEmail && data.customerEmail !== '') ? data.customerEmail : (order.customer?.email || undefined),
        customerRegime: data.customerRegime || order.customer?.regime || undefined,
        customerType: data.customerType || (order.customer?.documentType as string) || undefined,
        lineExtensionAmount: calculation.subtotalBase,
        taxExclusiveAmount: calculation.subtotalBase,
        taxInclusiveAmount: calculation.totalWithTax,
        payableAmount: calculation.grandTotal,
        discountAmount: calculation.discountAmount,
        cufe,
        softwareProviderNIT,
        softwareName,
        softwarePIN,
        items: xmlItems,
        taxTotals: taxBreakdownForXml.map((t) => ({
          taxCode: t.code, taxableAmount: t.base, taxAmount: t.amount, taxRate: t.rate, taxName: t.name,
        })),
        paymentMethodCode: paymentMethodCode,
        paymentMethodName: paymentMethodNames[paymentMethodCode] || 'Otro',
        notes: data.notes || undefined,
      })

      await db.invoice.update({
        where: { id: invoice.id },
        data: { xmlContent },
      })
    } catch (xmlError) {
      logger.warn('[Invoice] Error generando XML UBL 2.1, factura creada sin XML:', xmlError instanceof Error ? xmlError.message : 'Desconocido')
    }

    // 12. Auto-send to DIAN in background (fire-and-forget)
    if (data.autoSend) {
      // Spawn async — don't await so POS gets fast response
      const invoiceId = invoice.id
      const storeTestMode = testMode
      const autoSendPromise = (async () => {
        try {
          // Reload invoice with XML content
          const inv = await db.invoice.findUnique({ where: { id: invoiceId } })
          if (!inv || !inv.xmlContent) {
            logger.warn(`[AutoSend] Invoice ${invoiceId}: sin XML, no se puede enviar`)
            return
          }

          // Sign XML
          let finalXml = inv.xmlContent
          let signed = false
          try {
            const signResult = await signXMLForDIAN(inv.xmlContent)
            finalXml = signResult.signedXml
            signed = true
          } catch {
            logger.warn(`[AutoSend] Invoice ${invoiceId}: sin firma, enviando sin firmar`)
          }

          // Send to DIAN
          const sendResult = await sendBillAsync(finalXml, {
            testMode: storeTestMode,
            timeout: 30000,
          })

          if (!sendResult.success || !sendResult.trackId) {
            await db.invoice.update({
              where: { id: invoiceId },
              data: { dianResponse: JSON.stringify({ autoSendError: true, errorMessage: sendResult.errorMessage, errorCode: sendResult.errorCode }) },
            })
            logger.error(`[AutoSend] Invoice ${invoiceId}: error enviando a DIAN — ${sendResult.errorMessage}`)
            return
          }

          // Update with TrackId
          await db.invoice.update({
            where: { id: invoiceId },
            data: {
              status: 'PENDING_VALIDATE',
              sentAt: new Date(),
              dianResponse: JSON.stringify({ trackId: sendResult.trackId, sentAt: new Date().toISOString(), autoSent: true, signed }),
            },
          })

          // Poll for status (max 3 min)
          const pollResult = await pollForStatus(sendResult.trackId, { testMode: storeTestMode }, { maxAttempts: 36, intervalMs: 5000 })

          const updateData: Record<string, unknown> = {}
          if (pollResult.statusCode === '10010' || pollResult.statusCode === '10012') {
            updateData.status = 'VALIDATED'
            updateData.validatedAt = new Date()
          } else if (pollResult.statusCode === '10011') {
            updateData.status = 'REJECTED'
            updateData.dianErrorCode = pollResult.errorCode || pollResult.statusCode
          }
          await db.invoice.update({ where: { id: invoiceId }, data: updateData })

          logger.info(`[AutoSend] Invoice ${invoiceId}: estado final ${pollResult.statusCode || 'PENDIENTE'}`)
        } catch (err) {
          logger.error(`[AutoSend] Invoice ${invoiceId}: error inesperado`, err)
        }
      })()
    }

    // Audit: invoice created
    auditLogFromRequest(req, {
      storeId: invoice.storeId,
      action: 'CREATE',
      entity: 'Invoice',
      entityId: invoice.id,
      newValue: { invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive), grandTotal: invoice.grandTotal, status: invoice.status, customerNit: invoice.customerNit },
    }).catch(() => {})

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
        resolutionNumber: invoice.resolutionNumber,
        startDate: invoice.startDate?.toISOString() ?? null,
        endDate: invoice.endDate?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Error interno al crear la factura' }, { status: 500 })
  }
}
