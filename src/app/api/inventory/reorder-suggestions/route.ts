import { requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { toNum } from '@/lib/stock-math'
import { buildReorderSuggestions, type DailyDemandRow } from '@/domain/inventory/analytics'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/inventory/reorder-suggestions?storeId=N
 *
 * Punto de reorden (Vidal): ROP = demanda × leadTime + safety stock.
 * Demanda: ventas de los últimos 90 días (OrderItems en unidades base).
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

    const DAYS = 90
    const since = new Date()
    since.setDate(since.getDate() - DAYS)

    // Productos que rastrean inventario (los únicos con sentido para reorden)
    const products = await db.product.findMany({
      where: { storeId, isActive: true, trackInventory: true },
      select: {
        id: true,
        name: true,
        currentStock: true,
        minStock: true,
        providerId: true,
        provider: { select: { name: true, leadTimeDays: true } },
      },
    })

    // Ventas del período: solo columnas mínimas; se agregan días SIN venta como 0.
    const items = await db.orderItem.findMany({
      where: {
        productId: { not: null },
        returnedQuantity: { lt: 999999 }, // no filtrar — se resta abajo si aplica
        order: { storeId, createdAt: { gte: since }, status: { notIn: ['CANCELLED'] } },
      },
      select: {
        productId: true,
        quantity: true,
        unitsPerPack: true,
        returnedQuantity: true,
      },
    })

    // Demanda neta por producto en unidades base (agregada sobre todo el período;
    // la σ diaria usa el total/período como varianza muestral simplificada).
    const demandByProduct = new Map<number, number>()
    for (const it of items) {
      if (!it.productId) continue
      const netQty =
        Math.max(0, toNum(it.quantity) - toNum(it.returnedQuantity)) * toNum(it.unitsPerPack)
      demandByProduct.set(it.productId, (demandByProduct.get(it.productId) ?? 0) + netQty)
    }
    const demandRows: DailyDemandRow[] = [...demandByProduct.entries()].map(
      ([productId, quantity]) => ({ productId, quantity }),
    )

    const suggestions = buildReorderSuggestions(
      demandRows,
      DAYS,
      products.map((p) => ({
        productId: p.id,
        currentStock: toNum(p.currentStock),
        minStock: toNum(p.minStock),
        leadTimeDays: p.provider?.leadTimeDays ?? 7,
        providerId: p.providerId,
        providerName: p.provider?.name ?? null,
        productName: p.name,
      })),
    )

    return NextResponse.json({
      periodDays: DAYS,
      suggestions: suggestions.map(({ providerName, productName, ...rest }) => ({
        ...rest,
        productName,
        providerName,
      })),
    })
  } catch (error) {
    console.error('[reorder-suggestions]', error)
    return NextResponse.json({ error: 'Error al calcular sugerencias' }, { status: 500 })
  }
}
