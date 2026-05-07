import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const validStatuses = ['NEW', 'CONTACTED', 'APPROVED', 'REJECTED', 'CONVERTED'] as const

const updateLeadSchema = z.object({
  status: z.enum(validStatuses).optional(),
  notes: z.string().max(2000).optional(),
  reviewedBy: z.string().max(100).optional(),
})

/**
 * GET /api/super-admin/leads/[id]
 * Returns a single lead by ID with all fields
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    return NextResponse.json(lead)
  } catch (error) {
    logger.error('[SuperAdmin] Error fetching lead:', error)
    return NextResponse.json({ error: 'Error al obtener lead' }, { status: 500 })
  }
}

/**
 * PATCH /api/super-admin/leads/[id]
 * Updates lead status, notes, and reviewer info
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const data = updateLeadSchema.parse(body)

    // Prevent updating already-converted leads
    if (lead.status === 'CONVERTED') {
      return NextResponse.json(
        { error: 'No se puede modificar un lead ya convertido.' },
        { status: 409 },
      )
    }

    const updated = await db.lead.update({
      where: { id: leadId },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.reviewedBy ? { reviewedBy: data.reviewedBy } : {}),
        // Auto-set reviewedAt when status or reviewedBy is provided
        ...(data.status || data.reviewedBy ? { reviewedAt: new Date() } : {}),
      },
    })

    logger.info(`[SuperAdmin] Lead #${leadId} updated: status=${data.status || 'unchanged'}`)

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error updating lead:', error)
    return NextResponse.json({ error: 'Error al actualizar lead' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/leads/[id]
 * Deletes a lead (only if status is NEW or REJECTED)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    if (lead.status !== 'NEW' && lead.status !== 'REJECTED') {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar leads con estado NUEVO o RECHAZADO.' },
        { status: 409 },
      )
    }

    // Delete associated files from disk
    if (lead.rutFilePath || lead.camaraFilePath) {
      const { deleteReceiptFile } = await import('@/lib/file-storage')
      if (lead.rutFilePath) {
        deleteReceiptFile(lead.rutFilePath).catch(() => {})
      }
      if (lead.camaraFilePath) {
        deleteReceiptFile(lead.camaraFilePath).catch(() => {})
      }
    }

    await db.lead.delete({ where: { id: leadId } })

    logger.info(`[SuperAdmin] Lead #${leadId} deleted`)

    return NextResponse.json({ message: 'Lead eliminado correctamente' })
  } catch (error) {
    logger.error('[SuperAdmin] Error deleting lead:', error)
    return NextResponse.json({ error: 'Error al eliminar lead' }, { status: 500 })
  }
}
