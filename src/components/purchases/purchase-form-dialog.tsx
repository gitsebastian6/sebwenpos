'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  usePurchaseProviders, usePurchaseProducts, useCreatePurchase, useUpdatePurchase,
  type Purchase, type ProviderOption, type ProductOption,
} from '@/hooks/api/use-purchases'
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
  const storeId = editingPurchase ? undefined : undefined // storeId comes from useAuthStore internally

  // Data hooks
  const { data: providers = [] } = usePurchaseProviders(undefined, true)
  const { data: products = [] } = usePurchaseProducts(undefined)
  const createMutation = useCreatePurchase()
  const updateMutation = useUpdatePurchase()

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
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([EMPTY_ITEM()])
  const [itemSearches, setItemSearches] = useState<Record<string, string>>({})
  const [itemDropdowns, setItemDropdowns] = useState<Record<string, boolean>>({})

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
    Math.max(0, formSubtotal + formTotalIva - formTotalDiscount - formRetenciones.reteFuente - formRetenciones.reteIca),
    [formSubtotal, formTotalIva, formTotalDiscount, formRetenciones],
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

  function selectProduct(itemId: string, productId: string) {
    const prod = products.find(p => p.id === Number(productId))
    setPurchaseItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return { ...item, productId: String(prod?.id || productId), unitCost: String(prod?.costPrice || item.unitCost) }
    }))
    setItemSearches(prev => ({ ...prev, [itemId]: '' }))
    setItemDropdowns(prev => ({ ...prev, [itemId]: false }))
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

  // ── Populate for edit (use open as trigger key) ──
  const lastOpenRef = useRef(false)
  if (open && !lastOpenRef.current) {
    // Dialog just opened — reset form
    lastOpenRef.current = true
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
      setPurchaseNotes(editingPurchase.notes || '')
      const items = editingPurchase.purchaseItems.map(item => ({
        id: crypto.randomUUID(),
        productId: String(item.productId), quantity: String(item.quantity), unitCost: String(item.unitCost),
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
      setPurchaseNotes('')
      setPurchaseItems([EMPTY_ITEM()])
    }
    setProviderSearch('')
    setItemSearches({})
    setItemDropdowns({})
  }
  if (!open) lastOpenRef.current = false

  // ── Save ──

  async function handleSave() {
    const validItems = purchaseItems.filter(item => item.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0)
    if (validItems.length === 0) { toast.error('Debe agregar al menos un producto con cantidad y costo'); return }
    const productIds = validItems.map(item => item.productId)
    if (new Set(productIds).size !== productIds.length) { toast.error('No puede agregar el mismo producto más de una vez'); return }

    const mapItems = (items: PurchaseItemRow[], forUpdate = false) => items.map(item => ({
      productId: Number(item.productId),
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                {providerDropdownOpen && filteredProviders.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {filteredProviders.slice(0, 20).map(prov => (
                      <button key={prov.id} className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-accent text-sm" onClick={() => selectProvider(String(prov.id))}>
                        <span className="font-medium">{prov.name}</span>
                        {prov.nit && <span className="text-muted-foreground ml-2 text-xs">{prov.nit}{prov.dv ? `-${prov.dv}` : ''}</span>}
                        <span className="text-xs text-muted-foreground ml-2">({prov.regime === 'RESPONSABLE' ? 'Resp' : prov.regime === 'SIMPLIFICADO' ? 'Simpl' : 'NR'})</span>
                      </button>
                    ))}
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

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea className="text-sm min-h-[60px]" placeholder="Notas opcionales..." value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} />
          </div>

          <Separator />

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Productos ({purchaseItems.length})</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {purchaseItems.map((item, idx) => {
                const prod = products.find(p => p.id === Number(item.productId))
                const filtered = products.filter(p =>
                  p.name.toLowerCase().includes((itemSearches[item.id] || '').toLowerCase()) ||
                  (p.sku || '').toLowerCase().includes((itemSearches[item.id] || '').toLowerCase())
                )
                return (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                      {purchaseItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removeItem(item.id)} aria-label="Quitar producto"><X className="h-3 w-3" /></Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-1">
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Producto</Label>
                        <div className="relative" ref={el => { itemRefs.current[item.id] = el }}>
                          <Input
                            className="h-8 text-sm"
                            placeholder="Buscar producto..."
                            value={itemDropdowns[item.id] ? (itemSearches[item.id] || '') : (prod?.name || '')}
                            onChange={e => { setItemSearches(prev => ({ ...prev, [item.id]: e.target.value })); setItemDropdowns(prev => ({ ...prev, [item.id]: true })) }}
                            onFocus={() => { setItemSearches(prev => ({ ...prev, [item.id]: '' })); setItemDropdowns(prev => ({ ...prev, [item.id]: true })) }}
                          />
                          {itemDropdowns[item.id] && filtered.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                              {filtered.slice(0, 15).map(p => (
                                <button key={p.id} className="w-full text-left px-2 py-1 rounded-sm hover:bg-accent text-xs" onClick={() => selectProduct(item.id, String(p.id))}>
                                  <span className="font-medium">{p.name}</span>
                                  {p.sku && <span className="text-muted-foreground ml-1">({p.sku})</span>}
                                  <span className="text-muted-foreground ml-1">· Costo: {formatCurrency(p.costPrice, currencyCode)} · Stock: {p.currentStock}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
                        <Input type="number" min="1" className="h-8 text-sm" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Costo Unit. (COP)</Label>
                        <Input type="number" min="0" className="h-8 text-sm" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', e.target.value)} placeholder="0" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">IVA</Label>
                        <Select value={String(item.ivaRate)} onValueChange={v => updateItem(item.id, 'ivaRate', Number(v))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{IVA_RATES.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Descuento (COP)</Label>
                        <Input type="number" min="0" className="h-7 text-xs" value={item.discountAmount} onChange={e => updateItem(item.id, 'discountAmount', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Lote</Label>
                        <Input className="h-7 text-xs" value={item.lotNumber} onChange={e => updateItem(item.id, 'lotNumber', e.target.value)} placeholder="Opcional" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Vencimiento</Label>
                        <Input type="date" className="h-7 text-xs" value={item.expiryDate} onChange={e => updateItem(item.id, 'expiryDate', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Fabricación</Label>
                        <Input type="date" className="h-7 text-xs" value={item.manufacturingDate} onChange={e => updateItem(item.id, 'manufacturingDate', e.target.value)} />
                      </div>
                    </div>
                    <div className="flex justify-end mt-2">
                      <span className="text-xs text-muted-foreground">
                        Sub: {formatCurrency(calcLineSubtotal(item), currencyCode)} + IVA: {formatCurrency(calcLineIva(item), currencyCode)} - Desc: {formatCurrency(Number(item.discountAmount) || 0, currencyCode)} = <span className="font-semibold text-foreground">{formatCurrency(calcLineTotal(item), currencyCode)}</span>
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(formSubtotal, currencyCode)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">IVA Descontable</span><span className="text-blue-600 dark:text-blue-400">{formatCurrency(formTotalIva, currencyCode)}</span></div>
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
    </Dialog>
  )
}
