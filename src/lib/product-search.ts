import type { ProductOption, ProductPresentationOption } from '@/hooks/api/use-purchases'

// Shared by any picker that needs to search a store's catalog by name, SKU,
// or barcode — of either a product's own "Unidad" or one of its extra
// presentations (Six-pack, Caja x24, etc). Used by Compras and Cotizaciones.

export interface ProductSearchOption {
  key: string
  product: ProductOption
  presentation: ProductPresentationOption | null
}

export function buildProductSearchOptions(products: ProductOption[], query: string): ProductSearchOption[] {
  const q = query.trim().toLowerCase()
  const options: ProductSearchOption[] = []
  for (const p of products) {
    const nameMatches = !q || p.name.toLowerCase().includes(q)
    const baseCodeMatches = (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)
    const productOptions: ProductSearchOption[] = []
    if (!q || nameMatches || baseCodeMatches) {
      productOptions.push({ key: `${p.id}-u`, product: p, presentation: null })
    }
    for (const pr of (p.presentations || []).filter((x) => x.isActive)) {
      const prCodeMatches = (pr.sku || '').toLowerCase().includes(q) || (pr.barcode || '').toLowerCase().includes(q)
      const prNameMatches = pr.name.toLowerCase().includes(q)
      if (!q || nameMatches || prNameMatches || prCodeMatches) {
        productOptions.push({ key: `${p.id}-${pr.id}`, product: p, presentation: pr })
      }
    }
    // De menor a mayor precio de venta (empate: menor tamaño primero) — mismo
    // criterio que el POS: la "Unidad" base (steps=1, salePrice del producto)
    // participa en el orden. No cambia qué opciones coinciden con la búsqueda.
    productOptions.sort((a, b) => {
      const priceA = Number(a.presentation?.salePrice ?? p.salePrice)
      const priceB = Number(b.presentation?.salePrice ?? p.salePrice)
      return priceA - priceB || sizeOfOption(a) - sizeOfOption(b)
    })
    options.push(...productOptions)
  }
  return options
}

/** Unidades base de una opción (la "Unidad" base = 1). */
function sizeOfOption(option: ProductSearchOption): number {
  return option.presentation ? Number(option.presentation.unitsPerPack) : 1
}
