// ============================================================
// Sebwen POS — Stock Math (server-only)
// ─────────────────────────────────────────────────────────
// Capa de aritmética decimal para campos de stock/cantidad.
//
// POR QUÉ EXISTE:
//   Prisma mapea los campos `Decimal` del schema a `Prisma.Decimal`
//   (decimal.js). decimal.js NO es seguro con operadores JS nativos:
//   `valueOf()` devuelve un STRING, así que `a + b` concatena en vez
//   de sumar. TODA aritmética sobre campos Decimal DEBE pasar por
//   estas funciones.
//
// USO:
//   import { add, toNum, gte } from '@/lib/stock-math'
//   const newStock = add(product.currentStock, baseUnits)
//   if (gte(product.currentStock, baseUnits)) { ... }
//
// NOTA: este módulo es server-only (importa Prisma). El frontend usa
//   `src/lib/format.ts` (roundQty/floorQty/formatQty) con `number` puro.
// ============================================================

import { Prisma } from '@prisma/client'
import { QTY_PRECISION } from './constants'

// ─── Tipos ────────────────────────────────────────────────────────────────

/** Cualquier valor aceptable para una cantidad: Decimal de Prisma, number o string. */
export type Qty = Prisma.Decimal | number | string | null | undefined

// ─── Conversión ───────────────────────────────────────────────────────────

/** Convierte cualquier valor a Prisma.Decimal (null/undefined → 0). */
export function toDec(v: Qty): Prisma.Decimal {
  if (v === null || v === undefined) return new Prisma.Decimal(0)
  if (v instanceof Prisma.Decimal) return v
  return new Prisma.Decimal(v)
}

/** Convierte cualquier valor a number (null/undefined → 0). */
export function toNum(v: Qty): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  return Number(v)
}

// ─── Aritmética (siempre devuelve Prisma.Decimal) ─────────────────────────

export function add(a: Qty, b: Qty): Prisma.Decimal {
  return toDec(a).plus(toDec(b))
}

export function sub(a: Qty, b: Qty): Prisma.Decimal {
  return toDec(a).minus(toDec(b))
}

export function mul(a: Qty, b: Qty): Prisma.Decimal {
  return toDec(a).times(toDec(b))
}

export function div(a: Qty, b: Qty): Prisma.Decimal {
  return toDec(a).div(toDec(b))
}

// ─── Redondeo ─────────────────────────────────────────────────────────────

/** Redondea a QTY_PRECISION decimales (redondeo estándar). */
export function roundQty(v: Qty): Prisma.Decimal {
  return toDec(v).toDecimalPlaces(QTY_PRECISION)
}

/** Piso a QTY_PRECISION decimales (hacia abajo — para maxStock/límites). */
export function floorQty(v: Qty): Prisma.Decimal {
  return toDec(v).toDecimalPlaces(QTY_PRECISION, Prisma.Decimal.ROUND_DOWN)
}

// ─── Comparaciones ────────────────────────────────────────────────────────

export function gte(a: Qty, b: Qty): boolean {
  return toDec(a).gte(toDec(b))
}

export function lte(a: Qty, b: Qty): boolean {
  return toDec(a).lte(toDec(b))
}

export function gt(a: Qty, b: Qty): boolean {
  return toDec(a).gt(toDec(b))
}

export function lt(a: Qty, b: Qty): boolean {
  return toDec(a).lt(toDec(b))
}

export function eq(a: Qty, b: Qty): boolean {
  return toDec(a).eq(toDec(b))
}

export function isZero(v: Qty): boolean {
  return toDec(v).isZero()
}

/**
 * Estrictamente positivo (> 0). NOTA: decimal.js `isPositive()` devuelve true
 * para el cero; aquí usamos `gt(0)` para que "stock positivo" signifique
 * realmente mayor que cero (el cero NO es stock positivo en el negocio).
 */
export function isPositive(v: Qty): boolean {
  return toDec(v).gt(0)
}

// ─── Serialización ────────────────────────────────────────────────────────
// Override global de toJSON para Prisma.Decimal → number.
// Se registra una sola vez (idempotente) desde src/lib/db.ts, de modo que
// TODAS las rutas API que importan `db` serializan Decimal como number en
// NextResponse.json() sin tocar cada ruta.

let decimalSerializationRegistered = false

export function registerDecimalSerialization(): void {
  if (decimalSerializationRegistered) return
  decimalSerializationRegistered = true
  ;(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function () {
    return Number(this)
  }
}
