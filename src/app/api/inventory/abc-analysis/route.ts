import { requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { classifyAbc, type AbcRow } from '@/domain/inventory/analytics'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/inventory/abc-analysis?storeId=N
 *
 * Clasificación ABC por ingreso de ventas de los últimos 12 meses:
 * A = primer 80% del valor acumulado, B hasta 95%, C resto.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = Number(searchParams.get('storeId'))
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return NextResponse.json({ error: 'storeId inválido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const since = new Date()
    since.setFullYear(since.getFullYear() - 1)

    // Ingreso por producto: totalRow ya es el valor de la línea (COP).
    // Se resta lo devuelto proporcionalmente vía returnedQuantity.
    const items = await db.orderItem.findMany({
      where: {
        productId: { not: null },
        order: { storeId, createdAt: { gte: since }, status: { notIn: ['CANCELLED'] } },
      },
      select: {
        productId: true,
        quantity: true,
        returnedQuantity: true,
        totalRow: true,
      },
    })

    const revenueByProduct = new Map<number, number>()
    for (const it of items) {
      if (!it.productId) continue
      const qty = Number(it.quantity) || 0
      const ret = Number(it.returnedQuantity) || 0
      const netShare = qty > 0 ? Math.max(0, qty - ret) / qty : 0
      revenueByProduct.set(
        it.productId,
        (revenueByProduct.get(it.productId) ?? 0) + Math.round(Number(it.totalRow) * netShare),
      )
    }

    const products = await db.product.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true },
    })

    const rows: AbcRow[] = products.map((p) => ({
      productId: p.id,
      name: p.name,
      revenue: revenueByProduct.get(p.id) ?? 0,
    }))

    const classified = classifyAbc(rows)
    return NextResponse.json({
      periodDays: 365,
      totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
      summary: {
        A: classified.filter((r) => r.class === 'A').length,
        B: classified.filter((r) => r.class === 'B').length,
        C: classified.filter((r) => r.class === 'C').length,
      },
      items: classified,
    })
  } catch (error) {
    console.error('[abc-analysis]', error)
    return NextResponse.json({ error: 'Error al calcular análisis ABC' }, { status: 500 })
  }
}
