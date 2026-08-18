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
    if (!q || nameMatches || baseCodeMatches) {
      options.push({ key: `${p.id}-u`, product: p, presentation: null })
    }
    for (const pr of (p.presentations || []).filter((x) => x.isActive)) {
      const prCodeMatches = (pr.sku || '').toLowerCase().includes(q) || (pr.barcode || '').toLowerCase().includes(q)
      const prNameMatches = pr.name.toLowerCase().includes(q)
      if (!q || nameMatches || prNameMatches || prCodeMatches) {
        options.push({ key: `${p.id}-${pr.id}`, product: p, presentation: pr })
      }
    }
  }
  return options
}
