import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { verifyToken, extractTokenFromRequest } from '@/lib/auth-helpers'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const VALID_QUESTIONS = ['petName', 'motherName', 'birthCity', 'firstSchool', 'favoriteFood'] as const

const putSchema = z.object({
  userId: z.number().int().positive(),
  question: z.enum(VALID_QUESTIONS, { message: 'Pregunta de seguridad no válida' }),
  answer: z.string().min(2, 'La respuesta debe tener al menos 2 caracteres'),
})

const SECURITY_QUESTION_LABELS: Record<string, string> = {
  petName: '¿Cuál es el nombre de tu primera mascota?',
  motherName: '¿Cuál es el nombre de tu madre?',
  birthCity: '¿En qué ciudad naciste?',
  firstSchool: '¿Cuál fue tu primer colegio?',
  favoriteFood: '¿Cuál es tu comida favorita?',
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth: verify user is authenticated ──
    const authHeader = req.headers.get('authorization')
    const token = extractTokenFromRequest(authHeader)
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })
    }

    // User can only query their own security question
    const { searchParams } = new URL(req.url)
    const userIdParam = searchParams.get('userId')

    if (!userIdParam) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const userId = parseInt(userIdParam, 10)
    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json({ error: 'userId inválido' }, { status: 400 })
    }

    // Only allow querying own security question (or SUPER_ADMIN can query any)
    if (payload.role !== 'SUPER_ADMIN' && payload.userId !== userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, securityQuestion: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      hasQuestion: !!user.securityQuestion,
      question: user.securityQuestion
        ? (SECURITY_QUESTION_LABELS[user.securityQuestion] || user.securityQuestion)
        : null,
    })
  } catch (error: unknown) {
    logger.error('Get security question error:', error)
    return NextResponse.json({ error: 'Error al consultar pregunta de seguridad' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    // ── Auth: verify the user is setting their own question ──
    const authHeader = req.headers.get('authorization')
    const token = extractTokenFromRequest(authHeader)
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })
    }

    const body = await req.json()
    const data = putSchema.parse(body)

    // Only allow the user themselves to set their security question
    if (data.userId !== payload.userId) {
      return NextResponse.json({ error: 'No autorizado para modificar este usuario' }, { status: 403 })
    }

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id: data.userId },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Hash the answer (case-insensitive)
    const hashedAnswer = await hashPassword(data.answer.trim().toLowerCase())

    await db.user.update({
      where: { id: data.userId },
      data: {
        securityQuestion: data.question,
        securityAnswer: hashedAnswer,
      },
    })

    logger.info(`Security question set for user ${data.userId}`)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Set security question error:', error)
    return NextResponse.json({ error: 'Error al guardar pregunta de seguridad' }, { status: 500 })
  }
}
