import { create } from 'xmlbuilder2'

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for generating a complete UBL 2.1 Invoice XML compliant with
 * Colombian DIAN Resolution 000042 of 2020.
 *
 * All monetary amounts must be integers (Colombian pesos, no decimals).
 */
export interface XMLGeneratorInput {
  // ── Invoice identification ──
  invoiceNumber: string       // e.g. "FE-00000001"
  prefix: string              // e.g. "FE"
  consecutive: number         // e.g. 1
  issueDate: string           // YYYY-MM-DD
  issueTime: string           // HH:mm:ss-05:00
  invoiceTypeCode: string     // "01" = Factura de Venta

  // ── Resolution (DIAN authorization) ──
  resolutionNumber: string
  resolutionStartDate: string // YYYY-MM-DD
  resolutionEndDate: string   // YYYY-MM-DD
  startNumber: number
  endNumber: number

  // ── Currency ──
  currencyCode: string        // "COP"

  // ── Supplier / Emisor ──
  supplierNit: string         // e.g. "900123456-7"
  supplierName: string        // e.g. "Bar La Terraza"
  supplierLegalName: string   // e.g. "Bar La Terraza S.A.S"
  supplierAddress: string
  supplierCityCode: string    // DIVIPOLA code e.g. "11001" for Bogota
  supplierCityName: string    // e.g. "Bogota"
  supplierPhone: string
  supplierEmail: string
  supplierTaxRegime: string   // "01" for IVA responsable
  supplierMunicipality: string

  // ── Customer / Receptor ──
  customerNit: string
  customerName: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  customerRegime?: string
  customerType?: string       // "CC", "NIT", "CE", "TI", "PP"

  // ── Totals (all integers for COP) ──
  lineExtensionAmount: number  // Sum of line totals (before tax)
  taxExclusiveAmount: number
  taxInclusiveAmount: number
  payableAmount: number
  discountAmount: number

  // ── CUFE ──
  cufe: string

  // ── Software Provider (provedor tecnologico) ──
  softwareProviderNIT: string
  softwareName: string
  softwarePIN: string

  // ── Invoice line items ──
  items: Array<{
    lineNumber: number
    description: string
    quantity: number
    unitCode?: string          // default "NIU"
    unitPrice: number          // price per unit (tax exclusive)
    lineExtensionAmount: number
    taxCode: string            // "01"=IVA19%, "02"=IVA5%, "03"=Exento, "04"=Excluido, "05"=Impoconsumo
    taxRate: number            // percentage (19, 5, 0)
    taxableAmount: number      // base for tax
    taxAmount: number          // tax amount
    discountAmount?: number
    notes?: string
  }>

  // ── Tax totals ──
  taxTotals: Array<{
    taxCode: string
    taxableAmount: number
    taxAmount: number
    taxRate: number
    taxName: string
  }>

  // ── Payment ──
  paymentMethodCode: string   // DIAN code: 1=Cash, 2=Card, 10=Transfer, 42=Nequi/Daviplata, 99=Mixed
  paymentMethodName: string

  // ── Notes ──
  notes?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a Colombian document type to the DIAN schemeID used in cbc:ID.
 *
 * These codes identify the type of identification document held by the
 * customer / receptor in the electronic invoice XML.
 */
export function getCustomerSchemeID(customerType: string): string {
  const map: Record<string, string> = {
    NIT: '31',
    CC: '13',
    CE: '22',
    TI: '12',
    PP: '42',
  }
  return map[customerType.toUpperCase()] ?? '31'
}

/**
 * Maps a fiscal regime name to its DIAN tax level code.
 *
 * Used in cac:PartyLegalEntity / cbc:TaxLevelCode for both supplier
 * and customer when declaring their fiscal responsibility.
 */
export function getRegimeName(regime: string): string {
  const map: Record<string, string> = {
    RESPONSABLE: '48',      // IVA Responsable
    NO_RESPONSABLE: '49',   // No responsable de IVA
    SIMPLIFICADO: '50',     // Regimen simplificado
  }
  return map[regime.toUpperCase()] ?? '49'
}

/**
 * Returns the DIAN catalog URL depending on the environment.
 */
function getCatalogoURL(testMode: boolean): string {
  return testMode
    ? 'https://catalogo-vpfe-hab.dian.gov.co/documento/consultar'
    : 'https://catalogo-vpfe.dian.gov.co/documento/consultar'
}

/**
 * Formats a number as an integer string.
 * DIAN requires integer amounts for COP (no decimals).
 */
function amt(value: number): string {
  return String(Math.round(value))
}

/**
 * Returns the DIAN payment-means name for a given code.
 * Falls back to a generic label if the code is not recognised.
 */
function getPaymentMeansName(code: string): string {
  const map: Record<string, string> = {
    '1': 'Efectivo',
    '2': 'Tarjeta',
    '10': 'Transferencia',
    '42': 'Nequi / Daviplata',
    '99': 'Mixto',
  }
  return map[code] ?? 'Otro'
}

// ─────────────────────────────────────────────────────────────────────────────
// XML Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a complete UBL 2.1 XML document for a Colombian DIAN
 * electronic invoice (factura electronica de venta).
 *
 * The output is compliant with DIAN Resolution 000042 of 2020,
 * UBL 2.1 syntax, and includes all required DIAN extension elements
 * (InvoiceControl, InvoiceSource / CUFE, SoftwareProvider).
 *
 * @param input - Complete invoice data
 * @returns XML string (minified, no pretty-printing)
 */
export function generateUBL21XML(input: XMLGeneratorInput): string {
  const {
    invoiceNumber,
    prefix,
    consecutive,
    issueDate,
    issueTime,
    invoiceTypeCode,
    resolutionNumber,
    resolutionStartDate,
    resolutionEndDate,
    startNumber,
    endNumber,
    currencyCode,
    supplierNit,
    supplierName,
    supplierLegalName,
    supplierAddress,
    supplierCityCode,
    supplierCityName,
    supplierPhone,
    supplierEmail,
    supplierTaxRegime,
    supplierMunicipality,
    customerNit,
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    customerRegime,
    customerType,
    lineExtensionAmount,
    taxExclusiveAmount,
    taxInclusiveAmount,
    payableAmount,
    discountAmount,
    cufe,
    softwareProviderNIT,
    softwareName,
    softwarePIN,
    items,
    taxTotals,
    paymentMethodCode,
    paymentMethodName,
    notes,
  } = input

  // Derived values
  const totalTaxAmount = taxTotals.reduce((sum, t) => sum + t.taxAmount, 0)
  const customerSchemeID = getCustomerSchemeID(customerType ?? 'NIT')

  // ── Build XML tree ──────────────────────────────────────────────────────

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Invoice')
    // (a) Root element with all namespaces
    .att('xmlns', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2')
    .att('xmlns:cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2')
    .att('xmlns:cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2')
    .att('xmlns:ext', 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2')
    .att('xmlns:sts', 'http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures')
    .att('xmlns:clm54217', 'urn:un:unece:uncefact:codelist:specification:54217:2001')
    .att('xmlns:clm66411', 'urn:un:unece:uncefact:codelist:specification:66411:2001')
    .att('xmlns:clmIAN8801', 'urn:un:unece:uncefact:codelist:specification:IAN8801:2005')

  // ── (c) UBLExtensions ──────────────────────────────────────────────────
  const ublExtensions = root.ele('ext:UBLExtensions')

  // Extension 1: DIAN Extensions
  const ext1 = ublExtensions.ele('ext:UBLExtension')
  const ext1Content = ext1.ele('ext:ExtensionContent')
  const dianExts = ext1Content.ele('sts:DianExtensions')

  // -- InvoiceControl
  const invoiceControl = dianExts.ele('sts:InvoiceControl')
  invoiceControl.ele('sts:InvoiceAuthorizationNumber').txt(resolutionNumber).up()

  const authPeriod = invoiceControl.ele('sts:AuthorizationPeriod')
  authPeriod.ele('sts:StartDate').txt(resolutionStartDate).up()
  authPeriod.ele('sts:EndDate').txt(resolutionEndDate).up()
  invoiceControl.up()

  const authorizedInvoices = invoiceControl.ele('sts:AuthorizedInvoices')
  authorizedInvoices.ele('sts:Prefix').txt(prefix).up()
  authorizedInvoices.ele('sts:From').txt(String(startNumber)).up()
  authorizedInvoices.ele('sts:To').txt(String(endNumber)).up()

  // -- InvoiceSource (CUFE)
  const invoiceSource = dianExts.ele('sts:InvoiceSource')
  invoiceSource
    .ele('sts:IdentificationCode')
    .att('listAgencyID', '195')
    .att('listAgencyName', 'CO, DIAN')
    .txt(cufe)

  // -- SoftwareProvider
  const softwareProvider = dianExts.ele('sts:SoftwareProvider')
  softwareProvider
    .ele('sts:ProviderID')
    .att('schemeAgencyID', '195')
    .txt(softwareProviderNIT)
    .up()
  softwareProvider
    .ele('sts:SoftwareID')
    .txt(softwareName)

  // Extension 2: Security / PIN (optional - only if PIN is provided)
  if (softwarePIN) {
    const ext2 = ublExtensions.ele('ext:UBLExtension')
    const ext2Content = ext2.ele('ext:ExtensionContent')
    const dianExts2 = ext2Content.ele('sts:DianExtensions')
    const security = dianExts2.ele('sts:Security')
    security
      .ele('sts:PIN')
      .txt(softwarePIN)
  }

  // ── (d) cbc:ID ─────────────────────────────────────────────────────────
  root.ele('cbc:ID').txt(invoiceNumber).up()

  // ── (e) IssueDate / IssueTime ──────────────────────────────────────────
  root.ele('cbc:IssueDate').txt(issueDate).up()
  root.ele('cbc:IssueTime').txt(issueTime).up()

  // ── (f) InvoiceTypeCode ────────────────────────────────────────────────
  root
    .ele('cbc:InvoiceTypeCode')
    .att('listID', '#6')
    .att('listAgencyID', '6')
    .att('listAgencyName', 'United Nations Economic Commission for Europe')
    .att('listName', 'Invoice Type Code')
    .txt(invoiceTypeCode)
    .up()

  // ── (g) DocumentCurrencyCode ───────────────────────────────────────────
  root
    .ele('cbc:DocumentCurrencyCode')
    .att('listID', 'ISO 4217 Alpha')
    .att('listAgencyID', '6')
    .txt(currencyCode)
    .up()

  // ── (h) CustomizationID ────────────────────────────────────────────────
  root.ele('cbc:CustomizationID').txt('32').up()

  // ── (o) PaymentTerms (notes) - placed before aggregate sections ────────
  if (notes) {
    const paymentTerms = root.ele('cac:PaymentTerms')
    paymentTerms.ele('cbc:Note').dat(notes)
  }

  // ── (j) AccountingSupplierParty ────────────────────────────────────────
  const supplierParty = root.ele('cac:AccountingSupplierParty')
  const supplier = supplierParty.ele('cac:Party')

  // Supplier identification
  supplier
    .ele('cbc:ID')
    .att('schemeID', '31')
    .att('schemeName', '31 - NIT del emisor')
    .att('schemeAgencyID', '195')
    .att('schemeAgencyName', 'CO, DIAN')
    .txt(supplierNit)
    .up()

  // Supplier party name
  const supplierNameEl = supplier.ele('cac:PartyName')
  supplierNameEl.ele('cbc:Name').dat(supplierName).up()
  supplier.up()

  // Supplier postal address
  const supplierAddr = supplier.ele('cac:PostalAddress')
  if (supplierAddress) {
    supplierAddr.ele('cbc:StreetName').dat(supplierAddress).up()
  }
  supplierAddr
    .ele('cbc:CitySubdivisionName')
    .txt(supplierMunicipality)
    .up()
  supplierAddr
    .ele('cbc:CityName')
    .att('schemeID', 'CO_DANE_8')
    .att('schemeName', 'Divipola')
    .txt(supplierCityCode)
    .up()
  supplierAddr.ele('cbc:PostalZone').txt(supplierCityCode).up()
  supplierAddr
    .ele('cbc:CountrySubentity')
    .txt(supplierCityName)
    .up()

  const supplierCountry = supplierAddr.ele('cac:Country')
  supplierCountry
    .ele('cbc:IdentificationCode')
    .att('listID', 'ISO 3166-1 Alpha-2')
    .att('listAgencyID', '6')
    .txt('CO')

  // Supplier legal entity
  const supplierLegal = supplier.ele('cac:PartyLegalEntity')
  supplierLegal
    .ele('cbc:RegistrationName')
    .dat(supplierLegalName || supplierName)
    .up()

  // Supplier tax scheme
  const supplierTaxScheme = supplierLegal.ele('cac:TaxScheme')
  supplierTaxScheme
    .ele('cbc:ID')
    .att('schemeID', '4')
    .att('schemeName', '4 - Tributo')
    .txt(supplierTaxRegime)
    .up()
  supplierTaxScheme
    .ele('cbc:Name')
    .txt('IVA')

  // Supplier contact
  const supplierContact = supplier.ele('cac:Contact')
  if (supplierPhone) {
    supplierContact.ele('cbc:Telephone').txt(supplierPhone).up()
  }
  if (supplierEmail) {
    supplierContact.ele('cbc:ElectronicMail').txt(supplierEmail).up()
  }

  // ── (j) AccountingCustomerParty ────────────────────────────────────────
  const customerParty = root.ele('cac:AccountingCustomerParty')
  const customer = customerParty.ele('cac:Party')

  // Customer identification
  customer
    .ele('cbc:ID')
    .att('schemeID', customerSchemeID)
    .att('schemeName', `${customerSchemeID} - Documento de identificacion del receptor`)
    .att('schemeAgencyID', '195')
    .att('schemeAgencyName', 'CO, DIAN')
    .txt(customerNit)
    .up()

  // Customer party name
  const custNameEl = customer.ele('cac:PartyName')
  custNameEl.ele('cbc:Name').dat(customerName).up()

  // Customer postal address (optional)
  const custAddr = customer.ele('cac:PostalAddress')
  if (customerAddress) {
    custAddr.ele('cbc:StreetName').dat(customerAddress).up()
  }
  custAddr.ele('cbc:PostalZone').txt('').up()
  const custCountry = custAddr.ele('cac:Country')
  custCountry
    .ele('cbc:IdentificationCode')
    .att('listID', 'ISO 3166-1 Alpha-2')
    .att('listAgencyID', '6')
    .txt('CO')

  // Customer legal entity
  const custLegal = customer.ele('cac:PartyLegalEntity')
  custLegal.ele('cbc:RegistrationName').dat(customerName).up()

  // Customer fiscal regime
  if (customerRegime) {
    const regimeCode = getRegimeName(customerRegime)
    custLegal
      .ele('cbc:TaxLevelCode')
      .att('listName', 'Regimen fiscal')
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

  // ── (k) TaxTotal ───────────────────────────────────────────────────────
  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal
    .ele('cbc:TaxAmount')
    .att('currencyID', currencyCode)
    .txt(amt(totalTaxAmount))
    .up()

  // Tax subtotals
  for (const tax of taxTotals) {
    const taxSubtotal = taxTotal.ele('cac:TaxSubtotal')

    taxSubtotal
      .ele('cbc:TaxableAmount')
      .att('currencyID', currencyCode)
      .txt(amt(tax.taxableAmount))
      .up()

    taxSubtotal
      .ele('cbc:TaxAmount')
      .att('currencyID', currencyCode)
      .txt(amt(tax.taxAmount))
      .up()

    const taxCategory = taxSubtotal.ele('cac:TaxCategory')
    taxCategory
      .ele('cbc:ID')
      .att('schemeID', '5')
      .att('schemeName', '5 - Impuesto')
      .txt(tax.taxCode)
      .up()

    if (tax.taxRate > 0) {
      taxCategory
        .ele('cbc:Percent')
        .txt(tax.taxRate.toFixed(2))
        .up()
    }

    const taxScheme = taxCategory.ele('cac:TaxScheme')
    taxScheme
      .ele('cbc:ID')
      .att('schemeID', '4')
      .att('schemeName', '4 - Tributo')
      .txt('01')
      .up()
    taxScheme.ele('cbc:Name').txt(tax.taxName.split(' ')[0]).up()
  }

  // ── (l) LegalMonetaryTotal ─────────────────────────────────────────────
  const monetaryTotal = root.ele('cac:LegalMonetaryTotal')
  monetaryTotal
    .ele('cbc:LineExtensionAmount')
    .att('currencyID', currencyCode)
    .txt(amt(lineExtensionAmount))
    .up()
  monetaryTotal
    .ele('cbc:TaxExclusiveAmount')
    .att('currencyID', currencyCode)
    .txt(amt(taxExclusiveAmount))
    .up()
  monetaryTotal
    .ele('cbc:TaxInclusiveAmount')
    .att('currencyID', currencyCode)
    .txt(amt(taxInclusiveAmount))
    .up()

  // AllowanceTotalAmount (discounts) - always include for DIAN compatibility
  monetaryTotal
    .ele('cbc:AllowanceTotalAmount')
    .att('currencyID', currencyCode)
    .txt(amt(discountAmount))
    .up()

  // PayableAmount
  monetaryTotal
    .ele('cbc:PayableAmount')
    .att('currencyID', currencyCode)
    .txt(amt(payableAmount))

  // ── (m) InvoiceLine (one per item) ─────────────────────────────────────
  for (const item of items) {
    const line = root.ele('cac:InvoiceLine')

    // Line ID
    line.ele('cbc:ID').txt(String(item.lineNumber)).up()

    // Invoiced quantity
    line
      .ele('cbc:InvoicedQuantity')
      .att('unitCode', item.unitCode ?? 'NIU')
      .att('unitCodeListID', 'UN/ECE rec 20')
      .att('unitCodeListAgencyID', '6')
      .txt(String(item.quantity))
      .up()

    // Line extension amount
    line
      .ele('cbc:LineExtensionAmount')
      .att('currencyID', currencyCode)
      .txt(amt(item.lineExtensionAmount))
      .up()

    // Line tax total
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
      .txt(amt(item.taxableAmount))
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
      .att('schemeName', '5 - Impuesto')
      .txt(item.taxCode)
      .up()

    if (item.taxRate > 0) {
      lineTaxCategory
        .ele('cbc:Percent')
        .txt(item.taxRate.toFixed(2))
        .up()
    }

    const lineTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    lineTaxScheme
      .ele('cbc:ID')
      .att('schemeID', '4')
      .att('schemeName', '4 - Tributo')
      .txt('01')
      .up()
    lineTaxScheme.ele('cbc:Name').txt('IVA')

    // Item description
    const lineItem = line.ele('cac:Item')
    lineItem.ele('cbc:Description').dat(item.description).up()

    // (m) Optional AllowanceCharge for item-level discount
    if (item.discountAmount && item.discountAmount > 0) {
      const allowanceCharge = line.ele('cac:AllowanceCharge')
      allowanceCharge
        .ele('cbc:ChargeIndicator')
        .txt('false')
        .up()
      allowanceCharge
        .ele('cbc:AllowanceChargeReasonCode')
        .att('listID', 'UN/ECE D20')
        .att('listAgencyID', '6')
        .txt('11') // Discount
        .up()
      allowanceCharge
        .ele('cbc:MultiplierFactorNumeric')
        .txt(
          item.unitPrice > 0
            ? (item.discountAmount / (item.unitPrice * item.quantity)).toFixed(4)
            : '0.0000'
        )
        .up()
      allowanceCharge
        .ele('cbc:Amount')
        .att('currencyID', currencyCode)
        .txt(amt(item.discountAmount))
        .up()
      allowanceCharge
        .ele('cbc:BaseAmount')
        .att('currencyID', currencyCode)
        .txt(amt(item.unitPrice * item.quantity))
    }

    // Item line notes
    if (item.notes) {
      lineItem.ele('cbc:Name').dat(item.notes)
    }

    // Price
    const linePrice = line.ele('cac:Price')
    linePrice
      .ele('cbc:PriceAmount')
      .att('currencyID', currencyCode)
      .txt(amt(item.unitPrice))
  }

  // ── (n) PaymentMeans ───────────────────────────────────────────────────
  const paymentMeans = root.ele('cac:PaymentMeans')
  paymentMeans
    .ele('cbc:PaymentMeansCode')
    .att('listID', 'UN/ECE 4461')
    .att('listAgencyID', '6')
    .att('listName', 'Payment Means')
    .txt(paymentMethodCode)
    .up()
  paymentMeans
    .ele('cbc:PaymentDueDate')
    .txt(issueDate)
    .up()

  // Payment channel / account information
  const payerParty = paymentMeans.ele('cac:PayeeParty')
  payerParty.ele('cbc:Name').dat(paymentMethodName || getPaymentMeansName(paymentMethodCode))

  // ── Serialize ──────────────────────────────────────────────────────────
  const xmlString = root.end({ prettyPrint: false })

  return xmlString
}
