'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X, AlertTriangle, Loader2, PackagePlus, UserPlus, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  usePurchaseProviders, usePurchaseProducts, useCreatePurchase, useUpdatePurchase,
  type Purchase, type ProviderOption, type ProductPresentationOption,
} from '@/hooks/api/use-purchases'
import { buildProductSearchOptions } from '@/lib/product-search'
import { useCategories } from '@/hooks/api/use-categories'
import { useTaxes } from '@/hooks/api/use-taxes'
import { useCreateProduct } from '@/hooks/api/use-products'
import { useProviders } from '@/hooks/api/use-providers'
import type { Product } from '@/types'
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { ProviderFormDialog } from '@/components/providers/provider-form-dialog'
import {
  DOC_TYPES, PAYMENT_TERMS, IVA_RATES, EMPTY_ITEM,
  calcLineSubtotal, calcLineIva, calcLineTotal, todayStr,
  type PurchaseItemRow,
} from './purchase-types'

// ── Props ──

interface PurchaseFormDialogProps {
  open: boolean
  onClose: () => void
  editingPurchase: Purchase | null
  currencyCode: string
  onSaved: () => void
}

// ── Component ──

export function PurchaseFormDialog({ open, onClose, editingPurchase, currencyCode, onSaved }: PurchaseFormDialogProps) {
  const { store } = useAuthStore()
  const storeId = store?.id

  // Data hooks
  const { data: providers = [] } = usePurchaseProviders(storeId, true)
  const { data: products = [] } = usePurchaseProducts(storeId)
  const { data: categories = [] } = useCategories(storeId)
  const { data: taxRates = [] } = useTaxes(storeId)
  // Full Provider shape (contactName/phone/email/etc.) for the inline
  // "create product" dialog's own provider dropdown — usePurchaseProviders
  // above returns the lighter ProviderOption used for this form's own search.
  const { data: fullProviders = [] } = useProviders(storeId, { active: true })
  const createMutation = useCreatePurchase()
  const updateMutation = useUpdatePurchase()
  const createProductMutation = useCreateProduct()

  const isEdit = !!editingPurchase

  // ── Form state ──
  const [providerSearch, setProviderSearch] = useState('')
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null)
  const [purchaseDocType, setPurchaseDocType] = useState('FACTURA_COMPRA')
  const [purchaseDate, setPurchaseDate] = useState(todayStr())
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('')
  const [purchasePaymentTerms, setPurchasePaymentTerms] = useState('CONTADO')
  const [purchaseConsumptionTax, setPurchaseConsumptionTax] = useState('0')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([EMPTY_ITEM()])
  const [itemSearches, setItemSearches] = useState<Record<string, string>>({})
  const [itemDropdowns, setItemDropdowns] = useState<Record<string, boolean>>({})

  // ── Inline creation state ──
  const [showProviderCreate, setShowProviderCreate] = useState(false)
  const [showProductCreate, setShowProductCreate] = useState(false)
  const [pendingCreateItemId, setPendingCreateItemId] = useState<string | null>(null)
  const [pendingCreateName, setPendingCreateName] = useState('')

  // Refs
  const providerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Computed ──

  const filteredProviders = useMemo(() => {
    if (!providerSearch.trim()) return providers
    const q = providerSearch.toLowerCase()
    return providers.filter(p => p.name.toLowerCase().includes(q) || (p.nit || '').includes(q))
  }, [providers, providerSearch])

  const formSubtotal = useMemo(() => purchaseItems.reduce((s, i) => s + calcLineSubtotal(i), 0), [purchaseItems])
  const formTotalIva = useMemo(() => purchaseItems.reduce((s, i) => s + calcLineIva(i), 0), [purchaseItems])
  const formTotalDiscount = useMemo(() => purchaseItems.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0), [purchaseItems])

  const formRetenciones = useMemo(() => {
    const regime = selectedProvider?.regime || 'NO_RESPONSABLE'
    let reteFuente = 0
    let reteIca = 0
    if (regime === 'RESPONSABLE' && formSubtotal > 2800000) reteFuente = Math.round(formSubtotal * 0.025)
    reteIca = Math.round(formSubtotal * 0.00966)
    return { reteFuente, reteIca }
  }, [formSubtotal, selectedProvider])

  const formGrandTotal = useMemo(() =>
    Math.max(0, formSubtotal + formTotalIva + (Number(purchaseConsumptionTax) || 0) - formTotalDiscount - formRetenciones.reteFuente - formRetenciones.reteIca),
    [formSubtotal, formTotalIva, purchaseConsumptionTax, formTotalDiscount, formRetenciones],
  )

  // ── Click outside ──

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) setProviderDropdownOpen(false)
      for (const [key, ref] of Object.entries(itemRefs.current)) {
        if (ref && !ref.contains(e.target as Node)) setItemDropdowns(prev => ({ ...prev, [key]: false }))
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Item management ──

  function addItem() { setPurchaseItems(prev => [...prev, EMPTY_ITEM()]) }

  function removeItem(itemId: string) {
    if (purchaseItems.length <= 1) { toast.error('Debe haber al menos un producto'); return }
    setPurchaseItems(prev => prev.filter(item => item.id !== itemId))
  }

  function updateItem(itemId: string, field: keyof PurchaseItemRow, value: string | number) {
    setPurchaseItems(prev => prev.map(item => item.id === itemId ? { ...item, [field]: value } : item))
  }

  /** Select a product line — either its base "Unidad" (presentation=null) or one of its extra presentations. */
  function selectProductLine(itemId: string, product: { id: number; costPrice: number }, presentation: ProductPresentationOption | null) {
    setPurchaseItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const suggestedCost = presentation
        ? (presentation.costPrice > 0 ? presentation.costPrice : Math.round(product.costPrice * presentation.unitsPerPack))
        : product.costPrice
      return {
        ...item,
        productId: String(product.id),
        presentationId: presentation ? String(presentation.id) : '',
        presentationName: presentation ? presentation.name : '',
        unitsPerPack: presentation ? presentation.unitsPerPack : 1,
        unitCost: String(suggestedCost || item.unitCost),
      }
    }))
    setItemSearches(prev => ({ ...prev, [itemId]: '' }))
    setItemDropdowns(prev => ({ ...prev, [itemId]: false }))
  }

  function openCreateProductForItem(itemId: string) {
    setPendingCreateItemId(itemId)
    setPendingCreateName(itemSearches[itemId] || '')
    setShowProductCreate(true)
    setItemDropdowns(prev => ({ ...prev, [itemId]: false }))
  }

  async function handleCreateProductInline(body: Record<string, unknown>) {
    const created = await createProductMutation.mutateAsync({ body })
    const product = created as unknown as Product
    if (pendingCreateItemId) {
      selectProductLine(pendingCreateItemId, product, null)
    }
    toast.success(`Producto "${product.name}" creado`)
    setPendingCreateItemId(null)
    setPendingCreateName('')
  }

  // ── Provider selection ──

  function selectProvider(providerId: string) {
    const prov = providers.find(p => p.id === Number(providerId))
    setSelectedProviderId(providerId)
    setSelectedProvider(prov || null)
    setProviderSearch('')
    setProviderDropdownOpen(false)
    if (prov) {
      setPurchasePaymentTerms(prov.paymentTerms || 'CONTADO')
      const defaultIva = prov.regime === 'RESPONSABLE' ? 19 : prov.regime === 'SIMPLIFICADO' ? 0 : 19
      setPurchaseItems(prev => prev.map(item => ({ ...item, ivaRate: item.unitCost ? defaultIva : item.ivaRate })))
    }
  }

  async function handleCreateProviderInline(body: Record<string, unknown>) {
    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, storeId }),
    })
    const created = await res.json()
    if (!res.ok) throw new Error(created.error || 'Error al crear proveedor')
    // The providers list (['providers', storeId, ...]) is refreshed via the
    // useCreateProvider mutation elsewhere, but we created this one directly
    // (to avoid pulling in a second mutation hook) — select it optimistically.
    setSelectedProviderId(String(created.id))
    setSelectedProvider({
      id: created.id, name: created.name, nit: created.nit ?? null, dv: created.dv ?? null,
      regime: created.regime || 'NO_RESPONSABLE', autoretainer: created.autoretainer || false,
      paymentTerms: created.paymentTerms || 'CONTADO', isActive: true, totalDebt: 0,
    })
    toast.success(`Proveedor "${created.name}" creado`)
  }

  // ── Populate for edit (use open as trigger key) ──
  const [wasOpen, setWasOpen] = useState(false)
  if (open && !wasOpen) {
    // Dialog just opened — reset form
    setWasOpen(true)
    if (editingPurchase) {
      setSelectedProviderId(editingPurchase.providerId ? String(editingPurchase.providerId) : '')
      setSelectedProvider(editingPurchase.provider ? {
        id: editingPurchase.provider.id, name: editingPurchase.provider.name, nit: editingPurchase.provider.nit,
        dv: undefined, regime: editingPurchase.provider.regime || 'NO_RESPONSABLE',
        autoretainer: editingPurchase.provider.autoretainer || false,
        paymentTerms: editingPurchase.provider.paymentTerms || 'CONTADO', isActive: true,
      } : null)
      setPurchaseDocType(editingPurchase.documentType || 'FACTURA_COMPRA')
      setPurchaseDate(format(parseISO(editingPurchase.date), 'yyyy-MM-dd'))
      setPurchaseInvoiceNumber(editingPurchase.invoiceNumber || '')
      setPurchasePaymentTerms(editingPurchase.paymentTerms || 'CONTADO')
      setPurchaseConsumptionTax(String(editingPurchase.totalConsumptionTax || 0))
      setPurchaseNotes(editingPurchase.notes || '')
      const items = editingPurchase.purchaseItems.map(item => ({
        id: crypto.randomUUID(),
        productId: String(item.productId), quantity: String(item.quantity), unitCost: String(item.unitCost),
        presentationId: item.presentationId ? String(item.presentationId) : '',
        presentationName: item.presentationName || '',
        unitsPerPack: item.unitsPerPack || 1,
        ivaRate: item.ivaRate || 19, discountAmount: String(item.discountAmount || 0),
        lotNumber: item.lotNumber || '',
        expiryDate: item.expiryDate ? format(parseISO(item.expiryDate), 'yyyy-MM-dd') : '',
        manufacturingDate: item.manufacturingDate ? format(parseISO(item.manufacturingDate), 'yyyy-MM-dd') : '',
      }))
      setPurchaseItems(items.length > 0 ? items : [EMPTY_ITEM()])
    } else {
      setSelectedProviderId('')
      setSelectedProvider(null)
      setPurchaseDocType('FACTURA_COMPRA')
      setPurchaseDate(todayStr())
      setPurchaseInvoiceNumber('')
      setPurchasePaymentTerms('CONTADO')
      setPurchaseConsumptionTax('0')
      setPurchaseNotes('')
      setPurchaseItems([EMPTY_ITEM()])
    }
    setProviderSearch('')
    setItemSearches({})
    setItemDropdowns({})
  }
  if (!open && wasOpen) {
    setWasOpen(false)
  }

  // ── Save ──

  async function handleSave() {
    const validItems = purchaseItems.filter(item => item.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0)
    if (validItems.length === 0) { toast.error('Debe agregar al menos un producto con cantidad y costo'); return }
    // A product can appear more than once (its Unidad + a presentation), but
    // never the exact same product+presentation combination twice.
    const lineKeys = validItems.map(item => `${item.productId}:${item.presentationId || ''}`)
    if (new Set(lineKeys).size !== lineKeys.length) { toast.error('No puede agregar la misma presentación del mismo producto más de una vez'); return }

    const mapItems = (items: PurchaseItemRow[], forUpdate = false) => items.map(item => ({
      productId: Number(item.productId),
      ...(item.presentationId ? { presentationId: Number(item.presentationId) } : {}),
      quantity: Number(item.quantity),
      unitCost: Math.round(Number(item.unitCost)),
      ivaRate: item.ivaRate,
      discountAmount: Number(item.discountAmount) || 0,
      lotNumber: forUpdate ? item.lotNumber.trim() || null : item.lotNumber.trim() || undefined,
      expiryDate: forUpdate ? (item.expiryDate || null) : (item.expiryDate || undefined),
      manufacturingDate: forUpdate ? (item.manufacturingDate || null) : (item.manufacturingDate || undefined),
    }))

    if (isEdit && editingPurchase) {
      updateMutation.mutate({
        id: editingPurchase.id,
        body: {
          invoiceNumber: purchaseInvoiceNumber.trim() || null,
          documentType: purchaseDocType, date: purchaseDate,
          notes: purchaseNotes.trim() || null,
          providerId: selectedProviderId ? Number(selectedProviderId) : null,
          paymentTerms: purchasePaymentTerms,
          consumptionTax: Number(purchaseConsumptionTax) || 0,
          items: mapItems(validItems, true),
        },
      }, {
        onSuccess: () => { toast.success('Compra actualizada exitosamente'); onClose(); onSaved() },
        onError: (err) => toast.error(err.message),
      })
    } else {
      createMutation.mutate({
        body: {
          providerId: selectedProviderId ? Number(selectedProviderId) : undefined,
          invoiceNumber: purchaseInvoiceNumber.trim() || undefined,
          documentType: purchaseDocType, date: purchaseDate,
          paymentTerms: purchasePaymentTerms,
          consumptionTax: Number(purchaseConsumptionTax) || 0,
          notes: purchaseNotes.trim() || undefined,
          items: mapItems(validItems),
        },
      }, {
        onSuccess: () => { toast.success('Compra creada exitosamente'); onClose(); onSaved() },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] xl:max-w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Compra' : 'Nueva Compra'}</DialogTitle>
          <DialogDescription>{isEdit ? `Editando compra #${editingPurchase?.id}` : 'Registra una nueva compra de inventario'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isEdit && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Editando compra existente. Los cambios se reflejarán en el inventario.
            </div>
          )}

          {/* Row 1: Doc type + Date + Invoice */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Documento</Label>
              <Select value={purchaseDocType} onValueChange={setPurchaseDocType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(dt => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de Compra</Label>
              <Input type="date" className="h-9" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">N° Factura Proveedor</Label>
              <Input className="h-9" placeholder="Ej: 990001234" value={purchaseInvoiceNumber} onChange={e => setPurchaseInvoiceNumber(e.target.value)} />
            </div>
          </div>

          {/* Row 2: Provider + Payment terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Proveedor</Label>
              <div className="relative" ref={providerRef}>
                <Input
                  className="h-9"
                  placeholder="Buscar proveedor por nombre o NIT..."
                  value={providerDropdownOpen ? providerSearch : (selectedProvider?.name || '')}
                  onChange={e => { setProviderSearch(e.target.value); setProviderDropdownOpen(true) }}
                  onFocus={() => { setProviderDropdownOpen(true); setProviderSearch('') }}
                />
                {providerDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 max-h-52 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {filteredProviders.slice(0, 20).map(prov => (
                      <button key={prov.id} type="button" className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-accent text-sm" onClick={() => selectProvider(String(prov.id))}>
                        <span className="font-medium">{prov.name}</span>
                        {prov.nit && <span className="text-muted-foreground ml-2 text-xs">{prov.nit}{prov.dv ? `-${prov.dv}` : ''}</span>}
                        <span className="text-xs text-muted-foreground ml-2">({prov.regime === 'RESPONSABLE' ? 'Resp' : prov.regime === 'SIMPLIFICADO' ? 'Simpl' : 'NR'})</span>
                      </button>
                    ))}
                    {providerSearch.trim() && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-accent text-sm text-primary flex items-center gap-1.5 border-t mt-1 pt-1.5"
                        onClick={() => setShowProviderCreate(true)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Crear proveedor &quot;{providerSearch.trim()}&quot;
                      </button>
                    )}
                  </div>
                )}
                {selectedProviderId && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar selección de proveedor" onClick={() => { setSelectedProviderId(''); setSelectedProvider(null); setProviderSearch('') }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {selectedProvider && (
                <p className="text-[10px] text-muted-foreground">
                  Régimen: {selectedProvider.regime} · Autoretenedor: {selectedProvider.autoretainer ? 'Sí' : 'No'} · Deuda: {formatCurrency(selectedProvider.totalDebt, currencyCode)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de Pago</Label>
              <Select value={purchasePaymentTerms} onValueChange={setPurchasePaymentTerms}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TERMS.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}</SelectContent>
              </Select>
              {purchasePaymentTerms !== 'CONTADO' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Vencimiento automático: {purchasePaymentTerms === 'CREDITO_30' ? '30' : purchasePaymentTerms === 'CREDITO_60' ? '60' : '90'} días
                </p>
              )}
            </div>
          </div>

          {/* Notes + Consumption tax */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea className="text-sm min-h-[60px]" placeholder="Notas opcionales..." value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Impuesto al Consumo (IC)</Label>
              <Input type="number" min="0" className="h-9" placeholder="0" value={purchaseConsumptionTax} onChange={e => setPurchaseConsumptionTax(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">
                Ej: cerveza o bebidas azucaradas. Es un valor a nivel de factura completa (no por producto) y no es descontable — se suma al total a pagar, no afecta el costo registrado del producto.
              </p>
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Productos ({purchaseItems.length})</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
            </div>
            <div className="rounded border overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-sm min-w-[240px]">Producto</TableHead>
                  <TableHead className="text-sm w-24">Cant</TableHead>
                  <TableHead className="text-sm w-28">Costo Unit.</TableHead>
                  <TableHead className="text-sm w-24">IVA</TableHead>
                  <TableHead className="text-sm w-28">Descuento</TableHead>
                  <TableHead className="text-sm w-28">Lote</TableHead>
                  <TableHead className="text-sm w-36">Vencimiento</TableHead>
                  <TableHead className="text-sm w-36">Fabricación</TableHead>
                  <TableHead className="text-sm text-right w-28">Total</TableHead>
                  <TableHead className="w-8" />
                </TableRow></TableHeader>
                <TableBody>
                  {purchaseItems.map((item) => {
                    const prod = products.find(p => p.id === Number(item.productId))
                    const displayName = prod
                      ? (item.presentationName ? `${prod.name} — ${item.presentationName}` : prod.name)
                      : ''
                    const searchOptions = itemDropdowns[item.id]
                      ? buildProductSearchOptions(products, itemSearches[item.id] || '')
                      : []
                    const needsExpiry = !!prod?.trackExpiration && !item.lotNumber.trim() && !item.expiryDate
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="align-top">
                          <div className="relative" ref={el => { itemRefs.current[item.id] = el }}>
                            <Input
                              className="h-9 text-sm text-foreground bg-muted/50 border-muted-foreground/30"
                              placeholder="Buscar por nombre, SKU o código de barras..."
                              value={itemDropdowns[item.id] ? (itemSearches[item.id] || '') : displayName}
                              onChange={e => { setItemSearches(prev => ({ ...prev, [item.id]: e.target.value })); setItemDropdowns(prev => ({ ...prev, [item.id]: true })) }}
                              onFocus={() => { setItemSearches(prev => ({ ...prev, [item.id]: '' })); setItemDropdowns(prev => ({ ...prev, [item.id]: true })) }}
                            />
                            {item.unitsPerPack > 1 && (
                              <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">
                                {item.presentationName} — = {(Number(item.quantity) || 0) * item.unitsPerPack} uds. base
                              </p>
                            )}
                            {itemDropdowns[item.id] && (
                              <div className="absolute z-50 w-[320px] mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                                {searchOptions.slice(0, 15).map(opt => (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    className="w-full text-left px-2 py-1 rounded-sm hover:bg-accent text-xs"
                                    onClick={() => selectProductLine(item.id, opt.product, opt.presentation)}
                                  >
                                    <span className="font-medium">{opt.product.name}</span>
                                    {opt.presentation && (
                                      <span className="inline-flex items-center gap-0.5 ml-1 text-sky-600 dark:text-sky-400">
                                        <Layers className="h-2.5 w-2.5" />{opt.presentation.name} (×{opt.presentation.unitsPerPack})
                                      </span>
                                    )}
                                    {(opt.presentation ? opt.presentation.sku || opt.presentation.barcode : opt.product.sku || opt.product.barcode) && (
                                      <span className="text-muted-foreground ml-1 font-mono">
                                        ({opt.presentation ? (opt.presentation.sku || opt.presentation.barcode) : (opt.product.sku || opt.product.barcode)})
                                      </span>
                                    )}
                                    <span className="text-muted-foreground ml-1">
                                      · Costo: {formatCurrency(opt.presentation ? opt.presentation.costPrice : opt.product.costPrice, currencyCode)} · Stock: {opt.product.currentStock}
                                    </span>
                                  </button>
                                ))}
                                {searchOptions.length === 0 && (itemSearches[item.id] || '').trim() && (
                                  <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin coincidencias</p>
                                )}
                                <button
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-accent text-xs text-primary flex items-center gap-1.5 border-t mt-1 pt-1.5"
                                  onClick={() => openCreateProductForItem(item.id)}
                                >
                                  <PackagePlus className="h-3.5 w-3.5" />
                                  Crear producto nuevo{(itemSearches[item.id] || '').trim() ? ` "${itemSearches[item.id].trim()}"` : ''}
                                </button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input type="number" min="1" className="h-9 text-sm text-foreground bg-muted/50 border-muted-foreground/30" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input type="number" min="0" className="h-9 text-sm text-foreground bg-muted/50 border-muted-foreground/30" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', e.target.value)} placeholder="0" />
                          {item.unitsPerPack > 1 && Number(item.unitCost) > 0 && (
                            <p className="text-[10px] text-sky-600 dark:text-sky-400 mt-0.5">
                              ≈ {formatCurrency(Math.round(Number(item.unitCost) / item.unitsPerPack), currencyCode)}/unidad base
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Select value={String(item.ivaRate)} onValueChange={v => updateItem(item.id, 'ivaRate', Number(v))}>
                            <SelectTrigger className="h-9 text-sm bg-muted/50 border-muted-foreground/30"><SelectValue /></SelectTrigger>
                            <SelectContent>{IVA_RATES.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input type="number" min="0" className="h-9 text-sm text-foreground bg-muted/50 border-muted-foreground/30" value={item.discountAmount} onChange={e => updateItem(item.id, 'discountAmount', e.target.value)} />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input className={`h-9 text-sm text-foreground bg-muted/50 ${needsExpiry ? 'border-amber-400 dark:border-amber-600' : 'border-muted-foreground/30'}`} value={item.lotNumber} onChange={e => updateItem(item.id, 'lotNumber', e.target.value)} placeholder="Opcional" />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input type="date" className={`h-9 text-sm text-foreground bg-muted/50 ${needsExpiry ? 'border-amber-400 dark:border-amber-600' : 'border-muted-foreground/30'}`} value={item.expiryDate} onChange={e => updateItem(item.id, 'expiryDate', e.target.value)} />
                          {needsExpiry && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Maneja vencimiento</p>}
                        </TableCell>
                        <TableCell className="align-top">
                          <Input type="date" className="h-9 text-sm text-foreground bg-muted/50 border-muted-foreground/30" value={item.manufacturingDate} onChange={e => updateItem(item.id, 'manufacturingDate', e.target.value)} />
                        </TableCell>
                        <TableCell className="text-right text-sm align-top pt-4 font-semibold">
                          {formatCurrency(calcLineTotal(item), currencyCode)}
                        </TableCell>
                        <TableCell className="align-top">
                          {purchaseItems.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500" onClick={() => removeItem(item.id)} aria-label="Quitar producto"><X className="h-4 w-4" /></Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(formSubtotal, currencyCode)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">IVA Descontable</span><span className="text-blue-600 dark:text-blue-400">{formatCurrency(formTotalIva, currencyCode)}</span></div>
            {(Number(purchaseConsumptionTax) || 0) > 0 && (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Impuesto al Consumo (IC)</span><span className="text-purple-600 dark:text-purple-400">{formatCurrency(Number(purchaseConsumptionTax) || 0, currencyCode)}</span></div>
            )}
            {formTotalDiscount > 0 && (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Descuento Total</span><span className="text-red-500">-{formatCurrency(formTotalDiscount, currencyCode)}</span></div>
            )}
            {formRetenciones.reteFuente > 0 && (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Retención en la Fuente (2.5%)</span><span className="text-orange-600 dark:text-orange-400">-{formatCurrency(formRetenciones.reteFuente, currencyCode)}</span></div>
            )}
            {formRetenciones.reteIca > 0 && (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Retención ICA (9.66‰)</span><span className="text-orange-600 dark:text-orange-400">-{formatCurrency(formRetenciones.reteIca, currencyCode)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>TOTAL A PAGAR</span>
              <span className="text-primary">{formatCurrency(formGrandTotal, currencyCode)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? 'Guardar Cambios' : 'Crear Compra'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ── Inline provider creation ── */}
      <ProviderFormDialog
        open={showProviderCreate}
        onOpenChange={setShowProviderCreate}
        editingProvider={null}
        initialName={providerSearch}
        onSave={handleCreateProviderInline}
      />

      {/* ── Inline product creation ── */}
      <ProductFormDialog
        open={showProductCreate}
        onOpenChange={(o) => { setShowProductCreate(o); if (!o) { setPendingCreateItemId(null); setPendingCreateName('') } }}
        editingProduct={null}
        initialValues={{ name: pendingCreateName }}
        providers={fullProviders}
        taxRates={taxRates}
        categories={categories}
        onSave={handleCreateProductInline}
        onToggle={async () => {}}
      />
    </Dialog>
  )
}
