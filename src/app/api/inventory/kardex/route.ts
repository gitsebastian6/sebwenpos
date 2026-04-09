import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: Kardex for a product (inventory movements with running balance)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0')
    const productId = parseInt(searchParams.get('productId') || '0')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    if (!productId) return NextResponse.json({ error: 'productId requerido' }, { status: 400 })

    // Verify product belongs to store
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
      runningBalance = prevMovements.reduce((s, m) => s + m.quantity, 0)
    }

    // Calculate running balance
    const kardexMovements = movements.map((m) => {
      runningBalance += m.quantity
      return {
        id: m.id,
        date: m.createdAt.toISOString(),
        type: m.movementType,
        quantity: m.quantity,
        balance: runningBalance,
        notes: m.notes || '',
        referenceId: m.referenceId,
      }
    })

    return NextResponse.json({
      product,
      movements: kardexMovements,
      currentStock: product.currentStock,
    })
  } catch (error) {
    console.error('GET /api/inventory/kardex error:', error)
    return NextResponse.json({ error: 'Error al obtener kardex' }, { status: 500 })
  }
}
