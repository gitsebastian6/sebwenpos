'use client'

import { useState, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Upload, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useXmlImportPurchase, type ProviderOption } from '@/hooks/api/use-purchases'
import { useProviders } from '@/hooks/api/use-providers'

// ── XML Parsing ──

function parseXmlItems(xmlDoc: Document): { name: string; quantity: number; unitCost: number }[] {
  const xmlItems: { name: string; quantity: number; unitCost: number }[] = []
  const getText = (el: Element | null, selectors: string[]): string => {
    if (!el) return ''
    for (const sel of selectors) { const found = el.querySelector(sel); if (found?.textContent?.trim()) return found.textContent.trim() }
    return ''
  }
  const getNum = (el: Element | null, selectors: string[]): number => parseFloat(getText(el, selectors)) || 0

  // Strategy 1: UBL 2.1
  const invoiceLines = xmlDoc.querySelectorAll('InvoiceLine')
  if (invoiceLines.length > 0) {
    invoiceLines.forEach(line => {
      const name = getText(line, ['Item Name', 'Item cbc\\:Name', 'cbc\\:Name'])
      const qty = getNum(line, ['InvoicedQuantity', 'cbc\\:InvoicedQuantity'])
      const price = getNum(line, ['PriceAmount', 'Price cbc\\:PriceAmount', 'cbc\\:PriceAmount'])
      if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
    })
  }
  // Strategy 2: FeCo
  if (xmlItems.length === 0) {
    xmlDoc.querySelectorAll('item').forEach(item => {
      const name = getText(item, ['descripcion', 'nombre', 'name'])
      const qty = getNum(item, ['cantidad', 'quantity'])
      const price = getNum(item, ['precioUnitario', 'unitPrice', 'valor', 'precio'])
      if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
    })
  }
  // Strategy 3: generic
  if (xmlItems.length === 0) {
    xmlDoc.querySelectorAll('producto, product').forEach(item => {
      const name = getText(item, ['nombre', 'name', 'descripcion'])
      const qty = getNum(item, ['cantidad', 'quantity'])
      const price = getNum(item, ['precio', 'price', 'costo'])
      if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
    })
  }
  // Strategy 4: repeating element heuristic
  if (xmlItems.length === 0) {
    const root = xmlDoc.documentElement
    const children = Array.from(root.children)
    const counts = new Map<string, number>()
    children.forEach(c => { const t = c.tagName.replace(/.*:/, ''); counts.set(t, (counts.get(t) || 0) + 1) })
    let bestTag = '', bestCount = 1
    counts.forEach((count, tag) => { if (count > bestCount && count >= 2) { bestCount = count; bestTag = tag } })
    if (bestTag) {
      xmlDoc.querySelectorAll(bestTag).forEach(item => {
        let name = '', qty = 0, price = 0
        Array.from(item.children).forEach(child => {
          const tag = child.tagName.replace(/.*:/, '').toLowerCase()
          const val = child.textContent?.trim() || ''
          if (!name && val && (isNaN(parseFloat(val)) || val.length > 5)) name = val
          if (/cant|qty|quantity|cantidad/.test(tag)) qty = parseFloat(val) || 0
          if (/prec|price|cost|valor|amount/.test(tag)) { const p = parseFloat(val) || 0; if (price === 0 || p < price) price = p }
        })
        if (name && qty > 0) xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
      })
    }
  }
  return xmlItems
}

function parseXmlMetadata(xmlDoc: Document) {
  const root = xmlDoc.documentElement
  const gt = (selectors: string[]): string => { for (const s of selectors) { const f = root.querySelector(s); if (f?.textContent?.trim()) return f.textContent.trim() }; return '' }
  const invoiceNumber = gt(['ID', 'cbc\\:ID', 'Numero', 'numero', 'consecutivo', 'number', 'invoiceNumber'])
  const providerName = gt(['RegistrationName', 'cbc\\:RegistrationName', 'nombre', 'razSocial', 'razonSocial', 'name'])
  const providerNit = gt(['CompanyID', 'cbc\\:CompanyID', 'nit', 'NIT', 'numeroIdentificacion'])
  const invoiceDate = gt(['IssueDate', 'cbc\\:IssueDate', 'fecha', 'Fecha', 'date', 'fechaEmision'])
  let xmlFormat = 'Desconocido'
  if (root.querySelectorAll('InvoiceLine').length > 0) xmlFormat = 'UBL 2.1 DIAN'
  else if (root.querySelectorAll('item').length > 0) xmlFormat = 'FeCo'
  else if (root.querySelectorAll('producto, product').length > 0) xmlFormat = 'Genérico'
  else if (invoiceNumber || providerName) xmlFormat = 'Formato libre'
  return { invoiceNumber, providerName, providerNit, invoiceDate, xmlFormat }
}

// ── Types ──

interface XmlPreview {
  fileName: string
  items: { name: string; quantity: number; unitCost: number }[]
  invoiceNumber?: string
  invoiceDate?: string
  providerName?: string
  providerNit?: string
  xmlFormat?: string
}

// ── XML Help Dialog ──

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
              <li>UBL 2.1 DIAN (estándar colombiano)</li>
              <li>FeCo (factura electrónica)</li>
              <li>Formato genérico (producto/product)</li>
              <li>Formato libre (detección automática)</li>
            </ul>
          </div>
          <div className="rounded border p-3 bg-muted/30">
            <p className="font-semibold mb-1">Datos que se extraen:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
              <li>Número de factura y fecha</li>
              <li>Nombre y NIT del proveedor</li>
              <li>Lista de productos con cantidades y precios</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">Los productos se vincularán automáticamente si coinciden por nombre. Se crearán nuevos productos para los que no existan.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── XML Import Component ──

export function PurchaseXmlImport({
  xmlParsing,
  xmlPreview,
  xmlNotes,
  xmlProviderId,
  xmlProviders,
  setXmlParsing,
  setXmlPreview,
  setXmlNotes,
  setXmlProviderId,
}: {
  xmlParsing: boolean
  xmlPreview: XmlPreview | null
  xmlNotes: string
  xmlProviderId: string
  xmlProviders: ProviderOption[]
  setXmlParsing: (v: boolean) => void
  setXmlPreview: (v: XmlPreview | null) => void
  setXmlNotes: (v: string) => void
  setXmlProviderId: (v: string) => void
}) {
  const { store } = useAuthStore()
  const currencyCode = store?.currencyCode || 'COP'
  const xmlImport = useXmlImportPurchase()
  const { data: providersForMatch = [] } = useProviders(store?.id, { active: true })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !store?.id) return
    if (!file.name.endsWith('.xml')) { toast.error('Solo se permiten archivos XML'); return }
    setXmlParsing(true)
    try {
      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'text/xml')
      if (xmlDoc.querySelector('parsererror')) { toast.error('Error al leer el archivo XML'); return }
      const items = parseXmlItems(xmlDoc)
      const metadata = parseXmlMetadata(xmlDoc)
      if (items.length === 0) { toast.error('No se pudieron extraer productos del XML.'); return }
      try {
        const provs: ProviderOption[] = providersForMatch
        if (metadata.providerNit) {
          const nit = metadata.providerNit.replace(/[^0-9kK]/g, '').toLowerCase()
          const match = provs.find((p: ProviderOption) => (p.nit || '').replace(/[^0-9kK]/g, '').toLowerCase() === nit)
          if (match) setXmlProviderId(String(match.id))
        } else if (metadata.providerName) {
          const name = metadata.providerName.toLowerCase().trim()
          const match = provs.find((p: ProviderOption) => p.name.toLowerCase().includes(name))
          if (match) setXmlProviderId(String(match.id))
        }
      } catch { /* */ }
      setXmlNotes(`Importado desde XML: ${file.name}`)
      setXmlPreview({ fileName: file.name, items, invoiceNumber: metadata.invoiceNumber || undefined, invoiceDate: metadata.invoiceDate || undefined, providerName: metadata.providerName || undefined, providerNit: metadata.providerNit || undefined, xmlFormat: metadata.xmlFormat })
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error al procesar XML') }
    finally { setXmlParsing(false) }
  }

  function confirmImport() {
    if (!xmlPreview || !store?.id) return
    xmlImport.mutate({
      body: {
        storeId: store.id,
        providerId: xmlProviderId !== 'none' ? Number(xmlProviderId) : undefined,
        invoiceNumber: xmlPreview.invoiceNumber || undefined,
        invoiceDate: xmlPreview.invoiceDate || undefined,
        providerName: xmlPreview.providerName || undefined,
        providerNit: xmlPreview.providerNit || undefined,
        notes: xmlNotes.trim() || undefined,
        items: xmlPreview.items.map(item => ({ productId: 0, quantity: item.quantity, unitCost: item.unitCost, name: item.name })),
      },
    }, {
      onSuccess: (result: any) => {
        toast.success(`Factura importada: ${result?.itemsCreated} producto(s)`)
        setXmlPreview(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <>
      <input type="file" accept=".xml" className="hidden" onChange={handleUpload} disabled={xmlParsing || xmlImport.isPending} id="xml-purchase-input" />
      <Dialog open={!!xmlPreview} onOpenChange={open => { if (!open) setXmlPreview(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa de Importación</DialogTitle>
            <DialogDescription>{xmlPreview?.fileName} · {xmlPreview?.xmlFormat}</DialogDescription>
          </DialogHeader>
          {xmlPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {xmlPreview.invoiceNumber && <div><span className="text-xs text-muted-foreground">Factura:</span><p className="font-mono">{xmlPreview.invoiceNumber}</p></div>}
                {xmlPreview.invoiceDate && <div><span className="text-xs text-muted-foreground">Fecha:</span><p>{xmlPreview.invoiceDate}</p></div>}
                {xmlPreview.providerName && <div><span className="text-xs text-muted-foreground">Proveedor:</span><p>{xmlPreview.providerName}</p></div>}
                {xmlPreview.providerNit && <div><span className="text-xs text-muted-foreground">NIT:</span><p className="font-mono">{xmlPreview.providerNit}</p></div>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vincular a Proveedor</Label>
                <Select value={xmlProviderId} onValueChange={setXmlProviderId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {xmlProviders.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.nit ? ` (${p.nit})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notas</Label>
                <Input value={xmlNotes} onChange={e => setXmlNotes(e.target.value)} />
              </div>
              <div className="rounded border overflow-hidden max-h-[200px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Producto</TableHead>
                    <TableHead className="text-xs text-center">Cant</TableHead>
                    <TableHead className="text-xs text-right">Costo</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {xmlPreview.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{item.name}</TableCell>
                        <TableCell className="text-xs text-center">{item.quantity}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(item.unitCost, currencyCode)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setXmlPreview(null)}>Cancelar</Button>
            <Button onClick={confirmImport} disabled={xmlImport.isPending}>
              {xmlImport.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Upload className="h-4 w-4 mr-1" />Importar Factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
