import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { DIAN_CONSUMIDOR_FINAL_NIT, getSoftwareName, getSoftwareProviderNIT, unitCodeFor } from '@/lib/constants'
import { db } from '@/lib/db'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { signXMLForDIAN } from '@/lib/invoicing/certificate'
import { pollForStatus, sendBillAsync } from '@/lib/invoicing/soap-client'
import { generateUBL21XML } from '@/lib/invoicing/xml-generator'
import { logger } from '@/lib/logger'
import { toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── POST: Enviar factura a la DIAN ─────────────────────────────────────────
// POST /api/invoices/[id]/send?storeId=X
//
// Flujo completo:
// 1. Validar factura existe y esta en DRAFT o REJECTED
// 2. Leer factura con datos completos de tienda y orden
// 3. Generar XML UBL 2.1
// 4. Firmar XML (si hay certificado configurado)
// 5. Enviar a DIAN via SendBillAsync
// 6. Guardar trackId, actualizar estado a PENDING_VALIDATE
// 7. Sondear estado (pollForStatus) hasta obtener resultado definitivo
// 8. Actualizar estado segun resultado de la DIAN

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const storeId = z.coerce.number().int().positive().parse(url.searchParams.get('storeId'))

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'invoices')
    if (permErr) return permErr

    // 1. Obtener factura con datos completos
    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                product: { select: { name: true, unitLabel: true } },
                presentation: { select: { unitLabel: true } },
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
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // 2. Validar estado
    if (invoice.status !== 'DRAFT' && invoice.status !== 'REJECTED') {
      return NextResponse.json(
        {
          error: `Solo se pueden enviar facturas en estado BORRADOR (DRAFT) o RECHAZADA (REJECTED). Estado actual: "${invoice.status}".`,
        },
        { status: 400 },
      )
    }

    const store = invoice.store

    // 3. Generar XML UBL 2.1
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const issueTime = `${hours}:${minutes}:${seconds}-05:00`

    const taxBreakdown = JSON.parse(invoice.taxBreakdown || '[]')

    // Construir line items para el XML
    const xmlItems = (invoice.order?.orderItems || []).map((item, idx) => ({
      lineNumber: idx + 1,
      description: item.product?.name ?? item.service?.name ?? 'Eliminado',
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

    // Configuracion del proveedor tecnologico (variables de entorno)
    const softwareProviderNIT = getSoftwareProviderNIT()
    const softwareName = getSoftwareName()
    const softwarePIN = process.env.DIAN_SOFTWARE_PIN || ''

    // Nombres de metodo de pago
    const paymentMethodNames: Record<string, string> = {
      '1': 'Efectivo',
      '2': 'Tarjeta',
      '10': 'Transferencia',
      '42': 'Daviplata/Nequi',
      '99': 'Otro/Mixto',
    }

    const xmlInput = {
      invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
      prefix: invoice.prefix,
      consecutive: invoice.consecutive,
      issueDate,
      issueTime,
      invoiceTypeCode: '01',
      resolutionNumber: invoice.resolutionNumber || store.resolutionNumber || '',
      resolutionStartDate: invoice.startDate?.toISOString().slice(0, 10) || store.resolutionStartDate?.toISOString().slice(0, 10) || '',
      resolutionEndDate: invoice.endDate?.toISOString().slice(0, 10) || store.resolutionEndDate?.toISOString().slice(0, 10) || '',
      startNumber: invoice.startNumber || store.resolutionStartNumber || 1,
      endNumber: invoice.endNumber || store.resolutionEndNumber || 99999,
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
      cufe: invoice.cufe || '',
      softwareProviderNIT,
      softwareName,
      softwarePIN,
      items: xmlItems,
      taxTotals: taxBreakdown.map((t) => ({
        taxCode: t.code,
        taxableAmount: t.base,
        taxAmount: t.amount,
        taxRate: t.rate,
        taxName: t.name,
      })),
      paymentMethodCode: invoice.paymentMethod || '1',
      paymentMethodName: paymentMethodNames[invoice.paymentMethod || '1'] || 'Otro',
      notes: invoice.notes || undefined,
    }

    let xmlContent: string
    try {
      xmlContent = generateUBL21XML(xmlInput)
    } catch (error) {
      logger.error('Error generando XML UBL 2.1:', error)
      return NextResponse.json(
        {
          error: `Error al generar el XML de la factura: ${error instanceof Error ? error.message : 'Desconocido'}`,
        },
        { status: 500 },
      )
    }

    // 4. Firmar XML (si hay certificado configurado)
    let finalXml = xmlContent
    let signedXml = false
    try {
      const signResult = await signXMLForDIAN(xmlContent)
      finalXml = signResult.signedXml
      signedXml = true
    } catch (signError) {
      logger.warn(
        'Certificado no configurado o error al firmar XML. Se enviara sin firma:',
        signError instanceof Error ? signError.message : 'Desconocido',
      )
      // Continuar con XML sin firma
    }

    // 5. Enviar a la DIAN
    const sendResult = await sendBillAsync(finalXml, {
      testMode: invoice.testMode,
      timeout: 30000,
    })

    if (!sendResult.success || !sendResult.trackId) {
      // Guardar respuesta de error
      const errorResponse = JSON.stringify({
        success: false,
        errorMessage: sendResult.errorMessage,
        errorCode: sendResult.errorCode,
        statusCode: sendResult.statusCode,
        timestamp: sendResult.timestamp,
        signed: signedXml,
      })

      await db.invoice.update({
        where: { id: Number(id) },
        data: {
          dianResponse: errorResponse,
          xmlContent,
        },
      })

      return NextResponse.json(
        {
          error: `Error al enviar la factura a la DIAN: ${sendResult.errorMessage || 'No se obtuvo TrackId'}`,
          errorCode: sendResult.errorCode,
        },
        { status: 502 },
      )
    }

    // 6. Guardar trackId y actualizar estado
    const sentAt = new Date()
    await db.invoice.update({
      where: { id: Number(id) },
      data: {
        status: 'PENDING_VALIDATE',
        sentAt,
        dianResponse: JSON.stringify({
          trackId: sendResult.trackId,
          sentAt: sentAt.toISOString(),
          signed: signedXml,
          statusCode: sendResult.statusCode,
        }),
        xmlContent,
      },
    })

    // 7. Sondear estado (pollForStatus)
    const pollResult = await pollForStatus(
      sendResult.trackId,
      { testMode: invoice.testMode },
      { maxAttempts: 36, intervalMs: 5000 },
    )

    // 8. Actualizar estado segun resultado del sondeo
    const updateData: Record<string, unknown> = {
      dianResponse: JSON.stringify({
        trackId: sendResult.trackId,
        sentAt: sentAt.toISOString(),
        signed: signedXml,
        statusCode: sendResult.statusCode,
        pollResult: {
          statusCode: pollResult.statusCode,
          statusMessage: pollResult.statusMessage,
          success: pollResult.success,
          errorMessage: pollResult.errorMessage,
          errorCode: pollResult.errorCode,
          timestamp: pollResult.timestamp,
        },
      }),
    }

    if (pollResult.statusCode === '10010' || pollResult.statusCode === '10012') {
      updateData.status = 'VALIDATED'
      updateData.validatedAt = new Date()
    } else if (pollResult.statusCode === '10011') {
      updateData.status = 'REJECTED'
      updateData.dianErrorCode = pollResult.errorCode || pollResult.statusCode
    }
    // Si es 10009 (pendiente) o timeout, se mantiene PENDING_VALIDATE

    const updatedInvoice = await db.invoice.update({
      where: { id: Number(id) },
      data: updateData,
    })

    return NextResponse.json({
      id: updatedInvoice.id,
      invoiceNumber: formatInvoiceNumber(updatedInvoice.prefix, updatedInvoice.consecutive),
      status: updatedInvoice.status,
      trackId: sendResult.trackId,
      signed: signedXml,
      pollResult: {
        statusCode: pollResult.statusCode,
        statusMessage: pollResult.statusMessage,
        success: pollResult.success,
        errorMessage: pollResult.errorMessage,
      },
      sentAt: sentAt.toISOString(),
      validatedAt: updateData.validatedAt instanceof Date
        ? (updateData.validatedAt as Date).toISOString()
        : null,
    })
  } catch (error) {
    logger.error('POST /api/invoices/[id]/send error:', error)
    return NextResponse.json(
      { error: 'Error interno al enviar la factura a la DIAN' },
      { status: 500 },
    )
  }
}
