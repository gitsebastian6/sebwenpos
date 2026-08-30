// ============================================================
// SEBWEN POS — Batch Consumer FEFO (First-Expired-First-Out)
// Ref: Fundamentos de control y gestión de inventarios (Vidal)
// ──────────────────────────────────────────────────────────
// Consume stock por lotes en ventas para productos con
// trackExpiration = true, priorizando el lote más próximo a
// vencer (expiryDate ASC). Debe llamarse DENTRO de la misma
// transacción que reserveStockAtomically, DESPUÉS de ella:
//
//   1. reserveStockAtomically descuenta Product.currentStock
//      (atómico, valida stock suficiente).
//   2. consumeBatchesFEFO reparte ese descuento entre los
//      lotes ACTIVE (trazabilidad por lote).
//
// FALLBACK LEGACY: si los lotes no cubren lo vendido (stock
// anterior a la funciónalidad de lotes), la diferencia se
// reporta como `uncovered` — el stock general ya fue descontado,
// así que la venta NO falla; el script verify-batches.ts detecta
// y cuantifica estas discrepancias.
// ============================================================

import { Prisma } from '@prisma/client'
import { toNum } from '@/lib/stock-math'

export interface BatchConsumption {
  batchId: number
  lotNumber: string
  quantity: number
}

export interface FefoResult {
  consumptions: BatchConsumption[]
  /**
   * Cantidad vendida que no pudo asignarse a ningún lote (stock legacy
   * previo a lotes). No bloquea la venta; se registra para auditoría.
   */
  uncovered: number
}

/** Redondeo a 3 decimales (QTY_PRECISION del proyecto). */
function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Ordena lotes en orden FEFO (first-expired-first-out): primero los que tienen
 * fecha de vencimiento (los que vencen antes primero), luego los sin fecha por
 * antigüedad (FIFO). Postgres/SQLite no ordenan NULLS LAST de forma portable,
 * así que se hace en JS. Ordena una copia; no muta el arreglo original.
 */
export function sortBatchesFEFO<T extends { expiryDate: Date | null; createdAt: Date }>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime()
    if (a.expiryDate) return -1
    if (b.expiryDate) return 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/**
 * Reparte una salida de stock entre los lotes ACTIVE del producto
 * usando FEFO. Llamar después de reserveStockAtomically, en el mismo tx.
 */
export async function consumeBatchesFEFO(
  tx: Prisma.TransactionClient,
  storeId: number,
  productId: number,
  baseUnits: number,
): Promise<FefoResult> {
  const result: FefoResult = { consumptions: [], uncovered: 0 }
  let remaining = roundQty(baseUnits)
  if (remaining <= 0) return result

  // Lotes ACTIVE ordenados FEFO: primero los que tienen fecha de vencimiento
  // (más próximos a expirar primero), luego sin fecha (FIFO por createdAt).
  // SQLite no soporta ORDER BY ... NULLS LAST, así que se ordena en JS.
  const rows = await tx.batch.findMany({
    where: { storeId, productId, status: 'ACTIVE', quantity: { gt: 0 } },
    select: { id: true, lotNumber: true, quantity: true, expiryDate: true, createdAt: true },
  })
  const batches = sortBatchesFEFO(rows)

  for (const batch of batches) {
    if (remaining <= 0) break
    const available = roundQty(toNum(batch.quantity))
    if (available <= 0) continue
    const take = roundQty(Math.min(available, remaining))

    const newQty = roundQty(available - take)
    await tx.batch.update({
      where: { id: batch.id },
      data: {
        quantity: take === available ? 0 : newQty,
        ...(take === available ? { status: 'DEPLETED' } : {}),
      },
    })
    result.consumptions.push({ batchId: batch.id, lotNumber: batch.lotNumber, quantity: take })
    remaining = roundQty(remaining - take)
  }

  if (remaining > 0) {
    // Stock legacy sin lotes: ya fue descontado del Product por
    // reserveStockAtomically. Se reporta, no se bloquea.
    result.uncovered = remaining
  }
  return result
}

/**
 * Consume `baseUnits` de UN lote específico (pérdida / ajuste negativo dirigido a
 * ese lote — p. ej. "este lote se venció"). No aplica FEFO. Marca DEPLETED al
 * llegar a 0. Lo que el lote no cubra queda como `uncovered` para el caller.
 * Llamar en el mismo tx, después de descontar Product.currentStock.
 */
export async function consumeBatchById(
  tx: Prisma.TransactionClient,
  batchId: number,
  baseUnits: number,
): Promise<FefoResult> {
  const result: FefoResult = { consumptions: [], uncovered: 0 }
  const want = roundQty(baseUnits)
  if (want <= 0) return result

  const batch = await tx.batch.findUnique({
    where: { id: batchId },
    select: { id: true, lotNumber: true, quantity: true, status: true },
  })
  if (!batch || batch.status !== 'ACTIVE') {
    result.uncovered = want
    return result
  }

  const available = roundQty(toNum(batch.quantity))
  const take = roundQty(Math.min(available, want))
  if (take > 0) {
    await tx.batch.update({
      where: { id: batch.id },
      data: {
        quantity: take === available ? 0 : roundQty(available - take),
        ...(take === available ? { status: 'DEPLETED' } : {}),
      },
    })
    result.consumptions.push({ batchId: batch.id, lotNumber: batch.lotNumber, quantity: take })
  }
  result.uncovered = roundQty(want - take)
  return result
}
