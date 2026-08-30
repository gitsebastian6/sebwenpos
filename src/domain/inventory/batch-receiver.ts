// ============================================================
// SEBWEN POS — Batch Receiver (entrada de lotes)
// Ref: Fundamentos de control y gestión de inventarios (Vidal)
// ──────────────────────────────────────────────────────────
// Toda ENTRADA de stock a un lote (compra o ajuste/devolución
// manual) pasa por `upsertBatch`:
//
//   - Lote nuevo → se crea con cantidad y costo de la entrada.
//   - Lote existente (mismo productId+lotNumber) → se suma la
//     cantidad y el unitCost se promedia ponderado (CPP).
//
// Debe llamarse DENTRO de la transacción del caso de uso,
// después de crear el InventoryMovement.
// ============================================================

import { Prisma } from '@prisma/client'
import { toNum } from '@/lib/stock-math'

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}

export interface UpsertBatchInput {
  storeId: number
  productId: number
  lotNumber: string
  expiryDate?: Date | null
  manufacturingDate?: Date | null
  /** Unidades base entrantes. */
  baseUnits: number
  /** Costo por unidad BASE (COP entero). */
  baseUnitCost: number
  /** PurchaseItem origen (solo compras). */
  purchaseItemId?: number | null
}

/**
 * Crea o consolida un lote. Idempotente respecto a lotes repetidos gracias a
 * `@@unique([productId, lotNumber])`. Devuelve el id del lote afectado (o null
 * si la entrada no aplica: sin lotNumber o cantidad <= 0).
 */
export async function upsertBatch(
  tx: Prisma.TransactionClient,
  input: UpsertBatchInput,
): Promise<{ batchId: number } | null> {
  const { storeId, productId, purchaseItemId } = input
  const lotNumber = input.lotNumber.trim()
  const incomingQty = roundQty(input.baseUnits)
  if (!lotNumber || incomingQty <= 0) return null

  const existing = await tx.batch.findUnique({
    where: { productId_lotNumber: { productId, lotNumber } },
    select: { id: true, quantity: true, unitCost: true },
  })

  if (existing) {
    const prevQty = roundQty(toNum(existing.quantity))
    const totalQty = roundQty(prevQty + incomingQty)
    const weightedCost =
      totalQty > 0
        ? Math.round((prevQty * existing.unitCost + incomingQty * input.baseUnitCost) / totalQty)
        : Math.round(input.baseUnitCost)
    // Consolidación: no se pisa expiryDate/manufacturingDate del lote original
    // (son intrínsecos al lote; el mismo lotNumber = el mismo vencimiento).
    await tx.batch.update({
      where: { id: existing.id },
      data: {
        quantity: totalQty,
        unitCost: weightedCost,
        status: 'ACTIVE',
        ...(purchaseItemId ? { purchaseItemId } : {}),
      },
    })
    return { batchId: existing.id }
  }

  const created = await tx.batch.create({
    data: {
      storeId,
      productId,
      lotNumber,
      expiryDate: input.expiryDate ?? null,
      manufacturingDate: input.manufacturingDate ?? null,
      quantity: incomingQty,
      unitCost: Math.round(input.baseUnitCost),
      purchaseItemId: purchaseItemId ?? null,
    },
    select: { id: true },
  })
  return { batchId: created.id }
}

export interface ReceiveBatchInput {
  storeId: number
  productId: number
  purchaseItemId?: number | null
  lotNumber: string
  expiryDate?: Date | null
  manufacturingDate?: Date | null
  /** Unidades base entrantes (quantity × unitsPerPack). */
  baseUnits: number
  /** Costo por unidad BASE (unitCost / unitsPerPack). */
  baseUnitCost: number
}

/**
 * Entrada de lote desde una línea de compra. Fina envoltura sobre `upsertBatch`.
 */
export async function receiveBatchFromPurchase(
  tx: Prisma.TransactionClient,
  input: ReceiveBatchInput,
): Promise<void> {
  await upsertBatch(tx, {
    storeId: input.storeId,
    productId: input.productId,
    lotNumber: input.lotNumber,
    expiryDate: input.expiryDate ?? null,
    manufacturingDate: input.manufacturingDate ?? null,
    baseUnits: input.baseUnits,
    baseUnitCost: input.baseUnitCost,
    purchaseItemId: input.purchaseItemId ?? null,
  })
}
