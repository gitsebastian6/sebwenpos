import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { verifyOTP } from '@/lib/messagebird'
import { hashPassword } from '@/lib/auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

import { withRateLimit } from '@/lib/rate-limiter'

const VERIFY_OTP_RATE_LIMIT = { maxRequests: 5, windowSeconds: 300 }

const verifyOtpSchema = z.object({
  userId: z.number().int().positive(),
  otp: z.string().length(6, 'El código debe tener 6 dígitos'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
})

export async function POST(req: NextRequest) {
  // Rate limiting: 5 requests per 5 minutes per IP
  const rl = withRateLimit(req, 'verify-otp', VERIFY_OTP_RATE_LIMIT)
  if (rl.allowed === false) return rl.response

  try {
    const body = await req.json()
    const data = verifyOtpSchema.parse(body)

    // Find user with phone
    const user = await db.user.findUnique({
      where: { id: data.userId },
      select: { id: true, phone: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (!user.phone) {
      return NextResponse.json({
        error: 'No tienes un número de teléfono registrado.',
      }, { status: 400 })
    }

    // Verify OTP
    const result = await verifyOTP(data.userId, user.phone, data.otp)

    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    // Reset password
    const hashedPassword = await hashPassword(data.newPassword)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    })

    logger.info(`Password reset via WhatsApp OTP for user ${user.id}`)

    return NextResponse.json({
      success: true,
      message: 'Contraseña restablecida correctamente.',
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Verify OTP error:', error)
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 })
  }
}
