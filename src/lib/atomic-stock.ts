// ============================================================
// SEBWEN POS — Atomic Stock Reservation
// Ref: Designing Data-Intensive Applications (Kleppmann), Ch. 7
// ──────────────────────────────────────────────────────────
// Prevents the "write skew" / "lost update" race condition where
// two concurrent orders read the same stock, both pass the check,
// and both decrement — producing NEGATIVE stock.
//
// APPROACH: conditional UPDATE (atomic compare-and-write).
//   UPDATE Product SET currentStock = currentStock - N
//   WHERE id = ? AND currentStock >= N
//
// This is a single atomic statement under both SQLite (SERIALIZABLE
// by default) and PostgreSQL (Read Committed — row-level lock on
// the UPDATE). No SELECT-then-UPDATE gap, no need for SELECT FOR
// UPDATE (which SQLite doesn't support anyway).
//
// If trackInventory is false, the product is always sellable —
// we skip the decrement entirely.
// ============================================================

import { Prisma } from '@prisma/client'
import { toNum } from './stock-math'

export interface ReservationResult {
  success: boolean
  /** Available stock at the time of failure (undefined if success or product not found). */
  availableStock?: number
  /** Product name for error messaging. */
  productName?: string
  /** True if the product doesn't track inventory (always sellable). */
  notTracked?: boolean
}

/**
 * Atomically reserves (decrements) stock for a single product in base units.
 *
 * Uses a conditional `updateMany` so the check and the decrement happen in
 * one SQL statement — no race window between reading and writing.
 *
 * Must be called inside a transaction (`tx`), so the reservation is atomic
 * with the rest of the order creation.
 *
 * @param tx          Prisma transaction client
 * @param productId   Product to reserve from
 * @param baseUnits   Units in base packaging (e.g. 8 for "1 six-pack + 2 units")
 */
export async function reserveStockAtomically(
  tx: Prisma.TransactionClient,
  productId: number,
  baseUnits: number,
): Promise<ReservationResult> {
  // First, check if the product tracks inventory at all.
  // (We need the name for error messages too.)
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { currentStock: true, name: true, trackInventory: true },
  })

  if (!product) {
    return { success: false, productName: '(producto no encontrado)' }
  }

  // Products that don't track inventory are always sellable — no decrement.
  if (product.trackInventory === false) {
    return { success: true, notTracked: true, productName: product.name }
  }

  // Atomic conditional decrement: only succeeds if currentStock >= baseUnits.
  const result = await tx.product.updateMany({
    where: {
      id: productId,
      currentStock: { gte: baseUnits },
    },
    data: {
      currentStock: { decrement: baseUnits },
    },
  })

  if (result.count === 0) {
    // The condition failed — either stock is insufficient OR the row changed
    // between our findUnique and updateMany. Re-read for the error message.
    const fresh = await tx.product.findUnique({
      where: { id: productId },
      select: { currentStock: true },
    })
    return {
      success: false,
      availableStock: fresh ? toNum(fresh.currentStock) : 0,
      productName: product.name,
    }
  }

  return { success: true, productName: product.name }
}

/**
 * Reserves stock for multiple products atomically within a transaction.
 * Returns the first failure (if any) so the caller can abort with a
 * meaningful error message.
 *
 * @param tx        Prisma transaction client
 * @param entries   Map of productId → base units needed
 */
export async function reserveMultipleStock(
  tx: Prisma.TransactionClient,
  entries: Iterable<[number, number]>,
): Promise<ReservationResult> {
  for (const [productId, baseUnits] of entries) {
    const result = await reserveStockAtomically(tx, productId, baseUnits)
    if (!result.success) {
      return result
    }
  }
  return { success: true }
}
