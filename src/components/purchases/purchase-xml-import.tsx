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
import { useCreatePurchase, usePurchaseProducts, usePurchaseProviders } from '@/hooks/api/use-purchases'
import { useTaxes } from '@/hooks/api/use-taxes'
import { formatCurrency } from '@/lib/auth'
import { sortPresentationOptions } from '@/lib/product-presentations'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { useAuthStore } from '@/stores/auth-store'
import { CheckCircle2, HelpCircle, Loader2, PackagePlus, Upload, UserPlus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { IVA_RATES, PAYMENT_TERMS as PURCHASE_PAYMENT_TERMS, todayStr } from './purchase-types'
import {
  effectiveIvaRate,
  mapCustomizationId,
  mapDianPaymentMethod,
  mapDianResponseCode,
  mapUnitCodeToLabel,
  parseDocumentLevelConsumptionTax,
  parseXmlDianValidation,
  parseXmlItems,
  parseXmlMetadata,
  parseXmlWithholdings,
  resolveXmlLine,
  validateCufe,
  validateResolutionRange,
  isValidSoftwareSecurityCode,
  type ProviderMappingLookup,
  type XmlPreview,
  type XmlPreviewLine,
} from '@/lib/purchase-xml'

// Re-exported for existing consumers (purchases-view).
export type { XmlPreview } from '@/lib/purchase-xml'

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
        <DialogContent mobileFullscreen className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] xl:max-w-[95vw] max-h-[92vh] overflow-y-auto">
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
