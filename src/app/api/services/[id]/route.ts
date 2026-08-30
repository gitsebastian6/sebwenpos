import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Schemas ─────────────────────────────────────────────────

const updateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.number().int().min(0).optional(),
  icon: z.string().min(1).max(50).optional(),
  unit: z.string().min(1).max(50).optional(),
  commissionRate: z.number().int().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
})

const updateTransactionSchema = z.object({
  serviceId: z.number().int().positive().optional(),
  // Decimal (QTY_PRECISION=3): cantidades fraccionadas permitidas (ej. 1.5 h).
  quantity: z.number().positive('La cantidad debe ser mayor a 0').optional(),
  unitPrice: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(['COMPLETED', 'CANCELLED']).optional(),
})

// ─── GET ─────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const service = await db.service.findUnique({
      where: { id: sid },
      include: {
        serviceTransactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!service) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_request, service.storeId)
    if (storeAccessErr) return storeAccessErr

    return NextResponse.json({
      ...service,
      price: Number(service.price),
      serviceTransactions: service.serviceTransactions.map(t => ({
        ...t,
        unitPrice: Number(t.unitPrice),
        totalAmount: Number(t.totalAmount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    })
  } catch (error) {
    logger.error('GET /api/services/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener servicio' }, { status: 500 })
  }
}

// ─── PUT ─────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateServiceSchema.parse(body)

    const existing = await db.service.findUnique({ where: { id: sid } })
    if (!existing) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'services')
    if (permErr) return permErr

    const updated = await db.service.update({
      where: { id: sid },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.commissionRate !== undefined && { commissionRate: data.commissionRate }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })

    return NextResponse.json({ id: updated.id, name: updated.name })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/services/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar servicio' }, { status: 500 })
  }
}

// ─── DELETE ──────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await db.service.findUnique({ where: { id: sid } })
    if (!existing) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_request, existing.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(_request, 'services')
    if (permErr) return permErr

    // Delete related transactions first
    await db.serviceTransaction.deleteMany({
      where: { serviceId: sid },
    })

    await db.service.delete({ where: { id: sid } })
    return NextResponse.json({ message: 'Servicio eliminado' })
  } catch (error) {
    logger.error('DELETE /api/services/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar servicio' }, { status: 500 })
  }
}
