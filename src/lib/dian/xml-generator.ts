import { create } from 'xmlbuilder2'

/**
 * Input for generating a complete UBL 2.1 Invoice XML for DIAN Colombia.
 */
export interface InvoiceXMLInput {
  // ── Store / Emitter data ──
  storeNit: string
  storeName: string
  storeLegalName?: string
  storeAddress?: string
  storePhone?: string
  storeEmail?: string
  storeCityCode?: string    // DIVIPOLA code like "11001"
  storeDepartmentCode?: string

  // ── Resolution data ──
  prefix: string
  consecutive: number
  resolutionNumber: string
  resolutionStartDate: string   // YYYY-MM-DD
  resolutionEndDate: string     // YYYY-MM-DD
  resolutionStartNumber: number
  resolutionEndNumber: number

  // ── Customer data ──
  customerNit: string
  customerName: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  customerRegime?: string   // RESPONSABLE, NO_RESPONSABLE, SIMPLIFICADO
  customerType?: string     // CC, NIT, CE, TI, PP
  customerCityCode?: string
  customerDepartmentCode?: string

  // ── Invoice data ──
  issueDate: string         // YYYY-MM-DD
  issueTime: string         // HH:mm:ss-05:00
  currencyCode: string      // "COP"
  notes?: string

  // ── Monetary (all must be integers for COP) ──
  subtotalBase: number      // LineExtensionAmount (before tax)
  totalWithTax: number      // TaxInclusiveAmount
  totalTaxAmount: number
  discountAmount: number
  tipAmount: number
  grandTotal: number        // PayableAmount

  // ── Tax breakdown ──
  taxBreakdown: Array<{
    code: string      // "01", "02", etc
    name: string      // "IVA 19%"
    base: number
    rate: number      // 19.00
    amount: number
  }>

  // ── Invoice line items ──
  items: Array<{
    lineNumber: number
    description: string
    quantity: number
    unitCode?: string       // "NIU" default
    unitPrice: number       // Price BEFORE tax
    lineExtensionAmount: number  // quantity * unitPrice
    taxCode?: string
    taxRate?: number
    taxAmount?: number
    taxBase?: number
  }>

  // ── DIAN specific ──
  cufe: string
  pteNit?: string           // Software provider NIT
  pteSoftwareId?: string    // Software ID
  testMode: boolean
  pdfBase64?: string        // Optional: PDF/image representation in Base64
}

/**
 * Helper: formats an integer amount as a string (DIAN requires no decimals for COP).
 */
function amt(value: number): string {
  return String(Math.round(value))
}

/**
 * Builds the DIAN QR URL used in the XML namespaces.
 * In test mode (habilitación), uses the hab URL.
 */
function getQRUrl(testMode: boolean): string {
  return testMode
    ? 'https://catalogo-vpfe-hab.dian.gov.co/documento/consultar'
    : 'https://catalogo-vpfe.dian.gov.co/documento/consultar'
}

/**
 * Generates a complete UBL 2.1 Invoice XML for DIAN Colombia.
 *
 * Follows the structure defined in DIAN Resolution 000042 of 2020 and
 * the UBL 2.1 standard with DIAN extensions.
 *
 * @param input - All invoice data including store, customer, items, taxes
 * @returns XML string (no pretty printing for production)
 */
export function generateUBL21XML(input: InvoiceXMLInput): string {
  const {
    storeNit,
    storeName,
    storeLegalName,
    storeAddress,
    storePhone,
    storeEmail,
    storeCityCode,
    // storeDepartmentCode,
    prefix,
    consecutive,
    resolutionNumber,
    resolutionStartDate,
    resolutionEndDate,
    resolutionStartNumber,
    resolutionEndNumber,
    customerNit,
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    customerRegime,
    customerType,
    customerCityCode,
    issueDate,
    issueTime,
    currencyCode,
    notes,
    subtotalBase,
    totalWithTax,
    totalTaxAmount,
    discountAmount,
    tipAmount,
    grandTotal,
    taxBreakdown,
    items,
    cufe,
    pteNit,
    pteSoftwareId,
    testMode,
    pdfBase64,
  } = input

  // Invoice ID format: PREFIX-CONSECUTIVE (e.g., "FE-00000001")
  const invoiceId = `${prefix}-${String(consecutive).padStart(8, '0')}`

  // QR URL for namespace
  const qrUrl = getQRUrl(testMode)

  // Tax exclusive amount = total with tax - total tax amount
  const taxExclusiveAmount = totalWithTax - totalTaxAmount

  // ── Build XML ──
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Invoice')
    // Root namespaces
    .att('xmlns', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2')
    .att('xmlns:cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2')
    .att('xmlns:cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2')
    .att('xmlns:ext', 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2')
    .att('xmlns:sts', 'http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures')
    .att('xmlns:clm54217', 'urn:un:unece:uncefact:codelist:specification:54217:2001')
    .att('xmlns:clm66411', 'urn:un:unece:uncefact:codelist:specification:66411:2001')
    .att('xmlns:clmIAN8801', 'urn:un:unece:uncefact:codelist:specification:IAN8801:2005')

  // ── UBLExtensions ──
  const ublExtensions = doc.ele('ext:UBLExtensions')

  // Extension 1: DIAN Extensions (InvoiceControl, InvoiceSource, SoftwareProvider)
  const ext1 = ublExtensions.ele('ext:UBLExtension')
  const ext1Content = ext1.ele('ext:ExtensionContent')
  const dianExts = ext1Content.ele('sts:DianExtensions')

  // InvoiceControl
  const invoiceControl = dianExts.ele('sts:InvoiceControl')
  invoiceControl.ele('sts:InvoiceAuthorizationNumber').txt(resolutionNumber).up()
  const authPeriod = invoiceControl.ele('sts:AuthorizationPeriod')
  authPeriod.ele('sts:StartDate').txt(resolutionStartDate).up()
  authPeriod.ele('sts:EndDate').txt(resolutionEndDate).up()
  invoiceControl.up()
  const authorizedInvoices = invoiceControl.ele('sts:AuthorizedInvoices')
  authorizedInvoices.ele('sts:Prefix').txt(prefix).up()
  authorizedInvoices.ele('sts:From').txt(String(resolutionStartNumber)).up()
  authorizedInvoices.ele('sts:To').txt(String(resolutionEndNumber)).up()

  // InvoiceSource (CUFE)
  const invoiceSource = dianExts.ele('sts:InvoiceSource')
  invoiceSource
    .ele('sts:IdentificationCode')
    .att('listAgencyID', "195")
    .att('listAgencyName', 'CO, DIAN')
    .txt(cufe)

  // SoftwareProvider
  if (pteNit || pteSoftwareId) {
    const softwareProvider = dianExts.ele('sts:SoftwareProvider')
    if (pteNit) {
      softwareProvider.ele('sts:ProviderID').att('schemeAgencyID', '195').txt(pteNit).up()
    }
    if (pteSoftwareId) {
      softwareProvider.ele('sts:SoftwareID').txt(pteSoftwareId)
    }
  }

  // Extension 2: PDF / Graphic representation (optional)
  if (pdfBase64) {
    const ext2 = ublExtensions.ele('ext:UBLExtension')
    const ext2Content = ext2.ele('ext:ExtensionContent')
    const dianExts2 = ext2Content.ele('sts:DianExtensions')
    const reprGrafica = dianExts2.ele('sts:RepresentacionGrafica')
    reprGrafica.ele('sts:Formato').txt('PNG').up()
    reprGrafica.ele('sts:ImagenBase64').txt(pdfBase64)
  }

  // ── Basic invoice fields ──
  doc.ele('cbc:ID').txt(invoiceId).up()
  doc.ele('cbc:IssueDate').txt(issueDate).up()
  doc.ele('cbc:IssueTime').txt(issueTime).up()
  doc
    .ele('cbc:InvoiceTypeCode')
    .att('listID', '#6')
    .att('listAgencyID', '6')
    .att('listAgencyName', 'United Nations Economic Commission for Europe')
    .att('listName', 'Invoice Type Code')
    .txt('01')
    .up()

  doc
    .ele('cbc:DocumentCurrencyCode')
    .att('listID', 'ISO 4217 Alpha')
    .att('listAgencyID', '6')
    .txt(currencyCode)
    .up()

  // Notes
  if (notes) {
    doc.ele('cbc:Note').txt(notes).up()
  }

  // ── AccountingSupplierParty (Emitter) ──
  const supplierParty = doc.ele('cac:AccountingSupplierParty')
  const supplier = supplierParty.ele('cac:Party')
  supplier
    .ele('cbc:ID')
    .att('schemeID', '31')
    .att('schemeName', '31 - NIT del emisor')
    .att('schemeAgencyID', '195')
    .att('schemeAgencyName', 'CO, DIAN')
    .txt(storeNit)
    .up()

  // Party name
  const supplierName = supplier.ele('cac:PartyName')
  supplierName.ele('cbc:Name').cdata(storeName).up()
  supplier.up()

  // Postal address
  const supplierAddress = supplier.ele('cac:PostalAddress')
  if (storeAddress) {
    supplierAddress.ele('cbc:StreetName').cdata(storeAddress).up()
  }
  if (storeCityCode) {
    supplierAddress
      .ele('cbc:CityName')
      .att('schemeID', 'CO_DANE_8')
      .att('schemeName', 'Divipola')
      .txt(storeCityCode)
      .up()
  }
  supplierAddress.ele('cbc:PostalZone').txt(storeCityCode ?? '').up()
  const supplierCountry = supplierAddress.ele('cbc:Country')
  supplierCountry
    .ele('cbc:IdentificationCode')
    .att('listID', 'ISO 3166-1 Alpha-2')
    .txt('CO')
    .up()

  // Legal entity
  const supplierLegal = supplier.ele('cac:PartyLegalEntity')
  supplierLegal
    .ele('cbc:RegistrationName')
    .cdata(storeLegalName || storeName)
    .up()
  const supplierTaxScheme = supplierLegal.ele('cac:TaxScheme')
  supplierTaxScheme
    .ele('cbc:ID')
    .att('schemeID', '4')
    .att('schemeName', '4 - Tributo')
    .txt('01')

  // Contact
  if (storePhone || storeEmail) {
    const supplierContact = supplier.ele('cac:Contact')
    if (storePhone) {
      supplierContact.ele('cbc:Telephone').txt(storePhone).up()
    }
    if (storeEmail) {
      supplierContact.ele('cbc:ElectronicMail').txt(storeEmail).up()
    }
  }

  // ── AccountingCustomerParty (Customer) ──
  const customerParty = doc.ele('cac:AccountingCustomerParty')
  const customer = customerParty.ele('cac:Party')

  // Determine schemeID based on document type
  const schemeIdMap: Record<string, string> = {
    CC: '13',
    NIT: '31',
    CE: '22',
    TI: '12',
    PP: '11',
  }
  const custSchemeId = schemeIdMap[customerType ?? ''] ?? '31'

  customer
    .ele('cbc:ID')
    .att('schemeID', String(custSchemeId))
    .att('schemeName', `${custSchemeId} - Documento de identificación del receptor`)
    .att('schemeAgencyID', '195')
    .att('schemeAgencyName', 'CO, DIAN')
    .txt(customerNit)
    .up()

  // Customer party name
  const custName = customer.ele('cac:PartyName')
  custName.ele('cbc:Name').cdata(customerName).up()

  // Customer address
  const custAddress = customer.ele('cac:PostalAddress')
  if (customerAddress) {
    custAddress.ele('cbc:StreetName').cdata(customerAddress).up()
  }
  if (customerCityCode) {
    custAddress
      .ele('cbc:CityName')
      .att('schemeID', 'CO_DANE_8')
      .att('schemeName', 'Divipola')
      .txt(customerCityCode)
      .up()
  }
  custAddress.ele('cbc:PostalZone').txt(customerCityCode ?? '').up()
  const custCountry = custAddress.ele('cbc:Country')
  custCountry
    .ele('cbc:IdentificationCode')
    .att('listID', 'ISO 3166-1 Alpha-2')
    .txt('CO')

  // Customer legal entity
  const custLegal = customer.ele('cac:PartyLegalEntity')
  custLegal.ele('cbc:RegistrationName').cdata(customerName).up()

  // Customer fiscal regime
  if (customerRegime) {
    const regimeCodeMap: Record<string, string> = {
      RESPONSABLE: '01',
      NO_RESPONSABLE: '02',
      SIMPLIFICADO: '03',
    }
    const regimeCode = regimeCodeMap[customerRegime] ?? '02'
    custLegal
      .ele('cbc:TaxLevelCode')
      .att('listName', 'Régimen fiscal')
      .txt(regimeCode)
  }

  // Customer contact
  if (customerPhone || customerEmail) {
    const custContact = customer.ele('cac:Contact')
    if (customerPhone) {
      custContact.ele('cbc:Telephone').txt(customerPhone).up()
    }
    if (customerEmail) {
      custContact.ele('cbc:ElectronicMail').txt(customerEmail).up()
    }
  }

  // ── TaxTotal ──
  const taxTotal = doc.ele('cac:TaxTotal')
  taxTotal
    .ele('cbc:TaxAmount')
    .att('currencyID', currencyCode)
    .txt(amt(totalTaxAmount))
    .up()

  // Tax subtotals
  for (const tax of taxBreakdown) {
    const taxSubtotal = taxTotal.ele('cac:TaxSubtotal')
    taxSubtotal
      .ele('cbc:TaxableAmount')
      .att('currencyID', currencyCode)
      .txt(amt(tax.base))
      .up()
    taxSubtotal
      .ele('cbc:TaxAmount')
      .att('currencyID', currencyCode)
      .txt(amt(tax.amount))
      .up()
    const taxCategory = taxSubtotal.ele('cac:TaxCategory')
    taxCategory
      .ele('cbc:ID')
      .att('schemeID', '5')
      .att('schemeName', '5 - Impuesto')
      .txt(tax.code)
      .up()
    taxCategory.ele('cbc:Percent').txt(tax.rate.toFixed(2)).up()
    const taxScheme = taxCategory.ele('cac:TaxScheme')
    taxScheme.ele('cbc:ID').att('schemeID', '4').att('schemeName', '4 - Tributo').txt('01').up()
    taxScheme.ele('cbc:Name').txt(tax.name.split(' ')[0]) // e.g. "IVA"
  }

  // ── LegalMonetaryTotal ──
  const monetaryTotal = doc.ele('cac:LegalMonetaryTotal')
  monetaryTotal
    .ele('cbc:LineExtensionAmount')
    .att('currencyID', currencyCode)
    .txt(amt(subtotalBase))
    .up()
  monetaryTotal
    .ele('cbc:TaxExclusiveAmount')
    .att('currencyID', currencyCode)
    .txt(amt(taxExclusiveAmount))
    .up()
  monetaryTotal
    .ele('cbc:TaxInclusiveAmount')
    .att('currencyID', currencyCode)
    .txt(amt(totalWithTax))
    .up()

  // Allowance charge (discount)
  if (discountAmount > 0) {
    monetaryTotal
      .ele('cbc:AllowanceTotalAmount')
      .att('currencyID', currencyCode)
      .txt(amt(discountAmount))
      .up()
  }

  // Charge total (tips)
  if (tipAmount > 0) {
    monetaryTotal
      .ele('cbc:ChargeTotalAmount')
      .att('currencyID', currencyCode)
      .txt(amt(tipAmount))
      .up()
  }

  monetaryTotal
    .ele('cbc:PayableAmount')
    .att('currencyID', currencyCode)
    .txt(amt(grandTotal))

  // ── InvoiceLines ──
  for (const item of items) {
    const line = doc.ele('cac:InvoiceLine')
    line.ele('cbc:ID').txt(String(item.lineNumber)).up()
    line
      .ele('cbc:InvoicedQuantity')
      .att('unitCode', item.unitCode ?? 'NIU')
      .txt(String(item.quantity))
      .up()
    line
      .ele('cbc:LineExtensionAmount')
      .att('currencyID', currencyCode)
      .txt(amt(item.lineExtensionAmount))
      .up()

    // Line tax total (if item has tax)
    if (item.taxCode && item.taxAmount != null && item.taxBase != null) {
      const lineTaxTotal = line.ele('cac:TaxTotal')
      lineTaxTotal
        .ele('cbc:TaxAmount')
        .att('currencyID', currencyCode)
        .txt(amt(item.taxAmount))
        .up()
      const lineTaxSubtotal = lineTaxTotal.ele('cac:TaxSubtotal')
      lineTaxSubtotal
        .ele('cbc:TaxableAmount')
        .att('currencyID', currencyCode)
        .txt(amt(item.taxBase))
        .up()
      lineTaxSubtotal
        .ele('cbc:TaxAmount')
        .att('currencyID', currencyCode)
        .txt(amt(item.taxAmount))
        .up()
      const lineTaxCategory = lineTaxSubtotal.ele('cac:TaxCategory')
      lineTaxCategory
        .ele('cbc:ID')
        .att('schemeID', '5')
        .txt(item.taxCode)
        .up()
      if (item.taxRate != null) {
        lineTaxCategory.ele('cbc:Percent').txt(item.taxRate.toFixed(2)).up()
      }
      const lineTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
      lineTaxScheme.ele('cbc:ID').att('schemeID', '4').txt('01')
    }

    // Item description
    const lineItem = line.ele('cac:Item')
    lineItem.ele('cbc:Description').cdata(item.description).up()

    // Price
    const linePrice = line.ele('cac:Price')
    linePrice
      .ele('cbc:PriceAmount')
      .att('currencyID', currencyCode)
      .txt(amt(item.unitPrice))
  }

  // Generate XML string (no pretty printing for production)
  const xmlString = doc.end({ prettyPrint: false })

  return xmlString
}
