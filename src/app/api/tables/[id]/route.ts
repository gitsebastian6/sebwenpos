import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const updateTableSchema = z.object({
  name: z.string().max(100).nullable().optional(),
  capacity: z.number().int().min(1).optional(),
  zone: z.enum(['PRINCIPAL', 'TERRAZA', 'VIP', 'BARRA', 'EXTERIOR']).optional(),
  isActive: z.boolean().optional(),
})

// ─── GET: Single bar table ────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const tableId = Number(id)
    if (isNaN(tableId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const table = await db.barTable.findUnique({
      where: { id: tableId },
    })

    if (!table) {
      return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }

    const openSession = await db.tableSession.findFirst({
      where: { barTableId: tableId, status: 'OPEN' },
      select: {
        id: true,
        guests: true,
        startedAt: true,
        customer: { select: { id: true, name: true } },
        _count: { select: { comandaItems: true } },
      },
    })

    return NextResponse.json({
      id: table.id,
      storeId: table.storeId,
      number: table.number,
      name: table.name,
      capacity: table.capacity,
      zone: table.zone,
      isActive: table.isActive,
      createdAt: table.createdAt.toISOString(),
      currentSession: openSession
        ? {
            id: openSession.id,
            guests: openSession.guests,
            startedAt: openSession.startedAt.toISOString(),
            customer: openSession.customer,
            itemCount: openSession._count.comandaItems,
          }
        : null,
    })
  } catch (error) {
    console.error('GET /api/tables/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener la mesa' }, { status: 500 })
  }
}

// ─── PUT: Update bar table ────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const tableId = Number(id)
    if (isNaN(tableId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateTableSchema.parse(body)

    const existing = await db.barTable.findUnique({ where: { id: tableId } })
    if (!existing) {
      return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }

    const table = await db.barTable.update({
      where: { id: tableId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.zone !== undefined && { zone: data.zone }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })

    return NextResponse.json(table)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('PUT /api/tables/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar la mesa' }, { status: 500 })
  }
}

// ─── DELETE: Delete bar table ─────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const tableId = Number(id)
    if (isNaN(tableId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await db.barTable.findUnique({ where: { id: tableId } })
    if (!existing) {
      return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }

    // Check for open sessions
    const openSession = await db.tableSession.findFirst({
      where: { barTableId: tableId, status: 'OPEN' },
    })
    if (openSession) {
      return NextResponse.json(
        { error: 'No se puede eliminar la mesa porque tiene una sesión abierta' },
        { status: 400 },
      )
    }

    await db.barTable.delete({ where: { id: tableId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/tables/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar la mesa' }, { status: 500 })
  }
}
