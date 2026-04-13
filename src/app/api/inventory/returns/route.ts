import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const returnSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
})

// POST /api/inventory/returns
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = returnSchema.parse(body)

    // Verify product exists
    const product = await db.product.findFirst({
      where: { id: data.productId, storeId: data.storeId },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    // Create movement (positive quantity = stock going back in) and update stock
    const movement = await db.$transaction(async (tx) => {
      const mov = await tx.inventoryMovement.create({
        data: {
          storeId: data.storeId,
          productId: data.productId,
          quantity: data.quantity, // positive: stock increases
          movementType: 'RETURN',
          notes: data.notes,
        },
        include: {
          product: {
            select: { id: true, name: true, currentStock: true },
          },
        },
      })

      await tx.product.update({
        where: { id: data.productId },
        data: {
          currentStock: {
            increment: data.quantity,
          },
        },
      })

      return mov
    })

    return NextResponse.json({
      id: movement.id,
      productId: movement.productId,
      productName: movement.product.name,
      quantity: movement.quantity,
      movementType: movement.movementType,
      notes: movement.notes,
      createdAt: movement.createdAt.toISOString(),
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/inventory/returns error:', error)
    return NextResponse.json({ error: 'Error al registrar devolución' }, { status: 500 })
  }
}
