import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const resetSchema = z.object({
  userId: z.number().int().positive(),
  newPassword: z.string().min(6, 'Contraseña mín. 6 caracteres'),
})

/**
 * POST /api/super-admin/reset-password
 * Permite al Super Admin resetear la contraseña de cualquier usuario
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = resetSchema.parse(body)

    const user = await db.user.findUnique({ where: { id: data.userId } })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (user.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'No se puede resetear la contraseña del Super Admin' }, { status: 403 })
    }

    const passwordHash = await hashPassword(data.newPassword)
    await db.user.update({
      where: { id: data.userId },
      data: { passwordHash },
    })

    return NextResponse.json({ message: 'Contraseña actualizada exitosamente' })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Reset password error:', error)
    return NextResponse.json({ error: 'Error al resetear contraseña' }, { status: 500 })
  }
}
