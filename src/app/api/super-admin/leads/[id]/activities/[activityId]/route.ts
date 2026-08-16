import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/super-admin/leads/[id]/activities/[activityId]
 * Marks a TASK-type activity as completed (or reopens it).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  try {
    const { id: idStr, activityId: activityIdStr } = await params
    const leadId = parseInt(idStr, 10)
    const activityId = parseInt(activityIdStr, 10)
    if (isNaN(leadId) || isNaN(activityId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const activity = await db.leadActivity.findFirst({ where: { id: activityId, leadId } })
    if (!activity) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const completed = body.completed !== false

    const updated = await db.leadActivity.update({
      where: { id: activityId },
      data: { completedAt: completed ? new Date() : null },
    })

    return NextResponse.json({ activity: updated })
  } catch (error) {
    logger.error('[SuperAdmin] Error updating lead activity:', error)
    return NextResponse.json({ error: 'Error al actualizar actividad' }, { status: 500 })
  }
}
