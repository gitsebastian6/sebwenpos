'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import type { Product, Category, Provider, TaxRate } from '@/types'
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
import { ProductImage } from '@/components/ui/product-image'
import {
  Percent,
  Shield,
  X,
  Calculator,
  TrendingUp,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProductFormData {
  name: string
  sku: string
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
  isActive: boolean
}

export const emptyProductForm: ProductFormData = {
  name: '',
  sku: '',
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
  isActive: true,
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingProduct: Product | null
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
  providers,
  taxRates,
  categories,
  onSave,
}: ProductFormDialogProps) {
  const { store } = useAuthStore()
  const [productForm, setProductForm] = useState<ProductFormData>(emptyProductForm)
  const [productSaving, setProductSaving] = useState(false)

  // ─── Sync form when dialog opens or editingProduct changes ──────────────
  useEffect(() => {
    if (!open) return
    if (editingProduct) {
      setProductForm({
        name: editingProduct.name,
        sku: editingProduct.sku || '',
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
        isActive: editingProduct.isActive,
      })
    } else {
      setProductForm(emptyProductForm)
    }
  }, [open, editingProduct])

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

    setProductSaving(true)
    try {
      const body = {
        storeId: store?.id,
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || undefined,
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
        isActive: productForm.isActive,
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
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
          {/* Row: Name + SKU */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
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

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="prod-img">URL de Imagen</Label>
            <div className="flex gap-2">
              <Input
                id="prod-img"
                placeholder="https://ejemplo.com/imagen.jpg"
                value={productForm.imgUrl}
                onChange={(e) => setProductForm({ ...productForm, imgUrl: e.target.value })}
                className="flex-1"
              />
              {productForm.imgUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setProductForm({ ...productForm, imgUrl: '' })}
                  title="Quitar imagen"
                  aria-label="Quitar imagen"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
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

          {/* Row: Min Stock */}
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

          {/* Row: Stock Actual (edit only) */}
          {editingProduct && (
            <div className="space-y-2">
              <Label>Stock Actual</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium w-fit">
                <span className={editingProduct.currentStock <= editingProduct.minStock ? 'text-red-600 dark:text-red-400' : ''}>
                  {editingProduct.currentStock} unidades
                </span>
              </div>
            </div>
          )}
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
