'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import type { Product, Category, Provider, TaxRate } from '@/types'
import { UnitOfMeasureSelect } from '@/components/products/unit-of-measure-select'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductImage } from '@/components/ui/product-image'
import {
  Percent,
  Shield,
  X,
  Calculator,
  TrendingUp,
  Upload,
  Loader2,
  Link2,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProductFormData {
  name: string
  sku: string
  barcode: string
  unitLabel: string
  categoryId: string
  providerId: string
  taxRateId: string
  description: string
  imgUrl: string
  invima: string
  costPrice: string
  salePrice: string
  commission: string
  minStock: string
  trackInventory: boolean
  trackExpiration: boolean
  isActive: boolean
}

export const emptyProductForm: ProductFormData = {
  name: '',
  sku: '',
  barcode: '',
  unitLabel: 'UND',
  categoryId: 'none',
  providerId: 'none',
  taxRateId: 'none',
  description: '',
  imgUrl: '',
  invima: '',
  costPrice: '',
  salePrice: '',
  commission: '0',
  minStock: '5',
  trackInventory: true,
  trackExpiration: false,
  isActive: true,
}

// A product's own name/barcode/sku/price fields ARE its "Unidad" presentation.
// This row shape covers only the up-to-2 EXTRA presentations (Six-pack, Caja, etc.).
export interface PresentationFormRow {
  key: string // local React key only, not sent to the API
  name: string
  unitLabel: string
  barcode: string
  sku: string
  unitsPerPack: string
  salePrice: string
  costPrice: string
  isActive: boolean
}

function emptyPresentationRow(): PresentationFormRow {
  return { key: crypto.randomUUID(), name: '', unitLabel: 'UND', barcode: '', sku: '', unitsPerPack: '', salePrice: '', costPrice: '', isActive: true }
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingProduct: Product | null
  /** Prefills a few fields when creating fresh (e.g. from an XML import line with no product match) — ignored when editingProduct is set. */
  initialValues?: { name?: string; barcode?: string; sku?: string }
  providers: Provider[]
  taxRates: TaxRate[]
  categories: Category[]
  onSave: (body: Record<string, unknown>, isEditing: boolean) => Promise<void>
  onToggle: (product: Product) => Promise<void>
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProductFormDialog({
  open,
  onOpenChange,
  editingProduct,
  initialValues,
  providers,
  taxRates,
  categories,
  onSave,
}: ProductFormDialogProps) {
  const { store } = useAuthStore()
  const [productForm, setProductForm] = useState<ProductFormData>(emptyProductForm)
  const [productSaving, setProductSaving] = useState(false)
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageDragOver, setImageDragOver] = useState(false)
  const [presentations, setPresentations] = useState<PresentationFormRow[]>([])

  // ─── Sync form when dialog opens or editingProduct changes ──────────────
  useEffect(() => {
    if (!open) return
    if (editingProduct) {
      setProductForm({
        name: editingProduct.name,
        sku: editingProduct.sku || '',
        barcode: editingProduct.barcode || '',
        unitLabel: editingProduct.unitLabel || 'UND',
        categoryId: editingProduct.categoryId ? String(editingProduct.categoryId) : 'none',
        providerId: editingProduct.providerId ? String(editingProduct.providerId) : 'none',
        taxRateId: editingProduct.taxRateId ? String(editingProduct.taxRateId) : 'none',
        description: editingProduct.description || '',
        imgUrl: editingProduct.imgUrl || '',
        invima: editingProduct.invima || '',
        costPrice: editingProduct.costPrice ? String(editingProduct.costPrice) : '',
        salePrice: String(editingProduct.salePrice),
        commission: String(editingProduct.commission ?? 0),
        minStock: String(editingProduct.minStock),
        trackInventory: editingProduct.trackInventory,
        trackExpiration: editingProduct.trackExpiration,
        isActive: editingProduct.isActive,
      })
      setPresentations(
        (editingProduct.presentations || []).map((p) => ({
          key: crypto.randomUUID(),
          name: p.name,
          unitLabel: p.unitLabel || 'UND',
          barcode: p.barcode || '',
          sku: p.sku || '',
          unitsPerPack: String(p.unitsPerPack),
          salePrice: String(p.salePrice),
          costPrice: p.costPrice ? String(p.costPrice) : '',
          isActive: p.isActive,
        })),
      )
    } else {
      setProductForm({
        ...emptyProductForm,
        name: initialValues?.name?.trim() || '',
        barcode: initialValues?.barcode?.trim() || '',
        sku: initialValues?.sku?.trim() || '',
      })
      setPresentations([])
    }
  }, [open, editingProduct, initialValues])

  // ─── Commission Auto-Calculation ─────────────────────────────────────────

  const suggestedPrice = useMemo(() => {
    const cost = Number(productForm.costPrice)
    const commission = Number(productForm.commission || 0)
    if (!cost || cost <= 0 || commission <= 0) return null
    return Math.round(cost * (1 + commission / 100))
  }, [productForm.costPrice, productForm.commission])

  const profitMargin = useMemo(() => {
    const cost = Number(productForm.costPrice)
    const sale = Number(productForm.salePrice)
    if (!cost || cost <= 0 || !sale || sale <= 0) return null
    return ((sale - cost) / sale) * 100
  }, [productForm.costPrice, productForm.salePrice])

  // ─── Image Upload Handler ────────────────────────────────────────────────

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen (PNG, JPG o WebP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede ser mayor a 5MB')
      return
    }
    setUploadingImage(true)
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store?.id, fileData, fileName: file.name, fileType: file.type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al subir la imagen')
      setProductForm((prev) => ({ ...prev, imgUrl: data.url }))
      toast.success('Imagen subida')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploadingImage(false)
    }
  }

  // ─── Presentation Row Management ─────────────────────────────────────────

  function addPresentation() {
    if (presentations.length >= 2) return
    setPresentations((prev) => [...prev, emptyPresentationRow()])
  }

  function removePresentation(key: string) {
    setPresentations((prev) => prev.filter((p) => p.key !== key))
  }

  function updatePresentation(key: string, field: keyof PresentationFormRow, value: string | boolean) {
    setPresentations((prev) => prev.map((p) => (p.key === key ? { ...p, [field]: value } : p)))
  }

  // ─── Submit Handler ──────────────────────────────────────────────────────

  async function handleSaveProduct() {
    if (!productForm.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!productForm.salePrice || Number(productForm.salePrice) <= 0) {
      toast.error('El precio de venta es obligatorio y debe ser mayor a 0')
      return
    }
    for (const p of presentations) {
      if (!p.name.trim()) { toast.error('Cada presentación necesita un nombre (ej: Six-pack, Caja x24)'); return }
      if (!p.unitsPerPack || Number(p.unitsPerPack) < 1) { toast.error(`"${p.name}": debe equivaler a 1 o más unidades base`); return }
      if (!p.salePrice || Number(p.salePrice) <= 0) { toast.error(`"${p.name}": el precio de venta debe ser mayor a 0`); return }
    }
    const barcodes = [productForm.barcode.trim(), ...presentations.map((p) => p.barcode.trim())].filter(Boolean)
    if (new Set(barcodes).size !== barcodes.length) {
      toast.error('Hay códigos de barras repetidos entre las presentaciones de este producto')
      return
    }

    setProductSaving(true)
    try {
      const body = {
        storeId: store?.id,
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || undefined,
        barcode: productForm.barcode.trim() || undefined,
        unitLabel: productForm.unitLabel,
        categoryId: productForm.categoryId !== 'none' ? Number(productForm.categoryId) : undefined,
        providerId: productForm.providerId !== 'none' ? Number(productForm.providerId) : undefined,
        taxRateId: productForm.taxRateId !== 'none' ? Number(productForm.taxRateId) : undefined,
        description: productForm.description.trim() || undefined,
        imgUrl: productForm.imgUrl.trim() || null,
        invima: productForm.invima.trim() || null,
        costPrice: productForm.costPrice ? Math.round(Number(productForm.costPrice)) : 0,
        salePrice: Math.round(Number(productForm.salePrice)),
        commission: Math.max(0, Math.min(100, Math.round(Number(productForm.commission || 0)))),
        minStock: productForm.minStock ? Number(productForm.minStock) : 5,
        trackInventory: productForm.trackInventory,
        trackExpiration: productForm.trackExpiration,
        isActive: productForm.isActive,
        presentations: presentations.map((p) => ({
          name: p.name.trim(),
          unitLabel: p.unitLabel,
          barcode: p.barcode.trim() || undefined,
          sku: p.sku.trim() || undefined,
          unitsPerPack: Math.round(Number(p.unitsPerPack)),
          salePrice: Math.round(Number(p.salePrice)),
          costPrice: p.costPrice ? Math.round(Number(p.costPrice)) : 0,
          isActive: p.isActive,
        })),
      }

      const isEditing = !!editingProduct
      await onSave(body, isEditing)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar producto')
    } finally {
      setProductSaving(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) onOpenChange(false)
    }}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] xl:max-w-[95vw] max-h-[92vh] overflow-y-auto rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>
            {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
          </DialogTitle>
          <DialogDescription>
            {editingProduct
              ? 'Modifica los campos que desees actualizar.'
              : 'Completa los datos para registrar un nuevo producto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Row: Name + SKU + Barcode + Unit */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="prod-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prod-name"
                placeholder="Nombre del producto"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-sku">SKU</Label>
              <Input
                id="prod-sku"
                placeholder="Código SKU"
                value={productForm.sku}
                onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-barcode">Código de Barras</Label>
              <Input
                id="prod-barcode"
                placeholder="EAN, UPC, etc."
                value={productForm.barcode}
                onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                className="font-mono"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-unit">Unidad de Medida</Label>
              <UnitOfMeasureSelect id="prod-unit" value={productForm.unitLabel} onChange={(val) => setProductForm({ ...productForm, unitLabel: val })} />
            </div>
          </div>

          {/* Row: Category + Provider + Tax Rate */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="prod-category">Categoría</Label>
              <Select
                value={productForm.categoryId}
                onValueChange={(val) => setProductForm({ ...productForm, categoryId: val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-provider">Proveedor</Label>
              <Select
                value={productForm.providerId}
                onValueChange={(val) => setProductForm({ ...productForm, providerId: val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {providers.map((prov) => (
                    <SelectItem key={prov.id} value={String(prov.id)}>
                      {prov.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-tax">
                <span className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5" />
                  Impuesto (IVA)
                </span>
              </Label>
              <Select
                value={productForm.taxRateId}
                onValueChange={(val) => setProductForm({ ...productForm, taxRateId: val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin impuesto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin impuesto</SelectItem>
                  {taxRates.map((tax) => (
                    <SelectItem key={tax.id} value={String(tax.id)}>
                      <span className="flex items-center gap-2">
                        {tax.name}
                        <span className="text-muted-foreground text-xs">
                          ({tax.rateType === 'PERCENTAGE' ? `${tax.rate}%` : `$${tax.rate}`})
                        </span>
                        {tax.isDefault && (
                          <span className="text-xs text-amber-600">⭐</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {productForm.taxRateId !== 'none'
                  ? (() => {
                      const tax = taxRates.find(t => String(t.id) === productForm.taxRateId)
                      return tax
                        ? tax.rate === 0
                          ? 'Exento / Excluido de IVA'
                          : `IVA ${tax.rate}% incluido en el precio de venta`
                        : ''
                    })()
                  : 'Precio de venta sin impuesto'}
              </p>
            </div>
          </div>

          {/* Row: Active */}
          <div className="flex items-center gap-3">
            <Switch
              id="prod-active"
              checked={productForm.isActive}
              onCheckedChange={(checked) => setProductForm({ ...productForm, isActive: checked })}
            />
            <Label htmlFor="prod-active" className="text-sm">
              {productForm.isActive ? 'Activo' : 'Inactivo'}
            </Label>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="prod-desc">Descripción</Label>
            <Textarea
              id="prod-desc"
              placeholder="Descripción del producto (opcional)"
              value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* INVIMA */}
          <div className="space-y-2">
            <Label htmlFor="prod-invima">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Registro INVIMA
              </span>
            </Label>
            <Input
              id="prod-invima"
              placeholder="Ej: RSA-000123-2024 (opcional)"
              value={productForm.invima}
              onChange={(e) => setProductForm({ ...productForm, invima: e.target.value })}
              className="uppercase"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Registro sanitario del INVIMA (solo si aplica). Ej: RSA, NSO, RNE, etc.
            </p>
          </div>

          {/* Image: upload a file or paste a URL */}
          <div className="space-y-2">
            <Label>Imagen del Producto</Label>
            <Tabs value={imageTab} onValueChange={(v) => setImageTab(v as 'upload' | 'url')}>
              <TabsList className="h-8">
                <TabsTrigger value="upload" className="text-xs gap-1.5"><Upload className="h-3 w-3" />Subir archivo</TabsTrigger>
                <TabsTrigger value="url" className="text-xs gap-1.5"><Link2 className="h-3 w-3" />Pegar URL</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-2">
                <label
                  htmlFor="prod-img-file"
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                    imageDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setImageDragOver(true) }}
                  onDragLeave={() => setImageDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setImageDragOver(false)
                    const file = e.dataTransfer.files[0]
                    if (file) handleImageFile(file)
                  }}
                >
                  <input
                    id="prod-img-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageFile(file) }}
                  />
                  {uploadingImage ? (
                    <><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Subiendo...</span></>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Arrastra o haz clic para subir (PNG, JPG, WebP · máx. 5MB)</span>
                    </>
                  )}
                </label>
              </TabsContent>

              <TabsContent value="url" className="mt-2">
                <Input
                  id="prod-img"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={productForm.imgUrl}
                  onChange={(e) => setProductForm({ ...productForm, imgUrl: e.target.value })}
                />
              </TabsContent>
            </Tabs>
            {productForm.imgUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                onClick={() => setProductForm({ ...productForm, imgUrl: '' })}
              >
                <X className="h-3 w-3" />Quitar imagen
              </Button>
            )}
            {/* Preview */}
            {productForm.imgUrl ? (
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border">
                <ProductImage
                  src={productForm.imgUrl}
                  alt={productForm.name || 'Vista previa'}
                  categoryName={
                    productForm.categoryId !== 'none'
                      ? categories.find((c) => String(c.id) === productForm.categoryId)?.name
                      : undefined
                  }
                  categoryIcon={
                    productForm.categoryId !== 'none'
                      ? categories.find((c) => String(c.id) === productForm.categoryId)?.icon
                      : undefined
                  }
                  className="h-12 w-12 rounded object-cover"
                  fallbackClassName="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0"
                  iconClassName="h-6 w-6 text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground truncate">Vista previa de imagen</p>
              </div>
            ) : productForm.categoryId !== 'none' ? (
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border">
                <ProductImage
                  categoryName={categories.find((c) => String(c.id) === productForm.categoryId)?.name}
                  categoryIcon={categories.find((c) => String(c.id) === productForm.categoryId)?.icon}
                  alt={productForm.name || 'Producto'}
                  className="h-12 w-12 rounded object-cover"
                  fallbackClassName="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0"
                  iconClassName="h-6 w-6 text-muted-foreground"
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    Ícono por categoría:{' '}
                    <span className="font-medium text-foreground">
                      {categories.find((c) => String(c.id) === productForm.categoryId)?.name}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Si no asignas una imagen, se usará este ícono automáticamente.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Row: Prices */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-cost">Precio de Compra</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="prod-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={productForm.costPrice}
                  onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">Costo de adquisición en pesos</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-sale">
                Precio de Venta <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="prod-sale"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={productForm.salePrice}
                  onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value })}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">Precio al público en pesos</p>
            </div>
          </div>

          {/* Commission + Commission Calculator */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-commission">Comisión %</Label>
              <Input
                id="prod-commission"
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={productForm.commission}
                onChange={(e) => setProductForm({ ...productForm, commission: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Porcentaje de comisión del producto (ej: 10)
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" />
                Cálculo Automático
              </Label>
              {suggestedPrice !== null ? (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Precio sugerido:</span>
                    <span className="font-semibold">
                      {formatCurrency(suggestedPrice, store?.currencyCode)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => setProductForm({ ...productForm, salePrice: String(suggestedPrice) })}
                  >
                    Aplicar precio sugerido
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[68px] rounded-md border border-dashed text-xs text-muted-foreground">
                  Ingresa precio de compra y comisión para calcular
                </div>
              )}
            </div>
          </div>

          {/* Profit Margin Indicator */}
          {profitMargin !== null && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className={`h-4 w-4 ${
                    profitMargin > 40
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : profitMargin > 20
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`} />
                  <span className="text-muted-foreground">Margen de ganancia:</span>
                </div>
                <span className={`text-sm font-bold ${
                  profitMargin > 40
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : profitMargin > 20
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  {profitMargin.toFixed(1)}%
                </span>
              </div>
              <p className={`text-xs mt-1 ${
                profitMargin > 40
                  ? 'text-emerald-600/70 dark:text-emerald-400/70'
                  : profitMargin > 20
                    ? 'text-amber-600/70 dark:text-amber-400/70'
                    : 'text-red-600/70 dark:text-red-400/70'
              }`}>
                {profitMargin > 40
                  ? '✓ Margen saludable'
                  : profitMargin > 20
                    ? '⚠ Margen aceptable'
                    : '✗ Margen bajo — revisa tus precios'}
              </p>
            </div>
          )}

          {/* Row: Track Inventory toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="prod-track-inventory" className="text-sm font-medium">
                Maneja Inventario
              </Label>
              <p className="text-xs text-muted-foreground">
                {productForm.trackInventory
                  ? 'El stock se descuenta y se valida al vender'
                  : 'Sin control de stock — se puede vender sin límite (ej: por peso, preparado al momento)'}
              </p>
            </div>
            <Switch
              id="prod-track-inventory"
              checked={productForm.trackInventory}
              onCheckedChange={(checked) => setProductForm({ ...productForm, trackInventory: checked })}
            />
          </div>

          {/* Row: Track Expiration toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="prod-track-expiration" className="text-sm font-medium">
                Maneja Vencimiento
              </Label>
              <p className="text-xs text-muted-foreground">
                {productForm.trackExpiration
                  ? 'Perecedero — en Compras se pedirá lote y fecha de vencimiento, y aparecerá en Vencimientos'
                  : 'No perecedero — lote y fecha de vencimiento quedan opcionales en Compras'}
              </p>
            </div>
            <Switch
              id="prod-track-expiration"
              checked={productForm.trackExpiration}
              onCheckedChange={(checked) => setProductForm({ ...productForm, trackExpiration: checked })}
            />
          </div>

          {/* Row: Min Stock */}
          {productForm.trackInventory && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-minstock">Stock Mínimo</Label>
                <Input
                  id="prod-minstock"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={productForm.minStock}
                  onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Alerta cuando el stock esté por debajo de este valor
                </p>
              </div>
            </div>
          )}

          {/* Row: Stock Actual (edit only) */}
          {editingProduct && productForm.trackInventory && (
            <div className="space-y-2">
              <Label>Stock Actual</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium w-fit">
                <span className={editingProduct.currentStock <= editingProduct.minStock ? 'text-red-600 dark:text-red-400' : ''}>
                  {editingProduct.currentStock} unidades
                </span>
              </div>
            </div>
          )}

          {/* Presentaciones adicionales (Six-pack, Caja, Cajetilla, etc.) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Presentaciones adicionales
              </Label>
              {presentations.length < 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={addPresentation}
                >
                  <Plus className="h-3 w-3" />Agregar presentación
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Este producto ya tiene su presentación &quot;Unidad&quot; (nombre, código y precios de arriba). Agrega hasta 2 presentaciones extra —ej. Six-pack, Caja x24— con su propio código de barras y precio. Comparten el mismo stock, convertido según las unidades base que contienen.
            </p>

            {presentations.length === 0 ? (
              <div className="flex items-center justify-center h-14 rounded-md border border-dashed text-xs text-muted-foreground">
                Sin presentaciones adicionales
              </div>
            ) : (
              <div className="space-y-3">
                {presentations.map((p, idx) => {
                  const unitsPerPack = Number(p.unitsPerPack) || 0
                  const baseCost = Number(productForm.costPrice) || 0
                  const baseSale = Number(productForm.salePrice) || 0
                  const suggestedCostFromBase = unitsPerPack > 0 && baseCost > 0 ? Math.round(baseCost * unitsPerPack) : null
                  const suggestedSaleFromBase = unitsPerPack > 0 && baseSale > 0 ? Math.round(baseSale * unitsPerPack) : null
                  const impliedBaseCost = unitsPerPack > 0 && Number(p.costPrice) > 0 ? Math.round(Number(p.costPrice) / unitsPerPack) : null
                  const impliedBaseSale = unitsPerPack > 0 && Number(p.salePrice) > 0 ? Math.round(Number(p.salePrice) / unitsPerPack) : null
                  return (
                  <div key={p.key} className="rounded-md border p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Presentación {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={p.isActive}
                          onCheckedChange={(checked) => updatePresentation(p.key, 'isActive', checked)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removePresentation(p.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Nombre <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          placeholder="Ej: Six-pack, Caja x24"
                          value={p.name}
                          onChange={(e) => updatePresentation(p.key, 'name', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Unidad de Medida</Label>
                        <UnitOfMeasureSelect size="sm" value={p.unitLabel} onChange={(val) => updatePresentation(p.key, 'unitLabel', val)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Unidades base que contiene <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Ej: 6"
                          value={p.unitsPerPack}
                          onChange={(e) => updatePresentation(p.key, 'unitsPerPack', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Código de barras</Label>
                        <Input
                          placeholder="EAN, UPC, etc."
                          value={p.barcode}
                          onChange={(e) => updatePresentation(p.key, 'barcode', e.target.value)}
                          className="h-8 text-sm font-mono"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">SKU</Label>
                        <Input
                          placeholder="Código SKU"
                          value={p.sku}
                          onChange={(e) => updatePresentation(p.key, 'sku', e.target.value)}
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Precio de compra</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={p.costPrice}
                            onChange={(e) => updatePresentation(p.key, 'costPrice', e.target.value)}
                            className="h-8 text-sm pl-6"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Precio de venta <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={p.salePrice}
                            onChange={(e) => updatePresentation(p.key, 'salePrice', e.target.value)}
                            className="h-8 text-sm pl-6"
                          />
                        </div>
                      </div>
                    </div>
                    {(suggestedCostFromBase !== null || suggestedSaleFromBase !== null || impliedBaseCost !== null || impliedBaseSale !== null) && (
                      <div className="rounded border border-dashed bg-background/60 px-2.5 py-1.5 space-y-0.5">
                        {suggestedCostFromBase !== null && Number(p.costPrice) !== suggestedCostFromBase && (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-muted-foreground">
                              Compra sugerido: Unidad × {unitsPerPack} = <span className="font-medium text-foreground">{formatCurrency(suggestedCostFromBase, store?.currencyCode)}</span>
                            </span>
                            <button type="button" className="text-primary hover:underline shrink-0" onClick={() => updatePresentation(p.key, 'costPrice', String(suggestedCostFromBase))}>Usar</button>
                          </div>
                        )}
                        {suggestedSaleFromBase !== null && Number(p.salePrice) !== suggestedSaleFromBase && (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-muted-foreground">
                              Venta sugerido: Unidad × {unitsPerPack} = <span className="font-medium text-foreground">{formatCurrency(suggestedSaleFromBase, store?.currencyCode)}</span>
                            </span>
                            <button type="button" className="text-primary hover:underline shrink-0" onClick={() => updatePresentation(p.key, 'salePrice', String(suggestedSaleFromBase))}>Usar</button>
                          </div>
                        )}
                        {(impliedBaseCost !== null || impliedBaseSale !== null) && (
                          <p className="text-[11px] text-muted-foreground">
                            Con este precio, cada unidad base sale a{' '}
                            {impliedBaseCost !== null && <>compra {formatCurrency(impliedBaseCost, store?.currencyCode)}</>}
                            {impliedBaseCost !== null && impliedBaseSale !== null && ' · '}
                            {impliedBaseSale !== null && <>venta {formatCurrency(impliedBaseSale, store?.currencyCode)}</>}
                            {' '}— revisa que coincida con el precio de &quot;Unidad&quot; de arriba.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={productSaving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSaveProduct} disabled={productSaving}>
            {productSaving ? 'Guardando...' : editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
