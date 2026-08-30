import { requireStoreAccess } from '@/lib/api-auth'
import { requireActiveSubscription } from '@/lib/subscription-guard'
import { requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── GET: Fetch inventory movements ──────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = parseInt(searchParams.get('storeId') || '0', 10)
    const type = searchParams.get('type')
    const productId = searchParams.get('productId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(req, storeId)
    if (storeAccessErr) return storeAccessErr

    const where: Record<string, unknown> = { storeId }

    if (type) {
      where.movementType = type
    }
    if (productId) {
      where.productId = parseInt(productId, 10)
    }

    const movements = await db.inventoryMovement.findMany({
      where,
      include: {
        product: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const formatted = movements.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      presentationName: m.presentationName,
      unitsPerPack: m.unitsPerPack,
      quantity: m.quantity,
      movementType: m.movementType,
      notes: m.notes,
      createdAt: m.createdAt.toISOString(),
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    logger.error('Inventory GET error:', error)
    return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 })
  }
}

// ─── POST: Create inventory movement ────────────────────────

const createMovementSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  movementType: z.enum(['PURCHASE', 'ADJUSTMENT', 'RETURN', 'SALE']),
  quantity: z.number(),
  notes: z.string().optional(),
  referenceId: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createMovementSchema.parse(body)

    // Verify product
    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'inventory')
    if (permErr) return permErr
    const subErr = await requireActiveSubscription(data.storeId)
    if (subErr) return subErr

    // Verify product exists and belongs to store
    const product = await db.product.findFirst({
      where: { id: data.productId, storeId: data.storeId },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    // Determine quantity sign based on movement type
    let quantity = data.quantity
    if (data.movementType === 'PURCHASE' || data.movementType === 'RETURN') {
      // Ensure positive for entries
      quantity = Math.abs(quantity)
    }
    // For ADJUSTMENT, keep the sign as-is (positive or negative)
    // For SALE, quantity should be negative (stock goes out)
    if (data.movementType === 'SALE') {
      quantity = -Math.abs(quantity)
    }

    // Create movement and update product stock in a transaction
    const movement = await db.$transaction(async (tx) => {
      // Create the inventory movement record
      const mov = await tx.inventoryMovement.create({
        data: {
          storeId: data.storeId,
          productId: data.productId,
          quantity,
          movementType: data.movementType,
          notes: data.notes,
          referenceId: data.referenceId,
        },
        include: {
          product: { select: { name: true } },
        },
      })

      // Update product stock
      await tx.product.update({
        where: { id: data.productId },
        data: {
          currentStock: {
            increment: quantity,
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
    logger.error('Inventory POST error:', error)
    return NextResponse.json({ error: 'Error al crear movimiento' }, { status: 500 })
  }
}
