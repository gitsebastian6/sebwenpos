import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const resetSchema = z.object({
  storeId: z.number().int().positive(),
  note: z.string().max(500).optional(),
})

// POST /api/inventory/reset-stock
// Pone el stock de TODOS los productos a 0 y registra el movimiento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = resetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { storeId, note } = parsed.data

    // Get all products with stock > 0
    const productsWithStock = await db.product.findMany({
      where: { storeId, currentStock: { gt: 0 } },
      select: { id: true, name: true, currentStock: true },
    })

    if (productsWithStock.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Todos los productos ya están en stock 0',
        productsReset: 0,
      })
    }

    const totalUnitsReset = productsWithStock.reduce((sum, p) => sum + p.currentStock, 0)

    await db.$transaction(async (tx) => {
      // 1. Reset all product stock to 0
      await tx.product.updateMany({
        where: { storeId, currentStock: { gt: 0 } },
        data: { currentStock: 0 },
      })

      // 2. Create an inventory movement for each product
      for (const product of productsWithStock) {
        await tx.inventoryMovement.create({
          data: {
            storeId,
            productId: product.id,
            quantity: product.currentStock,
            movementType: 'ADJUSTMENT',
            notes: `RESETEO DE INVENTARIO${note ? ` - ${note}` : ''} (era ${product.currentStock} unidades)`,
          },
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: `Stock reseteado: ${productsWithStock.length} productos, ${totalUnitsReset} unidades en total`,
      productsReset: productsWithStock.length,
      totalUnitsReset,
    })
  } catch (error) {
    console.error('POST /api/inventory/reset-stock error:', error)
    return NextResponse.json({ error: 'Error al resetear inventario' }, { status: 500 })
  }
}
