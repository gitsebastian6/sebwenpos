import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const createContactSchema = z.object({
  fullName: z.string().min(2).max(200),
  cedula: z.string().max(20).optional(),
  role: z.enum(['REPRESENTANTE_LEGAL', 'CONTADOR', 'ENCARGADO', 'OTRO']).default('OTRO'),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  isPrimary: z.boolean().optional().default(false),
})

/**
 * GET /api/super-admin/leads/[id]/contacts
 * Lists additional contacts for a lead (accountant, on-site manager, etc.) —
 * the primary owner/legal-rep contact lives directly on Lead for compatibility.
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

    const contacts = await db.contact.findMany({
      where: { leadId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ contacts })
  } catch (error) {
    logger.error('[SuperAdmin] Error listing lead contacts:', error)
    return NextResponse.json({ error: 'Error al listar contactos' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/leads/[id]/contacts
 * Adds a contact to a lead.
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
    const data = createContactSchema.parse(body)

    if (data.isPrimary) {
      await db.contact.updateMany({ where: { leadId, isPrimary: true }, data: { isPrimary: false } })
    }

    const contact = await db.contact.create({
      data: {
        leadId,
        fullName: data.fullName.trim(),
        cedula: data.cedula?.trim() || null,
        role: data.role,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        isPrimary: data.isPrimary,
      },
    })

    return NextResponse.json({ contact }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error creating lead contact:', error)
    return NextResponse.json({ error: 'Error al crear contacto' }, { status: 500 })
  }
}
