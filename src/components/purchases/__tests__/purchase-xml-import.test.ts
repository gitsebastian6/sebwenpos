// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  unwrapAttachedDocument, parseXmlItems, parseXmlMetadata, resolveXmlLine,
  parseDocumentLevelConsumptionTax,
} from '../purchase-xml-import'
import type { ProductOption } from '@/hooks/api/use-purchases'

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
      const line = { name: 'Gaseosa Lux 350ml Unidad', barcode: '7701234500019', sellerSku: '', quantity: 20, unitCost: 1800, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(1)
      expect(result.presentationId).toBeNull()
    })

    it('resolves an exact barcode match on a presentation (Six-pack), not just the base product', () => {
      const line = { name: 'Gaseosa Lux 350ml Six-pack', barcode: '7701234500026', sellerSku: '', quantity: 8, unitCost: 10000, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(1)
      expect(result.presentationId).toBe(9)
    })

    it('resolves a seller SKU match (homologación) when there is no barcode match', () => {
      const line = { name: 'Algo distinto', barcode: '', sellerSku: 'GL-SP-350', quantity: 1, unitCost: 10000, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('exact')
      expect(result.presentationId).toBe(9)
    })

    it('falls back to a name-only "suggested" match — never "exact" — when no code matches', () => {
      const line = { name: 'Gaseosa Lux', barcode: '9999999999999', sellerSku: '', quantity: 5, unitCost: 1800, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products)
      expect(result.status).toBe('suggested')
      expect(result.productId).toBe(1)
    })

    it('leaves completely unmatched lines unresolved (productId null) instead of auto-creating', () => {
      const line = { name: 'Producto Totalmente Desconocido', barcode: '', sellerSku: '', quantity: 1, unitCost: 5000, ivaRate: 19, discountAmount: 0, isBonus: false }
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
      const line = { name: 'Agua Cristal 600ml', barcode: '7709876500019', sellerSku: '', quantity: 24, unitCost: 900, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.status).toBe('exact')
      expect(result.ivaRate).toBe(0)
    })

    it('uses the product\'s own rate when it does carry IVA', () => {
      const line = { name: 'Gaseosa Lux 350ml', barcode: '7701234500019', sellerSku: '', quantity: 10, unitCost: 1800, ivaRate: 5, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.ivaRate).toBe(19)
    })

    it('falls back to 0 (not the XML guess) when the matched product has no tax rate configured at all', () => {
      const line = { name: 'Producto Sin Impuesto Configurado', barcode: '', sellerSku: 'SIN-TAX', quantity: 1, unitCost: 500, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, taxedProducts)
      expect(result.status).toBe('exact')
      expect(result.ivaRate).toBe(0)
    })

    it('keeps the XML-extracted rate when nothing resolves yet (no product to sync from)', () => {
      const line = { name: 'Completamente Desconocido', barcode: '', sellerSku: '', quantity: 1, unitCost: 5000, ivaRate: 5, discountAmount: 0, isBonus: false }
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
      expect(items[0].unitCost).toBe(5000)
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
      const line = { name: 'Código raro del proveedor', barcode: '', sellerSku: 'PROV-CODE-9', quantity: 3, unitCost: 900, ivaRate: 19, discountAmount: 0, isBonus: false }
      // sellerSku "PROV-CODE-9" also equals Producto B's generic `sku` field —
      // this test alone is ambiguous between mapping and generic sku, so the
      // priority is proven by the next two tests instead.
      const result = resolveXmlLine(line, products, mappings)
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(1) // el mapeo gana, no el sku genérico de Producto B
    })

    it('barcode wins over a conflicting saved mapping', () => {
      const mappings = new Map([['sku-a', { productId: 2, presentationId: null }]])
      const line = { name: 'Producto A', barcode: '1111111111111', sellerSku: 'SKU-A', quantity: 1, unitCost: 1000, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products, mappings)
      expect(result.productId).toBe(1) // barcode de Producto A gana sobre el mapeo que apunta a Producto B
    })

    it('a saved mapping wins over a conflicting generic sku field', () => {
      const mappings = new Map([['prov-code-9', { productId: 1, presentationId: null }]])
      const line = { name: 'Código raro del proveedor', barcode: '', sellerSku: 'PROV-CODE-9', quantity: 3, unitCost: 900, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products, mappings)
      // PROV-CODE-9 is Producto B's own `sku` field too — the mapping must win.
      expect(result.productId).toBe(1)
      expect(result.matchLabel).toContain('homologación guardada')
    })

    it('falls back to the existing barcode/sku/name behavior unchanged when no mappings are passed', () => {
      const line = { name: 'Producto B', barcode: '', sellerSku: 'PROV-CODE-9', quantity: 1, unitCost: 2000, ivaRate: 19, discountAmount: 0, isBonus: false }
      const result = resolveXmlLine(line, products) // sin tercer argumento
      expect(result.status).toBe('exact')
      expect(result.productId).toBe(2) // resuelve por el sku genérico de Producto B, como siempre
    })
  })
})
