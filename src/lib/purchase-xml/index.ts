// ---------------------------------------------------------------------------
// SEBWEN POS — Importador de facturas de compra XML: lógica pura
// ---------------------------------------------------------------------------
// Parsing UBL 2.1 / AttachedDocument DIAN, resolución de líneas contra el
// catálogo, códigos DIAN y validaciones. Sin React ni DOM más allá de los
// tipos de lib.dom (las funciones que usan DOMParser/crypto.subtle solo se
// invocan desde el navegador). Movido desde
// src/components/purchases/purchase-xml-import.tsx sin cambios de lógica.
// ---------------------------------------------------------------------------

import type { ProductOption } from '@/hooks/api/use-purchases'
import { getUnitOfMeasureLabel } from '@/lib/constants'

// ── XML Parsing ──────────────────────────────────────────────────────────

export interface ParsedXmlLine {
  name: string
  barcode: string
  sellerSku: string
  quantity: number
  unitCost: number
  ivaRate: number
  discountAmount: number
  // #6: unidad de medida declarada en el XML (unitCode UN/ECE rec20: 94, KGM, LTR...)
  unitCode: string
  // Línea bonificada/gratis — PriceAmount=0, o un AllowanceCharge que cubre
  // ~100% del valor de la línea (las dos formas comunes en que un proveedor
  // colombiano representa un "regalo" en el XML). Puramente informativo:
  // no cambia el cálculo de costo, solo se usa para etiquetar la línea.
  isBonus: boolean
}

/**
 * #6: mapea códigos UN/ECE rec20 (unitCode del XML) a los unitLabel del
 * catálogo (UNIT_OF_MEASURE_OPTIONS). Default UND si no se reconoce.
 */
export function mapUnitCodeToLabel(unitCode: string): string {
  const map: Record<string, string> = {
    '94': 'UND', EA: 'UND', PCE: 'UND', NMB: 'UND',
    KGM: 'KG', GRM: 'G', MGM: 'MG', LBR: 'LB', ONZ: 'OZ',
    LTR: 'L', MLT: 'ML',
    MTR: 'M', CMT: 'CM', MTK: 'M2', MTQ: 'M3',
    DZN: 'DOC', PR: 'PAR', SET: 'KIT', BX: 'CAJ', PK: 'PAQ',
    BG: 'BOL', BO: 'BOT', CA: 'CAN', CT: 'CAR', TU: 'TUB',
    RL: 'ROL', BDL: 'BUL', TBE: 'TAM', H87: 'PZA',
  }
  return map[unitCode.toUpperCase()] || 'UND'
}

/**
 * #26: calcula el dígito de verificación de un NIT colombiano (módulo 11,
 * pesos 71..2). Devuelve '' si el NIT no es numérico.
 */
export function calculateNitDv(nit: string): string {
  const digits = nit.replace(/\D/g, '')
  if (!digits || digits.length > 15) return ''
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[digits.length - 1 - i], 10) * weights[i]
  }
  const mod = sum % 11
  return mod === 0 || mod === 1 ? String(mod) : String(11 - mod)
}

/**
 * #30: detecta si el documento XML trae firma digital (ds:Signature).
 * No valida criptográficamente (requeriría librería xmldsig) — solo informa
 * si el documento está firmado o no, para advertir sobre archivos alterados.
 */
export function hasXmlSignature(xmlDoc: Document): boolean {
  return Array.from(xmlDoc.querySelectorAll('*')).some(el => getLocalName(el) === 'Signature')
}

function getLocalName(el: Element): string {
  return el.tagName.replace(/.*:/, '')
}

/**
 * Normaliza un número que puede venir con coma decimal (locale es-CO) o con
 * separadores de miles: "1.437,78" → 1437.78, "1437.78" → 1437.78.
 * Caso borde #17: parseFloat("1437,78") = 1437 (trunca silenciosamente).
 */
export function parseXmlNumber(raw: string | null | undefined): number {
  if (!raw) return 0
  let s = raw.trim()
  if (!s) return 0
  // Si tiene coma Y punto, el punto es separador de miles → quitarlo
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    // Solo coma: si hay exactamente 3 dígitos después, es separador de miles
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length === 3) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(',', '.')
    }
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/**
 * Valida si un código es un GTIN real (EAN-8: 8, EAN-13: 13, UPC-A: 12,
 * GTIN-14: 14 dígitos). Caso borde #3: StandardItemIdentification suele ser
 * el SKU del proveedor con padding de ceros (000000000000028159), NO un
 * código de barras — usarlo como barcode causaría matches falsos.
 */
export function isValidGtin(code: string): boolean {
  const digits = code.replace(/\D/g, '')
  return [8, 12, 13, 14].includes(digits.length) && digits.length === code.trim().length
}

/**
 * Limpia el nombre del producto: quita pipes iniciales (formato Carvajal
 * "|CERVEZA SOL BOT NR 250X24") y espacios redundantes. Caso borde #27.
 */
export function cleanXmlName(raw: string): string {
  return raw.replace(/^\|+/, '').replace(/\s+/g, ' ').trim()
}

/**
 * DIAN electronic invoices are transmitted as an "AttachedDocument" envelope
 * (the signed, DIAN-facing document) that embeds the REAL commercial Invoice
 * — the one with line items, prices, and the actual seller's data — as raw
 * XML text (CDATA) inside a Description element. Reading the envelope
 * directly finds no InvoiceLine nodes at all; it has to be unwrapped first.
 *
 * Caso borde #5: el AttachedDocument puede contener MÚLTIPLES CDATA (la
 * Invoice + el ApplicationResponse de la DIAN). Se busca el Description que
 * contenga "InvoiceLine" (o "<Invoice"), no el primero que empiece con '<'.
 */
export function unwrapAttachedDocument(xmlDoc: Document): Document {
  const root = xmlDoc.documentElement
  if (getLocalName(root) !== 'AttachedDocument') return xmlDoc
  let descriptionEl: Element | null = null
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const text = el.textContent?.trim() || ''
    if (getLocalName(el) === 'Description' && text.startsWith('<')) {
      // Preferir el que contiene la Invoice real (con InvoiceLine o <Invoice)
      if (text.includes('InvoiceLine') || text.includes('<Invoice')) {
        descriptionEl = el
        break
      }
      // Fallback: primer CDATA que parezca XML (comportamiento legado)
      if (!descriptionEl) descriptionEl = el
    }
  }
  const inner = descriptionEl?.textContent?.trim()
  if (!inner) return xmlDoc
  const parser = new DOMParser()
  const innerDoc = parser.parseFromString(inner, 'text/xml')
  if (innerDoc.querySelector('parsererror')) return xmlDoc
  return innerDoc
}

export function parseXmlItems(xmlDoc: Document): ParsedXmlLine[] {
  const doc = unwrapAttachedDocument(xmlDoc)
  const items: ParsedXmlLine[] = []
  const getText = (el: Element | null, selectors: string[]): string => {
    if (!el) return ''
    for (const sel of selectors) { const found = el.querySelector(sel); if (found?.textContent?.trim()) return found.textContent.trim() }
    return ''
  }
  const getNum = (el: Element | null, selectors: string[]): number => parseXmlNumber(getText(el, selectors))

  /**
   * Descuentos por línea (AllowanceCharge con ChargeIndicator=false). Casos
   * borde #10 y #11: puede haber MÚLTIPLES descuentos (comercial + pronto
   * pago) y algunos proveedores omiten Amount (solo MultiplierFactorNumeric
   * + BaseAmount) → se calcula Amount = BaseAmount × factor / 100.
   */
  const getLineDiscounts = (line: Element): number => {
    let total = 0
    for (const el of Array.from(line.querySelectorAll('AllowanceCharge'))) {
      const isCharge = getText(el, ['ChargeIndicator', 'cbc\\:ChargeIndicator']).toLowerCase() === 'true'
      if (isCharge) continue
      let amount = getNum(el, ['Amount', 'cbc\\:Amount'])
      if (amount === 0) {
        const factor = getNum(el, ['MultiplierFactorNumeric', 'cbc\\:MultiplierFactorNumeric'])
        const base = getNum(el, ['BaseAmount', 'cbc\\:BaseAmount'])
        if (factor > 0 && base > 0) amount = base * factor / 100
      }
      total += amount
    }
    return total
  }

  /**
   * Tasa de IVA de la línea. Caso borde #7: `|| 19` fuerza IVA 19% en líneas
   * EXENTAS (sin nodo Percent o Percent=0). Caso borde #8: el primer TaxTotal
   * de la línea puede ser el IC (no el IVA) — se busca el TaxSubtotal cuyo
   * TaxScheme ID = '01' (IVA). Devuelve null si no hay nodo IVA (→ el caller
   * decide el default), 0 si está explícitamente exento.
   */
  const getLineIvaRate = (line: Element): number | null => {
    const taxTotals = Array.from(line.querySelectorAll('TaxTotal'))
    for (const tt of taxTotals) {
      const subs = Array.from(tt.querySelectorAll('TaxSubtotal'))
      for (const sub of subs) {
        const schemeId = getText(sub, ['TaxScheme cbc\\:ID', 'cac\\:TaxScheme cbc\\:ID', 'TaxScheme ID']).trim()
        // IVA es schemeId '01' (o 'ZA' en algunos ERPs). Si no hay ID, asumir
        // que el primer TaxSubtotal con Percent es el IVA.
        if (schemeId === '01' || schemeId === 'ZA' || (!schemeId && getText(sub, ['cbc\\:Percent', 'Percent']))) {
          const percent = getNum(sub, ['cbc\\:Percent', 'Percent'])
          return percent // 0 = exento explícito
        }
      }
    }
    // Sin nodo IVA → null (el caller aplica el default 19 solo si no hay señal de exención)
    return null
  }

  // Strategy 1: UBL 2.1 (DIAN and most Colombian e-invoicing software)
  const invoiceLines = doc.querySelectorAll('InvoiceLine')
  if (invoiceLines.length > 0) {
    invoiceLines.forEach(line => {
      // DIAN requires cac:Item > cbc:Description to be populated; cbc:Name is
      // optional and often absent, so Description must be tried first.
      const name = cleanXmlName(getText(line, [
        'Item cbc\\:Description', 'cac\\:Item cbc\\:Description', 'Item Description',
        'Item cbc\\:Name', 'Item Name', 'cbc\\:Name',
      ]))
      // Caso borde #3: StandardItemIdentification NO es un código de barras —
      // es el SKU del proveedor con padding. Solo se usa como barcode si es
      // un GTIN válido (8/12/13/14 dígitos).
      const stdId = getText(line, [
        'Item StandardItemIdentification cbc\\:ID', 'cac\\:Item cac\\:StandardItemIdentification cbc\\:ID', 'StandardItemIdentification ID',
      ])
      const barcode = isValidGtin(stdId) ? stdId : ''
      // Caso borde #19: sellerSku sin ceros a la izquierda (28159, no 000000000000028159)
      const sellerSku = getText(line, [
        'Item SellersItemIdentification cbc\\:ID', 'cac\\:Item cac\\:SellersItemIdentification cbc\\:ID', 'SellersItemIdentification ID',
      ]).replace(/^0+/, '')
      const qty = getNum(line, ['InvoicedQuantity', 'cbc\\:InvoicedQuantity'])
      const price = getNum(line, ['PriceAmount', 'Price cbc\\:PriceAmount', 'cbc\\:PriceAmount'])
      // #6: unidad de medida declarada (atributo unitCode del InvoicedQuantity
      // o del BaseUnitMeasure) — ej. unitCode="94" (unidades), "KGM" (kg).
      const qtyEl = line.querySelector('InvoicedQuantity, cbc\\:InvoicedQuantity')
      const unitCode = (qtyEl?.getAttribute('unitCode') || getText(line, ['Price BaseQuantity', 'cac\\:Price cbc\\:BaseQuantity']).match(/unitCode="([^"]+)"/)?.[1] || '').trim()
      // Caso borde #9: BaseQuantity puede ser 1 (precio por caja) o N (precio
      // por unidad). El costo efectivo SIEMPRE es LineExtensionAmount / qty.
      const lineExtension = getNum(line, ['LineExtensionAmount', 'cbc\\:LineExtensionAmount'])
      // Caso borde #1/#2/#16: usar el costo NETO (tras descuento) con decimales
      // exactos — evita el drift de redondeo y el precio inflado por descuento.
      const effectiveUnitCost = lineExtension > 0 && qty > 0
        ? lineExtension / qty
        : price
      const ivaRate = getLineIvaRate(line) ?? 19 // null → default 19 (sin señal de exención)
      const discountAmount = Math.round(getLineDiscounts(line))
      // Bonificado: precio literal $0, o el neto real ≤1% del bruto. Caso
      // borde #29: usar el LineExtensionAmount real (neto) en vez del umbral
      // arbitrario de 99% sobre el descuento — cubre proveedores que no
      // declaran el AllowanceCharge pero facturan el regalo con neto ~0.
      const grossLineAmount = qty * price
      const netLineAmount = lineExtension > 0 ? lineExtension : Math.max(0, grossLineAmount - discountAmount)
      const isBonus = price === 0 || (grossLineAmount > 0 && netLineAmount <= grossLineAmount * 0.01)
      if (name && qty > 0) items.push({
        name, barcode, sellerSku, quantity: qty, unitCode,
        unitCost: isBonus ? 0 : Math.round(effectiveUnitCost),
        ivaRate, discountAmount, isBonus,
      })
    })
  }
  // Strategy 2: FeCo
  if (items.length === 0) {
    doc.querySelectorAll('item').forEach(item => {
      const name = cleanXmlName(getText(item, ['descripcion', 'nombre', 'name']))
      const qty = getNum(item, ['cantidad', 'quantity'])
      const price = getNum(item, ['precioUnitario', 'unitPrice', 'valor', 'precio'])
      if (name && qty > 0) items.push({ name, barcode: '', sellerSku: '', quantity: qty, unitCode: '', unitCost: Math.round(price), ivaRate: 19, discountAmount: 0, isBonus: price === 0 })
    })
  }
  // Strategy 3: generic
  if (items.length === 0) {
    doc.querySelectorAll('producto, product').forEach(item => {
      const name = cleanXmlName(getText(item, ['nombre', 'name', 'descripcion']))
      const qty = getNum(item, ['cantidad', 'quantity'])
      const price = getNum(item, ['precio', 'price', 'costo'])
      if (name && qty > 0) items.push({ name, barcode: '', sellerSku: '', quantity: qty, unitCode: '', unitCost: Math.round(price), ivaRate: 19, discountAmount: 0, isBonus: price === 0 })
    })
  }
  // Strategy 4: repeating element heuristic
  if (items.length === 0) {
    const root = doc.documentElement
    const children = Array.from(root.children)
    const counts = new Map<string, number>()
    children.forEach(c => { const t = getLocalName(c); counts.set(t, (counts.get(t) || 0) + 1) })
    let bestTag = '', bestCount = 1
    counts.forEach((count, tag) => { if (count > bestCount && count >= 2) { bestCount = count; bestTag = tag } })
    if (bestTag) {
      doc.querySelectorAll(bestTag).forEach(item => {
        let name = '', qty = 0, price = 0
        Array.from(item.children).forEach(child => {
          const tag = getLocalName(child).toLowerCase()
          const val = child.textContent?.trim() || ''
          if (!name && val && (isNaN(parseXmlNumber(val)) || val.length > 5)) name = cleanXmlName(val)
          if (/cant|qty|quantity|cantidad/.test(tag)) qty = parseXmlNumber(val)
          if (/prec|price|cost|valor|amount/.test(tag)) { const p = parseXmlNumber(val); if (price === 0 || p < price) price = p }
        })
        if (name && qty > 0) items.push({ name, barcode: '', sellerSku: '', quantity: qty, unitCode: '', unitCost: Math.round(price), ivaRate: 19, discountAmount: 0, isBonus: price === 0 })
      })
    }
  }
  return items
}

/**
 * Some Colombian taxes beyond IVA — most commonly Impuesto al Consumo (IC) on
 * beer or bebidas azucaradas — are reported by DIAN invoices as a single
 * TaxTotal block at the INVOICE level (a direct child of the root Invoice
 * element), never broken down per InvoiceLine the way IVA is. Some PDF
 * renderers show a per-row breakdown for readability, but that's a display
 * choice by the ERP, not something present in the XML itself — so this is
 * read once for the whole document and surfaced as a single editable field,
 * never attributed to (or allowed to affect the cost of) a specific line.
 *
 * Casos borde cubiertos:
 *  #4  — IC declarado SOLO por línea (fallback: sumar los TaxTotal de cada InvoiceLine)
 *  #13 — IC sin TaxAmount (solo PerUnitAmount × BaseUnitMeasure)
 *  #14 — INC (Impuesto Nacional al Consumo, schemeId '03') también se captura
 */
export function parseDocumentLevelConsumptionTax(xmlDoc: Document): number {
  const doc = unwrapAttachedDocument(xmlDoc)
  const root = doc.documentElement
  const getText = (el: Element | null, selectors: string[]): string => {
    if (!el) return ''
    for (const sel of selectors) { const found = el.querySelector(sel); if (found?.textContent?.trim()) return found.textContent.trim() }
    return ''
  }
  const isConsumptionTax = (sub: Element): boolean => {
    const schemeName = getText(sub, ['TaxScheme cbc\\:Name', 'cac\\:TaxScheme cbc\\:Name', 'TaxScheme Name']).toLowerCase()
    const schemeId = getText(sub, ['TaxScheme cbc\\:ID', 'cac\\:TaxScheme cbc\\:ID', 'TaxScheme ID'])
    return schemeName.includes('consumo') || schemeName === 'ic' || schemeId === '02' || schemeId === '03'
  }
  const taxAmountOf = (sub: Element): number => {
    // #13: si no hay TaxAmount, calcular PerUnitAmount × base. OJO: en el XML
    // real de GASEOSAS LUX, BaseUnitMeasure=1 (no la cantidad) — el TaxableAmount
    // es quien trae la cantidad real (24.00). Si base ≤ 1 y TaxableAmount > 1,
    // usar TaxableAmount como base.
    const direct = parseXmlNumber(getText(sub, ['cbc\\:TaxAmount', 'TaxAmount']))
    if (direct > 0) return direct
    const perUnit = parseXmlNumber(getText(sub, ['cbc\\:PerUnitAmount', 'PerUnitAmount']))
    let base = parseXmlNumber(getText(sub, ['cbc\\:BaseUnitMeasure', 'BaseUnitMeasure']))
    if (base <= 1) {
      const taxable = parseXmlNumber(getText(sub, ['cbc\\:TaxableAmount', 'TaxableAmount']))
      if (taxable > 1) base = taxable
    }
    return perUnit > 0 && base > 0 ? perUnit * base : 0
  }
  let total = 0
  // Nivel documento (TaxTotal hijos directos del root)
  for (const tt of Array.from(root.children).filter(el => getLocalName(el) === 'TaxTotal')) {
    for (const sub of Array.from(tt.querySelectorAll('TaxSubtotal'))) {
      if (isConsumptionTax(sub)) total += taxAmountOf(sub)
    }
  }
  // #4: fallback — IC declarado por línea (TaxTotal dentro de cada InvoiceLine)
  if (total === 0) {
    for (const line of Array.from(root.querySelectorAll('InvoiceLine'))) {
      for (const tt of Array.from(line.querySelectorAll('TaxTotal'))) {
        for (const sub of Array.from(tt.querySelectorAll('TaxSubtotal'))) {
          if (isConsumptionTax(sub)) total += taxAmountOf(sub)
        }
      }
    }
  }
  return Math.round(total)
}

/**
 * #21: retenciones declaradas en el XML (ReteFuente, ReteIVA, ReteICA).
 * En DIAN UBL aparecen como TaxTotal a nivel documento con TaxScheme ID:
 *   04 = ReteFuente, 05 = ReteIVA, 06 = ReteICA, 07 = ReteCree.
 * Solo informativo: el backend recalcula las retenciones según el régimen
 * del proveedor al crear la compra (igual que una compra manual).
 */
export function parseXmlWithholdings(xmlDoc: Document): { reteFuente: number; reteIva: number; reteIca: number } {
  const doc = unwrapAttachedDocument(xmlDoc)
  const root = doc.documentElement
  const getText = (el: Element | null, selectors: string[]): string => {
    if (!el) return ''
    for (const sel of selectors) { const found = el.querySelector(sel); if (found?.textContent?.trim()) return found.textContent.trim() }
    return ''
  }
  const result = { reteFuente: 0, reteIva: 0, reteIca: 0 }
  for (const tt of Array.from(root.children).filter(el => getLocalName(el) === 'TaxTotal')) {
    for (const sub of Array.from(tt.querySelectorAll('TaxSubtotal'))) {
      const schemeId = getText(sub, ['TaxScheme cbc\\:ID', 'cac\\:TaxScheme cbc\\:ID', 'TaxScheme ID']).trim()
      const amount = Math.round(parseXmlNumber(getText(sub, ['cbc\\:TaxAmount', 'TaxAmount'])))
      if (schemeId === '04') result.reteFuente += amount
      else if (schemeId === '05') result.reteIva += amount
      else if (schemeId === '06') result.reteIca += amount
    }
  }
  return result
}

export function parseXmlMetadata(xmlDoc: Document) {
  // Metadata must also come from the unwrapped inner Invoice — the outer
  // AttachedDocument's own party data describes the DIAN-certified software
  // provider transmitting it, not the actual seller on the invoice.
  const doc = unwrapAttachedDocument(xmlDoc)
  const root = doc.documentElement
  const gt = (selectors: string[]): string => { for (const s of selectors) { const f = root.querySelector(s); if (f?.textContent?.trim()) return f.textContent.trim() }; return '' }
  const invoiceNumber = gt(['ID', 'cbc\\:ID', 'Numero', 'numero', 'consecutivo', 'number', 'invoiceNumber'])
  const providerName = gt(['RegistrationName', 'cbc\\:RegistrationName', 'nombre', 'razSocial', 'razonSocial', 'name'])
  const providerNit = gt(['CompanyID', 'cbc\\:CompanyID', 'nit', 'NIT', 'numeroIdentificacion'])
  const invoiceDate = gt(['IssueDate', 'cbc\\:IssueDate', 'fecha', 'Fecha', 'date', 'fechaEmision'])
  // #22: moneda del documento (COP esperado; USD/otra → advertir)
  const currency = gt(['DocumentCurrencyCode', 'cbc\\:DocumentCurrencyCode', 'moneda', 'currency']).toUpperCase() || 'COP'
  // #25: número de líneas declarado (para validar completitud)
  const lineCount = parseInt(gt(['LineCountNumeric', 'cbc\\:LineCountNumeric']), 10) || 0
  // #28: total de líneas declarado a nivel documento (para detectar drift)
  const declaredLineTotal = Math.round(parseXmlNumber(gt(['LegalMonetaryTotal LineExtensionAmount', 'cac\\:LegalMonetaryTotal cbc\\:LineExtensionAmount', 'LineExtensionAmount'])))
  // #15: estado de validación DIAN. OJO: el ResponseCode NO está en la Invoice
  // — está en el ApplicationResponse, que viaja como OTRO CDATA dentro del
  // AttachedDocument. El textContent del documento original incluye el
  // contenido de los CDATA (texto crudo con tags), así que se busca con regex
  // como fallback cuando no hay nodo directo (Invoice plana).
  let responseCode = gt(['ResponseCode', 'cbc\\:ResponseCode'])
  if (!responseCode) {
    const fullText = xmlDoc.documentElement.textContent || ''
    const rcMatch = fullText.match(/<cbc:ResponseCode[^>]*>([^<]+)<\/cbc:ResponseCode>/)
    responseCode = rcMatch ? rcMatch[1].trim() : ''
  }
  // #30: firma digital presente (ds:Signature en el AttachedDocument o la Invoice)
  const signature = hasXmlSignature(xmlDoc)
  let xmlFormat = 'Desconocido'
  const wasAttachedDocument = getLocalName(xmlDoc.documentElement) === 'AttachedDocument'
  if (root.querySelectorAll('InvoiceLine').length > 0) xmlFormat = wasAttachedDocument ? 'UBL 2.1 DIAN (AttachedDocument)' : 'UBL 2.1 DIAN'
  else if (root.querySelectorAll('item').length > 0) xmlFormat = 'FeCo'
  else if (root.querySelectorAll('producto, product').length > 0) xmlFormat = 'Genérico'
  else if (invoiceNumber || providerName) xmlFormat = 'Formato libre'
  return { invoiceNumber, providerName, providerNit, invoiceDate, xmlFormat, currency, lineCount, responseCode, declaredLineTotal, signature }
}

// ═══════════════════════════════════════════════════════════════════════
// Validaciones DIAN — Anexo Técnico Factura Electrónica de Venta v1.9
// y Resolución 000165 de 2023
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mapea los códigos de respuesta del ApplicationResponse de la DIAN a su
 * significado (Anexo Técnico v1.9, sección de validación).
 */
export function mapDianResponseCode(code: string): string {
  const map: Record<string, string> = {
    '00': 'Validado sin observaciones',
    '02': 'Validado con observaciones',
    '03': 'Rechazado',
    '04': 'Rechazado — error de validación',
    '05': 'Rechazado — error de firma',
    '06': 'Rechazado — error de CUFE',
    '07': 'Rechazado — error de resolución',
    '08': 'Rechazado — error de rango',
    '09': 'Rechazado — error de software',
    '10': 'Rechazado — error de certificado',
  }
  return map[code] || `Código desconocido (${code})`
}

/**
 * Mapea los CustomizationID del Anexo Técnico v1.9 al tipo de documento.
 * La Resolución 000165 de 2023 introdujo la Nota de Ajuste (16).
 */
export function mapCustomizationId(customizationId: string): string {
  const map: Record<string, string> = {
    '10': 'Factura de Venta (borrador)',
    '11': 'Factura de Venta',
    '12': 'Nota Crédito',
    '13': 'Nota Débito',
    '14': 'Factura de Exportación',
    '15': 'Documento Soporte en Adquisiciones a No Obligados',
    '16': 'Nota de Ajuste (Res. 000165/2023)',
    '20': 'Factura de Venta (borrador)',
    '21': 'Factura de Venta',
    '22': 'Nota Crédito',
    '23': 'Nota Débito',
    '24': 'Factura de Exportación',
    '25': 'Documento Soporte en Adquisiciones a No Obligados',
    '26': 'Nota de Ajuste (Res. 000165/2023)',
  }
  return map[customizationId] || `Tipo de documento desconocido (${customizationId})`
}

/**
 * Mapea los códigos de medio de pago del Anexo Técnico v1.9.
 */
export function mapDianPaymentMethod(code: string): string {
  const map: Record<string, string> = {
    '1': 'Efectivo',
    '2': 'Tarjeta débito',
    '3': 'Tarjeta crédito',
    '4': 'Transferencia',
    '5': 'Cheque',
    '6': 'Consignación',
    '10': 'Transferencia/Consignación',
    '42': 'Daviplata/Nequi',
    '49': 'PSE',
    '99': 'Otros',
  }
  return map[code] || `Medio de pago desconocido (${code})`
}

/**
 * Extrae los datos de validación DIAN del XML (Anexo Técnico v1.9):
 *  - CustomizationID (tipo de documento)
 *  - CUFE (UUID) y la cadena para validarlo
 *  - Resolución autorizada (prefijo, rango)
 *  - Método de pago
 *  - SoftwareSecurityCode
 *  - Régimen fiscal del proveedor (TaxLevelCode)
 *  - Notas adicionales (6.= forma de pago, 15.= texto legal)
 */
export function parseXmlDianValidation(xmlDoc: Document) {
  const doc = unwrapAttachedDocument(xmlDoc)
  const root = doc.documentElement
  // Buscar por nombre local (ignora namespaces: cbc:CustomizationID, CustomizationID, etc.)
  const findText = (localName: string, parent?: Element | null): string => {
    const scope = parent || root
    for (const el of Array.from(scope.querySelectorAll('*'))) {
      if (getLocalName(el) === localName && el.textContent?.trim()) return el.textContent.trim()
    }
    return ''
  }

  // CustomizationID — tipo de documento (11 = Factura de Venta)
  const customizationId = findText('CustomizationID')

  // CUFE — UUID con schemeName="CUFE-SHA384"
  let cufe = ''
  const uuidEl = Array.from(root.querySelectorAll('*')).find(el =>
    getLocalName(el) === 'UUID' && (el.getAttribute('schemeName') || '').includes('CUFE')
  )
  if (uuidEl) cufe = uuidEl.textContent?.trim() || ''
  if (!cufe) cufe = findText('UUID')

  // Cadena del CUFE (la que aparece en el Note "NumFac:" del XML real)
  // Formato: NumFac|FecFac|HorFac|ValFac|CodImp1|ValImp1|CodImp2|ValImp2|CodImp3|ValImp3|ValTolFac|NitOFE|NumAdq|TipoAmbiente
  // La cadena NO tiene espacios internos — el grupo de captura excluye \s
  // para no absorber el resto del XML (InvoicedQuantity, PriceAmount, etc.).
  const fullText = doc.documentElement.textContent || xmlDoc.documentElement.textContent || ''
  const cufeStringMatch = fullText.match(/String:\s*([A-Za-z0-9\-:.]+)/)
  const cufeString = cufeStringMatch ? cufeStringMatch[1].trim() : ''

  // Resolución autorizada (InvoiceAuthorization + AuthorizedInvoices)
  const resolutionNumber = findText('InvoiceAuthorization')
  const resolutionPrefix = findText('Prefix')
  const resolutionFrom = parseInt(findText('From'), 10) || 0
  const resolutionTo = parseInt(findText('To'), 10) || 0

  // Método de pago (PaymentMeans > PaymentMeansCode)
  const paymentMethodCode = findText('PaymentMeansCode')

  // SoftwareSecurityCode (39 caracteres SHA-384)
  const softwareSecurityCode = findText('SoftwareSecurityCode')

  // Régimen fiscal del proveedor (TaxLevelCode del AccountingSupplierParty)
  const supplierParty = Array.from(root.querySelectorAll('*')).find(el => getLocalName(el) === 'AccountingSupplierParty')
  const supplierTaxLevel = findText('TaxLevelCode', supplierParty || null)

  // Notas adicionales (6.= forma de pago, 15.= texto legal)
  const note6 = fullText.match(/6\.=([^|]+)/)?.[1]?.trim() || ''
  const note15 = fullText.match(/15\.=([^|]+)/)?.[1]?.trim() || ''

  return {
    customizationId,
    cufe,
    cufeString,
    resolutionNumber,
    resolutionPrefix,
    resolutionFrom,
    resolutionTo,
    paymentMethodCode,
    softwareSecurityCode,
    supplierTaxLevel,
    note6,
    note15,
  }
}

/**
 * Valida el CUFE recalculando el SHA-384 de la cadena concatenada
 * (Anexo Técnico v1.9, sección 4.1.1). Usa crypto.subtle (disponible en
 * navegadores modernos y Node 20+). Devuelve:
 *  - 'valid'   → el CUFE coincide
 *  - 'invalid' → el CUFE NO coincide (factura alterada)
 *  - 'unknown' → no se pudo validar (falta la cadena o el CUFE)
 */
export async function validateCufe(xmlDoc: Document): Promise<'valid' | 'invalid' | 'unknown'> {
  const { cufe, cufeString } = parseXmlDianValidation(xmlDoc)
  if (!cufe || !cufeString) return 'unknown'
  try {
    const data = new TextEncoder().encode(cufeString)
    const hashBuffer = await crypto.subtle.digest('SHA-384', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex.toLowerCase() === cufe.toLowerCase() ? 'valid' : 'invalid'
  } catch {
    return 'unknown'
  }
}

/**
 * Valida que el consecutivo de la factura esté dentro del rango autorizado
 * por la resolución (Anexo Técnico v1.9, regla RV01).
 */
export function validateResolutionRange(invoiceNumber: string, prefix: string, from: number, to: number): boolean {
  if (!invoiceNumber || !prefix || !from || !to) return true // no hay datos → no bloquear
  const match = invoiceNumber.match(new RegExp(`^${prefix}(\\d+)$`))
  if (!match) return true // formato no coincide → no bloquear
  const consecutive = parseInt(match[1], 10)
  return consecutive >= from && consecutive <= to
}

/**
 * Valida el SoftwareSecurityCode (debe ser un hash SHA-384 = 96 caracteres hex).
 */
export function isValidSoftwareSecurityCode(code: string): boolean {
  if (!code) return false
  return /^[0-9a-fA-F]{96}$/.test(code.trim())
}

// ── Resolution: match each parsed line against the store's real catalog ──
// Never trust name-only fuzzy matches automatically — only an exact barcode
// or SKU match (product's own, or one of its presentations') auto-resolves.
// Everything else needs an explicit human decision before it can be imported.

export type LineStatus = 'exact' | 'suggested' | 'unresolved' | 'create'

export interface XmlPreviewLine {
  key: string
  raw: ParsedXmlLine
  status: LineStatus
  productId: number | null
  presentationId: number | null
  matchLabel: string | null // what matched, for the "✓ Coincide por…" hint
  // Editable per line. discountAmount starts from whatever the XML declared
  // (if any); lot/expiry are almost never present in a standard DIAN invoice
  // line, so they always start blank for the user to fill in when relevant.
  // ivaRate: once a real product is resolved, its OWN configured tax rate
  // wins over whatever the XML said (or my 19% fallback) — a product marked
  // exento/0% in the catalog must never get silently taxed on import just
  // because the XML's tax node wasn't found or said something else.
  discountAmount: number
  lotNumber: string
  expiryDate: string
  ivaRate: number
}

/** The tax rate this line should use once `product` is the resolved match —
 * the product's own configured rate always wins over the XML/default guess. */
export function effectiveIvaRate(product: ProductOption | undefined, fallback: number): number {
  return product ? (product.taxRate?.rate ?? 0) : fallback
}

/** Homologación guardada por proveedor: sellerSku (en minúsculas) -> a qué producto/presentación resolvió la última vez. */
export type ProviderMappingLookup = Map<string, { productId: number; presentationId: number | null }>

export function resolveXmlLine(line: ParsedXmlLine, products: ProductOption[], mappings?: ProviderMappingLookup): XmlPreviewLine {
  const barcode = line.barcode.trim().toLowerCase()
  const sellerSku = line.sellerSku.trim().toLowerCase()
  const base = {
    key: crypto.randomUUID(), raw: line,
    discountAmount: line.discountAmount, lotNumber: '', expiryDate: '',
  }

  // 1. Código de barras — identifica el bien físico, gana siempre sin
  //    importar el proveedor. Nunca lo debe pisar una homologación ni un SKU.
  if (barcode) {
    for (const p of products) {
      if ((p.barcode || '').toLowerCase() === barcode) {
        return { ...base, status: 'exact', productId: p.id, presentationId: null, matchLabel: `código de barras "${p.barcode}"`, ivaRate: effectiveIvaRate(p, line.ivaRate) }
      }
      for (const pr of (p.presentations || []).filter(x => x.isActive)) {
        if ((pr.barcode || '').toLowerCase() === barcode) {
          return { ...base, status: 'exact', productId: p.id, presentationId: pr.id, matchLabel: `código de barras de "${p.name} — ${getUnitOfMeasureLabel(pr.unitLabel)}"`, ivaRate: effectiveIvaRate(p, line.ivaRate) }
        }
      }
    }
  }

  // 2. Homologación guardada para ESTE proveedor + sellerSku exacto — gana
  //    sobre el SKU genérico porque quedó confirmada por una resolución
  //    humana anterior (o autocorregida si el usuario la cambió la última vez).
  if (sellerSku && mappings?.has(sellerSku)) {
    const m = mappings.get(sellerSku)!
    const p = products.find(pp => pp.id === m.productId)
    if (p) {
      const pr = m.presentationId ? p.presentations?.find(x => x.id === m.presentationId) : undefined
      return { ...base, status: 'exact', productId: p.id, presentationId: pr?.id ?? null, matchLabel: `homologación guardada — código "${line.sellerSku}"`, ivaRate: effectiveIvaRate(p, line.ivaRate) }
    }
  }

  // 3. SKU genérico del producto/presentación (comportamiento legado — solo
  //    puede recordar un proveedor a la vez, por eso queda debajo de #2).
  if (sellerSku) {
    for (const p of products) {
      if ((p.sku || '').toLowerCase() === sellerSku) {
        return { ...base, status: 'exact', productId: p.id, presentationId: null, matchLabel: `SKU "${p.sku}"`, ivaRate: effectiveIvaRate(p, line.ivaRate) }
      }
      for (const pr of (p.presentations || []).filter(x => x.isActive)) {
        if ((pr.sku || '').toLowerCase() === sellerSku) {
          return { ...base, status: 'exact', productId: p.id, presentationId: pr.id, matchLabel: `SKU de "${p.name} — ${getUnitOfMeasureLabel(pr.unitLabel)}" (homologación)`, ivaRate: effectiveIvaRate(p, line.ivaRate) }
        }
      }
    }
  }

  const nameLower = line.name.trim().toLowerCase()
  const suggestion = products.find(p => {
    const pLower = p.name.toLowerCase()
    return pLower.includes(nameLower) || nameLower.includes(pLower)
  })
  if (suggestion) {
    return { ...base, status: 'suggested', productId: suggestion.id, presentationId: null, matchLabel: `nombre similar a "${suggestion.name}"`, ivaRate: effectiveIvaRate(suggestion, line.ivaRate) }
  }

  return { ...base, status: 'unresolved', productId: null, presentationId: null, matchLabel: null, ivaRate: line.ivaRate }
}

// ── Types ────────────────────────────────────────────────────────────────

export interface XmlPreview {
  fileName: string
  lines: XmlPreviewLine[]
  invoiceNumber?: string
  invoiceDate?: string
  providerName?: string
  providerNit?: string
  xmlFormat?: string
  currency?: string
  lineCount?: number
  responseCode?: string
  declaredLineTotal?: number
  signature?: boolean
  withholdings?: { reteFuente: number; reteIva: number; reteIca: number }
  // Validaciones DIAN (Anexo Técnico v1.9 / Res. 000165)
  customizationId?: string
  cufe?: string
  cufeValid?: 'valid' | 'invalid' | 'unknown'
  resolutionNumber?: string
  resolutionPrefix?: string
  resolutionInRange?: boolean
  paymentMethodCode?: string
  softwareSecurityCodeValid?: boolean
  supplierTaxLevel?: string
  note6?: string
  note15?: string
}
