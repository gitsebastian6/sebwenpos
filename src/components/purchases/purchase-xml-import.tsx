'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Upload, CheckCircle2, HelpCircle, XCircle, PackagePlus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useCreatePurchase, usePurchaseProducts, usePurchaseProviders, type ProductOption } from '@/hooks/api/use-purchases'
import { useCreateProduct } from '@/hooks/api/use-products'
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { ProviderFormDialog } from '@/components/providers/provider-form-dialog'
import { useCategories } from '@/hooks/api/use-categories'
import { useTaxes } from '@/hooks/api/use-taxes'
import { useProviders as useFullProviders } from '@/hooks/api/use-providers'
import { todayStr, PAYMENT_TERMS as PURCHASE_PAYMENT_TERMS, IVA_RATES } from './purchase-types'
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
  // Línea bonificada/gratis — PriceAmount=0, o un AllowanceCharge que cubre
  // ~100% del valor de la línea (las dos formas comunes en que un proveedor
  // colombiano representa un "regalo" en el XML). Puramente informativo:
  // no cambia el cálculo de costo, solo se usa para etiquetar la línea.
  isBonus: boolean
}

function getLocalName(el: Element): string {
  return el.tagName.replace(/.*:/, '')
}

/**
 * DIAN electronic invoices are transmitted as an "AttachedDocument" envelope
 * (the signed, DIAN-facing document) that embeds the REAL commercial Invoice
 * — the one with line items, prices, and the actual seller's data — as raw
 * XML text (CDATA) inside a Description element. Reading the envelope
 * directly finds no InvoiceLine nodes at all; it has to be unwrapped first.
 */
export function unwrapAttachedDocument(xmlDoc: Document): Document {
  const root = xmlDoc.documentElement
  if (getLocalName(root) !== 'AttachedDocument') return xmlDoc
  let descriptionEl: Element | null = null
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const text = el.textContent?.trim() || ''
    if (getLocalName(el) === 'Description' && text.startsWith('<')) {
      descriptionEl = el
      break
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
  const getNum = (el: Element | null, selectors: string[]): number => parseFloat(getText(el, selectors)) || 0

  // A line-level discount in DIAN UBL is an AllowanceCharge with
  // ChargeIndicator=false (true would be a surcharge, not a discount).
  const getLineDiscount = (line: Element): number => {
    for (const el of Array.from(line.querySelectorAll('AllowanceCharge'))) {
      const isCharge = getText(el, ['ChargeIndicator', 'cbc\\:ChargeIndicator']).toLowerCase() === 'true'
      if (!isCharge) return getNum(el, ['Amount', 'cbc\\:Amount'])
    }
    return 0
  }

  // Strategy 1: UBL 2.1 (DIAN and most Colombian e-invoicing software)
  const invoiceLines = doc.querySelectorAll('InvoiceLine')
  if (invoiceLines.length > 0) {
    invoiceLines.forEach(line => {
      // DIAN requires cac:Item > cbc:Description to be populated; cbc:Name is
      // optional and often absent, so Description must be tried first.
      const name = getText(line, [
        'Item cbc\\:Description', 'cac\\:Item cbc\\:Description', 'Item Description',
        'Item cbc\\:Name', 'Item Name', 'cbc\\:Name',
      ])
      const barcode = getText(line, [
        'Item StandardItemIdentification cbc\\:ID', 'cac\\:Item cac\\:StandardItemIdentification cbc\\:ID', 'StandardItemIdentification ID',
      ])
      const sellerSku = getText(line, [
        'Item SellersItemIdentification cbc\\:ID', 'cac\\:Item cac\\:SellersItemIdentification cbc\\:ID', 'SellersItemIdentification ID',
      ])
      const qty = getNum(line, ['InvoicedQuantity', 'cbc\\:InvoicedQuantity'])
      const price = getNum(line, ['PriceAmount', 'Price cbc\\:PriceAmount', 'cbc\\:PriceAmount'])
      const ivaRate = getNum(line, [
        'TaxTotal TaxSubtotal cbc\\:Percent', 'cac\\:TaxTotal cac\\:TaxSubtotal cbc\\:Percent', 'Percent',
      ]) || 19
      const discountAmount = Math.round(getLineDiscount(line))
      // Bonificado: precio literal $0, o un descuento que cubre ~100% del
      // valor bruto de la línea (las dos formas comunes en que un proveedor
      // colombiano representa un "regalo" en el XML, en vez de un precio $0).
      const grossLineAmount = qty * price
      const isFullyDiscounted = discountAmount > 0 && grossLineAmount > 0 && discountAmount >= Math.round(grossLineAmount * 0.99)
      const isBonus = price === 0 || isFullyDiscounted
      if (name && qty > 0) items.push({ name, barcode, sellerSku, quantity: qty, unitCost: Math.round(price), ivaRate, discountAmount, isBonus })
    })
  }
  // Strategy 2: FeCo
  if (items.length === 0) {
    doc.querySelectorAll('item').forEach(item => {
      const name = getText(item, ['descripcion', 'nombre', 'name'])
      const qty = getNum(item, ['cantidad', 'quantity'])
      const price = getNum(item, ['precioUnitario', 'unitPrice', 'valor', 'precio'])
      if (name && qty > 0) items.push({ name, barcode: '', sellerSku: '', quantity: qty, unitCost: Math.round(price), ivaRate: 19, discountAmount: 0, isBonus: price === 0 })
    })
  }
  // Strategy 3: generic
  if (items.length === 0) {
    doc.querySelectorAll('producto, product').forEach(item => {
      const name = getText(item, ['nombre', 'name', 'descripcion'])
      const qty = getNum(item, ['cantidad', 'quantity'])
      const price = getNum(item, ['precio', 'price', 'costo'])
      if (name && qty > 0) items.push({ name, barcode: '', sellerSku: '', quantity: qty, unitCost: Math.round(price), ivaRate: 19, discountAmount: 0, isBonus: price === 0 })
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
          if (!name && val && (isNaN(parseFloat(val)) || val.length > 5)) name = val
          if (/cant|qty|quantity|cantidad/.test(tag)) qty = parseFloat(val) || 0
          if (/prec|price|cost|valor|amount/.test(tag)) { const p = parseFloat(val) || 0; if (price === 0 || p < price) price = p }
        })
        if (name && qty > 0) items.push({ name, barcode: '', sellerSku: '', quantity: qty, unitCost: Math.round(price), ivaRate: 19, discountAmount: 0, isBonus: price === 0 })
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
 */
export function parseDocumentLevelConsumptionTax(xmlDoc: Document): number {
  const doc = unwrapAttachedDocument(xmlDoc)
  const root = doc.documentElement
  const getText = (el: Element | null, selectors: string[]): string => {
    if (!el) return ''
    for (const sel of selectors) { const found = el.querySelector(sel); if (found?.textContent?.trim()) return found.textContent.trim() }
    return ''
  }
  let total = 0
  for (const tt of Array.from(root.children).filter(el => getLocalName(el) === 'TaxTotal')) {
    for (const sub of Array.from(tt.querySelectorAll('TaxSubtotal'))) {
      const schemeName = getText(sub, ['TaxScheme cbc\\:Name', 'cac\\:TaxScheme cbc\\:Name', 'TaxScheme Name']).toLowerCase()
      const schemeId = getText(sub, ['TaxScheme cbc\\:ID', 'cac\\:TaxScheme cbc\\:ID', 'TaxScheme ID'])
      if (schemeName.includes('consumo') || schemeName === 'ic' || schemeId === '02') {
        total += parseFloat(getText(sub, ['cbc\\:TaxAmount', 'TaxAmount'])) || 0
      }
    }
  }
  return Math.round(total)
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
  let xmlFormat = 'Desconocido'
  const wasAttachedDocument = getLocalName(xmlDoc.documentElement) === 'AttachedDocument'
  if (root.querySelectorAll('InvoiceLine').length > 0) xmlFormat = wasAttachedDocument ? 'UBL 2.1 DIAN (AttachedDocument)' : 'UBL 2.1 DIAN'
  else if (root.querySelectorAll('item').length > 0) xmlFormat = 'FeCo'
  else if (root.querySelectorAll('producto, product').length > 0) xmlFormat = 'Genérico'
  else if (invoiceNumber || providerName) xmlFormat = 'Formato libre'
  return { invoiceNumber, providerName, providerNit, invoiceDate, xmlFormat }
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
      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'text/xml')
      if (xmlDoc.querySelector('parsererror')) { toast.error('Error al leer el archivo XML'); return }
      const rawItems = parseXmlItems(xmlDoc)
      const metadata = parseXmlMetadata(xmlDoc)
      const consumptionTax = parseDocumentLevelConsumptionTax(xmlDoc)
      if (rawItems.length === 0) { toast.error('No se pudieron extraer productos del XML.'); return }

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

      setXmlPaymentTerms('CONTADO')
      setXmlConsumptionTax(consumptionTax > 0 ? String(consumptionTax) : '0')

      setXmlNotes(`Importado desde XML: ${file.name}`)
      setXmlPreview({
        fileName: file.name, lines,
        invoiceNumber: metadata.invoiceNumber || undefined, invoiceDate: metadata.invoiceDate || undefined,
        providerName: metadata.providerName || undefined, providerNit: metadata.providerNit || undefined,
        xmlFormat: metadata.xmlFormat,
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
              </div>
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
                                  {products.flatMap(p => [
                                    <SelectItem key={p.id} value={String(p.id)}>{p.name} — {getUnitOfMeasureLabel(p.unitLabel)}</SelectItem>,
                                    ...(p.presentations || []).filter(pr => pr.isActive).map(pr => (
                                      <SelectItem key={`${p.id}::${pr.id}`} value={`${p.id}::${pr.id}`}>
                                        {p.name} — {getUnitOfMeasureLabel(pr.unitLabel)} (x{pr.unitsPerPack})
                                      </SelectItem>
                                    )),
                                  ])}
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
