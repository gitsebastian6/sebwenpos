import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET handler — id from URL params (typed), no additional validation needed
export async function GET(
  _request: NextRequest,
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
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_request, storeId)
    if (storeAccessErr) return storeAccessErr

    return NextResponse.json(store)
  } catch (error) {
    logger.error('Error validating store:', error)
    return NextResponse.json({ error: 'Error al validar tienda' }, { status: 500 })
  }
}
