import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { emitSessionClosed, emitSessionUpdated, emitSessionDeleted } from '@/lib/tables-sync'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const updateSessionSchema = z.object({
  guests: z.number().int().min(1).optional(),
  notes: z.string().max(500).nullable().optional(),
  action: z.enum(['CLOSE']).optional(),
})

// ─── GET: Get session by ID ───────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sessionId = Number(id)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const session = await db.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        barTable: {
          select: { id: true, number: true, name: true, zone: true },
        },
        customer: {
          select: { id: true, name: true, phone: true },
        },
        comandaItems: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, session.storeId)
    if (storeAccessErr) return storeAccessErr

    // Calculate session totals from comanda items
    const pendingItems = session.comandaItems.filter((i) => i.status === 'PENDING')
    const servedItems = session.comandaItems.filter((i) => i.status === 'SERVED')
    const paidItems = session.comandaItems.filter((i) => i.status === 'PAID')

    return NextResponse.json({
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
      comandaItems: session.comandaItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        product: item.product,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      orders: session.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        total: Number(order.total),
        createdAt: order.createdAt.toISOString(),
      })),
      summary: {
        totalItems: session.comandaItems.length,
        pendingCount: pendingItems.length,
        servedCount: servedItems.length,
        paidCount: paidItems.length,
        pendingTotal: pendingItems.reduce((sum, i) => sum + Number(i.total), 0),
        servedTotal: servedItems.reduce((sum, i) => sum + Number(i.total), 0),
        paidTotal: paidItems.reduce((sum, i) => sum + Number(i.total), 0),
        grandTotal: session.comandaItems.reduce((sum, i) => sum + Number(i.total), 0),
      },
    })
  } catch (error) {
    logger.error('GET /api/tables/sessions/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener la sesión' }, { status: 500 })
  }
}

// ─── PUT: Update session ──────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sessionId = Number(id)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateSessionSchema.parse(body)

    const existing = await db.tableSession.findUnique({ where: { id: sessionId } })
    if (!existing) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // If closing the session, check for pending or served items that haven't been paid
    if (data.action === 'CLOSE') {
      if (existing.status === 'CLOSED') {
        return NextResponse.json(
          { error: 'La sesión ya está cerrada' },
          { status: 400 },
        )
      }

      const unpaidItems = await db.comandaItem.count({
        where: {
          tableSessionId: sessionId,
          status: { in: ['PENDING', 'SERVED'] },
        },
      })

      if (unpaidItems > 0) {
        return NextResponse.json(
          { error: `No se puede cerrar la sesión. Hay ${unpaidItems} item(s) sin pagar` },
          { status: 400 },
        )
      }

      const session = await db.tableSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          ...(data.guests !== undefined && { guests: data.guests }),
          ...(data.notes !== undefined && { notes: data.notes }),
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

      // Broadcast real-time event
      emitSessionClosed(existing.storeId, { id: sessionId, barTableId: existing.barTableId })

      return NextResponse.json({
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
      })
    }

    // Regular update (not closing)
    const session = await db.tableSession.update({
      where: { id: sessionId },
      data: {
        ...(data.guests !== undefined && { guests: data.guests }),
        ...(data.notes !== undefined && { notes: data.notes }),
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

    // Broadcast real-time event
    emitSessionUpdated(existing.storeId, { id: sessionId, barTableId: existing.barTableId })

    return NextResponse.json({
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
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/tables/sessions/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar la sesión' }, { status: 500 })
  }
}

// ─── DELETE: Delete session ───────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sessionId = Number(id)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await db.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: {
          select: { comandaItems: true, orders: true },
        },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // Only allow deletion if no comanda items and no orders
    if (existing._count.comandaItems > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar la sesión porque tiene items en la comanda' },
        { status: 400 },
      )
    }
    if (existing._count.orders > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar la sesión porque tiene órdenes asociadas' },
        { status: 400 },
      )
    }

    await db.tableSession.delete({ where: { id: sessionId } })

    // Broadcast real-time event
    emitSessionDeleted(existing.storeId, existing.barTableId)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('DELETE /api/tables/sessions/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar la sesión' }, { status: 500 })
  }
}
