// ============================================================
// SEBWEN POS — StockReserver (Domain Service compartido)
// CONTEXT_MAP: Sales → Inventory | patrón "Shared Kernel"
// ──────────────────────────────────────────────────────────
// Punto de acceso ÚNICO de Inventory para reservar stock:
//
//   1. Descuento atómico de Product.currentStock
//      (conditional UPDATE — Kleppmann Ch.7).
//   2. Trazabilidad FEFO en Batch para productos perecederos.
//
// Sales (POS, mesas, cotizaciones) solo pregunta "¿puedes
// reservarme N unidades?"; no conoce detalles de lotes ni SQL.
//
// Debe llamarse DENTRO de la transacción Prisma del caso de uso.
// ============================================================

import { Prisma } from '@prisma/client'
import { toNum } from '@/lib/stock-math'
import {
  consumeBatchesFEFO,
  type BatchConsumption,
} from './batch-consumer'

export interface ReservationResult {
  success: boolean
  /** Stock disponible al momento del fallo (undefined si success o producto no encontrado). */
  availableStock?: number
  /** Nombre del producto para mensajes de error. */
  productName?: string
  /** true = el producto no rastrea inventario (siempre vendible). */
  notTracked?: boolean
  /** Consumos FEFO por lote (solo productos con trackExpiration y lotes). */
  consumptions: BatchConsumption[]
  /**
   * Cantidad vendida sin lote asignado (stock previo a la funcionalidad de
   * lotes). No bloquea la venta; verify-batches.ts la detecta como discrepancia.
   */
  uncovered: number
}

/**
 * Reserva stock de un producto en unidades base, con trazabilidad por lote.
 * Reemplaza al par reserveStockAtomically + consumeBatchesFEFO disperso en las rutas.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  storeId: number,
  productId: number,
  baseUnits: number,
): Promise<ReservationResult> {
  // 1) Verificación temprana + nombre para errores (igual que atomic-stock)
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { currentStock: true, name: true, trackInventory: true },
  })

  if (!product) {
    return { success: false, productName: '(producto no encontrado)', consumptions: [], uncovered: 0 }
  }

  if (product.trackInventory === false) {
    return { success: true, notTracked: true, productName: product.name, consumptions: [], uncovered: 0 }
  }

  // 2) Descuento atómico (compare-and-write, sin race window)
  const result = await tx.product.updateMany({
    where: { id: productId, currentStock: { gte: baseUnits } },
    data: { currentStock: { decrement: baseUnits } },
  })

  if (result.count === 0) {
    const fresh = await tx.product.findUnique({
      where: { id: productId },
      select: { currentStock: true },
    })
    return {
      success: false,
      availableStock: fresh ? toNum(fresh.currentStock) : 0,
      productName: product.name,
      consumptions: [],
      uncovered: 0,
    }
  }

  // 3) Trazabilidad FEFO (solo toca lotes si existen; no-op para el resto)
  const fefo = await consumeBatchesFEFO(tx, storeId, productId, baseUnits)

  return {
    success: true,
    productName: product.name,
    consumptions: fefo.consumptions,
    uncovered: fefo.uncovered,
  }
}
