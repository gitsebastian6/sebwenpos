// ─── Re-exports from all DIAN modules ───────────────────────────────────────

export { getNextConsecutive } from './consecutive-counter'
export type { ConsecutiveResult } from './consecutive-counter'

export { generateCUFE, generateCUDFE } from './cufe-generator'
export type { CUFEInput } from './cufe-generator'

export { generateUBL21XML } from './xml-generator'
export type { InvoiceXMLInput } from './xml-generator'

export { loadCertificate, signXML, verifyCertificateConfig } from './certificate'
export type { CertificateConfig, LoadedCertificate, CertificateVerificationResult } from './certificate'

export { generateInvoicePDF, generateInvoicePDFBase64 } from './pdf-generator'
export type { InvoicePDFData } from './pdf-generator'

export { sendInvoiceEmail } from './email-sender'
export type { EmailConfig, InvoiceEmailData, SendEmailResult } from './email-sender'

export { sendBillToDIAN, getDIANStatus, getStatusByDocument, pollDIANStatus, getDIANCatalogURL } from './soap-client'
export type { DIANConfig, SendBillResult, StatusResult } from './soap-client'

// ─── Internal imports for orchestrator ──────────────────────────────────────

import { getNextConsecutive } from './consecutive-counter'
import { generateCUFE } from './cufe-generator'
import { generateUBL21XML } from './xml-generator'
import { generateInvoicePDF, generateInvoicePDFBase64 } from './pdf-generator'
import { sendInvoiceEmail } from './email-sender'
import { formatInvoiceNumber, calculateInvoiceFromOrder, generateQRCodeURL, getDIANPaymentCode } from '@/lib/invoice-utils'
import { db } from '@/lib/db'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FullInvoiceProcessResult {
  invoice: any
  xmlContent?: string
  pdfBuffer?: Buffer
  trackId?: string
}

export interface ProcessInvoiceParams {
  storeId: number
  orderId: number
  customerNit?: string
  customerName?: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  customerRegime?: string
  customerType?: string
  notes?: string
  autoSendToDIAN?: boolean
  certPath?: string
  certPassword?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Gets current date/time in DIAN-required formats.
 */
function getIssueTimestamps() {
  const now = new Date()
  const colombiaOffset = -5 * 60
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const colombia = new Date(utc + colombiaOffset * 60000)

  const issueDate = colombia.toISOString().split('T')[0] // YYYY-MM-DD
  const issueTimeHHmm = `${String(colombia.getHours()).padStart(2, '0')}:${String(colombia.getMinutes()).padStart(2, '0')}`
  const issueTimeHHmmss = `${String(colombia.getHours()).padStart(2, '0')}${String(colombia.getMinutes()).padStart(2, '0')}${String(colombia.getSeconds()).padStart(2, '0')}`
  const issueTimeHHmmssSSS = issueTimeHHmmss + String(colombia.getMilliseconds()).padStart(3, '0')
  const issueDateCompact = issueDate.replace(/-/g, '') // YYYYMMDD

  return {
    issueDate,
    issueTimeHHmm,
    issueTimeHHmmss,
    issueTimeHHmmssSSS,
    issueDateCompact,
  }
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Complete invoice generation flow:
 * 1. Get next consecutive (atomic)
 * 2. Generate CUFE
 * 3. Generate XML UBL 2.1
 * 4. Generate PDF representation
 * 5. Create invoice record in DB
 * 6. Optionally send to DIAN
 *
 * @throws Error if store has no resolution, order is invalid, etc.
 */
export async function processInvoice(
  params: ProcessInvoiceParams,
): Promise<FullInvoiceProcessResult> {
  const {
    storeId,
    orderId,
    customerNit = '222222222222',
    customerName = 'CONSUMIDOR FINAL',
    customerAddress,
    customerPhone,
    customerEmail,
    customerRegime,
    customerType,
    notes,
    autoSendToDIAN = false,
    certPath,
    certPassword,
  } = params

  // ── 1. Load order with items, customer, and store ─────────────────────
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      customer: true,
      store: true,
      orderItems: {
        include: { product: { select: { name: true } }, service: { select: { name: true } } },
        orderBy: { id: 'asc' },
      },
    },
  })

  if (order.status === 'CANCELLED') {
    throw new Error('No se puede generar factura para una orden cancelada.')
  }

  // Check for existing invoice
  const existingInvoice = await db.invoice.findUnique({
    where: { orderId },
  })
  if (existingInvoice) {
    throw new Error(
      `La orden #${order.orderNumber} ya tiene una factura generada: ${existingInvoice.prefix}-${String(existingInvoice.consecutive).padStart(8, '0')}`
    )
  }

  const store = order.store
  if (!store.nit) {
    throw new Error('La tienda no tiene NIT configurado. Configure la información fiscal antes de generar facturas.')
  }

  // ── 2. Get next consecutive (atomic) ─────────────────────────────────
  const consec = await getNextConsecutive(storeId)
  if (consec.warn) {
    console.warn(`[DIAN] ${consec.warn}`)
  }

  // ── 3. Calculate invoice data from order items ───────────────────────
  const orderItemsForCalc = order.orderItems.map((item) => ({
    taxCode: item.taxCode,
    taxRate: item.taxRate,
    taxAmount: item.taxAmount,
    taxBase: item.taxBase,
  }))

  const calc = calculateInvoiceFromOrder(
    {
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      tipAmount: order.tipAmount,
      discountAmount: order.discountAmount,
      paymentMethod: order.paymentMethod,
      taxBreakdown: order.taxBreakdown,
    },
    orderItemsForCalc,
  )

  // ── 4. Generate timestamps ───────────────────────────────────────────
  const timestamps = getIssueTimestamps()
  const paymentCode = getDIANPaymentCode(order.paymentMethod)
  const invoiceNumber = formatInvoiceNumber(consec.prefix, consec.consecutive)

  // ── 5. Generate CUFE ─────────────────────────────────────────────────
  const cufe = generateCUFE({
    storeNit: store.nit,
    issueDate: timestamps.issueDateCompact,
    issueTime: timestamps.issueTimeHHmmssSSS,
    prefix: consec.prefix,
    consecutive: consec.consecutive,
    customerNit,
    subtotalBase: calc.subtotalBase,
    totalWithoutTax: calc.subtotalBase, // total sin impuestos = base gravable
    totalTaxAmount: calc.totalTaxAmount,
    discountAmount: calc.discountAmount,
    grandTotal: calc.grandTotal,
    currencyCode: store.currencyCode,
  })

  // ── 6. Generate QR code URL ──────────────────────────────────────────
  const qrCodeURL = generateQRCodeURL({
    storeNit: store.nit,
    prefix: consec.prefix,
    consecutive: consec.consecutive,
    date: timestamps.issueDate,
    grandTotal: calc.grandTotal,
    cufe,
  })

  // ── 7. Generate XML UBL 2.1 (without PDF yet) ──────────────────────
  const xmlItems = order.orderItems.map((item, idx) => ({
    lineNumber: idx + 1,
    description: item.product?.name ?? item.service?.name ?? `Item ${idx + 1}`,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineExtensionAmount: item.unitPrice * item.quantity,
    taxCode: item.taxCode ?? undefined,
    taxRate: item.taxRate || undefined,
    taxAmount: item.taxAmount || undefined,
    taxBase: item.taxBase || undefined,
  }))

  let xmlContent = generateUBL21XML({
    storeNit: store.nit,
    storeName: store.name,
    storeLegalName: store.legalName ?? undefined,
    storeAddress: store.address ?? undefined,
    storePhone: store.phone ?? undefined,
    prefix: consec.prefix,
    consecutive: consec.consecutive,
    resolutionNumber: consec.resolutionNumber ?? '',
    resolutionStartDate: consec.resolutionStartDate
      ? consec.resolutionStartDate.toISOString().split('T')[0]
      : '',
    resolutionEndDate: consec.resolutionEndDate
      ? consec.resolutionEndDate.toISOString().split('T')[0]
      : '',
    resolutionStartNumber: consec.resolutionStartNumber ?? 1,
    resolutionEndNumber: consec.resolutionEndNumber ?? 99999999,
    customerNit,
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    customerRegime,
    customerType,
    issueDate: timestamps.issueDate,
    issueTime: `${timestamps.issueTimeHHmmss}-05:00`,
    currencyCode: store.currencyCode,
    notes,
    subtotalBase: calc.subtotalBase,
    totalWithTax: calc.totalWithTax,
    totalTaxAmount: calc.totalTaxAmount,
    discountAmount: calc.discountAmount,
    tipAmount: calc.tipAmount,
    grandTotal: calc.grandTotal,
    taxBreakdown: calc.taxBreakdown,
    items: xmlItems,
    cufe,
    testMode: store.invoiceTestMode,
  })

  // ── 8. Generate PDF and get base64 ───────────────────────────────────
  const pdfData = {
    storeName: store.name,
    storeLegalName: store.legalName ?? undefined,
    storeNit: store.nit,
    storeAddress: store.address ?? undefined,
    storePhone: store.phone ?? undefined,
    prefix: consec.prefix,
    consecutive: consec.consecutive,
    resolutionNumber: consec.resolutionNumber ?? '',
    resolutionStartDate: consec.resolutionStartDate
      ? consec.resolutionStartDate.toISOString().split('T')[0]
      : '',
    resolutionEndDate: consec.resolutionEndDate
      ? consec.resolutionEndDate.toISOString().split('T')[0]
      : '',
    resolutionStartNumber: consec.resolutionStartNumber ?? 1,
    resolutionEndNumber: consec.resolutionEndNumber ?? 99999999,
    customerNit,
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    customerRegime,
    invoiceNumber,
    issueDate: timestamps.issueDate,
    issueTime: timestamps.issueTimeHHmm,
    currencyCode: store.currencyCode,
    subtotalBase: calc.subtotalBase,
    taxExemptAmount: calc.taxExemptAmount,
    totalTaxAmount: calc.totalTaxAmount,
    totalWithTax: calc.totalWithTax,
    discountAmount: calc.discountAmount,
    tipAmount: calc.tipAmount,
    grandTotal: calc.grandTotal,
    taxBreakdown: calc.taxBreakdown,
    items: order.orderItems.map((item) => ({
      description: item.product?.name ?? item.service?.name ?? `Item`,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.totalRow,
      taxRate: item.taxRate,
      taxAmount: item.taxAmount,
      notes: item.notes ?? undefined,
    })),
    cufe,
    qrCodeURL,
    paymentMethod: paymentCode,
    status: store.invoiceTestMode ? 'DRAFT' : 'PENDING_VALIDATE',
    notes,
    testMode: store.invoiceTestMode,
  }

  const pdfBuffer = await generateInvoicePDF(pdfData)
  const pdfBase64 = pdfBuffer.toString('base64')

  // ── 9. Regenerate XML with PDF base64 embedded ───────────────────────
  xmlContent = generateUBL21XML({
    storeNit: store.nit,
    storeName: store.name,
    storeLegalName: store.legalName ?? undefined,
    storeAddress: store.address ?? undefined,
    storePhone: store.phone ?? undefined,
    prefix: consec.prefix,
    consecutive: consec.consecutive,
    resolutionNumber: consec.resolutionNumber ?? '',
    resolutionStartDate: consec.resolutionStartDate
      ? consec.resolutionStartDate.toISOString().split('T')[0]
      : '',
    resolutionEndDate: consec.resolutionEndDate
      ? consec.resolutionEndDate.toISOString().split('T')[0]
      : '',
    resolutionStartNumber: consec.resolutionStartNumber ?? 1,
    resolutionEndNumber: consec.resolutionEndNumber ?? 99999999,
    customerNit,
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    customerRegime,
    customerType,
    issueDate: timestamps.issueDate,
    issueTime: `${timestamps.issueTimeHHmmss}-05:00`,
    currencyCode: store.currencyCode,
    notes,
    subtotalBase: calc.subtotalBase,
    totalWithTax: calc.totalWithTax,
    totalTaxAmount: calc.totalTaxAmount,
    discountAmount: calc.discountAmount,
    tipAmount: calc.tipAmount,
    grandTotal: calc.grandTotal,
    taxBreakdown: calc.taxBreakdown,
    items: xmlItems,
    cufe,
    testMode: store.invoiceTestMode,
    pdfBase64,
  })

  // ── 10. Create invoice record in DB ──────────────────────────────────
  const invoice = await db.invoice.create({
    data: {
      storeId,
      orderId,
      prefix: consec.prefix,
      consecutive: consec.consecutive,
      resolutionNumber: consec.resolutionNumber,
      resolutionDate: consec.resolutionStartDate,
      startDate: consec.resolutionStartDate,
      endDate: consec.resolutionEndDate,
      startNumber: consec.resolutionStartNumber,
      endNumber: consec.resolutionEndNumber,
      customerNit,
      customerName,
      customerAddress,
      customerPhone,
      customerEmail,
      customerRegime,
      customerType,
      subtotalBase: Math.round(calc.subtotalBase),
      taxExemptAmount: Math.round(calc.taxExemptAmount),
      taxBreakdown: JSON.stringify(calc.taxBreakdown),
      totalTaxAmount: Math.round(calc.totalTaxAmount),
      totalWithTax: Math.round(calc.totalWithTax),
      discountAmount: Math.round(calc.discountAmount),
      tipAmount: Math.round(calc.tipAmount),
      grandTotal: Math.round(calc.grandTotal),
      paymentMethod: paymentCode,
      cufe,
      qrCode: qrCodeURL,
      xmlContent,
      notes,
      status: store.invoiceTestMode ? 'DRAFT' : 'PENDING_VALIDATE',
      testMode: store.invoiceTestMode,
    },
  })

  // ── 11. Optionally send to DIAN ──────────────────────────────────────
  let trackId: string | undefined

  if (autoSendToDIAN && !store.invoiceTestMode && certPath && certPassword) {
    try {
      // Dynamic import for soap-client to avoid build-time errors if module not yet created
      let soapModule: any
      try {
        soapModule = await import('./soap-client')
      } catch {
        console.warn('[DIAN] soap-client module not available. Skipping DIAN send.')
        return { invoice, xmlContent, pdfBuffer, trackId: undefined }
      }

      const result = await soapModule.sendBillToDIAN({
        xmlContent,
        certPath,
        certPassword,
        testMode: false,
      })

      if (result.success && result.trackId) {
        trackId = result.trackId
        await db.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'PENDING_VALIDATE',
            sentAt: new Date(),
            dianResponse: JSON.stringify(result),
          },
        })
      } else {
        await db.invoice.update({
          where: { id: invoice.id },
          data: {
            dianResponse: JSON.stringify(result),
            dianErrorCode: result.errorMessage ?? 'UNKNOWN',
          },
        })
      }
    } catch (err: any) {
      // soap-client module not available yet — log but don't fail
      console.warn(
        `[DIAN] No se pudo enviar a la DIAN: ${err?.message ?? err}`
      )
    }
  }

  return {
    invoice,
    xmlContent,
    pdfBuffer,
    trackId,
  }
}

/**
 * Send an invoice email to the customer after generation.
 * Convenience wrapper around sendInvoiceEmail from email-sender.
 */
export async function emailInvoice(
  emailConfig: import('./email-sender').EmailConfig,
  invoiceId: number,
) {
  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { store: true, order: true },
  })

  if (!invoice.customerEmail) {
    throw new Error('La factura no tiene email del cliente.')
  }

  if (!invoice.xmlContent) {
    throw new Error('La factura no tiene contenido XML generado.')
  }

  // Generate PDF if not already available
  const order = invoice.order
  const store = invoice.store
  const storeName = store.name
  const storeNit = store.nit ?? ''

  // We need the pdfBuffer — regenerate it
  // Parse tax breakdown
  let taxBreakdown: any[] = []
  try {
    taxBreakdown = JSON.parse(invoice.taxBreakdown ?? '[]')
  } catch {
    // ignore parse errors
  }

  // Build the PDF data from the invoice record
  const pdfData = {
    storeName: store.name,
    storeLegalName: store.legalName ?? undefined,
    storeNit: storeNit,
    storeAddress: store.address ?? undefined,
    storePhone: store.phone ?? undefined,
    prefix: invoice.prefix,
    consecutive: invoice.consecutive,
    resolutionNumber: invoice.resolutionNumber ?? '',
    resolutionStartDate: invoice.startDate
      ? invoice.startDate.toISOString().split('T')[0]
      : '',
    resolutionEndDate: invoice.endDate
      ? invoice.endDate.toISOString().split('T')[0]
      : '',
    resolutionStartNumber: invoice.startNumber ?? 1,
    resolutionEndNumber: invoice.endNumber ?? 99999999,
    customerNit: invoice.customerNit ?? '222222222222',
    customerName: invoice.customerName ?? 'CONSUMIDOR FINAL',
    customerAddress: invoice.customerAddress ?? undefined,
    customerPhone: invoice.customerPhone ?? undefined,
    customerEmail: invoice.customerEmail ?? undefined,
    customerRegime: invoice.customerRegime ?? undefined,
    invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
    issueDate: invoice.createdAt.toISOString().split('T')[0],
    issueTime: invoice.createdAt.toTimeString().slice(0, 5),
    currencyCode: store.currencyCode,
    subtotalBase: invoice.subtotalBase,
    taxExemptAmount: invoice.taxExemptAmount,
    totalTaxAmount: invoice.totalTaxAmount,
    totalWithTax: invoice.totalWithTax,
    discountAmount: invoice.discountAmount,
    tipAmount: invoice.tipAmount,
    grandTotal: invoice.grandTotal,
    taxBreakdown,
    items: [], // items not available from invoice record alone
    cufe: invoice.cufe ?? '',
    qrCodeURL: invoice.qrCode ?? '',
    paymentMethod: invoice.paymentMethod ?? '99',
    status: invoice.status,
    notes: invoice.notes ?? undefined,
    testMode: invoice.testMode,
  }

  const pdfBuffer = await generateInvoicePDF(pdfData)

  const result = await sendInvoiceEmail(emailConfig, {
    to: invoice.customerEmail,
    customerName: invoice.customerName ?? 'Cliente',
    invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
    grandTotal: invoice.grandTotal,
    issueDate: invoice.createdAt.toISOString().split('T')[0],
    currencyCode: store.currencyCode,
    xmlContent: invoice.xmlContent,
    pdfBuffer,
    qrCodeURL: invoice.qrCode ?? '',
    storeName,
  })

  if (result.success) {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { emailedAt: new Date() },
    })
  }

  return result
}
