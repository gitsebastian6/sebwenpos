import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, sanitizeUser } from '@/lib/auth'
import { z } from 'zod'

const loginSchema = z.object({
  phone: z.string().min(10, 'Teléfono mínimo 10 dígitos'),
  password: z.string().min(1, 'Contraseña es requerida'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = loginSchema.parse(body)

    const user = await db.user.findUnique({
      where: { phone: data.phone },
      include: { store: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const valid = await verifyPassword(data.password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    if (!user.store) {
      return NextResponse.json({ error: 'No hay tienda asociada' }, { status: 400 })
    }

    const safeUser = sanitizeUser(user)
    const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64')

    return NextResponse.json({ user: safeUser, store: user.store, token })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
