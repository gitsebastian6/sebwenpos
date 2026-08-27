// ---------------------------------------------------------------------------
// SEBWEN POS — Product form: shapes, pricing math, validation, payload builder
// ---------------------------------------------------------------------------
// Pure logic lifted out of src/components/products/product-form-dialog.tsx so
// the pricing/validation/serialization can be unit-tested. No React.
// ---------------------------------------------------------------------------

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

export function emptyPresentationRow(): PresentationFormRow {
  return { key: crypto.randomUUID(), name: '', unitLabel: 'UND', barcode: '', sku: '', unitsPerPack: '', salePrice: '', costPrice: '', isActive: true }
}

// ─── Pricing ──────────────────────────────────────────────────────────────

/** Sale price suggested from cost + commission %. Null unless both are > 0. */
export function suggestedSalePrice(costPrice: string, commissionPct: string): number | null {
  const cost = Number(costPrice)
  const commission = Number(commissionPct || 0)
  if (!cost || cost <= 0 || commission <= 0) return null
  return Math.round(cost * (1 + commission / 100))
}

/** Gross margin as a percentage of the sale price. Null unless both are > 0. */
export function profitMarginPct(costPrice: string, salePrice: string): number | null {
  const cost = Number(costPrice)
  const sale = Number(salePrice)
  if (!cost || cost <= 0 || !sale || sale <= 0) return null
  return ((sale - cost) / sale) * 100
}

// ─── Validation ───────────────────────────────────────────────────────────

/**
 * Returns the first validation error message, or null when the form is valid.
 * (The dialog surfaces it via toast.)
 */
export function validateProductForm(form: ProductFormData, presentations: PresentationFormRow[]): string | null {
  if (!form.name.trim()) return 'El nombre es obligatorio'
  if (!form.salePrice || Number(form.salePrice) <= 0) return 'El precio de venta es obligatorio y debe ser mayor a 0'

  for (const p of presentations) {
    if (!p.name.trim()) return 'Cada presentación necesita un nombre (ej: Six-pack, Caja x24)'
    if (!p.unitsPerPack || Number(p.unitsPerPack) < 0.001) return `"${p.name}": debe equivaler a 0.001 o más unidades base`
    if (!p.salePrice || Number(p.salePrice) <= 0) return `"${p.name}": el precio de venta debe ser mayor a 0`
  }

  const barcodes = [form.barcode.trim(), ...presentations.map((p) => p.barcode.trim())].filter(Boolean)
  if (new Set(barcodes).size !== barcodes.length) {
    return 'Hay códigos de barras repetidos entre las presentaciones de este producto'
  }

  return null
}

// ─── Payload ──────────────────────────────────────────────────────────────

export interface ProductPayload {
  storeId: number | undefined
  name: string
  sku: string | undefined
  barcode: string | undefined
  unitLabel: string
  categoryId: number | undefined
  providerId: number | undefined
  taxRateId: number | undefined
  description: string | undefined
  imgUrl: string | null
  invima: string | null
  costPrice: number
  salePrice: number
  commission: number
  minStock: number
  trackInventory: boolean
  trackExpiration: boolean
  isActive: boolean
  presentations: Array<{
    name: string
    unitLabel: string
    barcode: string | undefined
    sku: string | undefined
    unitsPerPack: number
    salePrice: number
    costPrice: number
    isActive: boolean
  }>
}

/** Build the API payload from the form. Prices are rounded to whole COP;
 *  commission is clamped to 0–100. */
export function buildProductPayload(
  form: ProductFormData,
  presentations: PresentationFormRow[],
  storeId: number | undefined,
): ProductPayload {
  return {
    storeId,
    name: form.name.trim(),
    sku: form.sku.trim() || undefined,
    barcode: form.barcode.trim() || undefined,
    unitLabel: form.unitLabel,
    categoryId: form.categoryId !== 'none' ? Number(form.categoryId) : undefined,
    providerId: form.providerId !== 'none' ? Number(form.providerId) : undefined,
    taxRateId: form.taxRateId !== 'none' ? Number(form.taxRateId) : undefined,
    description: form.description.trim() || undefined,
    imgUrl: form.imgUrl.trim() || null,
    invima: form.invima.trim() || null,
    costPrice: form.costPrice ? Math.round(Number(form.costPrice)) : 0,
    salePrice: Math.round(Number(form.salePrice)),
    commission: Math.max(0, Math.min(100, Math.round(Number(form.commission || 0)))),
    minStock: form.minStock ? Number(form.minStock) : 5,
    trackInventory: form.trackInventory,
    trackExpiration: form.trackExpiration,
    isActive: form.isActive,
    presentations: presentations.map((p) => ({
      name: p.name.trim(),
      unitLabel: p.unitLabel,
      barcode: p.barcode.trim() || undefined,
      sku: p.sku.trim() || undefined,
      unitsPerPack: Number(p.unitsPerPack),
      salePrice: Math.round(Number(p.salePrice)),
      costPrice: p.costPrice ? Math.round(Number(p.costPrice)) : 0,
      isActive: p.isActive,
    })),
  }
}
