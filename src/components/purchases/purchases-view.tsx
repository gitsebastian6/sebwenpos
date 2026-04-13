'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  CalendarDays,
  Package,
  Ban,
  Eye,
  FileText,
  Printer,
  Download,
  FileSpreadsheet,
  Upload,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { printReport, printThermal80mm } from '@/lib/print-report'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProviderOption {
  id: number
  name: string
  isActive: boolean
}

interface ProductOption {
  id: number
  name: string
  isActive: boolean
  currentStock: number
}

interface PurchaseItemRow {
  id: string
  productId: string
  quantity: string
  unitCost: string // in pesos (will convert to cents on save)
}

interface PurchaseItemData {
  id: number
  purchaseId: number
  productId: number
  product: { id: number; name: string }
  quantity: number
  returnedQuantity: number
  unitCost: number // in centavos
  total: number
}

interface Purchase {
  id: number
  storeId: number
  providerId: number | null
  provider: { id: number; name: string } | null
  invoiceNumber: string | null
  date: string
  notes: string | null
  total: number // in centavos
  status: string
  itemCount: number
  purchaseItems: PurchaseItemData[]
  createdAt: string
  updatedAt: string
}

type StatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED'

// ── Helper ────────────────────────────────────────────────────────────────

// Nota: Todos los valores monetarios se almacenan en pesos enteros (sin centavos para COP)
// El usuario ingresa el valor en pesos y se guarda directamente.

// ── Component ──────────────────────────────────────────────────────────────

export function PurchasesView() {
  const { store } = useAuthStore()
  const currencyCode = store?.currencyCode || 'COP'

  // List state
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('none')
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([
    { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' },
  ])
  const [saving, setSaving] = useState(false)

  // Detail dialog state
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null)

  // Cancel dialog state
  const [cancelPurchase, setCancelPurchase] = useState<Purchase | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Return dialog state
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning] = useState(false)
  const [returnItems, setReturnItems] = useState<Map<number, number>>(new Map()) // purchaseItemId -> qty to return

  // XML import state
  const xmlInputRef = useRef<HTMLInputElement>(null)
  const [xmlUploading, setXmlUploading] = useState(false)
  const [xmlPreview, setXmlPreview] = useState<{
    fileName: string
    items: { name: string; quantity: number; unitCost: number }[]
  } | null>(null)
  const [xmlNotes, setXmlNotes] = useState('')
  const [xmlProviderId, setXmlProviderId] = useState<string>('none')
  const [xmlProviders, setXmlProviders] = useState<ProviderOption[]>([])

  // ─── Fetch purchases ──────────────────────────────────────────────────

  const fetchPurchases = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: store.id.toString() })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/purchases?${params}`)
      if (!res.ok) throw new Error('Error al cargar compras')
      const data = await res.json()
      setPurchases(data)
    } catch {
      toast.error('Error al cargar compras')
    } finally {
      setLoading(false)
    }
  }, [store?.id, search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => fetchPurchases(), 300)
    return () => clearTimeout(timer)
  }, [fetchPurchases])

  // ─── Fetch providers and products for create dialog ──────────────────

  async function openCreateDialog() {
    setSelectedProviderId('none')
    setPurchaseInvoiceNumber('')
    setPurchaseNotes('')
    setPurchaseItems([
      { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' },
    ])
    setCreateOpen(true)

    if (!store?.id) return

    // Fetch active providers
    try {
      const res = await fetch(`/api/providers?storeId=${store.id}&active=true`)
      if (res.ok) {
        const data = await res.json()
        setProviders(data)
      }
    } catch {
      // Silently fail
    }

    // Fetch active products
    try {
      const res = await fetch(`/api/products?storeId=${store.id}&active=true`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      }
    } catch {
      // Silently fail
    }
  }

  // ─── Purchase items management ───────────────────────────────────────

  function addItem() {
    setPurchaseItems([
      ...purchaseItems,
      { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' },
    ])
  }

  function removeItem(itemId: string) {
    if (purchaseItems.length <= 1) {
      toast.error('Debe haber al menos un producto')
      return
    }
    setPurchaseItems(purchaseItems.filter((item) => item.id !== itemId))
  }

  function updateItem(itemId: string, field: keyof PurchaseItemRow, value: string) {
    setPurchaseItems(
      purchaseItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    )
  }

  function getLineTotal(item: PurchaseItemRow): number {
    const qty = Number(item.quantity) || 0
    const cost = Number(item.unitCost) || 0
    return qty * cost // in pesos
  }

  function getGrandTotal(): number {
    return purchaseItems.reduce((sum, item) => sum + getLineTotal(item), 0) // in pesos
  }

  // ─── Save purchase ──────────────────────────────────────────────────

  async function handleSavePurchase() {
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }

    // Validate items
    const validItems = purchaseItems.filter((item) => item.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0)

    if (validItems.length === 0) {
      toast.error('Debe agregar al menos un producto con cantidad y costo')
      return
    }

    // Check for duplicate products
    const productIds = validItems.map((item) => item.productId)
    const uniqueIds = new Set(productIds)
    if (uniqueIds.size !== productIds.length) {
      toast.error('No puede agregar el mismo producto más de una vez')
      return
    }

    setSaving(true)
    try {
      const body = {
        storeId: store.id,
        providerId: selectedProviderId !== 'none' ? Number(selectedProviderId) : undefined,
        invoiceNumber: purchaseInvoiceNumber.trim() || undefined,
        notes: purchaseNotes.trim() || undefined,
        items: validItems.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          unitCost: Math.round(Number(item.unitCost)),
        })),
      }

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al crear compra')
      }

      toast.success('Compra creada exitosamente')
      setCreateOpen(false)
      fetchPurchases()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  // ─── View purchase detail ───────────────────────────────────────────

  async function openDetail(purchase: Purchase) {
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailPurchase(data)
      }
    } catch {
      setDetailPurchase(purchase)
    }
  }

  // ─── Return purchase ──────────────────────────────────────────────

  function openReturnDialog() {
    if (!detailPurchase) return
    const items = new Map<number, number>()
    for (const item of detailPurchase.purchaseItems) {
      const available = item.quantity - (item.returnedQuantity ?? 0)
      if (available > 0) {
        items.set(item.id, available)
      }
    }
    setReturnItems(items)
    setReturnReason('')
    setShowReturnDialog(true)
  }

  function toggleReturnItem(itemId: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.set(itemId, maxQty)
      }
      return next
    })
  }

  function setReturnItemQty(itemId: number, qty: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      const clamped = Math.max(1, Math.min(qty, maxQty))
      next.set(itemId, clamped)
      return next
    })
  }

  function selectAllReturnItems() {
    if (!detailPurchase) return
    const items = new Map<number, number>()
    for (const item of detailPurchase.purchaseItems) {
      const available = item.quantity - (item.returnedQuantity ?? 0)
      if (available > 0) {
        items.set(item.id, available)
      }
    }
    setReturnItems(items)
  }

  function deselectAllReturnItems() {
    setReturnItems(new Map())
  }

  async function handleReturnPurchase() {
    if (!detailPurchase) return
    if (returnItems.size === 0) {
      toast.error('Selecciona al menos un producto para devolver')
      return
    }
    setReturning(true)
    try {
      const items = Array.from(returnItems.entries()).map(([purchaseItemId, quantity]) => ({
        purchaseItemId,
        quantity,
      }))
      const res = await fetch(`/api/purchases/${detailPurchase.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason: returnReason.trim() || undefined })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al procesar devolución')
      }
      const data = await res.json()
      toast.success(data.message)
      setShowReturnDialog(false)
      setReturnItems(new Map())
      setDetailPurchase(null)
      fetchPurchases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al procesar devolución')
    } finally {
      setReturning(false)
    }
  }

  // ─── Cancel purchase ───────────────────────────────────────────────

  async function handleCancel() {
    if (!cancelPurchase) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/purchases/${cancelPurchase.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al cancelar compra')
      }
      toast.success('Compra cancelada exitosamente')
      setCancelPurchase(null)
      fetchPurchases()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setCancelling(false)
    }
  }

  // ─── XML Invoice Import ─────────────────────────────────────────

  function parseXmlItems(xmlDoc: Document): { name: string; quantity: number; unitCost: number }[] {
    const xmlItems: { name: string; quantity: number; unitCost: number }[] = []

    const getText = (el: Element | null, selectors: string[]): string => {
      if (!el) return ''
      for (const sel of selectors) {
        const found = el.querySelector(sel)
        if (found?.textContent?.trim()) return found.textContent.trim()
      }
      return ''
    }
    const getNum = (el: Element | null, selectors: string[]): number => {
      const txt = getText(el, selectors)
      return parseFloat(txt) || 0
    }

    // Strategy 1: UBL 2.1 standard (Colombian DIAN)
    const invoiceLines = xmlDoc.querySelectorAll('InvoiceLine')
    if (invoiceLines.length > 0) {
      invoiceLines.forEach(line => {
        const name = getText(line, ['Item Name', 'Item cbc\\:Name', 'cbc\\:Name'])
        const qty = getNum(line, ['InvoicedQuantity', 'cbc\\:InvoicedQuantity', 'cbc\\:Quantity'])
        const price = getNum(line, ['PriceAmount', 'Price cbc\\:PriceAmount', 'cbc\\:PriceAmount', 'cbc\\:Amount'])
        if (name && qty > 0) {
          xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
        }
      })
    }

    // Strategy 2: FeCo Colombian format
    if (xmlItems.length === 0) {
      const feItems = xmlDoc.querySelectorAll('item')
      if (feItems.length > 0) {
        feItems.forEach(item => {
          const name = getText(item, ['descripcion', 'nombre', 'name', 'descripcionPro'])
          const qty = getNum(item, ['cantidad', 'quantity', 'cant'])
          const price = getNum(item, ['precioUnitario', 'unitPrice', 'valor', 'precio', 'precioTotal'])
          if (name && qty > 0) {
            xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
          }
        })
      }
    }

    // Strategy 3: generic producto/product
    if (xmlItems.length === 0) {
      const genericItems = xmlDoc.querySelectorAll('producto, product')
      if (genericItems.length > 0) {
        genericItems.forEach(item => {
          const name = getText(item, ['nombre', 'name', 'descripcion', 'description'])
          const qty = getNum(item, ['cantidad', 'quantity', 'cant'])
          const price = getNum(item, ['precio', 'price', 'precioUnitario', 'unitPrice', 'valor', 'costo'])
          if (name && qty > 0) {
            xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
          }
        })
      }
    }

    // Strategy 4: Try to find ANY repeating element that could be a line item
    if (xmlItems.length === 0) {
      const root = xmlDoc.documentElement
      const children = Array.from(root.children)
      const tagNameCounts = new Map<string, number>()
      children.forEach(child => {
        const tag = child.tagName.replace(/.*:/, '')
        tagNameCounts.set(tag, (tagNameCounts.get(tag) || 0) + 1)
      })
      let bestTag = ''
      let bestCount = 1
      tagNameCounts.forEach((count, tag) => {
        if (count > bestCount && count >= 2) {
          bestCount = count
          bestTag = tag
        }
      })
      if (bestTag) {
        const lineItems = xmlDoc.querySelectorAll(bestTag)
        lineItems.forEach(item => {
          const itemChildren = Array.from(item.children)
          let name = ''
          let qty = 0
          let price = 0
          itemChildren.forEach(child => {
            const tag = child.tagName.replace(/.*:/, '').toLowerCase()
            const val = child.textContent?.trim() || ''
            if (!name && val) {
              const numVal = parseFloat(val)
              if (isNaN(numVal) || val.length > 5) {
                name = val
              }
            }
            if (/cant|qty|quantity|cantidad/.test(tag)) {
              qty = parseFloat(val) || 0
            }
            if (/prec|price|cost|valor|unit|amount|total|importe/.test(tag)) {
              const parsed = parseFloat(val) || 0
              if (price === 0 || parsed < price) price = parsed
            }
          })
          if (name && qty > 0) {
            xmlItems.push({ name, quantity: qty, unitCost: Math.round(price) })
          }
        })
      }
    }

    return xmlItems
  }

  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!store?.id) return

    if (!file.name.endsWith('.xml')) {
      toast.error('Solo se permiten archivos XML')
      return
    }

    setXmlUploading(true)
    try {
      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'text/xml')
      const parseError = xmlDoc.querySelector('parsererror')
      if (parseError) {
        toast.error('Error al leer el archivo XML')
        return
      }

      const xmlItems = parseXmlItems(xmlDoc)

      if (xmlItems.length === 0) {
        toast.error('No se pudieron extraer productos del XML. Verifica el formato del archivo.')
        return
      }

      // Fetch providers for the preview dialog
      try {
        const res = await fetch(`/api/providers?storeId=${store.id}&active=true`)
        if (res.ok) {
          const data = await res.json()
          setXmlProviders(data)
        }
      } catch {
        // Silently fail
      }

      setXmlNotes(`Importado desde XML: ${file.name}`)
      setXmlProviderId('none')
      setXmlPreview({ fileName: file.name, items: xmlItems })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar XML')
    } finally {
      setXmlUploading(false)
      if (xmlInputRef.current) xmlInputRef.current.value = ''
    }
  }

  async function confirmXmlImport() {
    if (!xmlPreview || !store?.id) return
    setXmlUploading(true)
    try {
      const body = {
        storeId: store.id,
        providerId: xmlProviderId !== 'none' ? Number(xmlProviderId) : undefined,
        notes: xmlNotes.trim() || undefined,
        items: xmlPreview.items.map(item => ({
          productId: 0,
          quantity: item.quantity,
          unitCost: item.unitCost,
          name: item.name,
        })),
      }

      const res = await fetch('/api/purchases/xml-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al importar factura XML')
      }

      const result = await res.json()
      toast.success(`Factura XML importada: ${result.itemsCreated} producto${result.itemsCreated !== 1 ? 's' : ''} procesados`)
      setXmlPreview(null)
      fetchPurchases()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar XML')
    } finally {
      setXmlUploading(false)
    }
  }

  // ─── Print Purchases ──────────────────────────────────────────────

  function handlePrintPurchases(thermal = false) {
    const statusFilterLabel = statusFilter === 'ALL' ? 'Todas' : statusFilter === 'COMPLETED' ? 'Completadas' : 'Canceladas'
    const subtitle = search || statusFilter !== 'ALL'
      ? `${search ? `"${search}" · ` : ''}${statusFilterLabel}`
      : 'Todas las compras'

    if (thermal) {
      const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
      lines.push({ left: subtitle, separator: true })
      purchases.forEach(p => {
        const prov = p.provider?.name || 'Sin prov.'
        lines.push({ left: `${prov}`, right: formatCurrency(p.total, currencyCode), bold: true, separator: true })
        const dateStr = format(new Date(p.date), 'dd/MM/yy', { locale: es })
        const inv = p.invoiceNumber || ''
        lines.push({ left: `${dateStr} ${inv ? '· ' + inv : ''} · ${p.itemCount} prod.` })
        lines.push({ left: p.status === 'COMPLETED' ? '✓ Completada' : '✗ Cancelada', separator: true })
      })
      const totalVal = purchases.filter(p => p.status === 'COMPLETED').reduce((s, p) => s + p.total, 0)
      lines.push({ left: '────────────────────────────────', separator: false })
      lines.push({ left: `TOTAL COMPLETADAS:`, right: formatCurrency(totalVal, currencyCode), bold: true })
      printThermal80mm({
        title: 'COMPRAS',
        lines,
        footer: `Total: ${purchases.length} compra${purchases.length !== 1 ? 's' : ''}`,
      })
    } else {
      printReport({
        title: 'Reporte de Compras',
        subtitle: `Filtros: ${subtitle}`,
        headers: ['#', 'Fecha', 'Factura', 'Proveedor', 'Productos', 'Total', 'Estado'],
        columnAligns: ['center', 'center', 'center', 'left', 'center', 'right', 'center'],
        columnWidths: ['30px', '100px', '100px', '1fr', '60px', '100px', '80px'],
        rows: purchases.map((p, i) => [
          i + 1,
          format(new Date(p.date), 'd MMM yyyy', { locale: es }),
          p.invoiceNumber || '—',
          p.provider?.name || 'Sin proveedor',
          p.itemCount,
          formatCurrency(p.total, currencyCode),
          p.status === 'COMPLETED' ? 'Completada' : 'Cancelada',
        ]),
        footer: `Total compras: ${purchases.length} · Total valor: ${formatCurrency(purchases.filter(p => p.status === 'COMPLETED').reduce((s, p) => s + p.total, 0), currencyCode)}`,
        orientation: 'landscape',
      })
    }
  }

  // ─── Print Single Purchase (detail) ────────────────────────────────

  function handlePrintPurchaseDetail(purchase: Purchase) {
    const lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[] = []
    const dateStr = format(new Date(purchase.date), 'dd/MM/yyyy', { locale: es })
    const prov = purchase.provider?.name || 'Sin proveedor'

    lines.push({ left: `Compra #${purchase.id}`, bold: true, separator: true })
    lines.push({ left: `Fecha: ${dateStr}` })
    lines.push({ left: `Proveedor: ${prov}` })
    if (purchase.invoiceNumber) {
      lines.push({ left: `Factura: ${purchase.invoiceNumber}` })
    }
    if (purchase.notes) {
      lines.push({ left: `Notas: ${purchase.notes}` })
    }
    lines.push({ separator: true })
    lines.push({ left: 'PRODUCTO', right: 'SUBTOTAL', bold: true, separator: true })

    purchase.purchaseItems.forEach(item => {
      const name = item.product.name.length > 24 ? item.product.name.slice(0, 24) + '..' : item.product.name
      lines.push({
        left: `${item.quantity}x ${name}`,
        right: formatCurrency(item.total, currencyCode),
      })
    })

    lines.push({ left: '────────────────────────────────', separator: false })
    lines.push({ left: `TOTAL:`, right: formatCurrency(purchase.total, currencyCode), bold: true })
    lines.push({ left: purchase.status === 'COMPLETED' ? 'ESTADO: COMPLETADA' : 'ESTADO: CANCELADA', separator: true })

    printThermal80mm({
      title: 'COMPRA DETALLE',
      lines,
      footer: `Generado: ${new Date().toLocaleDateString('es-CO')}`,
    })
  }

  // ─── Export Excel ───────────────────────────────────────────────────

  function handleExportExcel() {
    const rows = purchases.map((p, i) => ({
      '#': i + 1,
      'Fecha': format(new Date(p.date), 'yyyy-MM-dd'),
      'Factura': p.invoiceNumber || '',
      'Proveedor': p.provider?.name || 'Sin proveedor',
      'N° Productos': p.itemCount,
      'Total': p.total,
      'Estado': p.status === 'COMPLETED' ? 'Completada' : 'Cancelada',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 16 },
      { wch: 25 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')

    const fileName = `Compras_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`Archivo ${fileName} descargado`)
  }

  // ─── Counts ─────────────────────────────────────────────────────────

  const completedCount = purchases.filter((p) => p.status === 'COMPLETED').length
  const cancelledCount = purchases.filter((p) => p.status === 'CANCELLED').length

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header + Action ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Compras</h2>
            <p className="text-sm text-muted-foreground">
              {loading
                ? '...'
                : `${completedCount} completada${completedCount !== 1 ? 's' : ''}, ${cancelledCount} cancelada${cancelledCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="hidden sm:block flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrintPurchases(false)}
                disabled={loading || purchases.length === 0}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden lg:inline">Imprimir</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePrintPurchases(false)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Impresora Normal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrintPurchases(true)}>
                <Printer className="h-4 w-4 mr-2" />
                Térmica 80mm
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={loading || purchases.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span className="hidden lg:inline">Excel</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => xmlInputRef.current?.click()}
            disabled={xmlUploading}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden lg:inline">Importar XML</span>
          </Button>
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml"
            className="hidden"
            onChange={handleXmlUpload}
          />
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4" />
            Nueva Compra
          </Button>
        </div>
      </div>

      {/* ── Search + Filter Bar ────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por notas o proveedor..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {(
                [
                  { key: 'ALL', label: 'Todas' },
                  { key: 'COMPLETED', label: 'Completadas' },
                  { key: 'CANCELLED', label: 'Canceladas' },
                ] as const
              ).map((filter) => (
                <Button
                  key={filter.key}
                  variant={statusFilter === filter.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(filter.key)}
                  className="text-xs"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Purchases Table ────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No se encontraron compras</p>
              <p className="text-sm text-muted-foreground/70">
                {search || statusFilter !== 'ALL'
                  ? 'Intenta con otra búsqueda o filtro'
                  : 'Registra tu primera compra de inventario'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-center">Productos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((purchase) => (
                      <TableRow
                        key={purchase.id}
                        className={purchase.status === 'CANCELLED' ? 'opacity-60' : ''}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {purchase.invoiceNumber ? (
                            <span className="inline-flex items-center gap-1 text-sm font-mono">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {purchase.invoiceNumber}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {purchase.provider?.name || (
                            <span className="text-muted-foreground">Sin proveedor</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            {purchase.itemCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(purchase.total, currencyCode)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={purchase.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Ver detalle"
                              onClick={() => openDetail(purchase)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Imprimir compra"
                              onClick={() => handlePrintPurchaseDetail(purchase)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {purchase.status === 'COMPLETED' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title="Cancelar compra"
                                onClick={() => setCancelPurchase(purchase)}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {purchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className={`p-4 space-y-3 ${purchase.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">
                          {purchase.provider?.name || 'Sin proveedor'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {format(new Date(purchase.date), 'd MMM yyyy', { locale: es })}
                          {purchase.invoiceNumber && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <FileText className="h-3 w-3" />
                              <span className="font-mono">{purchase.invoiceNumber}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={purchase.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {purchase.itemCount} producto{purchase.itemCount !== 1 ? 's' : ''}
                      </span>
                      <span className="font-semibold text-sm">
                        {formatCurrency(purchase.total, currencyCode)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => openDetail(purchase)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver detalle
                      </Button>
                      {purchase.status === 'COMPLETED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                          onClick={() => setCancelPurchase(purchase)}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Purchase count ─────────────────────────────────────────── */}
      {!loading && purchases.length > 0 && (
        <p className="text-sm text-muted-foreground text-right">
          {purchases.length} compra{purchases.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CREATE PURCHASE DIALOG                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Compra</DialogTitle>
            <DialogDescription>
              Registra una compra de inventario. Los productos se agregarán al stock automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Provider + Invoice Number row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="purchase-provider">Proveedor</Label>
                <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar proveedor (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-invoice" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  N° Factura
                </Label>
                <Input
                  id="purchase-invoice"
                  placeholder="Ej: FAC-2025-001"
                  value={purchaseInvoiceNumber}
                  onChange={(e) => setPurchaseInvoiceNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Número de factura del proveedor</p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="purchase-notes">Notas</Label>
              <Textarea
                id="purchase-notes"
                placeholder="Notas adicionales sobre la compra..."
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* Items header */}
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Productos</Label>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar producto
              </Button>
            </div>

            {/* Items list */}
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {purchaseItems.map((item, index) => (
                <Card key={item.id} className="p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px_140px_auto] items-end">
                    {/* Product select */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Producto {index + 1} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={item.productId}
                        onValueChange={(val) => updateItem(item.id, 'productId', val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products
                            .filter(
                              (p) =>
                                !purchaseItems.some(
                                  (pi) => pi.id !== item.id && pi.productId === String(p.id),
                                ),
                            )
                            .map((product) => (
                              <SelectItem key={product.id} value={String(product.id)}>
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{product.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    (Stock: {product.currentStock})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quantity */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Cantidad *</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        className="text-center"
                      />
                    </div>

                    {/* Unit cost */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Costo Unit. ($) *</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                          $
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={item.unitCost}
                          onChange={(e) => updateItem(item.id, 'unitCost', e.target.value)}
                          className="pl-6"
                        />
                      </div>
                    </div>

                    {/* Line total + Remove */}
                    <div className="flex items-center gap-2 pb-0.5">
                      <span className="text-sm font-medium whitespace-nowrap min-w-[80px] text-right">
                        {getLineTotal(item) > 0
                          ? formatCurrency(getLineTotal(item), currencyCode)
                          : '—'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeItem(item.id)}
                        disabled={purchaseItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Separator />

            {/* Grand total */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="font-semibold">Total de la Compra</span>
              <span className="text-xl font-bold">
                {formatCurrency(getGrandTotal(), currencyCode)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSavePurchase} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar Compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DETAIL DIALOG                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailPurchase} onOpenChange={(open) => !open && setDetailPurchase(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Compra #{detailPurchase?.id}</DialogTitle>
            <DialogDescription>
              {detailPurchase
                ? format(new Date(detailPurchase.date), "EEEE d 'de' MMMM, yyyy", {
                    locale: es,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>

          {detailPurchase && (
            <div className="space-y-4">
              {/* Info row */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Proveedor</p>
                  <p className="font-medium">
                    {detailPurchase.provider?.name || 'Sin proveedor'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  <StatusBadge status={detailPurchase.status} />
                </div>
              </div>

              {/* Invoice + Notes row */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    N° Factura
                  </p>
                  <p className="font-medium font-mono">
                    {detailPurchase.invoiceNumber || 'Sin factura'}
                  </p>
                </div>
                {detailPurchase.notes ? (
                  <div>
                    <p className="text-muted-foreground">Notas</p>
                    <p className="text-sm">{detailPurchase.notes}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground">Notas</p>
                    <p className="text-sm text-muted-foreground/50">Sin notas</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Items table */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailPurchase.purchaseItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-medium">{item.product.name}</TableCell>
                        <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(item.unitCost, currencyCode)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(item.total, currencyCode)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold">
                  {formatCurrency(detailPurchase.total, currencyCode)}
                </span>
              </div>

              {/* Return Purchase Button */}
              {detailPurchase.status === 'COMPLETED' && detailPurchase.purchaseItems.some(i => i.quantity > (i.returnedQuantity ?? 0)) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={openReturnDialog}
                  className="w-full"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Devolver Compra
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CANCEL CONFIRMATION                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AlertDialog
        open={!!cancelPurchase}
        onOpenChange={(open) => !open && setCancelPurchase(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar compra #{cancelPurchase?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará la compra por{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(
                  (cancelPurchase?.total || 0),
                  currencyCode,
                )}
              </span>{' '}
              {cancelPurchase?.provider?.name
                ? `del proveedor "${cancelPurchase.provider.name}"`
                : ''}
              {cancelPurchase?.invoiceNumber
                ? ` (Factura: ${cancelPurchase.invoiceNumber})`
                : ''}
              . El stock de los productos se reducirá automáticamente. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelando...' : 'Sí, cancelar compra'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* RETURN PURCHASE DIALOG (PARTIAL SELECTION)                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={showReturnDialog} onOpenChange={(open) => { if (!open) { setShowReturnDialog(false); setReturnItems(new Map()) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Devolver Compra {detailPurchase?.invoiceNumber ? `#${detailPurchase.invoiceNumber}` : `#${detailPurchase?.id}`}
            </DialogTitle>
            <DialogDescription>
              Selecciona los productos y cantidades que deseas devolver al proveedor. El stock se reducirá.
            </DialogDescription>
          </DialogHeader>

          {detailPurchase && (
            <div className="space-y-4">
              {/* Select All / Deselect All */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {returnItems.size} de {detailPurchase.purchaseItems.filter(i => i.quantity > (i.returnedQuantity ?? 0)).length} producto(s) seleccionado(s)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllReturnItems}>
                    Seleccionar todos
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={deselectAllReturnItems}>
                    Quitar todos
                  </Button>
                </div>
              </div>

              {/* Items list */}
              <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                {detailPurchase.purchaseItems.filter(i => i.quantity > (i.returnedQuantity ?? 0)).length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay productos devolvibles en esta compra.
                  </div>
                ) : (
                  detailPurchase.purchaseItems.map((item) => {
                    const returned = item.returnedQuantity ?? 0
                    const available = item.quantity - returned
                    if (available <= 0) return null
                    const isSelected = returnItems.has(item.id)
                    const returnQty = returnItems.get(item.id) || 0

                    return (
                      <div key={item.id} className={`flex items-center gap-3 p-3 ${isSelected ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReturnItem(item.id, available)}
                          className="h-4 w-4 rounded border-gray-300 text-destructive focus:ring-destructive"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Comprado: {item.quantity}{returned > 0 ? ` · Devuelto: ${returned}` : ''} · Disponible: {available}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setReturnItemQty(item.id, returnQty - 1, available)}
                              disabled={returnQty <= 1}
                              className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50"
                            >
                              −
                            </button>
                            <Input
                              type="number"
                              min={1}
                              max={available}
                              value={returnQty}
                              onChange={(e) => setReturnItemQty(item.id, Number(e.target.value) || 1, available)}
                              className="h-7 w-14 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => setReturnItemQty(item.id, returnQty + 1, available)}
                              disabled={returnQty >= available}
                              className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="purchase-return-reason" className="text-xs font-medium">Motivo de la devolución (opcional)</Label>
                <Textarea
                  id="purchase-return-reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Ej: Producto defectuoso, error en la compra..."
                  rows={2}
                  className="text-xs min-h-[60px]"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowReturnDialog(false); setReturnItems(new Map()) }}
                  disabled={returning}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReturnPurchase}
                  disabled={returning || returnItems.size === 0}
                >
                  {returning ? 'Procesando...' : `Devolver ${returnItems.size > 0 ? `(${returnItems.size} producto${returnItems.size > 1 ? 's' : ''})` : ''}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* XML IMPORT PREVIEW DIALOG                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!xmlPreview} onOpenChange={(open) => !open && setXmlPreview(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Factura XML
            </DialogTitle>
            <DialogDescription>
              Archivo: <span className="font-mono font-medium text-foreground">{xmlPreview?.fileName}</span>
              {' · '}
              {xmlPreview?.items.length} producto{xmlPreview && xmlPreview.items.length !== 1 ? 's' : ''} encontrado{xmlPreview && xmlPreview.items.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>

          {xmlPreview && (
            <div className="space-y-4">
              {/* Provider + Notes */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <Select value={xmlProviderId} onValueChange={setXmlProviderId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar proveedor (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin proveedor</SelectItem>
                      {xmlProviders.map((provider) => (
                        <SelectItem key={provider.id} value={String(provider.id)}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea
                    value={xmlNotes}
                    onChange={(e) => setXmlNotes(e.target.value)}
                    rows={2}
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>

              <Separator />

              {/* Items preview table */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Productos extraídos</Label>
                <div className="max-h-[300px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {xmlPreview.items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell className="font-medium text-sm">{item.name}</TableCell>
                          <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(item.unitCost, currencyCode)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {formatCurrency(item.unitCost * item.quantity, currencyCode)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Total */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="font-semibold">Total de la Factura</span>
                <span className="text-xl font-bold">
                  {formatCurrency(
                    xmlPreview.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
                    currencyCode,
                  )}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                Los productos se vincularán automáticamente por nombre o se crearán nuevos si no existen.
                El stock se actualizará al confirmar la importación.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setXmlPreview(null)}
              disabled={xmlUploading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmXmlImport}
              disabled={xmlUploading}
            >
              {xmlUploading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Confirmar Importación
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
      >
        Completada
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800"
    >
      Cancelada
    </Badge>
  )
}
