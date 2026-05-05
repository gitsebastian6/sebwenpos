import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'
import { requireOwner } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Only OWNER or SUPER_ADMIN can reset employee passwords
    const auth = requireOwner(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const userId = parseInt(id)

    const user = await db.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (user.role === 'OWNER') {
      return NextResponse.json({ error: 'No se puede cambiar la contraseña del propietario' }, { status: 403 })
    }

    const body = await req.json()
    const data = resetPasswordSchema.parse(body)

    const passwordHash = await hashPassword(data.newPassword)

    await db.user.update({
      where: { id: userId },
      data: { passwordHash },
    })

    return NextResponse.json({ message: 'Contraseña actualizada correctamente' })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Error resetting password:', error)
    return NextResponse.json({ error: 'Error al actualizar contraseña' }, { status: 500 })
  }
}
