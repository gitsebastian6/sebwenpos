import type { ProductPresentation } from '@/types'

// ─── Tipos ──────────────────────────────────────────────

/**
 * Una fila del selector de presentaciones en superficies de venta (POS, Mesas).
 * - `presentation === null` → la base "Unidad" del producto (su propio sku/
 *   barcode/salePrice): equivale a 1 unidad base.
 * - `presentation !== null` → una presentación adicional activa (Six-pack,
 *   Caja x24…), con su propio precio y unidades base que contiene.
 */
export interface PresentationOption {
  presentation: ProductPresentation | null
  /** Nombre legible para el preview hover (product.name o p.name). */
  name: string
  unitLabel: string
  salePrice: number
  /** Unidades base que representa la fila (la base "Unidad" = 1). */
  unitsPerPack: number
}

/**
 * Forma mínima de una presentación necesaria para ordenar las filas. `isActive`
 * es opcional porque las APIs públicas (storefront) ya excluyen las inactivas y
 * no envían el campo.
 */
export interface PresentationLike {
  id: number
  name: string
  unitLabel: string
  unitsPerPack: number
  salePrice: number
  isActive?: boolean
}

// ─── Helper ─────────────────────────────────────────────

/**
 * Construye las filas del selector de presentaciones ordenadas de MENOR a MAYOR
 * precio de venta (salePrice asc). En empates de precio gana la de menor tamaño
 * (unitsPerPack asc) y, si también empatan el tamaño, se conserva el orden
 * previo (sort estable). Como el precio de venta sube con el tamaño en los
 * casos reales, la primera fila suele ser la unidad más pequeña (0.25, 0.5,
 * Unidad…) — que es la que queda seleccionada por defecto en los selectores.
 *
 * La base "Unidad" se trata como unitsPerPack = 1 y usa el salePrice del propio
 * producto. El orden NO depende del sortOrder ni del orden de registro en el
 * formulario de producto: lo más pequeño/económico siempre se lista primero.
 */
export function sortPresentationOptions(product: {
  name: string
  unitLabel?: string
  salePrice: number
  presentations?: PresentationLike[]
}): PresentationOption[] {
  const base: PresentationOption = {
    presentation: null,
    name: product.name,
    unitLabel: product.unitLabel ?? '',
    // Prisma puede serializar Decimal como string en el JSON de la API.
    salePrice: Number(product.salePrice),
    unitsPerPack: 1,
  }

  const extras: PresentationOption[] = (product.presentations ?? [])
    .filter((p) => p.isActive !== false)
    .map((p) => ({
      // Los consumidores (POS, Mesas) siempre pasan ProductPresentation reales;
      // el cast es seguro y el accesor de la referencia se conserva intacto.
      presentation: p as ProductPresentation,
      name: p.name,
      unitLabel: p.unitLabel,
      salePrice: Number(p.salePrice),
      // Prisma puede serializar Decimal como string en el JSON de la API.
      unitsPerPack: Number(p.unitsPerPack) || 0,
    }))

  return [base, ...extras].sort(
    (a, b) => a.salePrice - b.salePrice || a.unitsPerPack - b.unitsPerPack
  )
}