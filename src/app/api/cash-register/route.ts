import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const openShiftSchema = z.object({
  storeId: z.number().int().positive(),
  userId: z.number().int().positive(),
  openingBalance: z.number().int().min(0),
  notes: z.string().max(500).optional(),
})

// GET: List shifts for store
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0')
    const status = searchParams.get('status') // OPEN, CLOSED
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })

    const where: Record<string, unknown> = { storeId }
    if (status && ['OPEN', 'CLOSED'].includes(status)) {
      where.status = status
    }

    const shifts = await db.cashRegister.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ shifts })
  } catch (error) {
    console.error('GET /api/cash-register error:', error)
    return NextResponse.json({ error: 'Error al listar turnos' }, { status: 500 })
  }
}

// POST: Open new shift
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = openShiftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { storeId, userId, openingBalance, notes } = parsed.data

    // Check no OPEN shift exists for store
    const existing = await db.cashRegister.findFirst({
      where: { storeId, status: 'OPEN' },
    })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un turno abierto para esta tienda' }, { status: 409 })
    }

    const shift = await db.cashRegister.create({
      data: {
        storeId,
        userId,
        openingBalance,
        notes,
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
      },
    })

    return NextResponse.json({ shift }, { status: 201 })
  } catch (error) {
    console.error('POST /api/cash-register error:', error)
    return NextResponse.json({ error: 'Error al abrir caja' }, { status: 500 })
  }
}
