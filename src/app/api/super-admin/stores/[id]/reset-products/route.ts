import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/super-admin/stores/[id]/reset-products
 * Elimina todos los productos de la tienda (maestra).
 * También elimina los registros asociados: movimientos de inventario, items de compra, etc.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const storeId = Number(id)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Get product IDs for this store to count and for related deletions
    const storeProductIds = await db.product.findMany({
      where: { storeId },
      select: { id: true },
    })

    const productCount = storeProductIds.length
    const productIds = storeProductIds.map(p => p.id)

    if (productCount === 0) {
      return NextResponse.json({
        message: `La tienda "${store.name}" no tiene productos para eliminar`,
        deleted: 0,
      })
    }

    // Use a transaction to safely delete everything
    const result = await db.$transaction(async (tx) => {
      let deletedMovements = 0
      let deletedPurchaseItems = 0
      let deletedProducts = 0

      // 1. Delete inventory movements referencing these products (onDelete: Cascade will handle this too, but explicit for clarity)
      if (productIds.length > 0) {
        const delMov = await tx.inventoryMovement.deleteMany({
          where: { productId: { in: productIds } },
        })
        deletedMovements = delMov.count

        // 2. Delete purchase items (has onDelete: Restrict, must delete first)
        const delPI = await tx.purchaseItem.deleteMany({
          where: { productId: { in: productIds } },
        })
        deletedPurchaseItems = delPI.count

        // 3. Delete all products for this store
        // OrderItems, ComandaItems, QuotationItems have SetNull on productId, so they'll survive
        const delProd = await tx.product.deleteMany({
          where: { storeId },
        })
        deletedProducts = delProd.count
      }

      return { deletedMovements, deletedPurchaseItems, deletedProducts }
    })

    logger.info(`Maestra reset for store ${storeId} (${store.name}): ${result.deletedProducts} products, ${result.deletedPurchaseItems} purchase items, ${result.deletedMovements} inventory movements deleted`)

    return NextResponse.json({
      message: `Maestra de "${store.name}" reiniciada exitosamente`,
      deletedProducts: result.deletedProducts,
      deletedPurchaseItems: result.deletedPurchaseItems,
      deletedInventoryMovements: result.deletedMovements,
      storeId,
      storeName: store.name,
    })
  } catch (error) {
    logger.error('Reset products error:', error)
    return NextResponse.json({ error: 'Error al reiniciar la maestra de productos' }, { status: 500 })
  }
}
