import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getAuthUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const createActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'TASK', 'WHATSAPP', 'EMAIL']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
})

/**
 * GET /api/super-admin/leads/[id]/activities
 * Full activity timeline for a lead — notes, tasks, calls, and system-logged
 * stage/document events — newest first.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const activities = await db.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, fullName: true } } },
    })

    return NextResponse.json({ activities })
  } catch (error) {
    logger.error('[SuperAdmin] Error listing lead activities:', error)
    return NextResponse.json({ error: 'Error al listar actividad' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/leads/[id]/activities
 * Logs a manual note, call, task, or contact attempt for a lead.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { id: true } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const data = createActivitySchema.parse(body)
    const auth = getAuthUser(req)

    const activity = await db.leadActivity.create({
      data: {
        leadId,
        type: data.type,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdById: auth?.userId ?? null,
      },
    })

    return NextResponse.json({ activity }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error creating lead activity:', error)
    return NextResponse.json({ error: 'Error al registrar actividad' }, { status: 500 })
  }
}
