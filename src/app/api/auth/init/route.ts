import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/init
 * Verifica si el sistema necesita configuración inicial.
 * Retorna { needsSetup: true } si no existe ningún Super Admin.
 */
export async function GET() {
  try {
    const anyAdmin = await db.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })

    return NextResponse.json({ needsSetup: !anyAdmin })
  } catch (error) {
    logger.error('Error verificando estado de setup:', error)
    return NextResponse.json({ error: 'Error al verificar' }, { status: 500 })
  }
}
