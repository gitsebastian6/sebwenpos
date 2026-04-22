import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { isWhatsAppOTPEnabled, sendOTPViaWhatsApp } from '@/lib/messagebird'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

import { withRateLimit } from '@/lib/rate-limiter'

const SEND_OTP_RATE_LIMIT = { maxRequests: 3, windowSeconds: 300 }

const sendOtpSchema = z.object({
  cedula: z.string().min(3, 'Identificación mínimo 3 caracteres'),
})

export async function POST(req: NextRequest) {
  // Rate limiting: 3 requests per 5 minutes per IP
  const rl = withRateLimit(req, 'send-otp', SEND_OTP_RATE_LIMIT)
  if (!rl.allowed) return rl.response

  try {
    const body = await req.json()
    const data = sendOtpSchema.parse(body)

    // Check if WhatsApp OTP is enabled globally
    const enabled = await isWhatsAppOTPEnabled()
    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        error: 'WhatsApp OTP no está habilitado. Usa la recuperación por pregunta de seguridad.',
      }, { status: 400 })
    }

    // Find user by cedula
    const user = await db.user.findUnique({
      where: { cedula: data.cedula },
      select: { id: true, phone: true, fullName: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (!user.phone) {
      return NextResponse.json({
        error: 'No tienes un número de teléfono registrado. Contacta al soporte.',
      }, { status: 400 })
    }

    // Send OTP (or simulate in test mode)
    const result = await sendOTPViaWhatsApp(user.phone, user.id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    logger.info(`WhatsApp OTP sent to user ${user.id} (${result.maskedPhone})${result.testCode ? ' [TEST MODE]' : ''}`)

    // Build response — include testCode only in test mode
    const response: Record<string, unknown> = {
      success: true,
      enabled: true,
      userId: user.id,
      maskedPhone: result.maskedPhone,
      message: result.testCode
        ? 'MODO PRUEBA — Código generado (no se envió WhatsApp).'
        : 'Se envió un código de verificación a tu WhatsApp.',
    }
    if (result.testCode) {
      response.testCode = result.testCode
      response.testMode = true
    }

    return NextResponse.json(response)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Send OTP error:', error)
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 })
  }
}
