// ============================================================
// SEBWEN POS — Batch Receiver (entrada de lotes desde Compras)
// Ref: Fundamentos de control y gestión de inventarios (Vidal)
// ──────────────────────────────────────────────────────────
// Al registrar una compra, cada PurchaseItem que traiga
// lotNumber (producto con trackExpiration = true) crea o
// consolida un Batch:
//
//   - Lote nuevo → se crea con cantidad y costo de la línea.
//   - Lote existente (mismo productId+lotNumber) → se suma la
//     cantidad y el unitCost del lote se promedia ponderado
//     (consistente con la filosofía CPP del resto del sistema).
//
// Debe llamarse DENTRO de la transacción de creación/edición de
// la compra, después de crear el InventoryMovement.
// ============================================================

import { Prisma } from '@prisma/client'
import { toNum } from '@/lib/stock-math'

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
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
 * Crea o consolida el lote correspondiente a una línea de compra.
 * Idempotente respecto a lotes repetidos gracias a @@unique([productId, lotNumber]).
 */
export async function receiveBatchFromPurchase(
  tx: Prisma.TransactionClient,
  input: ReceiveBatchInput,
): Promise<void> {
  const { storeId, productId, purchaseItemId, lotNumber } = input
  const incomingQty = roundQty(input.baseUnits)
  if (!lotNumber.trim() || incomingQty <= 0) return

  const existing = await tx.batch.findUnique({
    where: { productId_lotNumber: { productId, lotNumber: lotNumber.trim() } },
    select: { id: true, quantity: true, unitCost: true },
  })

  if (existing) {
    // Consolidación: cantidad suma + costo promedio ponderado del lote.
    const prevQty = roundQty(toNum(existing.quantity))
    const totalQty = roundQty(prevQty + incomingQty)
    const weightedCost =
      totalQty > 0
        ? Math.round((prevQty * existing.unitCost + incomingQty * input.baseUnitCost) / totalQty)
        : Math.round(input.baseUnitCost)
    await tx.batch.update({
      where: { id: existing.id },
      data: { quantity: totalQty, unitCost: weightedCost, status: 'ACTIVE', purchaseItemId: purchaseItemId ?? undefined },
    })
  } else {
    await tx.batch.create({
      data: {
        storeId,
        productId,
        lotNumber: lotNumber.trim(),
        expiryDate: input.expiryDate ?? null,
        manufacturingDate: input.manufacturingDate ?? null,
        quantity: incomingQty,
        unitCost: Math.round(input.baseUnitCost),
        purchaseItemId: purchaseItemId ?? null,
      },
    })
  }
}
