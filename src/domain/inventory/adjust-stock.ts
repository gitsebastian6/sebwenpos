// ============================================================
// SEBWEN POS — AdjustStock (Domain Service compartido)
// CONTEXT_MAP: Inventory — ajustes / pérdidas / devoluciones
// ──────────────────────────────────────────────────────────
// Punto ÚNICO de escritura para movimientos de inventario que
// NO provienen de una venta ni de una compra:
//
//   - ADJUSTMENT (ajuste manual / conteo físico)
//   - LOSS       (merma: vencido, dañado, robo…)
//   - RETURN     (devolución de cliente / proveedor)
//
// Recibe el delta YA resuelto a unidades base (con signo).
//
// SALIDA (delta < 0):
//   - batchId dado  → decremento atómico del producto + consumo de ESE lote.
//   - si no         → reserveStock() (decremento atómico + FEFO), igual venta.
//
// ENTRADA (delta > 0):
//   - increment atómico del producto, y si trackExpiration:
//       · batchId dado   → se suma a ese lote.
//       · lotNumber dado → upsertBatch (crea/consolida lote real).
//       · nada           → sin lote (stock "uncovered", igual que compra sin lote).
//
// El InventoryMovement guarda quantity base con signo + snapshot de la
// presentación + batchId del lote afectado (si hay exactamente uno).
//
// Debe llamarse DENTRO de la transacción Prisma del caso de uso.
// ============================================================

import { toNum } from '@/lib/stock-math'
import { Prisma } from '@prisma/client'
import { consumeBatchById, type BatchConsumption } from './batch-consumer'
import { upsertBatch } from './batch-receiver'
import { reserveStock } from './stock-reserver'

export type AdjustMovementType = 'ADJUSTMENT' | 'LOSS' | 'RETURN'

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}

export class InsufficientStockError extends Error {
  constructor(public availableStock: number, public productName: string) {
    super('Stock insuficiente. El stock no puede ser menor a 0.')
    this.name = 'InsufficientStockError'
  }
}

export interface AdjustStockInput {
  storeId: number
  productId: number
  /** Delta en unidades base, con signo. Debe ser distinto de 0. */
  baseDelta: number
  movementType: AdjustMovementType
  /** Snapshot para el movimiento (la presentación en la que pensó el usuario). */
  presentationId?: number | null
  presentationName?: string | null
  unitsPerPack?: number | null
  notes?: string | null
  // ─── Lote (solo aplica a productos con trackExpiration) ───
  /** Lote existente al que dirigir la entrada/salida. */
  batchId?: number | null
  /** Lote nuevo (entrada) — se ignora si viene batchId. */
  lotNumber?: string | null
  expiryDate?: Date | null
  manufacturingDate?: Date | null
}

export interface AdjustStockResult {
  movementId: number
  newStock: number
  costPrice: number
  batchConsumptions: BatchConsumption[]
  /** Salida no cubierta por ningún lote (stock legacy). */
  uncovered: number
}

export async function adjustStock(
  tx: Prisma.TransactionClient,
  input: AdjustStockInput,
): Promise<AdjustStockResult> {
  const { storeId, productId } = input
  const baseDelta = roundQty(input.baseDelta)
  if (baseDelta === 0) throw new Error('adjustStock: baseDelta no puede ser 0')

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { name: true, costPrice: true, trackExpiration: true },
  })
  if (!product) throw new Error('Producto no encontrado')

  let batchConsumptions: BatchConsumption[] = []
  let uncovered = 0
  let affectedBatchId: number | null = null

  if (baseDelta < 0) {
    const amount = Math.abs(baseDelta)

    if (product.trackExpiration && input.batchId) {
      // Salida dirigida a un lote concreto ("este lote se venció / dañó").
      const dec = await tx.product.updateMany({
        where: { id: productId, currentStock: { gte: amount } },
        data: { currentStock: { decrement: amount } },
      })
      if (dec.count === 0) {
        const fresh = await tx.product.findUnique({ where: { id: productId }, select: { currentStock: true } })
        throw new InsufficientStockError(fresh ? toNum(fresh.currentStock) : 0, product.name)
      }
      const res = await consumeBatchById(tx, input.batchId, amount)
      batchConsumptions = res.consumptions
      uncovered = res.uncovered
    } else {
      // Decremento atómico + FEFO (mismo primitivo que una venta).
      const reservation = await reserveStock(tx, storeId, productId, amount)
      if (!reservation.success && !reservation.notTracked) {
        throw new InsufficientStockError(
          reservation.availableStock ?? 0,
          reservation.productName ?? product.name,
        )
      }
      batchConsumptions = reservation.consumptions
      uncovered = reservation.uncovered
    }
  } else {
    // Entrada de stock.
    await tx.product.update({
      where: { id: productId },
      data: { currentStock: { increment: baseDelta } },
    })

    if (product.trackExpiration) {
      if (input.batchId) {
        const batch = await tx.batch.findFirst({
          where: { id: input.batchId, productId, status: 'ACTIVE' },
          select: { id: true, quantity: true },
        })
        if (batch) {
          await tx.batch.update({
            where: { id: batch.id },
            data: { quantity: roundQty(toNum(batch.quantity) + baseDelta) },
          })
          affectedBatchId = batch.id
        }
      } else if (input.lotNumber?.trim()) {
        const res = await upsertBatch(tx, {
          storeId,
          productId,
          lotNumber: input.lotNumber,
          expiryDate: input.expiryDate ?? null,
          manufacturingDate: input.manufacturingDate ?? null,
          baseUnits: baseDelta,
          baseUnitCost: product.costPrice,
        })
        affectedBatchId = res?.batchId ?? null
      }
      // sin batchId ni lotNumber → sin lote (uncovered), igual que compra sin lote
    }
  }

  const batchId =
    affectedBatchId ?? (batchConsumptions.length === 1 ? batchConsumptions[0].batchId : null)

  const movement = await tx.inventoryMovement.create({
    data: {
      storeId,
      productId,
      presentationId: input.presentationId ?? null,
      presentationName: input.presentationName ?? null,
      unitsPerPack: input.unitsPerPack ?? 1,
      quantity: baseDelta,
      movementType: input.movementType,
      notes: input.notes ?? null,
      batchId,
    },
  })

  const fresh = await tx.product.findUnique({
    where: { id: productId },
    select: { currentStock: true },
  })

  return {
    movementId: movement.id,
    newStock: toNum(fresh?.currentStock ?? 0),
    costPrice: product.costPrice,
    batchConsumptions,
    uncovered,
  }
}
