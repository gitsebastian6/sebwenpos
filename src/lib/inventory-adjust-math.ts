// ─── Aritmética de ajustes de inventario (cliente, sin React) ──────────────
// Convierte entre la unidad de una presentación y las unidades base del pozo
// único de stock (Product.currentStock). El servidor
// (src/domain/inventory/adjust-stock.ts) aplica exactamente la misma fórmula
// dentro de la transacción — este módulo es solo para el preview y la
// validación en los diálogos de inventario.

import { QTY_PRECISION } from '@/lib/constants'

export type AdjustMode = 'delta' | 'absolute'

const FACTOR = Math.pow(10, QTY_PRECISION)
const round = (n: number) => Math.round(n * FACTOR) / FACTOR

interface PresentationLike {
  id: number
  unitsPerPack: number | string
}

/** unitsPerPack de la presentación elegida; 1 para la base ("Unidad"). */
export function presentationUnitsPerPack(
  presentations: PresentationLike[] | undefined,
  presentationId: number | null | undefined,
): number {
  if (!presentationId) return 1
  const p = presentations?.find((x) => x.id === presentationId)
  const upp = p ? Number(p.unitsPerPack) : 1
  return upp > 0 ? upp : 1
}

/** Cantidad en la unidad elegida → unidades base. */
export function toBaseUnits(qty: number, unitsPerPack: number): number {
  return round(qty * unitsPerPack)
}

/**
 * Stock actual expresado en la unidad elegida, SIN piso (para mostrar
 * "≈ 4,167 six-packs" y precargar el modo absoluto con el valor exacto).
 */
export function currentInPresentation(currentStock: number, unitsPerPack: number): number {
  if (unitsPerPack <= 0) return currentStock
  return round(currentStock / unitsPerPack)
}

export interface ResolveDeltaInput {
  mode: AdjustMode
  qty: number
  unitsPerPack: number
  currentStock: number
}

/**
 * Delta en unidades base que se aplicará al pozo de stock.
 * - 'delta'    → qty (± en la unidad elegida) × unitsPerPack
 * - 'absolute' → (qty × unitsPerPack) − currentStock
 * MISMA fórmula que el servidor; en 'absolute' el servidor recalcula con el
 * currentStock fresco de la transacción, así que este valor es solo preview.
 */
export function resolveBaseDelta({ mode, qty, unitsPerPack, currentStock }: ResolveDeltaInput): number {
  if (mode === 'absolute') return round(toBaseUnits(qty, unitsPerPack) - currentStock)
  return toBaseUnits(qty, unitsPerPack)
}

/** Valida la entrada del diálogo. Devuelve el primer error o `null`. */
export function validateAdjust(input: ResolveDeltaInput): string | null {
  const { mode, qty, currentStock } = input
  if (isNaN(qty)) return 'La cantidad debe ser un número'
  if (mode === 'absolute' && qty < 0) return 'La cantidad no puede ser negativa'
  if (mode === 'delta' && qty === 0) return 'Indica cuántas unidades agregar o quitar'
  const delta = resolveBaseDelta(input)
  if (delta === 0) return 'No hay cambio en el stock'
  if (round(currentStock + delta) < 0) return 'El stock resultante no puede ser menor a 0'
  return null
}

