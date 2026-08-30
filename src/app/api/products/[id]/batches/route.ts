import { sortBatchesFEFO } from '@/domain/inventory/batch-consumer'
import { requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products/[id]/batches?storeId=X
// Lotes ACTIVE del producto ordenados FEFO (vencen antes primero; sin fecha al
// final por createdAt) — alimenta el selector de lote de los diálogos de
// ajuste / pérdida / devolución.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const productId = Number(id)
    const storeId = Number(req.nextUrl.searchParams.get('storeId'))
    if (!productId || !storeId) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const accessErr = requireStoreAccess(req, storeId)
    if (accessErr) return accessErr

    const rows = await db.batch.findMany({
      where: { productId, storeId, status: 'ACTIVE', quantity: { gt: 0 } },
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        manufacturingDate: true,
        quantity: true,
        unitCost: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      sortBatchesFEFO(rows).map((b) => ({
        id: b.id,
        lotNumber: b.lotNumber,
        expiryDate: b.expiryDate?.toISOString() ?? null,
        manufacturingDate: b.manufacturingDate?.toISOString() ?? null,
        quantity: toNum(b.quantity),
        unitCost: b.unitCost,
      }))
    )
  } catch (error) {
    logger.error('GET /api/products/[id]/batches error:', error)
    return NextResponse.json({ error: 'Error al obtener lotes' }, { status: 500 })
  }
}
