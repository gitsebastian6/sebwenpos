import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { generateUBL21XML } from '@/lib/invoicing/xml-generator'
import { signXMLForDIAN } from '@/lib/invoicing/certificate'
import { sendBillAsync, pollForStatus } from '@/lib/invoicing/soap-client'
import { decryptField } from '@/lib/field-encryption'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { getSoftwareProviderNIT, getSoftwareName, DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// ─── POST: Retransmitir factura de contingencia a la DIAN ─────────────────
// POST /api/contingency-invoices/[id]/retransmit?storeId=X
//
// Flujo:
// 1. Validar que la factura de contingencia existe y está en DRAFT o REJECTED
// 2. Regenerar XML UBL 2.1 si no existe (o usar el existente)
// 3. Firmar XML con certificado
// 4. Enviar a DIAN via SendBillAsync
// 5. Guardar trackId, actualizar estado a PENDING_RETRANSMIT
// 6. Sondear estado (pollForStatus) hasta obtener resultado definitivo
// 7. Actualizar estado según resultado: RETRANSMITTED o REJECTED
// 8. Registrar contingencyEnd y retransmittedAt

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

    // 1. Obtener factura de contingencia con datos completos
    const contingency = await db.contingencyInvoice.findFirst({
      where: { id: Number(id), storeId },
      include: {
        invoice: {
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
        },
        store: {
          select: {
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

    if (!contingency) {
      return NextResponse.json({ error: 'Factura de contingencia no encontrada' }, { status: 404 })
    }

    // 2. Validar estado
    if (contingency.status !== 'DRAFT' && contingency.status !== 'REJECTED') {
      return NextResponse.json(
        {
          error: `Solo se pueden retransmitir facturas en estado BORRADOR (DRAFT) o RECHAZADA (REJECTED). Estado actual: "${contingency.status}".`,
        },
        { status: 400 },
      )
    }

    // Usar la tienda del invoice original si existe, si no la de la contingency
    const store = contingency.invoice?.store || contingency.store

    // 3. Obtener o regenerar XML
    let xmlContent = contingency.xmlContent

    // Si no hay XML, generarlo desde los datos de la factura original
    if (!xmlContent && contingency.invoice) {
      const invoice = contingency.invoice
      try {
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')

        const taxBreakdown = JSON.parse(invoice.taxBreakdown || '[]')
        const xmlItems = (invoice.order?.orderItems || []).map((item, idx) => ({
          lineNumber: idx + 1,
          description: (() => {
            const baseName = item.product?.name ?? item.service?.name ?? 'Eliminado'
            return item.presentationName ? `${baseName} — ${item.presentationName}` : baseName
          })(),
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
        const softwarePIN = decryptField(store.softwarePin || '') || process.env.DIAN_SOFTWARE_PIN || ''

        const paymentMethodNames: Record<string, string> = {
          '1': 'Efectivo', '2': 'Tarjeta', '10': 'Transferencia', '42': 'Daviplata/Nequi', '99': 'Otro/Mixto',
        }

        const retransmitNotes = contingency.reason
          ? `[RETRANSMISIÓN CONTINGENCIA TIPO ${contingency.contingencyType}] ${contingency.reason}`
          : `[RETRANSMISIÓN CONTINGENCIA TIPO ${contingency.contingencyType}] Factura original ${formatInvoiceNumber(invoice.prefix, invoice.consecutive)}`

        xmlContent = generateUBL21XML({
          invoiceNumber: formatInvoiceNumber(contingency.prefix, contingency.consecutive),
          prefix: contingency.prefix,
          consecutive: contingency.consecutive,
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
          customerNit: contingency.customerNit || DIAN_CONSUMIDOR_FINAL_NIT,
          customerName: contingency.customerName || 'Consumidor Final',
          customerAddress: contingency.customerAddress || undefined,
          customerPhone: contingency.customerPhone || undefined,
          customerEmail: contingency.customerEmail || undefined,
          customerRegime: contingency.customerRegime || undefined,
          customerType: contingency.customerType || undefined,
          lineExtensionAmount: Number(contingency.subtotalBase),
          taxExclusiveAmount: Number(contingency.subtotalBase),
          taxInclusiveAmount: Number(contingency.totalWithTax),
          payableAmount: Number(contingency.grandTotal),
          discountAmount: Number(contingency.discountAmount),
          cufe: contingency.contingencyCufe || '',
          softwareProviderNIT,
          softwareName,
          softwarePIN,
          items: xmlItems,
          taxTotals: taxBreakdown.map((t) => ({
            taxCode: t.code, taxableAmount: t.base, taxAmount: t.amount, taxRate: t.rate, taxName: t.name,
          })),
          paymentMethodCode: invoice.paymentMethod || '1',
          paymentMethodName: paymentMethodNames[invoice.paymentMethod || '1'] || 'Otro',
          notes: retransmitNotes,
        })

        // Guardar XML generado
        await db.contingencyInvoice.update({
          where: { id: contingency.id },
          data: { xmlContent },
        })
      } catch (xmlError) {
        logger.error('Error regenerando XML para retransmisión:', xmlError)
        return NextResponse.json(
          {
            error: `Error al generar el XML para retransmisión: ${xmlError instanceof Error ? xmlError.message : 'Desconocido'}`,
          },
          { status: 500 },
        )
      }
    }

    if (!xmlContent) {
      return NextResponse.json(
        { error: 'No se pudo generar el XML de la factura de contingencia. Verifique que la factura original tenga datos completos.' },
        { status: 500 },
      )
    }

    // 4. Firmar XML con certificado
    let finalXml = xmlContent
    let signedXml = false
    try {
      const signResult = await signXMLForDIAN(xmlContent, storeId)
      finalXml = signResult.signedXml
      signedXml = true
    } catch (signError) {
      logger.warn(
        '[ContingencyRetransmit] Certificado no configurado o error al firmar:',
        signError instanceof Error ? signError.message : 'Desconocido',
      )
    }

    // 5. Enviar a la DIAN
    const sendResult = await sendBillAsync(finalXml, {
      testMode: contingency.testMode,
      timeout: 30000,
    })

    if (!sendResult.success || !sendResult.trackId) {
      const errorResponse = JSON.stringify({
        success: false,
        errorMessage: sendResult.errorMessage,
        errorCode: sendResult.errorCode,
        statusCode: sendResult.statusCode,
        timestamp: sendResult.timestamp,
        signed: signedXml,
      })

      await db.contingencyInvoice.update({
        where: { id: contingency.id },
        data: { dianResponse: errorResponse },
      })

      return NextResponse.json(
        {
          error: `Error al retransmitir la factura de contingencia a la DIAN: ${sendResult.errorMessage || 'No se obtuvo TrackId'}`,
          errorCode: sendResult.errorCode,
        },
        { status: 502 },
      )
    }

    // 6. Actualizar estado a PENDING_RETRANSMIT
    const sentAt = new Date()
    await db.contingencyInvoice.update({
      where: { id: contingency.id },
      data: {
        status: 'PENDING_RETRANSMIT',
        retransmittedAt: sentAt,
        dianResponse: JSON.stringify({
          trackId: sendResult.trackId,
          sentAt: sentAt.toISOString(),
          signed: signedXml,
          statusCode: sendResult.statusCode,
        }),
      },
    })

    // 7. Sondear estado (pollForStatus)
    const pollResult = await pollForStatus(
      sendResult.trackId,
      { testMode: contingency.testMode },
      { maxAttempts: 36, intervalMs: 5000 },
    )

    // 8. Actualizar estado según resultado del sondeo
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
      updateData.status = 'RETRANSMITTED'
      updateData.contingencyEnd = new Date()
    } else if (pollResult.statusCode === '10011') {
      updateData.status = 'REJECTED'
    }

    const updatedContingency = await db.contingencyInvoice.update({
      where: { id: contingency.id },
      data: updateData,
    })

    return NextResponse.json({
      id: updatedContingency.id,
      invoiceNumber: formatInvoiceNumber(updatedContingency.prefix, updatedContingency.consecutive),
      status: updatedContingency.status,
      trackId: sendResult.trackId,
      signed: signedXml,
      pollResult: {
        statusCode: pollResult.statusCode,
        statusMessage: pollResult.statusMessage,
        success: pollResult.success,
        errorMessage: pollResult.errorMessage,
      },
      sentAt: sentAt.toISOString(),
      contingencyEnd: updateData.contingencyEnd instanceof Date
        ? (updateData.contingencyEnd as Date).toISOString()
        : null,
    })
  } catch (error) {
    logger.error('POST /api/contingency-invoices/[id]/retransmit error:', error)
    return NextResponse.json(
      { error: 'Error interno al retransmitir la factura de contingencia a la DIAN' },
      { status: 500 },
    )
  }
}
