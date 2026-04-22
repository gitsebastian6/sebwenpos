import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { withRateLimit, SETUP_RATE_LIMIT, attachRateLimitHeaders } from '@/lib/rate-limiter'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const setupSchema = z.object({
  cedula: z.string()
    .min(5, 'Identificación mínimo 5 caracteres')
    .max(20, 'Identificación máximo 20 caracteres')
    .regex(/^[a-zA-Z0-9]+$/, 'Solo se permiten letras y números'),
  password: z.string()
    .min(8, 'Contraseña mínimo 8 caracteres')
    .max(64, 'Contraseña máximo 64 caracteres'),
  fullName: z.string()
    .min(3, 'Nombre completo es requerido')
    .max(100, 'Nombre completo máximo 100 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
})

/**
 * POST /api/auth/setup
 * Primer setup: crea el Super Admin si NO existe ninguno.
 * Una vez creado, este endpoint se bloquea permanentemente.
 */
export async function POST(req: NextRequest) {
  // ─── Rate Limiting: 3 intentos por 5 minutos por IP ───
  const rl = withRateLimit(req, 'setup', SETUP_RATE_LIMIT)
  if (!rl.allowed) return rl.response

  try {
    // ─── Gate 1: No Super Admin puede hacer setup ───
    const anyAdmin = await db.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    })

    if (anyAdmin) {
      return NextResponse.json({
        error: 'El sistema ya está configurado. Inicie sesión con las credenciales del Super Administrador.',
      }, { status: 403 })
    }

    // ─── Gate 2: Validar payload ───
    const body = await req.json()
    const data = setupSchema.parse(body)

    // ─── Gate 3: Verificar que la cédula no esté en uso ───
    const existingUser = await db.user.findUnique({
      where: { cedula: data.cedula },
    })
    if (existingUser) {
      return NextResponse.json({
        error: 'Esta identificación ya está registrada en el sistema.',
      }, { status: 409 })
    }

    // ─── Crear Super Admin ───
    const passwordHash = await hashPassword(data.password)
    const admin = await db.user.create({
      data: {
        cedula: data.cedula,
        fullName: data.fullName,
        email: data.email || null,
        phone: null,
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    })

    // Log de auditoría (sin exponer datos sensibles)
    logger.info(`[Setup] Super Admin creado: ID=${admin.id}, cedula=${admin.cedula}`)

    return attachRateLimitHeaders(
      NextResponse.json({
        message: 'Super Administrador creado exitosamente. Ya puede iniciar sesión.',
        created: true,
      }, { status: 201 }),
      rl.result,
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      )
    }
    logger.error('[Setup] Error creando Super Admin:', error)
    return NextResponse.json(
      { error: 'Error al crear el Super Administrador' },
      { status: 500 },
    )
  }
}
