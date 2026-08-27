'use client'

import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { ProviderFormDialog } from '@/components/providers/provider-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCategories } from '@/hooks/api/use-categories'
import { useCreateProduct } from '@/hooks/api/use-products'
import { useProviders as useFullProviders } from '@/hooks/api/use-providers'
import { useCreatePurchase, usePurchaseProducts, usePurchaseProviders, type ProductOption } from '@/hooks/api/use-purchases'
import { useTaxes } from '@/hooks/api/use-taxes'
import { formatCurrency } from '@/lib/auth'
import { sortPresentationOptions } from '@/lib/product-presentations'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { useAuthStore } from '@/stores/auth-store'
import { CheckCircle2, HelpCircle, Loader2, PackagePlus, Upload, UserPlus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { IVA_RATES, PAYMENT_TERMS as PURCHASE_PAYMENT_TERMS, todayStr } from './purchase-types'

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
function effectiveIvaRate(product: ProductOption | undefined, fallback: number): number {
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

// ── XML Help Dialog ──────────────────────────────────────────────────────

export function PurchaseXmlHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Factura XML</DialogTitle>
          <DialogDescription>Formatos soportados para importar facturas electrónicas</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded border p-3 bg-muted/30">
            <p className="font-semibold mb-1">Formatos soportados:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
              <li>UBL 2.1 DIAN, incluyendo el sobre &quot;AttachedDocument&quot; (factura firmada con la factura real embebida)</li>
              <li>FeCo (factura electrónica)</li>
              <li>Formato genérico (producto/product)</li>
              <li>Formato libre (detección automática)</li>
            </ul>
          </div>
          <div className="rounded border p-3 bg-muted/30">
            <p className="font-semibold mb-1">Cómo se vinculan los productos:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
              <li>Coincidencia exacta por código de barras o SKU (incluye presentaciones como Six-pack o Caja x24) → se vincula automáticamente</li>
              <li>Coincidencia solo por nombre → se sugiere, pero debes confirmarla o corregirla</li>
              <li>Sin coincidencia → eliges un producto existente o creas uno nuevo antes de poder importar</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-1">Nunca se crean productos ni proveedores en silencio — siempre revisas y confirmas antes de importar.</p>
            <p className="text-xs text-muted-foreground mt-1">
              El Impuesto al Consumo (IC) — ej. cerveza, bebidas azucaradas — cuando existe, aparece en el XML como un
              total único de toda la factura, no por producto. Se detecta automáticamente si está presente y queda en
              un campo editable; se suma al total a pagar pero no afecta el costo registrado del producto.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              La cantidad de la factura (InvoicedQuantity) siempre se registra en unidades base del producto —
              nunca se asume que el nombre (ej. &quot;X 24&quot;) implica multiplicar por 24. Ese multiplicador solo se aplica
              si eliges explícitamente una presentación (Six-pack, Caja, etc.) en &quot;Se registrará como&quot;, o si el
              código de barras de la línea coincide exactamente con el de esa presentación.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── XML Import Component ────────────────────────────────────────────────

export function PurchaseXmlImport({
  xmlParsing,
  xmlPreview,
  xmlNotes,
  xmlProviderId,
  xmlPaymentTerms,
  xmlConsumptionTax,
  setXmlParsing,
  setXmlPreview,
  setXmlNotes,
  setXmlProviderId,
  setXmlPaymentTerms,
  setXmlConsumptionTax,
}: {
  xmlParsing: boolean
  xmlPreview: XmlPreview | null
  xmlNotes: string
  xmlProviderId: string
  xmlPaymentTerms: string
  xmlConsumptionTax: string
  setXmlParsing: (v: boolean) => void
  setXmlPreview: (v: XmlPreview | null) => void
  setXmlNotes: (v: string) => void
  setXmlProviderId: (v: string) => void
  setXmlPaymentTerms: (v: string) => void
  setXmlConsumptionTax: (v: string) => void
}) {
  const { store } = useAuthStore()
  const storeId = store?.id
  const currencyCode = store?.currencyCode || 'COP'
  const createPurchase = useCreatePurchase()
  const createProductMut = useCreateProduct()
  const { data: products = [] } = usePurchaseProducts(storeId)
  const { data: providersForMatch = [] } = usePurchaseProviders(storeId, true)
  const { data: fullProviders = [] } = useFullProviders(storeId, { active: true })
  const { data: categories = [] } = useCategories(storeId)
  const { data: taxRates = [] } = useTaxes(storeId)

  // Inline creation state
  const [showProviderCreate, setShowProviderCreate] = useState(false)
  const [showProductCreate, setShowProductCreate] = useState(false)
  const [pendingCreateLineKey, setPendingCreateLineKey] = useState<string | null>(null)
  const [pendingCreateInitial, setPendingCreateInitial] = useState<{ name?: string; barcode?: string; sku?: string } | undefined>(undefined)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !storeId) return
    if (!file.name.endsWith('.xml')) { toast.error('Solo se permiten archivos XML'); return }
    setXmlParsing(true)
    try {
      // #24: encoding — file.text() asume UTF-8. Leer como ArrayBuffer y
      // decodificar según la declaración del XML (Latin-1/ISO-8859-1 rompe
      // los acentos si se fuerza UTF-8).
      const buf = await file.arrayBuffer()
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
      } catch {
        text = new TextDecoder('latin1').decode(buf)
      }
      const encDecl = text.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)
      if (encDecl && !/utf-?8/i.test(encDecl[1])) {
        try { text = new TextDecoder(encDecl[1]).decode(buf) } catch { /* mantener el texto actual */ }
      }
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'text/xml')
      if (xmlDoc.querySelector('parsererror')) { toast.error('Error al leer el archivo XML'); return }
      const rawItems = parseXmlItems(xmlDoc)
      const metadata = parseXmlMetadata(xmlDoc)
      const consumptionTax = parseDocumentLevelConsumptionTax(xmlDoc)
      const withholdings = parseXmlWithholdings(xmlDoc)
      // Validaciones DIAN (Anexo Técnico v1.9 / Res. 000165)
      const dian = parseXmlDianValidation(xmlDoc)
      const cufeValid = await validateCufe(xmlDoc)
      const resolutionInRange = validateResolutionRange(
        metadata.invoiceNumber || '', dian.resolutionPrefix, dian.resolutionFrom, dian.resolutionTo
      )
      const softwareSecurityCodeValid = isValidSoftwareSecurityCode(dian.softwareSecurityCode)
      if (rawItems.length === 0) { toast.error('No se pudieron extraer productos del XML.'); return }

      // #23: si el XML era un AttachedDocument pero no se encontró la Invoice
      // interna, avisar (el CDATA pudo fallar o el orden cambió).
      const wasAttached = xmlDoc.documentElement.tagName.toLowerCase().includes('attacheddocument')
      if (wasAttached && rawItems.length === 0) {
        toast.error('El XML es un AttachedDocument pero no se pudo extraer la factura interna (CDATA).')
        return
      }

      // #12: notas crédito / montos negativos — advertir (no es una compra normal)
      const hasNegative = rawItems.some(i => i.quantity < 0 || i.unitCost < 0)
      if (hasNegative) {
        toast.warning('El XML contiene montos negativos (posible nota crédito/devolución). Se importará como compra — verifica los valores.')
      }

      // #22: moneda distinta a COP → advertir (los costos se guardan en COP)
      if (metadata.currency && metadata.currency !== 'COP') {
        toast.warning(`La factura está en ${metadata.currency} — los costos se registrarán como si fueran COP. Verifica los valores.`)
      }

      // #15: factura rechazada por la DIAN → advertir antes de importar
      if (metadata.responseCode && metadata.responseCode !== '02' && metadata.responseCode !== '0000') {
        toast.warning(`La DIAN respondió con código ${metadata.responseCode} (${mapDianResponseCode(metadata.responseCode)}). Verifica antes de importar.`)
      }

      // #30: sin firma digital → advertir (posible archivo alterado)
      if (metadata.signature === false) {
        toast.warning('El XML no tiene firma digital (ds:Signature). Verifica que el archivo sea legítimo.')
      }

      // CUFE inválido → factura alterada (Anexo Técnico v1.9, sección 4.1.1)
      if (cufeValid === 'invalid') {
        toast.error('⚠️ El CUFE del XML NO coincide con los datos de la factura — el archivo pudo ser alterado. No se recomienda importar.')
      }

      // Tipo de documento ≠ Factura de Venta (CustomizationID 11/21)
      if (dian.customizationId && !['11', '21'].includes(dian.customizationId)) {
        toast.warning(`El XML es un "${mapCustomizationId(dian.customizationId)}" (CustomizationID ${dian.customizationId}) — no es una Factura de Venta estándar. Verifica antes de importar.`)
      }

      // Consecutivo fuera del rango autorizado por la resolución (RV01)
      if (!resolutionInRange && dian.resolutionPrefix) {
        toast.warning(`El consecutivo de la factura está FUERA del rango autorizado (${dian.resolutionPrefix}${dian.resolutionFrom}-${dian.resolutionPrefix}${dian.resolutionTo}). Verifica la resolución.`)
      }

      // SoftwareSecurityCode inválido (debe ser SHA-384 = 96 hex)
      if (dian.softwareSecurityCode && !softwareSecurityCodeValid) {
        toast.warning('El SoftwareSecurityCode del XML no tiene el formato esperado (SHA-384). Verifica el software emisor.')
      }

      // #28: discrepancia entre el total declarado y la suma de líneas
      if (metadata.declaredLineTotal && metadata.declaredLineTotal > 0) {
        const parsedTotal = Math.round(rawItems.reduce((s, i) => s + i.quantity * i.unitCost, 0))
        const diff = Math.abs(parsedTotal - metadata.declaredLineTotal)
        if (diff > Math.max(100, metadata.declaredLineTotal * 0.01)) {
          toast.warning(`El total de líneas del XML (${metadata.declaredLineTotal}) difiere del calculado (${parsedTotal}) por ${diff}. Revisa descuentos/redondeos.`)
        }
      }

      // #20: dedup por número de factura — evitar compras duplicadas
      if (metadata.invoiceNumber) {
        try {
          const dupRes = await fetch(`/api/purchases?storeId=${storeId}&q=${encodeURIComponent(metadata.invoiceNumber)}&limit=5`)
          if (dupRes.ok) {
            const dupData = await dupRes.json() as { data?: Array<{ invoiceNumber: string | null }> }
            const alreadyImported = (dupData.data || []).some(p => p.invoiceNumber === metadata.invoiceNumber)
            if (alreadyImported) {
              toast.warning(`La factura ${metadata.invoiceNumber} ya fue importada antes — podrías estar duplicando stock.`)
            }
          }
        } catch { /* dedup no disponible — continuar */ }
      }

      // Determinar el proveedor ANTES de resolver las líneas, para poder
      // cargar sus homologaciones guardadas (código propio del proveedor ->
      // producto/presentación) y que resolveXmlLine ya las tenga disponibles.
      // Auto-select provider only on an exact NIT match — a name-only match
      // is shown but left for the user to confirm via the dropdown below.
      let matchedProviderId: number | null = null
      if (metadata.providerNit) {
        const nit = metadata.providerNit.replace(/[^0-9kK]/g, '').toLowerCase()
        const match = providersForMatch.find(p => (p.nit || '').replace(/[^0-9kK]/g, '').toLowerCase() === nit)
        matchedProviderId = match ? match.id : null
      }
      setXmlProviderId(matchedProviderId ? String(matchedProviderId) : 'none')

      let mappings: ProviderMappingLookup | undefined
      if (matchedProviderId) {
        try {
          const res = await fetch(`/api/providers/${matchedProviderId}/product-mappings?storeId=${storeId}`)
          if (res.ok) {
            const { data } = await res.json() as { data: { sellerSku: string; productId: number; presentationId: number | null }[] }
            mappings = new Map(data.map(r => [r.sellerSku.toLowerCase(), { productId: r.productId, presentationId: r.presentationId }]))
          }
        } catch { /* homologación no disponible — sigue resolviendo por código de barras/SKU/nombre */ }
      }

      const lines = rawItems.map(item => resolveXmlLine(item, products, mappings))

      // #25: validar completitud — si el XML declara N líneas y parseamos menos
      if (metadata.lineCount > 0 && lines.length < metadata.lineCount) {
        toast.warning(`El XML declara ${metadata.lineCount} líneas pero solo se extrajeron ${lines.length}. Revisa el archivo.`)
      }

      setXmlPaymentTerms('CONTADO')
      setXmlConsumptionTax(consumptionTax > 0 ? String(consumptionTax) : '0')

      setXmlNotes(`Importado desde XML: ${file.name}`)
      setXmlPreview({
        fileName: file.name, lines,
        invoiceNumber: metadata.invoiceNumber || undefined, invoiceDate: metadata.invoiceDate || undefined,
        providerName: metadata.providerName || undefined, providerNit: metadata.providerNit || undefined,
        xmlFormat: metadata.xmlFormat, currency: metadata.currency, lineCount: metadata.lineCount,
        responseCode: metadata.responseCode, declaredLineTotal: metadata.declaredLineTotal,
        signature: metadata.signature, withholdings,
        customizationId: dian.customizationId || undefined,
        cufe: dian.cufe || undefined,
        cufeValid,
        resolutionNumber: dian.resolutionNumber || undefined,
        resolutionPrefix: dian.resolutionPrefix || undefined,
        resolutionInRange,
        paymentMethodCode: dian.paymentMethodCode || undefined,
        softwareSecurityCodeValid,
        supplierTaxLevel: dian.supplierTaxLevel || undefined,
        note6: dian.note6 || undefined,
        note15: dian.note15 || undefined,
      })
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error al procesar XML') }
    finally { setXmlParsing(false) }
  }

  function updateLine(key: string, patch: Partial<XmlPreviewLine>) {
    if (!xmlPreview) return
    setXmlPreview({ ...xmlPreview, lines: xmlPreview.lines.map(l => l.key === key ? { ...l, ...patch } : l) })
  }

  function handleLineSelectChange(line: XmlPreviewLine, value: string) {
    if (value === '__create__') {
      setPendingCreateLineKey(line.key)
      // Prefill the new-product form with whatever the XML already told us —
      // name, barcode (StandardItemIdentification) and the seller's own SKU.
      setPendingCreateInitial({ name: line.raw.name, barcode: line.raw.barcode || undefined, sku: line.raw.sellerSku || undefined })
      setShowProductCreate(true)
      return
    }
    // Value encodes "<productId>" for the base product, or "<productId>::<presentationId>"
    // when the user explicitly chose one of its extra presentations (e.g. "Caja x24") —
    // only an explicit choice here (or an exact barcode/SKU match) ever assigns a
    // presentationId; a plain name match never does, to avoid guessing a pack multiplier.
    const [productPart, presentationPart] = value.split('::')
    const product = products.find(p => p.id === Number(productPart))
    const presentation = presentationPart ? product?.presentations?.find(pr => pr.id === Number(presentationPart)) : undefined
    updateLine(line.key, {
      status: 'suggested', productId: product?.id ?? null, presentationId: presentation?.id ?? null,
      matchLabel: presentation ? `seleccionado manualmente — ${getUnitOfMeasureLabel(presentation.unitLabel)}` : 'seleccionado manualmente',
      ivaRate: effectiveIvaRate(product, line.raw.ivaRate),
    })
  }

  async function handleCreateProductInline(body: Record<string, unknown>) {
    const created = await createProductMut.mutateAsync({ body })
    if (pendingCreateLineKey) {
      const createdTaxRate = (created as unknown as { taxRate?: { rate: number } | null }).taxRate
      updateLine(pendingCreateLineKey, {
        status: 'create', productId: created.id, presentationId: null, matchLabel: 'producto nuevo',
        ivaRate: createdTaxRate ? createdTaxRate.rate : 0,
      })
    }
    toast.success(`Producto "${created.name}" creado`)
    setPendingCreateLineKey(null)
    setPendingCreateInitial(undefined)
  }

  async function handleCreateProviderInline(body: Record<string, unknown>) {
    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, storeId }),
    })
    const created = await res.json()
    if (!res.ok) throw new Error(created.error || 'Error al crear proveedor')
    setXmlProviderId(String(created.id))
    toast.success(`Proveedor "${created.name}" creado`)
  }

  const allResolved = !!xmlPreview && xmlPreview.lines.every(l => l.productId !== null)

  // Pre-retención totals (retenciones are computed server-side from the
  // provider's regime, exactly like a manual purchase — not duplicated here).
  const xmlTotals = xmlPreview ? xmlPreview.lines.reduce((acc, l) => {
    const lineSubtotal = l.raw.quantity * l.raw.unitCost
    const lineIva = Math.round(lineSubtotal * l.ivaRate / 100)
    acc.subtotal += lineSubtotal
    acc.totalIva += lineIva
    acc.totalDiscount += l.discountAmount || 0
    return acc
  }, { subtotal: 0, totalIva: 0, totalDiscount: 0 }) : { subtotal: 0, totalIva: 0, totalDiscount: 0 }
  const consumptionTaxNum = Number(xmlConsumptionTax) || 0
  const xmlGrandTotal = Math.max(0, xmlTotals.subtotal + xmlTotals.totalIva + consumptionTaxNum - xmlTotals.totalDiscount)

  function confirmImport() {
    if (!xmlPreview || !storeId) return
    if (!allResolved) { toast.error('Resuelve todos los productos antes de importar'); return }

    createPurchase.mutate({
      body: {
        storeId,
        providerId: xmlProviderId !== 'none' ? Number(xmlProviderId) : undefined,
        invoiceNumber: xmlPreview.invoiceNumber || undefined,
        documentType: 'FACTURA_COMPRA',
        date: xmlPreview.invoiceDate || todayStr(),
        paymentTerms: xmlPaymentTerms,
        consumptionTax: consumptionTaxNum,
        notes: xmlNotes.trim() || undefined,
        items: xmlPreview.lines.map(l => ({
          productId: l.productId!,
          ...(l.presentationId ? { presentationId: l.presentationId } : {}),
          quantity: l.raw.quantity,
          unitCost: l.raw.unitCost,
          ivaRate: l.ivaRate,
          discountAmount: l.discountAmount || 0,
          lotNumber: l.lotNumber.trim() || undefined,
          expiryDate: l.expiryDate || undefined,
          isBonus: l.raw.isBonus,
          sellerSku: l.raw.sellerSku || undefined,
        })),
      },
    }, {
      onSuccess: () => {
        toast.success(`Factura importada: ${xmlPreview.lines.length} producto(s)`)
        setXmlPreview(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <>
      <input type="file" accept=".xml" className="hidden" onChange={handleUpload} disabled={xmlParsing || createPurchase.isPending} id="xml-purchase-input" />
      <Dialog open={!!xmlPreview} onOpenChange={open => { if (!open) setXmlPreview(null) }}>
        <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] xl:max-w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa de Importación</DialogTitle>
            <DialogDescription>{xmlPreview?.fileName} · {xmlPreview?.xmlFormat}</DialogDescription>
          </DialogHeader>
          {xmlPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {xmlPreview.invoiceNumber && <div><span className="text-xs text-muted-foreground">Factura:</span><p className="font-mono">{xmlPreview.invoiceNumber}</p></div>}
                {xmlPreview.invoiceDate && <div><span className="text-xs text-muted-foreground">Fecha:</span><p>{xmlPreview.invoiceDate}</p></div>}
                {xmlPreview.providerName && <div><span className="text-xs text-muted-foreground">Proveedor (factura):</span><p>{xmlPreview.providerName}</p></div>}
                {xmlPreview.providerNit && <div><span className="text-xs text-muted-foreground">NIT:</span><p className="font-mono">{xmlPreview.providerNit}</p></div>}
                {xmlPreview.signature !== undefined && (
                  <div><span className="text-xs text-muted-foreground">Firma digital:</span>
                    <p className={xmlPreview.signature ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {xmlPreview.signature ? '✓ Firmado' : '⚠ Sin firma'}
                    </p>
                  </div>
                )}
              </div>
              {xmlPreview.withholdings && (xmlPreview.withholdings.reteFuente > 0 || xmlPreview.withholdings.reteIva > 0 || xmlPreview.withholdings.reteIca > 0) && (
                <p className="text-xs text-muted-foreground bg-muted/50 border rounded px-2 py-1">
                  Retenciones declaradas en el XML: {xmlPreview.withholdings.reteFuente > 0 && `ReteFuente $${xmlPreview.withholdings.reteFuente} `}{xmlPreview.withholdings.reteIva > 0 && `ReteIVA $${xmlPreview.withholdings.reteIva} `}{xmlPreview.withholdings.reteIca > 0 && `ReteICA $${xmlPreview.withholdings.reteIca} `}
                  — el sistema las recalcula según el régimen del proveedor.
                </p>
              )}
              {xmlPreview.providerNit && !/\d{9,15}$/.test(xmlPreview.providerNit.replace(/[^0-9]/g, '')) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  El NIT del XML no incluye dígito de verificación — verifica al crear/editar el proveedor.
                </p>
              )}
              {(xmlPreview.currency && xmlPreview.currency !== 'COP') && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  ⚠️ Factura en {xmlPreview.currency} — los costos se registrarán como COP. Verifica los valores.
                </p>
              )}
              {xmlPreview.responseCode && xmlPreview.responseCode !== '02' && xmlPreview.responseCode !== '0000' && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
                  ⚠️ La DIAN respondió con código {xmlPreview.responseCode} ({mapDianResponseCode(xmlPreview.responseCode)}). Verifica antes de importar.
                </p>
              )}
              {/* Validaciones DIAN (Anexo Técnico v1.9 / Res. 000165) */}
              {xmlPreview.cufeValid === 'invalid' && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
                  ⛔ El CUFE del XML NO coincide con los datos de la factura — el archivo pudo ser alterado. No se recomienda importar.
                </p>
              )}
              {xmlPreview.cufeValid === 'valid' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-1">
                  ✓ CUFE validado (SHA-384) — la factura no fue alterada.
                </p>
              )}
              {xmlPreview.customizationId && !['11', '21'].includes(xmlPreview.customizationId) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  ⚠️ Documento: {mapCustomizationId(xmlPreview.customizationId)} (CustomizationID {xmlPreview.customizationId}) — no es una Factura de Venta estándar.
                </p>
              )}
              {xmlPreview.resolutionInRange === false && xmlPreview.resolutionPrefix && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  ⚠️ El consecutivo está FUERA del rango autorizado por la resolución. Verifica.
                </p>
              )}
              {xmlPreview.softwareSecurityCodeValid === false && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  ⚠️ El SoftwareSecurityCode no tiene el formato SHA-384 esperado. Verifica el software emisor.
                </p>
              )}
              {xmlPreview.paymentMethodCode && (
                <p className="text-xs text-muted-foreground bg-muted/50 border rounded px-2 py-1">
                  Medio de pago declarado: {mapDianPaymentMethod(xmlPreview.paymentMethodCode)} ({xmlPreview.paymentMethodCode})
                  {xmlPreview.note6 ? ` — ${xmlPreview.note6}` : ''}
                </p>
              )}
              {xmlPreview.supplierTaxLevel && (
                <p className="text-xs text-muted-foreground bg-muted/50 border rounded px-2 py-1">
                  Régimen fiscal del proveedor (XML): {xmlPreview.supplierTaxLevel}
                </p>
              )}
              {xmlPreview.resolutionNumber && (
                <p className="text-xs text-muted-foreground bg-muted/50 border rounded px-2 py-1">
                  Resolución: {xmlPreview.resolutionNumber}{xmlPreview.resolutionPrefix ? ` (${xmlPreview.resolutionPrefix}${xmlPreview.resolutionInRange === false ? ' — FUERA DE RANGO' : ''})` : ''}
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Vincular a Proveedor</Label>
                <div className="flex gap-2">
                  <Select value={xmlProviderId} onValueChange={setXmlProviderId}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin proveedor</SelectItem>
                      {providersForMatch.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.nit ? ` (${p.nit})` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0" onClick={() => setShowProviderCreate(true)}>
                    <UserPlus className="h-3.5 w-3.5" />Nuevo
                  </Button>
                </div>
                {xmlProviderId === 'none' && xmlPreview.providerNit && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    No se encontró un proveedor con NIT {xmlPreview.providerNit} — selecciona uno existente o crea uno nuevo.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pago</Label>
                <Select value={xmlPaymentTerms} onValueChange={setXmlPaymentTerms}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{PURCHASE_PAYMENT_TERMS.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {xmlPaymentTerms === 'CONTADO'
                    ? 'Se registra como pagada de inmediato.'
                    : 'Queda pendiente de pago — se abona desde el detalle de la compra (igual que una compra manual a crédito).'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Notas</Label>
                  <Input value={xmlNotes} onChange={e => setXmlNotes(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Impuesto al Consumo (IC)</Label>
                  <Input type="number" min="0" className="h-9" placeholder="0" value={xmlConsumptionTax} onChange={e => setXmlConsumptionTax(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">
                    {consumptionTaxNum > 0
                      ? 'Detectado en el total de la factura (no viene por línea) — verifica que coincida con el XML.'
                      : 'Si el XML declara IC (ej. cerveza, bebidas azucaradas) a nivel de factura, ingrésalo aquí. No es descontable — solo se suma al total a pagar.'}
                  </p>
                </div>
              </div>

              {/* Line resolution table */}
              <div className="space-y-1.5">
                <Label className="text-xs">Productos ({xmlPreview.lines.length}) — confirma cada uno antes de importar</Label>
                <div className="rounded border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-sm">Del XML</TableHead>
                      <TableHead className="text-sm text-center">Cant</TableHead>
                      <TableHead className="text-sm text-right">Costo Unit.</TableHead>
                      <TableHead className="text-sm text-right">Costo Total</TableHead>
                      <TableHead className="text-sm text-center w-24">IVA %</TableHead>
                      <TableHead className="text-sm text-right">Valor IVA</TableHead>
                      <TableHead className="text-sm text-right w-28">Descuento</TableHead>
                      <TableHead className="text-sm w-28">Lote</TableHead>
                      <TableHead className="text-sm w-36">Vencimiento</TableHead>
                      <TableHead className="text-sm text-right w-28">Total Línea</TableHead>
                      <TableHead className="text-sm min-w-[240px]">Se registrará como</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {xmlPreview.lines.map(line => {
                        const lineSubtotal = line.raw.quantity * line.raw.unitCost
                        const lineIva = Math.round(lineSubtotal * line.ivaRate / 100)
                        const lineTotal = Math.max(0, lineSubtotal + lineIva - (line.discountAmount || 0))
                        const resolvedProduct = line.productId ? products.find(p => p.id === line.productId) : undefined
                        const resolvedPresentation = line.presentationId ? resolvedProduct?.presentations?.find(pr => pr.id === line.presentationId) : undefined
                        const needsExpiry = !!resolvedProduct?.trackExpiration && !line.lotNumber.trim() && !line.expiryDate
                        return (
                        <TableRow key={line.key}>
                          <TableCell className="text-sm align-top">
                            <p className="truncate max-w-[140px]" title={line.raw.name}>{line.raw.name}</p>
                            {(line.raw.barcode || line.raw.sellerSku) && (
                              <p className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                                {line.raw.barcode || line.raw.sellerSku}
                              </p>
                            )}
                            {line.raw.unitCode && (
                              <p className="text-[10px] text-muted-foreground">
                                Unidad XML: {line.raw.unitCode} → {getUnitOfMeasureLabel(mapUnitCodeToLabel(line.raw.unitCode))}
                              </p>
                            )}
                            {line.raw.isBonus && (
                              <Badge variant="outline" className="text-[10px] mt-1 px-1.5 py-0 border-emerald-300 text-emerald-600 dark:text-emerald-400 dark:border-emerald-700">
                                Bonificado
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-center align-top">{line.raw.quantity}</TableCell>
                          <TableCell className="text-sm text-right align-top">
                            {formatCurrency(line.raw.unitCost, currencyCode)}
                            {resolvedPresentation && (
                              <p className="text-[10px] text-sky-600 dark:text-sky-400">
                                ≈ {formatCurrency(Math.round(line.raw.unitCost / resolvedPresentation.unitsPerPack), currencyCode)}/unidad base
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right align-top">{formatCurrency(lineSubtotal, currencyCode)}</TableCell>
                          <TableCell className="align-top">
                            <Select value={String(line.ivaRate)} onValueChange={(v) => updateLine(line.key, { ivaRate: Number(v) })}>
                              <SelectTrigger className="h-9 text-sm w-full bg-muted/50 border-muted-foreground/30"><SelectValue /></SelectTrigger>
                              <SelectContent>{IVA_RATES.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-right align-top">{formatCurrency(lineIva, currencyCode)}</TableCell>
                          <TableCell className="align-top">
                            <Input
                              type="number" min="0" className="h-9 text-sm text-right text-foreground bg-muted/50 border-muted-foreground/30"
                              value={line.discountAmount || ''}
                              onChange={(e) => updateLine(line.key, { discountAmount: Number(e.target.value) || 0 })}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Input
                              className={`h-9 text-sm text-foreground bg-muted/50 ${needsExpiry ? 'border-amber-400 dark:border-amber-600' : 'border-muted-foreground/30'}`} value={line.lotNumber}
                              onChange={(e) => updateLine(line.key, { lotNumber: e.target.value })}
                              placeholder="Opcional"
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Input
                              type="date" className={`h-9 text-sm text-foreground bg-muted/50 ${needsExpiry ? 'border-amber-400 dark:border-amber-600' : 'border-muted-foreground/30'}`} value={line.expiryDate}
                              onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                            />
                            {needsExpiry && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Este producto maneja vencimiento</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right align-top pt-4 font-semibold">
                            {formatCurrency(lineTotal, currencyCode)}
                          </TableCell>
                          <TableCell className="text-sm align-top space-y-1">
                            <div className="flex items-center gap-1">
                              {line.status === 'exact' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                              {line.status === 'suggested' && <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                              {line.status === 'create' && <PackagePlus className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
                              {line.status === 'unresolved' && <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <Select
                                value={line.productId ? (line.presentationId ? `${line.productId}::${line.presentationId}` : String(line.productId)) : ''}
                                onValueChange={(v) => handleLineSelectChange(line, v)}
                              >
                                <SelectTrigger className="h-9 text-sm w-full bg-muted/50 border-muted-foreground/30"><SelectValue placeholder="Sin resolver" /></SelectTrigger>
                                <SelectContent>
                                  {products.flatMap(p => sortPresentationOptions(p).map((option) => {
                                    const pr = option.presentation
                                    return pr ? (
                                      <SelectItem key={`${p.id}::${pr.id}`} value={`${p.id}::${pr.id}`}>
                                        {p.name} — {getUnitOfMeasureLabel(pr.unitLabel)} (x{option.unitsPerPack})
                                      </SelectItem>
                                    ) : (
                                      <SelectItem key={p.id} value={String(p.id)}>{p.name} — {getUnitOfMeasureLabel(p.unitLabel)}</SelectItem>
                                    )
                                  }))}
                                  <SelectItem value="__create__">
                                    <span className="flex items-center gap-1 text-primary"><PackagePlus className="h-3 w-3" />Crear producto nuevo</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {line.matchLabel && (
                              <p className={`text-xs ${line.status === 'exact' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                {line.status === 'exact' ? '✓ Coincide por ' : line.status === 'create' ? '' : '≈ Sugerido por '}{line.status !== 'create' ? line.matchLabel : ''}
                              </p>
                            )}
                            {resolvedPresentation && (
                              <p className="text-[10px] text-sky-600 dark:text-sky-400">
                                Se registrará {line.raw.quantity} × {getUnitOfMeasureLabel(resolvedPresentation.unitLabel)} = {line.raw.quantity * resolvedPresentation.unitsPerPack} unidades base
                              </p>
                            )}
                            {!resolvedPresentation && line.productId && (
                              <p className="text-[10px] text-muted-foreground">
                                Se registrará {line.raw.quantity} unidad(es) base — no se aplica ningún multiplicador de presentación
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )})}
                    </TableBody>
                  </Table>
                </div>
                {!allResolved && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600">Pendiente</Badge>
                    Resuelve todos los productos antes de importar — nunca se crean duplicados en silencio.
                  </p>
                )}
              </div>

              {/* Totals summary */}
              <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(xmlTotals.subtotal, currencyCode)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="text-blue-600 dark:text-blue-400">{formatCurrency(xmlTotals.totalIva, currencyCode)}</span></div>
                {consumptionTaxNum > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Impuesto al Consumo (IC)</span><span className="text-purple-600 dark:text-purple-400">{formatCurrency(consumptionTaxNum, currencyCode)}</span></div>
                )}
                {xmlTotals.totalDiscount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Descuento</span><span className="text-red-500">-{formatCurrency(xmlTotals.totalDiscount, currencyCode)}</span></div>
                )}
                <p className="text-[10px] text-muted-foreground">Las retenciones (si aplican según el régimen del proveedor) se calculan al confirmar, igual que en una compra manual.</p>
                <div className="flex justify-between font-bold text-base pt-1 border-t"><span>TOTAL A PAGAR</span><span className="text-primary">{formatCurrency(xmlGrandTotal, currencyCode)}</span></div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Forma de pago</span>
                  <span className={xmlPaymentTerms === 'CONTADO' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                    {PURCHASE_PAYMENT_TERMS.find(pt => pt.value === xmlPaymentTerms)?.label}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setXmlPreview(null)}>Cancelar</Button>
            <Button onClick={confirmImport} disabled={createPurchase.isPending || !allResolved}>
              {createPurchase.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Upload className="h-4 w-4 mr-1" />Importar Factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Inline provider creation ── */}
      <ProviderFormDialog
        open={showProviderCreate}
        onOpenChange={setShowProviderCreate}
        editingProvider={null}
        initialName={xmlPreview?.providerName}
        onSave={handleCreateProviderInline}
      />

      {/* ── Inline product creation ── */}
      <ProductFormDialog
        open={showProductCreate}
        onOpenChange={(o) => { setShowProductCreate(o); if (!o) { setPendingCreateLineKey(null); setPendingCreateInitial(undefined) } }}
        editingProduct={null}
        initialValues={pendingCreateInitial}
        providers={fullProviders}
        taxRates={taxRates}
        categories={categories}
        onSave={handleCreateProductInline}
        onToggle={async () => {}}
      />
    </>
  )
}
