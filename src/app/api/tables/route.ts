import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const createTableSchema = z.object({
  storeId: z.number().int().positive(),
  number: z.number().int().positive('El número de mesa debe ser positivo'),
  name: z.string().max(100).optional(),
  capacity: z.number().int().min(1).default(4),
  zone: z.enum(['PRINCIPAL', 'TERRAZA', 'VIP', 'BARRA', 'EXTERIOR']).default('PRINCIPAL'),
})

// ─── GET: List bar tables ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(req, storeId)
    if (storeAccessErr) return storeAccessErr

    const tables = await db.barTable.findMany({
      where: { storeId },
      orderBy: [{ number: 'asc' }],
    })

    // For each table, check for an open session
    const tablesWithSession = await Promise.all(
      tables.map(async (table) => {
        const openSession = await db.tableSession.findFirst({
          where: { barTableId: table.id, status: 'OPEN' },
          select: {
            id: true,
            guests: true,
            startedAt: true,
            customer: { select: { id: true, name: true } },
            _count: { select: { comandaItems: true } },
          },
        })

        // Calculate total consumed for the session
        let totalConsumed: number | null = null
        if (openSession) {
          const comandaItems = await db.comandaItem.findMany({
            where: { tableSessionId: openSession.id },
            select: { total: true },
          })
          totalConsumed = comandaItems.reduce((sum, ci) => sum + Number(ci.total), 0)
        }

        return {
          id: table.id,
          storeId: table.storeId,
          number: table.number,
          name: table.name,
          capacity: table.capacity,
          zone: table.zone,
          isActive: table.isActive,
          createdAt: table.createdAt.toISOString(),
          activeSession: openSession
            ? {
                id: openSession.id,
                guests: openSession.guests,
                startedAt: openSession.startedAt.toISOString(),
                customer: openSession.customer,
                _count: { comandaItems: openSession._count.comandaItems },
                totalConsumed,
              }
            : null,
        }
      }),
    )

    return NextResponse.json(tablesWithSession)
  } catch (error) {
    logger.error('GET /api/tables error:', error)
    return NextResponse.json({ error: 'Error al obtener las mesas' }, { status: 500 })
  }
}

// ─── POST: Create bar table ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createTableSchema.parse(body)

    // Verify store access
    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr

    // Verify store exists
    const store = await db.store.findUnique({ where: { id: data.storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const table = await db.barTable.create({
      data: {
        storeId: data.storeId,
        number: data.number,
        name: data.name || null,
        capacity: data.capacity,
        zone: data.zone,
      },
    })

    return NextResponse.json(table, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json(
        { error: 'Ya existe una mesa con ese número en esta tienda' },
        { status: 409 },
      )
    }
    logger.error('POST /api/tables error:', error)
    return NextResponse.json({ error: 'Error al crear la mesa' }, { status: 500 })
  }
}
