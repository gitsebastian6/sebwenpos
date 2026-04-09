import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: Get current open shift for store
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0')

    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })

    const shift = await db.cashRegister.findFirst({
      where: { storeId, status: 'OPEN' },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { openedAt: 'desc' },
    })

    if (!shift) {
      return NextResponse.json({ shift: null })
    }

    // Get order count for this shift
    const orderCount = await db.order.count({
      where: {
        storeId,
        status: { in: ['COMPLETED', 'CREDIT'] },
        createdAt: { gte: shift.openedAt },
      },
    })

    return NextResponse.json({ shift, orderCount })
  } catch (error) {
    console.error('GET /api/cash-register/current error:', error)
    return NextResponse.json({ error: 'Error al obtener turno actual' }, { status: 500 })
  }
}
