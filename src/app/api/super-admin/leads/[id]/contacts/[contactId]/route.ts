import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/super-admin/leads/[id]/contacts/[contactId]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const { id: idStr, contactId: contactIdStr } = await params
    const leadId = parseInt(idStr, 10)
    const contactId = parseInt(contactIdStr, 10)
    if (isNaN(leadId) || isNaN(contactId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const contact = await db.contact.findFirst({ where: { id: contactId, leadId } })
    if (!contact) {
      return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
    }

    await db.contact.delete({ where: { id: contactId } })

    return NextResponse.json({ message: 'Contacto eliminado' })
  } catch (error) {
    logger.error('[SuperAdmin] Error deleting lead contact:', error)
    return NextResponse.json({ error: 'Error al eliminar contacto' }, { status: 500 })
  }
}
