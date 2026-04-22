import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { generateToken, verifyToken } from '@/lib/auth-helpers'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

import { withRateLimit } from '@/lib/rate-limiter'

const RESET_PW_RATE_LIMIT = { maxRequests: 5, windowSeconds: 300 }

const requestResetSchema = z.object({
  cedula: z.string().min(3, 'Identificación mínimo 3 caracteres'),
})

const verifyAndResetSchema = z.object({
  userId: z.number().int().positive(),
  answer: z.string().min(1, 'La respuesta es requerida'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
})

const SECURITY_QUESTION_LABELS: Record<string, string> = {
  petName: '¿Cuál es el nombre de tu primera mascota?',
  motherName: '¿Cuál es el nombre de tu madre?',
  birthCity: '¿En qué ciudad naciste?',
  firstSchool: '¿Cuál fue tu primer colegio?',
  favoriteFood: '¿Cuál es tu comida favorita?',
}

export async function POST(req: NextRequest) {
  // Rate limiting: 5 requests per 5 minutes per IP
  const rl = withRateLimit(req, 'reset-password', RESET_PW_RATE_LIMIT)
  if (!rl.allowed) return rl.response

  try {
    const body = await req.json()

    // ── Step 1: Request reset (get security question) ──
    if (body.cedula && !body.userId) {
      const data = requestResetSchema.parse(body)

      const user = await db.user.findUnique({
        where: { cedula: data.cedula },
        select: { id: true, securityQuestion: true },
      })

      if (!user) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
      }

      if (!user.securityQuestion) {
        return NextResponse.json(
          { error: 'No tienes pregunta de seguridad configurada. Contacta al soporte.' },
          { status: 400 },
        )
      }

      // Generate a signed, time-limited reset token (10 min) instead of exposing raw userId
      const resetToken = await generateToken({
        userId: user.id,
        role: 'RESET',
        storeId: null,
        expiryMs: 10 * 60 * 1000, // 10 minutes
      })
      return NextResponse.json({
        step: 'question',
        question: SECURITY_QUESTION_LABELS[user.securityQuestion] || user.securityQuestion,
        resetToken,
      })
    }

    // ── Step 2: Verify answer & reset password ──
    if (body.resetToken && body.answer && body.newPassword) {
      // Verify the reset token server-side
      const tokenPayload = await verifyToken(body.resetToken)
      if (!tokenPayload || tokenPayload.role !== 'RESET') {
        return NextResponse.json({ error: 'Token de recuperación inválido o expirado. Solicita uno nuevo.' }, { status: 401 })
      }

      const resetData = z.object({
        answer: z.string().min(1, 'La respuesta es requerida'),
        newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
      }).parse({ answer: body.answer, newPassword: body.newPassword })

      const user = await db.user.findUnique({
        where: { id: tokenPayload.userId },
        select: { id: true, securityAnswer: true },
      })

      if (!user) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
      }

      if (!user.securityAnswer) {
        return NextResponse.json(
          { error: 'No tienes pregunta de seguridad configurada. Contacta al soporte.' },
          { status: 400 },
        )
      }

      const isCorrect = await verifyPassword(resetData.answer.trim().toLowerCase(), user.securityAnswer)
      if (!isCorrect) {
        return NextResponse.json({ error: 'Respuesta incorrecta' }, { status: 401 })
      }

      const hashedPassword = await hashPassword(resetData.newPassword)
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: hashedPassword },
      })

      logger.info(`Password reset successful for user ${user.id}`)

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Solicitud inválida. Proporciona cédula o resetToken + respuesta + nueva contraseña.' }, { status: 400 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Reset password error:', error)
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 })
  }
}
