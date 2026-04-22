import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'

const recoverSchema = z.object({
  phone: z.string().min(10, 'Teléfono mínimo 10 dígitos'),
  cedula: z.string().min(1, 'Cédula es requerida para verificación'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
})

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = recoverSchema.parse(body)

    // Find user by phone AND cédula (double verification)
    const user = await db.user.findFirst({
      where: {
        phone: data.phone,
        cedula: data.cedula,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'No se encontró un usuario con ese teléfono y número de documento' },
        { status: 404 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Tu cuenta está desactivada. Contacta al administrador.' },
        { status: 403 }
      )
    }

    const passwordHash = await hashPassword(data.newPassword)

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return NextResponse.json({
      message: 'Contraseña actualizada correctamente',
      user: {
        id: user.id,
        fullName: user.fullName,
        cedula: user.cedula,
        phone: user.phone,
      },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Recover password error:', error)
    return NextResponse.json({ error: 'Error al recuperar contraseña' }, { status: 500 })
  }
}

// GET /api/auth/recover-password?phone=XXX — Check if phone exists (for recovery flow)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json({ error: 'Teléfono es requerido' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { phone },
      select: {
        id: true,
        fullName: true,
        cedula: true,
        documentType: true,
        isActive: true,
      },
    })

    if (!user) {
      return NextResponse.json({ found: false }, { status: 200 })
    }

    // Mask the cédula for privacy (show last 4 digits)
    const maskedCedula = user.cedula
      ? user.cedula.slice(0, Math.max(0, user.cedula.length - 4)) + '****'
      : null

    return NextResponse.json({
      found: true,
      fullName: user.fullName,
      documentType: user.documentType,
      maskedCedula,
      isActive: user.isActive,
    })
  } catch (error) {
    console.error('Recovery lookup error:', error)
    return NextResponse.json({ error: 'Error al buscar usuario' }, { status: 500 })
  }
}
