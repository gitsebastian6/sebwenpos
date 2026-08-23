// @vitest-environment jsdom
import type { ProductOption } from '@/hooks/api/use-purchases'
import { describe, expect, it } from 'vitest'
import {
  calculateNitDv,
  hasXmlSignature,
  isValidSoftwareSecurityCode,
  mapCustomizationId,
  mapDianPaymentMethod,
  mapDianResponseCode,
  mapUnitCodeToLabel,
  parseDocumentLevelConsumptionTax,
  parseXmlDianValidation,
  parseXmlItems, parseXmlMetadata, parseXmlWithholdings,
  resolveXmlLine,
  unwrapAttachedDocument,
  validateCufe,
  validateResolutionRange
} from '../purchase-xml-import'

// A synthetic DIAN "AttachedDocument" envelope: the real, commercial
// <Invoice> (with line items, prices, and the seller's data) is embedded as
// raw XML text inside cac:Attachment > cac:ExternalReference > cbc:Description
// — this is how real DIAN electronic invoices are actually transmitted, and
// is the exact structure the original parser (pre-fix) could not read at all.
function buildAttachedDocumentXml(): string {
  const innerInvoice = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FEGL990001234</cbc:ID>
  <cbc:IssueDate>2026-08-10</cbc:IssueDate>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>GASEOSAS LUX S.A.S</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>900123456</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>20</cbc:InvoicedQuantity>
    <cac:Item>
      <cbc:Description>Gaseosa Lux 350ml Unidad</cbc:Description>
      <cac:StandardItemIdentification>
        <cbc:ID>7701234500019</cbc:ID>
      </cac:StandardItemIdentification>
      <cac:SellersItemIdentification>
        <cbc:ID>GL-UN-350</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount>1800</cbc:PriceAmount>
    </cac:Price>
    <cac:TaxTotal>
      <cac:TaxSubtotal>
        <cbc:Percent>19</cbc:Percent>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </cac:InvoiceLine>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>8</cbc:InvoicedQuantity>
    <cac:Item>
      <cbc:Description>Gaseosa Lux 350ml Six-pack</cbc:Description>
      <cac:StandardItemIdentification>
        <cbc:ID>7701234500026</cbc:ID>
      </cac:StandardItemIdentification>
      <cac:SellersItemIdentification>
        <cbc:ID>GL-SP-350</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount>10000</cbc:PriceAmount>
    </cac:Price>
    <cac:TaxTotal>
      <cac:TaxSubtotal>
        <cbc:Percent>19</cbc:Percent>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </cac:InvoiceLine>
</Invoice>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FEGL990001234</cbc:ID>
  <cac:SenderParty>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>PROVEEDOR TECNOLOGICO DIAN S.A.S</cbc:RegistrationName>
    </cac:PartyLegalEntity>
  </cac:SenderParty>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[${innerInvoice}]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>`
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml')
}

describe('purchase-xml-import — DIAN AttachedDocument parsing', () => {
  it('unwraps the AttachedDocument envelope and finds the embedded Invoice', () => {
    const doc = parse(buildAttachedDocumentXml())
    const unwrapped = unwrapAttachedDocument(doc)
    expect(unwrapped.querySelectorAll('InvoiceLine').length).toBe(2)
  })

  it('extracts exactly 2 lines totaling 28 units, with names, barcodes, seller SKUs and costs', () => {
    const doc = parse(buildAttachedDocumentXml())
    const items = parseXmlItems(doc)

    expect(items).toHaveLength(2)
    const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0)
    expect(totalUnits).toBe(28)

    expect(items[0].name).toBe('Gaseosa Lux 350ml Unidad')
    expect(items[0].barcode).toBe('7701234500019')
    expect(items[0].sellerSku).toBe('GL-UN-350')
    expect(items[0].quantity).toBe(20)
    expect(items[0].unitCost).toBe(1800)
    expect(items[0].ivaRate).toBe(19)

    expect(items[1].name).toBe('Gaseosa Lux 350ml Six-pack')
    expect(items[1].barcode).toBe('7701234500026')
    expect(items[1].quantity).toBe(8)
    expect(items[1].unitCost).toBe(10000)
  })

  it('reads seller metadata (name/NIT/date) from the embedded Invoice, not the outer envelope sender', () => {
    const doc = parse(buildAttachedDocumentXml())
    const meta = parseXmlMetadata(doc)

    expect(meta.providerName).toBe('GASEOSAS LUX S.A.S')
    expect(meta.providerNit).toBe('900123456')
    expect(meta.invoiceDate).toBe('2026-08-10')
    expect(meta.xmlFormat).toContain('AttachedDocument')
  })

  it('a plain (non-enveloped) UBL Invoice still parses correctly (no regression)', () => {
    const plainInvoice = `<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE001</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>3</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Producto Simple</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>2000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`
    const doc = parse(plainInvoice)
    const items = parseXmlItems(doc)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Producto Simple')
    expect(items[0].quantity).toBe(3)
  })

  describe('parseDocumentLevelConsumptionTax — IC (Impuesto al Consumo) is a whole-invoice total, never per line', () => {
    // Shaped after the user's real GASEOSAS LUX invoice: a document-level
    // TaxTotal (direct child of Invoice, not nested in any InvoiceLine) whose
    // TaxScheme is "IC", alongside a separate document-level IVA TaxTotal
    // that must NOT be counted as consumption tax.
    function invoiceWithDocumentLevelTaxes(icAmount: number): string {
      return `<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>LI073909786</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>24</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Cerveza X 24</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1437</cbc:PriceAmount></cac:Price>
    <cac:TaxTotal><cac:TaxSubtotal><cbc:Percent>19</cbc:Percent></cac:TaxSubtotal></cac:TaxTotal>
  </cac:InvoiceLine>
  <cac:TaxTotal>
    <cbc:TaxAmount>29696.11</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxAmount>29696.11</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount>${icAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxAmount>${icAmount}</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>02</cbc:ID><cbc:Name>IC</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
</Invoice>`
    }

    it('sums the document-level IC TaxTotal, ignoring the document-level IVA TaxTotal', () => {
      const doc = parse(invoiceWithDocumentLevelTaxes(30276.48))
      expect(parseDocumentLevelConsumptionTax(doc)).toBe(30276)
    })

    it('returns 0 when the invoice has no IC tax scheme at all (most invoices)', () => {
      const doc = parse(invoiceWithDocumentLevelTaxes(0))
      // Even an explicit 0 IC block should read as 0, and a document with
      // no IC TaxTotal block whatsoever must not throw or misread the IVA one.
      const noIcDoc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE002</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Agua</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:TaxTotal>
    <cbc:TaxAmount>190</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxAmount>190</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
</Invoice>`)
      expect(parseDocumentLevelConsumptionTax(doc)).toBe(0)
      expect(parseDocumentLevelConsumptionTax(noIcDoc)).toBe(0)
    })
  })

  describe('resolveXmlLine — never silently auto-creates', () => {
    const products: ProductOption[] = [
      {
        id: 1, name: 'Gaseosa Lux 350ml', unitLabel: 'UND', sku: 'GL-UN-350', barcode: '7701234500019',
        costPrice: 1700, salePrice: 2500, currentStock: 50, isActive: true,
        presentations: [
          { id: 9, name: 'Six-pack', unitLabel: 'PAQ', barcode: '7701234500026', sku: 'GL-SP-350', unitsPerPack: 6, salePrice: 12000, costPrice: 9500, isActive: true },
        ],
      },
    ]

    it('resolves an exact barcode match on the base product', () => {
      const line = { name: 'Gaseosa Lux 350ml Unidad', barcode: '7701234500019', sellerSku: '', quantity: 20, unitCost: 1800, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(1)
      expect(result.presentationId).toBeNull()
    })

    it('resolves an exact barcode match on a presentation (Six-pack), not just the base product', () => {
      const line = { name: 'Gaseosa Lux 350ml Six-pack', barcode: '7701234500026', sellerSku: '', quantity: 8, unitCost: 10000, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(1)
      expect(result.presentationId).toBe(9)
    })

    it('resolves a seller SKU match (homologación) when there is no barcode match', () => {
      const line = { name: 'Algo distinto', barcode: '', sellerSku: 'GL-SP-350', quantity: 1, unitCost: 10000, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('exact')
      expect(result.presentationId).toBe(9)
    })

    it('falls back to a name-only "suggested" match — never "exact" — when no code matches', () => {
      const line = { name: 'Gaseosa Lux', barcode: '9999999999999', sellerSku: '', quantity: 5, unitCost: 1800, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('suggested')
      expect(result.productId).toBe(1)
    })

    it('leaves completely unmatched lines unresolved (productId null) instead of auto-creating', () => {
      const line = { name: 'Producto Totalmente Desconocido', barcode: '', sellerSku: '', quantity: 1, unitCost: 5000, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('unresolved')
      expect(result.productId).toBeNull()
    })
  })

  describe('resolveXmlLine — IVA syncs with the resolved product\'s own tax config', () => {
    const taxedProducts: ProductOption[] = [
      {
        id: 1, name: 'Gaseosa Lux 350ml', unitLabel: 'UND', sku: 'GL-UN-350', barcode: '7701234500019',
        costPrice: 1700, salePrice: 2500, currentStock: 50, isActive: true,
        taxRate: { id: 1, code: '01', rate: 19, rateType: 'PERCENTAGE' },
      },
      {
        // Agua — exento de IVA in the store's own catalog
        id: 2, name: 'Agua Cristal 600ml', unitLabel: 'UND', sku: 'AG-600', barcode: '7709876500019',
        costPrice: 800, salePrice: 1500, currentStock: 30, isActive: true,
        taxRate: { id: 2, code: '04', rate: 0, rateType: 'PERCENTAGE' },
      },
      {
        // No tax rate assigned at all in the catalog
        id: 3, name: 'Producto Sin Impuesto Configurado', unitLabel: 'UND', sku: 'SIN-TAX', barcode: '',
        costPrice: 500, salePrice: 900, currentStock: 10, isActive: true,
        taxRate: null,
      },
    ]

    it('uses the product\'s own 0% (exento) rate even when the XML said 19% (or defaulted to it)', () => {
      // Simulates the reported bug: water's real invoice had no tax node, the
      // parser fell back to 19%, but the product is configured as exento.
      const line = { name: 'Agua Cristal 600ml', barcode: '7709876500019', sellerSku: '', quantity: 24, unitCost: 900, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.status).toBe('exact')
      expect(result.ivaRate).toBe(0)
    })

    it('uses the product\'s own rate when it does carry IVA', () => {
      const line = { name: 'Gaseosa Lux 350ml', barcode: '7701234500019', sellerSku: '', quantity: 10, unitCost: 1800, ivaRate: 5, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.ivaRate).toBe(19)
    })

    it('falls back to 0 (not the XML guess) when the matched product has no tax rate configured at all', () => {
      const line = { name: 'Producto Sin Impuesto Configurado', barcode: '', sellerSku: 'SIN-TAX', quantity: 1, unitCost: 500, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.status).toBe('exact')
      expect(result.ivaRate).toBe(0)
    })

    it('keeps the XML-extracted rate when nothing resolves yet (no product to sync from)', () => {
      const line = { name: 'Completamente Desconocido', barcode: '', sellerSku: '', quantity: 1, unitCost: 5000, ivaRate: 5, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.status).toBe('unresolved')
      expect(result.ivaRate).toBe(5)
    })
  })

  describe('parseXmlItems — bonus/free line detection', () => {
    function invoiceWithLine(priceAmount: number, allowanceAmount?: number): string {
      return `<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-BONUS</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Bombombum Ristra</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>${priceAmount}</cbc:PriceAmount></cac:Price>
    ${allowanceAmount !== undefined ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount>${allowanceAmount}</cbc:Amount></cac:AllowanceCharge>` : ''}
    <cac:TaxTotal><cac:TaxSubtotal><cbc:Percent>19</cbc:Percent></cac:TaxSubtotal></cac:TaxTotal>
  </cac:InvoiceLine>
</Invoice>`
    }

    it('flags a line with a literal $0 PriceAmount as bonus', () => {
      const doc = parse(invoiceWithLine(0))
      const items = parseXmlItems(doc)
      expect(items[0].unitCost).toBe(0)
      expect(items[0].isBonus).toBe(true)
    })

    it('flags a line whose AllowanceCharge covers ~100% of the gross value as bonus (regalo representado como descuento total, no precio $0)', () => {
      // gross = 2 * 5000 = 10000; allowance = 10000 -> 100% discounted
      const doc = parse(invoiceWithLine(5000, 10000))
      const items = parseXmlItems(doc)
      // Fix #18: el costo de una línea bonificada es 0 (no el precio bruto),
      // o el CPP se infla con producto gratis.
      expect(items[0].unitCost).toBe(0)
      expect(items[0].isBonus).toBe(true)
    })

    it('does NOT flag a partial discount (e.g. 10%) as bonus', () => {
      // gross = 2 * 5000 = 10000; allowance = 1000 -> only 10% discounted
      const doc = parse(invoiceWithLine(5000, 1000))
      const items = parseXmlItems(doc)
      expect(items[0].isBonus).toBe(false)
    })

    it('does NOT flag a normal full-price line as bonus', () => {
      const doc = parse(invoiceWithLine(5000))
      const items = parseXmlItems(doc)
      expect(items[0].isBonus).toBe(false)
    })
  })

  describe('resolveXmlLine — provider product mapping (homologación)', () => {
    const products: ProductOption[] = [
      {
        id: 1, name: 'Producto A', unitLabel: 'UND', sku: 'SKU-A', barcode: '1111111111111',
        costPrice: 1000, salePrice: 1500, currentStock: 10, isActive: true,
      },
      {
        id: 2, name: 'Producto B', unitLabel: 'UND', sku: 'PROV-CODE-9', barcode: '',
        costPrice: 2000, salePrice: 3000, currentStock: 5, isActive: true,
      },
    ]

    it('resolves by a saved mapping when there is no barcode/sku match at all', () => {
      const mappings = new Map([['prov-code-9', { productId: 1, presentationId: null }]])
      const line = { name: 'Código raro del proveedor', barcode: '', sellerSku: 'PROV-CODE-9', quantity: 3, unitCost: 900, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      // sellerSku "PROV-CODE-9" also equals Producto B's generic `sku` field —
      // this test alone is ambiguous between mapping and generic sku, so the
      // priority is proven by the next two tests instead.
      const result = resolveXmlLine(line, products, mappings)
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(1) // el mapeo gana, no el sku genérico de Producto B
    })

    it('barcode wins over a conflicting saved mapping', () => {
      const mappings = new Map([['sku-a', { productId: 2, presentationId: null }]])
      const line = { name: 'Producto A', barcode: '1111111111111', sellerSku: 'SKU-A', quantity: 1, unitCost: 1000, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products, mappings)
      expect(result.productId).toBe(1) // barcode de Producto A gana sobre el mapeo que apunta a Producto B
    })

    it('a saved mapping wins over a conflicting generic sku field', () => {
      const mappings = new Map([['prov-code-9', { productId: 1, presentationId: null }]])
      const line = { name: 'Código raro del proveedor', barcode: '', sellerSku: 'PROV-CODE-9', quantity: 3, unitCost: 900, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products, mappings)
      // PROV-CODE-9 is Producto B's own `sku` field too — the mapping must win.
      expect(result.productId).toBe(1)
      expect(result.matchLabel).toContain('homologación guardada')
    })

    it('falls back to the existing barcode/sku/name behavior unchanged when no mappings are passed', () => {
      const line = { name: 'Producto B', barcode: '', sellerSku: 'PROV-CODE-9', quantity: 1, unitCost: 2000, ivaRate: 19, discountAmount: 0, unitCode: '', isBonus: false }
      const result = resolveXmlLine(line, products) // sin tercer argumento
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(2) // resuelve por el sku genérico de Producto B, como siempre
    })
  })

  describe('parseXmlItems — casos borde de facturas colombianas reales', () => {
    it('#17: normaliza coma decimal en cantidades y precios ("1,5" → 1.5)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-COMMA</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1,5</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Queso Campesino</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>10.000,50</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      expect(items[0].quantity).toBe(1.5)
      expect(items[0].unitCost).toBe(10001) // 10.000,50 → 10000.5 → round 10001
    })

    it('#1/#9/#16: usa LineExtensionAmount/qty como costo efectivo (neto tras descuento), no el PriceAmount bruto', () => {
      // Línea 3 del XML real de GASEOSAS LUX: 32 uds, PriceAmount 2314.48,
      // LineExtensionAmount 67116.22 (neto tras AllowanceCharge 6947.14).
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-NET</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>32</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>67116.22</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Cerveza Andina BR 750</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>2314.48</cbc:PriceAmount></cac:Price>
    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount>6947.14</cbc:Amount></cac:AllowanceCharge>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      // 67116.22 / 32 = 2097.38 → 2097 (costo neto real), NO 2314 (bruto)
      expect(items[0].unitCost).toBe(2097)
      expect(items[0].discountAmount).toBe(6947)
    })

    it('#7: Percent=0 explícito → línea EXENTA (no fuerza 19%)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-EXENTO</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>10</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Medicamento Exento</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>5000</cbc:PriceAmount></cac:Price>
    <cac:TaxTotal><cac:TaxSubtotal><cbc:Percent>0</cbc:Percent></cac:TaxSubtotal></cac:TaxTotal>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      expect(items[0].ivaRate).toBe(0) // exento, no 19
    })

    it('#8: el primer TaxTotal de la línea puede ser el IC — el IVA se busca por schemeId 01', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-IC-FIRST</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>24</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Cerveza</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1437.78</cbc:PriceAmount></cac:Price>
    <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount>5690.88</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>02</cbc:ID><cbc:Name>IC</cbc:Name></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
    <cac:TaxTotal><cac:TaxSubtotal><cbc:Percent>19</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      expect(items[0].ivaRate).toBe(19) // IVA del segundo TaxTotal, no el IC del primero
    })

    it('#3: StandardItemIdentification con padding de ceros NO es barcode (solo GTIN válido)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-PAD</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>24</cbc:InvoicedQuantity>
    <cac:Item>
      <cbc:Description>Cerveza Sol</cbc:Description>
      <cac:StandardItemIdentification><cbc:ID>000000000000028159</cbc:ID></cac:StandardItemIdentification>
      <cac:SellersItemIdentification><cbc:ID>28159</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price><cbc:PriceAmount>1437.78</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      expect(items[0].barcode).toBe('') // 18 dígitos con padding → no GTIN
      expect(items[0].sellerSku).toBe('28159') // sin ceros a la izquierda (#19)
    })

    it('#10/#11: múltiples AllowanceCharges y descuento sin Amount (solo factor %)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-MULTI-DISC</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>9000</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Producto Con Descuentos</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price>
    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount>500</cbc:Amount></cac:AllowanceCharge>
    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:MultiplierFactorNumeric>5</cbc:MultiplierFactorNumeric><cbc:BaseAmount>10000</cbc:BaseAmount></cac:AllowanceCharge>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      // 500 + (10000 × 5%) = 500 + 500 = 1000
      expect(items[0].discountAmount).toBe(1000)
      // costo neto: 9000/10 = 900
      expect(items[0].unitCost).toBe(900)
    })

    it('#27: limpia pipes iniciales del nombre (formato Carvajal)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-PIPE</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>|CERVEZA SOL BOT NR 250X24</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      expect(items[0].name).toBe('CERVEZA SOL BOT NR 250X24')
    })
  })

  describe('parseDocumentLevelConsumptionTax — casos borde adicionales', () => {
    it('#4: IC declarado SOLO por línea (fallback)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-IC-LINE</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>24</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Cerveza</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1437.78</cbc:PriceAmount></cac:Price>
    <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount>5690.88</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>02</cbc:ID><cbc:Name>IC</cbc:Name></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  </cac:InvoiceLine>
</Invoice>`)
      expect(parseDocumentLevelConsumptionTax(doc)).toBe(5691)
    })

    it('#13: IC sin TaxAmount — calcula PerUnitAmount × BaseUnitMeasure', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-IC-PERUNIT</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>24</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Cerveza</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1437.78</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:TaxTotal>
    <cac:TaxSubtotal>
      <cbc:BaseUnitMeasure>24</cbc:BaseUnitMeasure>
      <cbc:PerUnitAmount>237.12</cbc:PerUnitAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>02</cbc:ID><cbc:Name>IC</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
</Invoice>`)
      expect(parseDocumentLevelConsumptionTax(doc)).toBe(5691) // 24 × 237.12 = 5690.88
    })

    it('#14: INC (schemeId 03) también se captura', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-INC</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>10</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Bebida Azucarada</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>2000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:TaxTotal>
    <cac:TaxSubtotal>
      <cbc:TaxAmount>1500</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>03</cbc:ID><cbc:Name>INC</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
</Invoice>`)
      expect(parseDocumentLevelConsumptionTax(doc)).toBe(1500)
    })
  })

  describe('parseXmlMetadata — moneda, lineCount y responseCode', () => {
    it('#22/#25/#15: lee moneda, número de líneas y código de respuesta DIAN', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-META</cbc:ID>
  <cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>4</cbc:LineCountNumeric>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>X</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response></cac:DocumentResponse>
</Invoice>`)
      const meta = parseXmlMetadata(doc)
      expect(meta.currency).toBe('USD')
      expect(meta.lineCount).toBe(4)
      expect(meta.responseCode).toBe('02')
    })
  })

  describe('casos borde de la segunda ronda (revisión con lupa)', () => {
    it('#6: mapea unitCode UN/ECE rec20 a unitLabel del catálogo', () => {
      expect(mapUnitCodeToLabel('94')).toBe('UND')
      expect(mapUnitCodeToLabel('KGM')).toBe('KG')
      expect(mapUnitCodeToLabel('LTR')).toBe('L')
      expect(mapUnitCodeToLabel('DZN')).toBe('DOC')
      expect(mapUnitCodeToLabel('DESCONOCIDO')).toBe('UND')
    })

    it('#6: lee el unitCode del InvoicedQuantity en el XML', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-UNIT</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity unitCode="KGM">1.5</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Queso</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>10000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      expect(items[0].unitCode).toBe('KGM')
      expect(mapUnitCodeToLabel(items[0].unitCode)).toBe('KG')
    })

    it('#26: calcula el dígito de verificación de un NIT (módulo 11)', () => {
      // 900123456: suma ponderada (71..29) = 1554 → 1554 % 11 = 3 → DV = 11-3 = 8
      expect(calculateNitDv('900123456')).toBe('8')
      expect(calculateNitDv('')).toBe('')
      expect(calculateNitDv('abc')).toBe('')
    })

    it('#29: bonificado por neto real ≤1% del bruto (sin AllowanceCharge declarado)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-NET-BONUS</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>50</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Regalo Sin Descuento Declarado</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>5000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`)
      const items = parseXmlItems(doc)
      // bruto 50000, neto 50 → ≤1% → bonificado, costo 0
      expect(items[0].isBonus).toBe(true)
      expect(items[0].unitCost).toBe(0)
    })

    it('#21: lee retenciones declaradas (ReteFuente 04, ReteIVA 05, ReteICA 06)', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-RET</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>X</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>100000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount>2500</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>04</cbc:ID><cbc:Name>ReteFuente</cbc:Name></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount>966</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>06</cbc:ID><cbc:Name>ReteICA</cbc:Name></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
</Invoice>`)
      const w = parseXmlWithholdings(doc)
      expect(w.reteFuente).toBe(2500)
      expect(w.reteIca).toBe(966)
      expect(w.reteIva).toBe(0)
    })

    it('#30: detecta firma digital (ds:Signature)', () => {
      const signed = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <cbc:ID>FE-SIG</cbc:ID>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <ds:Signature><ds:SignedInfo/></ds:Signature>
</Invoice>`)
      expect(hasXmlSignature(signed)).toBe(true)

      const unsigned = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-NOSIG</cbc:ID>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`)
      expect(hasXmlSignature(unsigned)).toBe(false)
    })

    it('#15 (bug): lee el ResponseCode del ApplicationResponse embebido en el AttachedDocument', () => {
      // El ResponseCode NO está en la Invoice — está en el ApplicationResponse
      // que viaja como OTRO CDATA dentro del AttachedDocument.
      const innerInvoice = `<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>LI073849148</cbc:ID>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`
      const appResponse = `<?xml version="1.0"?>
<ApplicationResponse xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>79494295</cbc:ID>
  <cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode><cbc:Description>Documento validado por la DIAN</cbc:Description></cac:Response></cac:DocumentResponse>
</ApplicationResponse>`
      const attached = `<?xml version="1.0"?>
<AttachedDocument xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>ENV-1</cbc:ID>
  <cac:Attachment><cac:ExternalReference><cbc:Description><![CDATA[${innerInvoice}]]></cbc:Description></cac:ExternalReference></cac:Attachment>
  <cac:ParentDocumentLineReference><cac:DocumentReference><cbc:ID>LI073849148</cbc:ID><cac:Attachment><cac:ExternalReference><cbc:Description><![CDATA[${appResponse}]]></cbc:Description></cac:ExternalReference></cac:Attachment></cac:DocumentReference></cac:ParentDocumentLineReference>
</AttachedDocument>`
      const doc = parse(attached)
      const meta = parseXmlMetadata(doc)
      expect(meta.responseCode).toBe('02')
      // La Invoice interna se sigue extrayendo bien
      expect(parseXmlItems(doc)).toHaveLength(1)
    })

    it('#13 (bug): IC sin TaxAmount con BaseUnitMeasure=1 usa el TaxableAmount como base', () => {
      // Estructura real de GASEOSAS LUX: BaseUnitMeasure=1, PerUnitAmount=237.12,
      // TaxableAmount=24 (la cantidad real).
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-IC-BASE1</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>24</cbc:InvoicedQuantity>
    <cac:Item><cbc:Description>Cerveza</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1437.78</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:TaxTotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount>24</cbc:TaxableAmount>
      <cbc:BaseUnitMeasure>1</cbc:BaseUnitMeasure>
      <cbc:PerUnitAmount>237.12</cbc:PerUnitAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>02</cbc:ID><cbc:Name>IC</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
</Invoice>`)
      // 24 × 237.12 = 5690.88 → 5691 (no 237)
      expect(parseDocumentLevelConsumptionTax(doc)).toBe(5691)
    })

    it('#28: lee el total de líneas declarado a nivel documento', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-TOTAL</cbc:ID>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>3600</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>X</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount>1800</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount>3600</cbc:LineExtensionAmount></cac:LegalMonetaryTotal>
</Invoice>`)
      const meta = parseXmlMetadata(doc)
      expect(meta.declaredLineTotal).toBe(3600)
    })
  })

  describe('validaciones DIAN — Anexo Técnico v1.9 y Resolución 000165', () => {
    it('mapea códigos de respuesta DIAN a su significado', () => {
      expect(mapDianResponseCode('00')).toBe('Validado sin observaciones')
      expect(mapDianResponseCode('02')).toBe('Validado con observaciones')
      expect(mapDianResponseCode('03')).toBe('Rechazado')
      expect(mapDianResponseCode('99')).toContain('desconocido')
    })

    it('mapea CustomizationID al tipo de documento (Res. 000165: Nota de Ajuste = 16)', () => {
      expect(mapCustomizationId('11')).toBe('Factura de Venta')
      expect(mapCustomizationId('12')).toBe('Nota Crédito')
      expect(mapCustomizationId('15')).toBe('Documento Soporte en Adquisiciones a No Obligados')
      expect(mapCustomizationId('16')).toContain('Nota de Ajuste')
      expect(mapCustomizationId('99')).toContain('desconocido')
    })

    it('mapea códigos de medio de pago DIAN', () => {
      expect(mapDianPaymentMethod('1')).toBe('Efectivo')
      expect(mapDianPaymentMethod('42')).toBe('Daviplata/Nequi')
      expect(mapDianPaymentMethod('99')).toBe('Otros')
    })

    it('extrae CustomizationID, CUFE, resolución, método de pago y régimen del XML', () => {
      const doc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1">
  <cbc:ID>LI073849148</cbc:ID>
  <cbc:CustomizationID>11</cbc:CustomizationID>
  <cbc:UUID schemeName="CUFE-SHA384">c41311c54b1ffee41a6347cb6530bfb689a329fd3354707ef2164b2ec9cdfc5f64e77c59daae94d043f2ca40c5855f77</cbc:UUID>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:TaxLevelCode>O-13;O-15</cbc:TaxLevelCode></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>1</cbc:PaymentMeansCode></cac:PaymentMeans>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><sts:DianExtensions>
    <sts:InvoiceControl><sts:InvoiceAuthorization>18764096738652</sts:InvoiceAuthorization><sts:AuthorizedInvoices><sts:Prefix>LI07</sts:Prefix><sts:From>1000001</sts:From><sts:To>5000000</sts:To></sts:AuthorizedInvoices></sts:InvoiceControl>
    <sts:SoftwareSecurityCode>53cdc6cce540bae407f5d31866f55cde6e813f70fe8bc536427632c4a0540379cbb9f1232812aca43077e51968b92412</sts:SoftwareSecurityCode>
  </sts:DianExtensions></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
</Invoice>`)
      const dian = parseXmlDianValidation(doc)
      expect(dian.customizationId).toBe('11')
      expect(dian.cufe).toBe('c41311c54b1ffee41a6347cb6530bfb689a329fd3354707ef2164b2ec9cdfc5f64e77c59daae94d043f2ca40c5855f77')
      expect(dian.resolutionNumber).toBe('18764096738652')
      expect(dian.resolutionPrefix).toBe('LI07')
      expect(dian.resolutionFrom).toBe(1000001)
      expect(dian.resolutionTo).toBe(5000000)
      expect(dian.paymentMethodCode).toBe('1')
      expect(dian.supplierTaxLevel).toBe('O-13;O-15')
      expect(isValidSoftwareSecurityCode(dian.softwareSecurityCode)).toBe(true)
    })

    it('valida el rango de la resolución (RV01): dentro y fuera', () => {
      expect(validateResolutionRange('LI073849148', 'LI07', 1000001, 5000000)).toBe(true)
      expect(validateResolutionRange('LI075000001', 'LI07', 1000001, 5000000)).toBe(false)
      expect(validateResolutionRange('', '', 0, 0)).toBe(true) // sin datos → no bloquear
    })

    it('valida el SoftwareSecurityCode (SHA-384 = 96 hex)', () => {
      expect(isValidSoftwareSecurityCode('53cdc6cce540bae407f5d31866f55cde6e813f70fe8bc536427632c4a0540379cbb9f1232812aca43077e51968b92412')).toBe(true)
      expect(isValidSoftwareSecurityCode('abc')).toBe(false)
      expect(isValidSoftwareSecurityCode('')).toBe(false)
    })

    it('valida el CUFE recalculando SHA-384 (válido e inválido)', async () => {
      // Cadena real del XML de GASEOSAS LUX (Note "NumFac:")
      const cufeString = 'LI0738491482026-08-0805:15:57-05:00156295.300129696.11040.00030.00216267.8986000169711935178451'
      const cufeReal = 'c41311c54b1ffee41a6347cb6530bfb689a329fd3354707ef2164b2ec9cdfc5f64e77c59daae94d043f2ca40c5855f77'

      // Calcular el SHA-384 esperado con crypto.subtle
      const data = new TextEncoder().encode(cufeString)
      const hashBuffer = await crypto.subtle.digest('SHA-384', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Construir un XML con el CUFE correcto
      const validDoc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>LI073849148</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${hashHex}</cbc:UUID>
  <cbc:Note>NumFac: LI073849148 FecFac: 2026-08-08 HorFac: 05:15:57-05:00 ValFac: 156295.30 ValIva: 29696.11 ValOtroIm: 30276.48 ValTolFac: 216267.89 CUFE: ${hashHex} String: ${cufeString}</cbc:Note>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`)
      expect(await validateCufe(validDoc)).toBe('valid')

      // XML con CUFE alterado → invalid
      const invalidDoc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>LI073849148</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000</cbc:UUID>
  <cbc:Note>NumFac: LI073849148 FecFac: 2026-08-08 HorFac: 05:15:57-05:00 ValFac: 156295.30 ValIva: 29696.11 ValOtroIm: 30276.48 ValTolFac: 216267.89 CUFE: 000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 String: ${cufeString}</cbc:Note>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`)
      expect(await validateCufe(invalidDoc)).toBe('invalid')

      // Sin cadena ni CUFE → unknown
      const noCufeDoc = parse(`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-NOCUFE</cbc:ID>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cac:Item><cbc:Description>X</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount>1000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`)
      expect(await validateCufe(noCufeDoc)).toBe('unknown')
    })
  })
})
