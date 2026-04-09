import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/stores/[id] — Validate store exists
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
      select: {
        id: true,
        name: true,
        currencyCode: true,
        countryCode: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    return NextResponse.json(store)
  } catch (error) {
    console.error('Error validating store:', error)
    return NextResponse.json({ error: 'Error al validar tienda' }, { status: 500 })
  }
}
