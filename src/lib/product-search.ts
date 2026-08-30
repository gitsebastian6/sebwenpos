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

// ─── Barcode / SKU exact-match resolver ──────────────────────────────────────
// Shared by every product picker that wires a scanner (POS, Compras,
// Cotizaciones, Mesas, Inventario…). A scanned code is only auto-selected when
// it maps to exactly ONE product-or-presentation by an *exact* barcode/SKU
// match; anything else falls back to filling the search box.

// Minimal shape a product needs to be resolvable from a scanned code — only
// the fields the resolver actually reads, so concrete catalog types (POS,
// Compras, reports…) satisfy it structurally regardless of their `id` type.
export interface ScannablePresentation {
  sku?: string | null
  barcode?: string | null
  isActive?: boolean
}
export interface ScannableProduct {
  sku?: string | null
  barcode?: string | null
  presentations?: ScannablePresentation[] | null
}

export interface ScanMatch<
  P extends ScannableProduct,
  PR = P extends { presentations?: ReadonlyArray<infer U> | null | undefined } ? U : ScannablePresentation,
> {
  product: P
  /** null → the product's base "Unidad"; otherwise the matched presentation. */
  presentation: PR | null
}

/**
 * Resolve a raw scanned string against a catalog.
 * - `exact`   → the single product/presentation whose barcode or SKU equals the
 *               code (case-insensitive). null when there are 0 or 2+ matches.
 * - `ambiguous` → true when 2+ different products/presentations matched.
 */
export function resolveScannedCode<P extends ScannableProduct>(
  products: P[],
  rawCode: string
): { exact: ScanMatch<P> | null; ambiguous: boolean } {
  const code = rawCode.trim().toLowerCase()
  if (!code) return { exact: null, ambiguous: false }

  const hits: ScanMatch<P>[] = []
  for (const p of products) {
    if ((p.barcode || '').toLowerCase() === code || (p.sku || '').toLowerCase() === code) {
      hits.push({ product: p, presentation: null })
    }
    for (const pr of (p.presentations ?? []) as ScannablePresentation[]) {
      if (pr.isActive === false) continue
      if ((pr.barcode || '').toLowerCase() === code || (pr.sku || '').toLowerCase() === code) {
        hits.push({ product: p, presentation: pr as unknown as ScanMatch<P>['presentation'] })
      }
    }
  }

  if (hits.length === 1) return { exact: hits[0], ambiguous: false }
  return { exact: null, ambiguous: hits.length > 1 }
}
