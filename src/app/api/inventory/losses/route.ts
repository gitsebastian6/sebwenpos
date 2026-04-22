import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const lossSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
  notes: z.string().optional(),
})

// POST /api/inventory/losses
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = lossSchema.parse(body)

    // Verify product exists
    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr


    const product = await db.product.findFirst({
      where: { id: data.productId, storeId: data.storeId },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    // Prevent stock from going below 0
    if (product.currentStock < data.quantity) {
      return NextResponse.json(
        { error: 'Stock insuficiente. No se puede registrar más pérdidas que el stock disponible.' },
        { status: 400 }
      )
    }

    // Create movement (positive quantity in request, but stock decreases) and update stock
    const movement = await db.$transaction(async (tx) => {
      const mov = await tx.inventoryMovement.create({
        data: {
          storeId: data.storeId,
          productId: data.productId,
          quantity: -data.quantity, // negative: stock decreases
          movementType: 'LOSS',
          notes: [data.reason, data.notes].filter(Boolean).join(' — ') || null,
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
            decrement: data.quantity,
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
    logger.error('POST /api/inventory/losses error:', error)
    return NextResponse.json({ error: 'Error al registrar pérdida' }, { status: 500 })
  }
}
