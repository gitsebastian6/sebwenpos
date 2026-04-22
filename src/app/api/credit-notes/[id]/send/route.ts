import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { signXMLForDIAN } from '@/lib/invoicing/certificate'
import { sendBillAsync, pollForStatus } from '@/lib/invoicing/soap-client'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { getSoftwareProviderNIT, getSoftwareName, DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// ─── POST: Enviar nota crédito/débito a la DIAN ────────────────────────────
// POST /api/credit-notes/[id]/send?storeId=X
//
// Flujo completo:
// 1. Validar nota existe y está en DRAFT o REJECTED
// 2. Leer nota con datos completos de tienda y factura referenciada
// 3. Generar XML UBL 2.1 (CreditNote o DebitNote)
// 4. Firmar XML (si hay certificado configurado)
// 5. Enviar a DIAN via SendBillAsync
// 6. Guardar trackId, actualizar estado a PENDING_VALIDATE
// 7. Sondear estado (pollForStatus) hasta obtener resultado definitivo
// 8. Actualizar estado según resultado de la DIAN

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const storeId = z.coerce.number().int().positive().parse(url.searchParams.get('storeId'))

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    // 1. Obtener nota crédito/débito con datos completos
    const creditNote = await db.creditNote.findFirst({
      where: { id: Number(id), storeId },
      include: {
        invoice: {
          select: {
            prefix: true,
            consecutive: true,
            cufe: true,
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
            user: { select: { email: true } },
          },
        },
      },
    })

    if (!creditNote) {
      return NextResponse.json(
        { error: 'Nota crédito/débito no encontrada' },
        { status: 404 },
      )
    }

    // 2. Validar estado
    if (creditNote.status !== 'DRAFT' && creditNote.status !== 'REJECTED') {
      return NextResponse.json(
        {
          error: `Solo se pueden enviar notas en estado BORRADOR (DRAFT) o RECHAZADA (REJECTED). Estado actual: "${creditNote.status}".`,
        },
        { status: 400 },
      )
    }

    // 3. Verificar que la nota tenga factura referenciada
    if (!creditNote.invoice) {
      return NextResponse.json(
        { error: 'La nota debe tener una factura original referenciada para enviar a la DIAN.' },
        { status: 400 },
      )
    }

    const store = creditNote.store

    // 4. Construir XML para Nota Crédito/Débito
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10)
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const issueTime = `${hours}:${minutes}:${seconds}-05:00`

    const taxBreakdown = JSON.parse(creditNote.taxBreakdown || '[]')

    // Tipo de documento DIAN: 91=Nota Crédito, 92=Nota Débito
    const invoiceTypeCode = creditNote.noteType === 'DEBIT' ? '92' : '91'
    const documentTypeName = creditNote.noteType === 'DEBIT'
      ? 'Nota Débito Electrónica'
      : 'Nota Crédito Electrónica'

    // Número de la factura original referenciada
    const referencedInvoiceNumber = creditNote.invoice
      ? formatInvoiceNumber(creditNote.invoice.prefix, creditNote.invoice.consecutive)
      : ''
    const referencedCUDE = creditNote.invoice?.cufe || creditNote.referencedInvoiceId || ''

    // Configuración del proveedor tecnológico
    const softwareProviderNIT = getSoftwareProviderNIT()
    const softwareName = getSoftwareName()
    const softwarePIN = process.env.DIAN_SOFTWARE_PIN || ''

    // Generar XML UBL 2.1 para Nota Crédito/Débito
    const xmlContent = buildCreditNoteXML({
      noteNumber: formatInvoiceNumber(creditNote.prefix, creditNote.consecutive),
      prefix: creditNote.prefix,
      consecutive: creditNote.consecutive,
      issueDate,
      issueTime,
      invoiceTypeCode,
      documentTypeName,
      resolutionNumber: creditNote.resolutionNumber || store.resolutionNumber || '',
      resolutionStartDate: creditNote.startDate?.toISOString().slice(0, 10) || store.resolutionStartDate?.toISOString().slice(0, 10) || '',
      resolutionEndDate: creditNote.endDate?.toISOString().slice(0, 10) || store.resolutionEndDate?.toISOString().slice(0, 10) || '',
      startNumber: creditNote.startNumber || store.resolutionStartNumber || 1,
      endNumber: creditNote.endNumber || store.resolutionEndNumber || 99999,
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
      customerNit: creditNote.customerNit || DIAN_CONSUMIDOR_FINAL_NIT,
      customerName: creditNote.customerName || 'Consumidor Final',
      customerAddress: creditNote.customerAddress || undefined,
      customerPhone: creditNote.customerPhone || undefined,
      customerEmail: creditNote.customerEmail || undefined,
      customerRegime: creditNote.customerRegime || undefined,
      customerType: creditNote.customerType || undefined,
      concept: creditNote.concept,
      description: creditNote.description || undefined,
      referencedInvoiceNumber,
      referencedCUDE,
      referencedIssueDate: creditNote.invoice ? new Date().toISOString().slice(0, 10) : '',
      lineExtensionAmount: Number(creditNote.subtotalBase),
      taxExclusiveAmount: Number(creditNote.subtotalBase),
      taxInclusiveAmount: Number(creditNote.totalWithTax),
      payableAmount: Number(creditNote.grandTotal),
      discountAmount: Number(creditNote.discountAmount),
      cufe: creditNote.cufe || '',
      softwareProviderNIT,
      softwareName,
      softwarePIN,
      taxTotals: taxBreakdown.map((t) => ({
        taxCode: t.code,
        taxableAmount: t.base,
        taxAmount: t.amount,
        taxRate: t.rate,
        taxName: t.name,
      })),
      notes: creditNote.notes || undefined,
    })

    // 5. Firmar XML (si hay certificado configurado)
    let finalXml = xmlContent
    let signedXml = false
    try {
      const signResult = await signXMLForDIAN(xmlContent, storeId)
      finalXml = signResult.signedXml
      signedXml = true
    } catch (signError) {
      logger.warn(
        'Certificado no configurado o error al firmar XML para NC/ND. Se enviará sin firma:',
        signError instanceof Error ? signError.message : 'Desconocido',
      )
    }

    // 6. Enviar a la DIAN
    const sendResult = await sendBillAsync(finalXml, {
      testMode: creditNote.testMode,
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

      await db.creditNote.update({
        where: { id: Number(id) },
        data: {
          dianResponse: errorResponse,
          xmlContent,
        },
      })

      return NextResponse.json(
        {
          error: `Error al enviar la nota a la DIAN: ${sendResult.errorMessage || 'No se obtuvo TrackId'}`,
          errorCode: sendResult.errorCode,
        },
        { status: 502 },
      )
    }

    // 7. Guardar trackId y actualizar estado
    const sentAt = new Date()
    await db.creditNote.update({
      where: { id: Number(id) },
      data: {
        status: 'PENDING_VALIDATE',
        sentAt,
        xmlContent,
        dianResponse: JSON.stringify({
          trackId: sendResult.trackId,
          sentAt: sentAt.toISOString(),
          signed: signedXml,
          statusCode: sendResult.statusCode,
        }),
      },
    })

    // 8. Sondear estado (pollForStatus)
    const pollResult = await pollForStatus(
      sendResult.trackId,
      { testMode: creditNote.testMode },
      { maxAttempts: 36, intervalMs: 5000 },
    )

    // 9. Actualizar estado según resultado del sondeo
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
    }

    const updatedNote = await db.creditNote.update({
      where: { id: Number(id) },
      data: updateData,
    })

    return NextResponse.json({
      id: updatedNote.id,
      noteNumber: formatInvoiceNumber(updatedNote.prefix, updatedNote.consecutive),
      noteType: updatedNote.noteType,
      status: updatedNote.status,
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
    logger.error('POST /api/credit-notes/[id]/send error:', error)
    return NextResponse.json(
      { error: 'Error interno al enviar la nota a la DIAN' },
      { status: 500 },
    )
  }
}

// ─── XML Builder para Nota Crédito/Débito ──────────────────────────────────

interface CreditNoteXMLInput {
  noteNumber: string
  prefix: string
  consecutive: number
  issueDate: string
  issueTime: string
  invoiceTypeCode: string // 91=NC, 92=ND
  documentTypeName: string
  resolutionNumber: string
  resolutionStartDate: string
  resolutionEndDate: string
  startNumber: number
  endNumber: number
  currencyCode: string
  supplierNit: string
  supplierName: string
  supplierLegalName: string
  supplierAddress: string
  supplierCityCode: string
  supplierCityName: string
  supplierPhone: string
  supplierEmail: string
  supplierTaxRegime: string
  supplierMunicipality: string
  customerNit: string
  customerName: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  customerRegime?: string
  customerType?: string
  concept: string
  description?: string
  referencedInvoiceNumber: string
  referencedCUDE: string
  referencedIssueDate: string
  lineExtensionAmount: number
  taxExclusiveAmount: number
  taxInclusiveAmount: number
  payableAmount: number
  discountAmount: number
  cufe: string
  softwareProviderNIT: string
  softwareName: string
  softwarePIN: string
  taxTotals: Array<{
    taxCode: string
    taxableAmount: number
    taxAmount: number
    taxRate: number
    taxName: string
  }>
  notes?: string
}

/**
 * Genera XML UBL 2.1 para Nota Crédito (tipo 91) o Nota Débito (tipo 92).
 *
 * Estructura similar a factura de venta pero incluye:
 * - cac:BillingReference con referencia a la factura original
 * - cbc:DocumentTypeCode = "91" (NC) o "92" (ND)
 * - cbc:CreditNoteTypeCode para el concepto
 * - cac:DiscrepancyResponse con motivo
 */
function buildCreditNoteXML(input: CreditNoteXMLInput): string {
  const totalTaxAmount = input.taxTotals.reduce((sum, t) => sum + t.taxAmount, 0)

  // Helper: customer type to DIAN schemeID
  const customerTypeMap: Record<string, string> = {
    NIT: '31', CC: '13', CE: '22', TI: '12', PP: '42',
  }
  const customerSchemeID = customerTypeMap[input.customerType?.toUpperCase() ?? 'NIT'] ?? '31'

  // Helper: regime to DIAN code
  const regimeMap: Record<string, string> = {
    RESPONSABLE: '48', NO_RESPONSABLE: '49', SIMPLIFICADO: '50',
  }
  const customerRegimeCode = input.customerRegime
    ? regimeMap[input.customerRegime.toUpperCase()] ?? '49'
    : undefined

  // Helper: format amount
  const amt = (v: number) => String(Math.round(v))

  // ── Build XML ──────────────────────────────────────────────────────────
  const lines: string[] = []

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<CreditNote`)
  lines.push(`  xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"`)
  lines.push(`  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`)
  lines.push(`  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"`)
  lines.push(`  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`)
  lines.push(`  xmlns:sts="http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures"`)
  lines.push(`  xmlns:clm54217="urn:un:unece:uncefact:codelist:specification:54217:2001"`)
  lines.push(`  xmlns:clm66411="urn:un:unece:uncefact:codelist:specification:66411:2001"`)
  lines.push(`  xmlns:clmIAN8801="urn:un:unece:uncefact:codelist:specification:IAN8801:2005">`)

  // ── UBLExtensions ──
  lines.push(`  <ext:UBLExtensions>`)
  lines.push(`    <ext:UBLExtension>`)
  lines.push(`      <ext:ExtensionContent>`)
  lines.push(`        <sts:DianExtensions>`)

  // InvoiceControl
  lines.push(`          <sts:InvoiceControl>`)
  lines.push(`            <sts:InvoiceAuthorizationNumber>${input.resolutionNumber}</sts:InvoiceAuthorizationNumber>`)
  lines.push(`            <sts:AuthorizationPeriod>`)
  lines.push(`              <sts:StartDate>${input.resolutionStartDate}</sts:StartDate>`)
  lines.push(`              <sts:EndDate>${input.resolutionEndDate}</sts:EndDate>`)
  lines.push(`            </sts:AuthorizationPeriod>`)
  lines.push(`            <sts:AuthorizedInvoices>`)
  lines.push(`              <sts:Prefix>${input.prefix}</sts:Prefix>`)
  lines.push(`              <sts:From>${input.startNumber}</sts:From>`)
  lines.push(`              <sts:To>${input.endNumber}</sts:To>`)
  lines.push(`            </sts:AuthorizedInvoices>`)
  lines.push(`          </sts:InvoiceControl>`)

  // InvoiceSource (CUDFE)
  lines.push(`          <sts:InvoiceSource>`)
  lines.push(`            <sts:IdentificationCode listAgencyID="195" listAgencyName="CO, DIAN">${input.cufe}</sts:IdentificationCode>`)
  lines.push(`          </sts:InvoiceSource>`)

  // SoftwareProvider
  lines.push(`          <sts:SoftwareProvider>`)
  lines.push(`            <sts:ProviderID schemeAgencyID="195">${input.softwareProviderNIT}</sts:ProviderID>`)
  lines.push(`            <sts:SoftwareID>${input.softwareName}</sts:SoftwareID>`)
  lines.push(`          </sts:SoftwareProvider>`)

  lines.push(`        </sts:DianExtensions>`)
  lines.push(`      </ext:ExtensionContent>`)
  lines.push(`    </ext:UBLExtension>`)

  // PIN extension (if available)
  if (input.softwarePIN) {
    lines.push(`    <ext:UBLExtension>`)
    lines.push(`      <ext:ExtensionContent>`)
    lines.push(`        <sts:DianExtensions>`)
    lines.push(`          <sts:Security>`)
    lines.push(`            <sts:PIN>${input.softwarePIN}</sts:PIN>`)
    lines.push(`          </sts:Security>`)
    lines.push(`        </sts:DianExtensions>`)
    lines.push(`      </ext:ExtensionContent>`)
    lines.push(`    </ext:UBLExtension>`)
  }

  lines.push(`  </ext:UBLExtensions>`)

  // ── cbc:ID ──
  lines.push(`  <cbc:ID>${input.noteNumber}</cbc:ID>`)

  // ── IssueDate / IssueTime ──
  lines.push(`  <cbc:IssueDate>${input.issueDate}</cbc:IssueDate>`)
  lines.push(`  <cbc:IssueTime>${input.issueTime}</cbc:IssueTime>`)

  // ── DocumentTypeCode ──
  lines.push(`  <cbc:DocumentTypeCode listID="#6" listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listName="Invoice Type Code">${input.invoiceTypeCode}</cbc:DocumentTypeCode>`)

  // ── CreditNoteTypeCode (motivo) ──
  lines.push(`  <cbc:CreditNoteTypeCode listID="7" listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listName="Credit Note Type Code">1</cbc:CreditNoteTypeCode>`)

  // ── DocumentCurrencyCode ──
  lines.push(`  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listAgencyID="6">${input.currencyCode}</cbc:DocumentCurrencyCode>`)

  // ── CustomizationID ──
  lines.push(`  <cbc:CustomizationID>32</cbc:CustomizationID>`)

  // ── Notes ──
  if (input.notes) {
    lines.push(`  <cbc:Note><![CDATA[${input.notes}]]></cbc:Note>`)
  }

  // ── BillingReference (factura original) ──
  lines.push(`  <cac:BillingReference>`)
  lines.push(`    <cac:InvoiceDocumentReference>`)
  lines.push(`      <cbc:ID>${input.referencedInvoiceNumber}</cbc:ID>`)
  lines.push(`      <cbc:UUID>${input.referencedCUDE}</cbc:UUID>`)
  lines.push(`      <cbc:IssueDate>${input.referencedIssueDate}</cbc:IssueDate>`)
  lines.push(`    </cac:InvoiceDocumentReference>`)
  lines.push(`  </cac:BillingReference>`)

  // ── DiscrepancyResponse (motivo de la NC/ND) ──
  lines.push(`  <cac:DiscrepancyResponse>`)
  lines.push(`    <cbc:ReferenceID>1</cbc:ReferenceID>`)
  lines.push(`    <cbc:ResponseCode listID="7" listAgencyID="6" listName="Document Type Code">${input.invoiceTypeCode}</cbc:ResponseCode>`)
  lines.push(`    <cbc:Description><![CDATA[${input.concept}${input.description ? ' — ' + input.description : ''}]]></cbc:Description>`)
  lines.push(`  </cac:DiscrepancyResponse>`)

  // ── AccountingSupplierParty ──
  lines.push(`  <cac:AccountingSupplierParty>`)
  lines.push(`    <cac:Party>`)
  lines.push(`      <cbc:ID schemeID="31" schemeName="31 - NIT del emisor" schemeAgencyID="195" schemeAgencyName="CO, DIAN">${input.supplierNit}</cbc:ID>`)
  lines.push(`      <cac:PartyName><cbc:Name><![CDATA[${input.supplierName}]]></cbc:Name></cac:PartyName>`)
  lines.push(`      <cac:PostalAddress>`)
  if (input.supplierAddress) {
    lines.push(`        <cbc:StreetName><![CDATA[${input.supplierAddress}]]></cbc:StreetName>`)
  }
  lines.push(`        <cbc:CitySubdivisionName>${input.supplierMunicipality}</cbc:CitySubdivisionName>`)
  lines.push(`        <cbc:CityName schemeID="CO_DANE_8" schemeName="Divipola">${input.supplierCityCode}</cbc:CityName>`)
  lines.push(`        <cbc:PostalZone>${input.supplierCityCode}</cbc:PostalZone>`)
  lines.push(`        <cbc:CountrySubentity>${input.supplierCityName}</cbc:CountrySubentity>`)
  lines.push(`        <cac:Country><cbc:IdentificationCode listID="ISO 3166-1 Alpha-2" listAgencyID="6">CO</cbc:IdentificationCode></cac:Country>`)
  lines.push(`      </cac:PostalAddress>`)
  lines.push(`      <cac:PartyLegalEntity>`)
  lines.push(`        <cbc:RegistrationName><![CDATA[${input.supplierLegalName || input.supplierName}]]></cbc:RegistrationName>`)
  lines.push(`        <cac:TaxScheme><cbc:ID schemeID="4" schemeName="4 - Tributo">${input.supplierTaxRegime}</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>`)
  lines.push(`      </cac:PartyLegalEntity>`)
  lines.push(`      <cac:Contact>`)
  if (input.supplierPhone) lines.push(`        <cbc:Telephone>${input.supplierPhone}</cbc:Telephone>`)
  if (input.supplierEmail) lines.push(`        <cbc:ElectronicMail>${input.supplierEmail}</cbc:ElectronicMail>`)
  lines.push(`      </cac:Contact>`)
  lines.push(`    </cac:Party>`)
  lines.push(`  </cac:AccountingSupplierParty>`)

  // ── AccountingCustomerParty ──
  lines.push(`  <cac:AccountingCustomerParty>`)
  lines.push(`    <cac:Party>`)
  lines.push(`      <cbc:ID schemeID="${customerSchemeID}" schemeName="${customerSchemeID} - Documento de identificacion del receptor" schemeAgencyID="195" schemeAgencyName="CO, DIAN">${input.customerNit}</cbc:ID>`)
  lines.push(`      <cac:PartyName><cbc:Name><![CDATA[${input.customerName}]]></cbc:Name></cac:PartyName>`)
  lines.push(`      <cac:PostalAddress>`)
  if (input.customerAddress) lines.push(`        <cbc:StreetName><![CDATA[${input.customerAddress}]]></cbc:StreetName>`)
  lines.push(`        <cbc:PostalZone></cbc:PostalZone>`)
  lines.push(`        <cac:Country><cbc:IdentificationCode listID="ISO 3166-1 Alpha-2" listAgencyID="6">CO</cbc:IdentificationCode></cac:Country>`)
  lines.push(`      </cac:PostalAddress>`)
  lines.push(`      <cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[${input.customerName}]]></cbc:RegistrationName>`)
  if (customerRegimeCode) {
    lines.push(`        <cbc:TaxLevelCode listName="Regimen fiscal">${customerRegimeCode}</cbc:TaxLevelCode>`)
  }
  lines.push(`      </cac:PartyLegalEntity>`)
  if (input.customerPhone || input.customerEmail) {
    lines.push(`      <cac:Contact>`)
    if (input.customerPhone) lines.push(`        <cbc:Telephone>${input.customerPhone}</cbc:Telephone>`)
    if (input.customerEmail) lines.push(`        <cbc:ElectronicMail>${input.customerEmail}</cbc:ElectronicMail>`)
    lines.push(`      </cac:Contact>`)
  }
  lines.push(`    </cac:Party>`)
  lines.push(`  </cac:AccountingCustomerParty>`)

  // ── TaxTotal ──
  lines.push(`  <cac:TaxTotal>`)
  lines.push(`    <cbc:TaxAmount currencyID="${input.currencyCode}">${amt(totalTaxAmount)}</cbc:TaxAmount>`)
  for (const tax of input.taxTotals) {
    lines.push(`    <cac:TaxSubtotal>`)
    lines.push(`      <cbc:TaxableAmount currencyID="${input.currencyCode}">${amt(tax.taxableAmount)}</cbc:TaxableAmount>`)
    lines.push(`      <cbc:TaxAmount currencyID="${input.currencyCode}">${amt(tax.taxAmount)}</cbc:TaxAmount>`)
    lines.push(`      <cac:TaxCategory>`)
    lines.push(`        <cbc:ID schemeID="5" schemeName="5 - Impuesto">${tax.taxCode}</cbc:ID>`)
    if (tax.taxRate > 0) lines.push(`        <cbc:Percent>${tax.taxRate.toFixed(2)}</cbc:Percent>`)
    lines.push(`        <cac:TaxScheme><cbc:ID schemeID="4" schemeName="4 - Tributo">01</cbc:ID><cbc:Name>${tax.taxName.split(' ')[0]}</cbc:Name></cac:TaxScheme>`)
    lines.push(`      </cac:TaxCategory>`)
    lines.push(`    </cac:TaxSubtotal>`)
  }
  lines.push(`  </cac:TaxTotal>`)

  // ── LegalMonetaryTotal ──
  lines.push(`  <cac:LegalMonetaryTotal>`)
  lines.push(`    <cbc:LineExtensionAmount currencyID="${input.currencyCode}">${amt(input.lineExtensionAmount)}</cbc:LineExtensionAmount>`)
  lines.push(`    <cbc:TaxExclusiveAmount currencyID="${input.currencyCode}">${amt(input.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>`)
  lines.push(`    <cbc:TaxInclusiveAmount currencyID="${input.currencyCode}">${amt(input.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>`)
  lines.push(`    <cbc:AllowanceTotalAmount currencyID="${input.currencyCode}">${amt(input.discountAmount)}</cbc:AllowanceTotalAmount>`)
  // Para NC: PayableAmount es negativo (valor absoluto con signo negativo)
  const payableSign = input.invoiceTypeCode === '91' ? '-' : ''
  lines.push(`    <cbc:PayableAmount currencyID="${input.currencyCode}">${payableSign}${amt(input.payableAmount)}</cbc:PayableAmount>`)
  lines.push(`  </cac:LegalMonetaryTotal>`)

  // ── Nota: Las líneas de detalle (CreditNoteLine) serían necesarias para NC/ND con items específicos.
  // Por ahora se omite la sección de líneas ya que las NC/ND pueden ser por montos totales.
  // Si se requiriera items individuales, se agregarían aquí cac:CreditNoteLine.

  lines.push(`</CreditNote>`)

  return lines.join('\n')
}
