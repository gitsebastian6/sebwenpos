import { requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { roundQty, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const updateTransactionSchema = z.object({
  // Decimal (QTY_PRECISION=3): cantidades fraccionadas permitidas (ej. 1.5 h).
  // El total se recalcula server-side si cambia quantity o unitPrice.
  quantity: z.number().positive('La cantidad debe ser mayor a 0').optional(),
  unitPrice: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(['COMPLETED', 'CANCELLED']).optional(),
})

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
    const data = updateTransactionSchema.parse(body)

    const existing = await db.serviceTransaction.findUnique({
      where: { id: sid },
      include: { service: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.service.storeId)
    if (storeAccessErr) return storeAccessErr

    // Si cambia la cantidad o el precio unitario, el total se recalcula aquí
    // (nunca confiado del cliente) y se redondea a COP entero.
    const newQuantity = data.quantity !== undefined ? roundQty(data.quantity) : existing.quantity
    const newUnitPrice = data.unitPrice !== undefined ? data.unitPrice : existing.unitPrice
    const newTotalAmount = Math.round(toNum(newQuantity) * newUnitPrice)

    const updated = await db.serviceTransaction.update({
      where: { id: sid },
      data: {
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.unitPrice !== undefined && { unitPrice: data.unitPrice }),
        totalAmount: newTotalAmount,
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: { service: true },
    })

    return NextResponse.json({
      id: updated.id,
      serviceId: updated.serviceId,
      quantity: toNum(updated.quantity),
      unitPrice: Number(updated.unitPrice),
      totalAmount: Number(updated.totalAmount),
      notes: updated.notes,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      service: {
        id: updated.service.id,
        name: updated.service.name,
        icon: updated.service.icon,
        unit: updated.service.unit,
      },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/services/transactions/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar transacción' }, { status: 500 })
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

    const existing = await db.serviceTransaction.findUnique({ where: { id: sid } })
    if (!existing) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_request, existing.serviceId)
    if (storeAccessErr) return storeAccessErr

    await db.serviceTransaction.delete({ where: { id: sid } })
    return NextResponse.json({ message: 'Transacción eliminada' })
  } catch (error) {
    logger.error('DELETE /api/services/transactions/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar transacción' }, { status: 500 })
  }
}
