import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { requireFeature } from '@/lib/subscription-guard'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const kardexParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  from: z.string().optional(),
  to: z.string().optional(),
})

// GET: Kardex for a product (inventory movements with running balance)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = kardexParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const { storeId, productId, from, to } = params

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'inventory')
    if (permErr) return permErr
    const featErr = await requireFeature(storeId, 'advancedInventory')
    if (featErr) return featErr

    // Verify product exists and belongs to store
    const product = await db.product.findFirst({
      where: { id: productId, storeId },
      select: {
        id: true,
        name: true,
        sku: true,
        currentStock: true,
        category: { select: { name: true } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    // Build date filter
    const dateFilter: Record<string, unknown> = {}
    if (from) {
      const d = new Date(from)
      d.setHours(0, 0, 0, 0)
      dateFilter.gte = d
    }
    if (to) {
      const d = new Date(to)
      d.setHours(23, 59, 59, 999)
      dateFilter.lte = d
    }

    const hasDateFilter = from || to

    // Get all inventory movements for this product
    const movementsWhere: Record<string, unknown> = { productId }
    if (hasDateFilter) movementsWhere.createdAt = dateFilter

    const movements = await db.inventoryMovement.findMany({
      where: movementsWhere,
      select: {
        id: true,
        quantity: true,
        movementType: true,
        notes: true,
        createdAt: true,
        referenceId: true,
        presentationName: true,
        unitsPerPack: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // If we have date filter, get the balance BEFORE the filter date
    let runningBalance = 0
    if (hasDateFilter && from) {
      // Count all movements before the "from" date
      const beforeDate = new Date(from)
      beforeDate.setHours(0, 0, 0, 0)

      const prevMovements = await db.inventoryMovement.findMany({
        where: { productId, createdAt: { lt: beforeDate } },
        select: { quantity: true },
      })
      runningBalance = prevMovements.reduce((s, m) => s + toNum(m.quantity), 0)
    }

    // Calculate running balance
    const kardexMovements = movements.map((m) => {
      runningBalance += toNum(m.quantity)
      return {
        id: m.id,
        date: m.createdAt.toISOString(),
        type: m.movementType,
        quantity: toNum(m.quantity),
        balance: runningBalance,
        notes: m.notes || '',
        referenceId: m.referenceId,
        presentationName: m.presentationName,
        unitsPerPack: toNum(m.unitsPerPack),
      }
    })

    return NextResponse.json({
      product,
      movements: kardexMovements,
      currentStock: product.currentStock,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map(i => i.message).join(', ') }, { status: 400 })
    }
    logger.error('GET /api/inventory/kardex error:', error)
    return NextResponse.json({ error: 'Error al obtener kardex' }, { status: 500 })
  }
}
