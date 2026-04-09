import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const openSessionSchema = z.object({
  storeId: z.number().int().positive(),
  barTableId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  guests: z.number().int().min(1).default(1),
  notes: z.string().max(500).optional(),
})

// ─── GET: List table sessions ─────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = Number(searchParams.get('storeId'))
    const status = searchParams.get('status')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const where: Record<string, unknown> = { storeId }

    if (status && (status === 'OPEN' || status === 'CLOSED')) {
      where.status = status
    }

    const sessions = await db.tableSession.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }],
      include: {
        barTable: {
          select: { id: true, number: true, name: true, zone: true },
        },
        customer: {
          select: { id: true, name: true, phone: true },
        },
        _count: {
          select: { comandaItems: true, orders: true },
        },
      },
    })

    const result = sessions.map((session) => ({
      id: session.id,
      storeId: session.storeId,
      barTableId: session.barTableId,
      barTable: session.barTable,
      customerId: session.customerId,
      customer: session.customer,
      guests: session.guests,
      status: session.status,
      notes: session.notes,
      startedAt: session.startedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      comandaItemCount: session._count.comandaItems,
      orderCount: session._count.orders,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/tables/sessions error:', error)
    return NextResponse.json({ error: 'Error al obtener las sesiones' }, { status: 500 })
  }
}

// ─── POST: Open table session ─────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = openSessionSchema.parse(body)

    // Verify table exists and is active
    const table = await db.barTable.findUnique({
      where: { id: data.barTableId },
    })
    if (!table) {
      return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }
    if (!table.isActive) {
      return NextResponse.json({ error: 'La mesa está desactivada' }, { status: 400 })
    }
    if (table.storeId !== data.storeId) {
      return NextResponse.json(
        { error: 'La mesa no pertenece a esta tienda' },
        { status: 400 },
      )
    }

    // Verify no open session exists for this table
    const existingSession = await db.tableSession.findFirst({
      where: { barTableId: data.barTableId, status: 'OPEN' },
    })
    if (existingSession) {
      return NextResponse.json(
        { error: 'La mesa ya tiene una sesión abierta' },
        { status: 400 },
      )
    }

    // Verify customer belongs to store if provided
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, storeId: data.storeId },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
      }
    }

    const session = await db.tableSession.create({
      data: {
        storeId: data.storeId,
        barTableId: data.barTableId,
        customerId: data.customerId ?? null,
        guests: data.guests,
        notes: data.notes ?? null,
      },
      include: {
        barTable: {
          select: { id: true, number: true, name: true, zone: true },
        },
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
    })

    return NextResponse.json(
      {
        id: session.id,
        storeId: session.storeId,
        barTableId: session.barTableId,
        barTable: session.barTable,
        customerId: session.customerId,
        customer: session.customer,
        guests: session.guests,
        status: session.status,
        notes: session.notes,
        startedAt: session.startedAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/tables/sessions error:', error)
    return NextResponse.json({ error: 'Error al abrir la sesión' }, { status: 500 })
  }
}
