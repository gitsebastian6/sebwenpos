import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { withRateLimit, attachRateLimitHeaders } from '@/lib/rate-limiter'
import { logger } from '@/lib/logger'
import { saveReceiptFile } from '@/lib/file-storage'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Rate limit: 3 per hour per IP ───
const TRIAL_SIGNUP_RATE_LIMIT = {
  maxRequests: 3,
  windowSeconds: 3600,
}

// ─── Schema validation ───
const trialSignupSchema = z.object({
  ownerCedula: z.string().min(5, 'Cédula mínimo 5 caracteres').max(20),
  ownerPassword: z.string().min(6, 'Contraseña mínimo 6 caracteres').max(64),
  ownerFullName: z.string().min(2, 'Nombre completo mínimo 2 caracteres').max(100),
  ownerEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  ownerPhone: z.string().min(7, 'Teléfono mínimo 7 caracteres').optional().or(z.literal('')),
  storeName: z.string().min(2, 'Nombre de la tienda mínimo 2 caracteres').max(100),
  nit: z.string().min(5, 'NIT/RUT mínimo 5 caracteres').max(20),
  legalName: z.string().min(2, 'Razón social mínimo 2 caracteres').max(150),
  address: z.string().optional().or(z.literal('')),
  cityName: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  storePhone: z.string().optional().or(z.literal('')),
  businessType: z.enum(['NATURAL', 'JURIDICA']).default('NATURAL'),
  hasCamaraComercio: z.boolean().optional(),
  registrationNumber: z.string().optional().or(z.literal('')),
  // ── Optional file uploads ──
  rutFileBase64: z.string().optional().or(z.literal('')),
  rutFileName: z.string().optional().or(z.literal('')),
  rutFileType: z.string().optional().or(z.literal('')),
  camaraFileBase64: z.string().optional().or(z.literal('')),
  camaraFileName: z.string().optional().or(z.literal('')),
  camaraFileType: z.string().optional().or(z.literal('')),
})

/**
 * POST /api/auth/trial-signup
 * Public self-service endpoint for requesting a free trial.
 *
 * This ONLY creates a Lead record in the CRM.
 * It does NOT create a User, Store, Subscription, or auth token.
 * The super admin must review and approve the lead before any account is created.
 */
export async function POST(req: NextRequest) {
  // ─── Rate Limiting: 3 intentos por hora por IP ───
  const rl = withRateLimit(req, 'trial-signup', TRIAL_SIGNUP_RATE_LIMIT)
  if (rl.allowed === false) return rl.response

  try {
    // ─── Validate payload ───
    const body = await req.json()
    const data = trialSignupSchema.parse(body)

    // ─── Gate 1: Check cedula not already registered as user ───
    const existingUser = await db.user.findUnique({
      where: { cedula: data.ownerCedula },
    })
    if (existingUser) {
      return NextResponse.json({
        error: 'Esta identificación ya tiene una cuenta registrada. Si olvidaste tu contraseña, usa la opción de recuperación.',
      }, { status: 409 })
    }

    // ─── Gate 2: Check no duplicate lead with same cedula ───
    const existingLead = await db.lead.findFirst({
      where: {
        ownerCedula: data.ownerCedula,
        status: { in: ['NEW', 'CONTACTED', 'APPROVED'] },
      },
    })
    if (existingLead) {
      return NextResponse.json({
        error: 'Ya tienes una solicitud pendiente. Nuestro equipo se pondrá en contacto contigo pronto.',
      }, { status: 409 })
    }

    // ─── Gate 3: Check no duplicate lead with same NIT ───
    const existingNitLead = await db.lead.findFirst({
      where: {
        nit: data.nit,
        status: { in: ['NEW', 'CONTACTED', 'APPROVED'] },
      },
    })
    if (existingNitLead) {
      return NextResponse.json({
        error: 'Ya existe una solicitud pendiente para este NIT/RUT.',
      }, { status: 409 })
    }

    // ─── Hash password (stored securely, only used when admin creates the account) ───
    const passwordHash = await hashPassword(data.ownerPassword)

    // ─── Save uploaded files to disk (if provided) ───
    let rutFilePath: string | null = null
    let rutFileSize: number | null = null
    let camaraFilePath: string | null = null
    let camaraFileSize: number | null = null

    if (data.rutFileBase64 && data.rutFileName && data.rutFileType) {
      try {
        rutFilePath = await saveReceiptFile({
          base64Data: data.rutFileBase64,
          fileName: data.rutFileName,
          fileType: data.rutFileType,
        })
        // Calculate approximate file size from base64
        rutFileSize = Math.floor((data.rutFileBase64.length * 3) / 4)
        logger.info(`[TrialSignup] RUT file saved: ${rutFilePath} (${rutFileSize} bytes)`)
      } catch (fileError) {
        logger.error('[TrialSignup] Error saving RUT file:', fileError)
        return NextResponse.json(
          { error: 'Error al guardar el archivo RUT. Por favor intenta de nuevo.' },
          { status: 500 },
        )
      }
    }

    if (data.camaraFileBase64 && data.camaraFileName && data.camaraFileType) {
      try {
        camaraFilePath = await saveReceiptFile({
          base64Data: data.camaraFileBase64,
          fileName: data.camaraFileName,
          fileType: data.camaraFileType,
        })
        // Calculate approximate file size from base64
        camaraFileSize = Math.floor((data.camaraFileBase64.length * 3) / 4)
        logger.info(`[TrialSignup] Cámara file saved: ${camaraFilePath} (${camaraFileSize} bytes)`)
      } catch (fileError) {
        logger.error('[TrialSignup] Error saving Cámara file:', fileError)
        // Clean up RUT file if it was already saved
        if (rutFilePath) {
          const { deleteReceiptFile } = await import('@/lib/file-storage')
          deleteReceiptFile(rutFilePath).catch(() => {})
        }
        return NextResponse.json(
          { error: 'Error al guardar el archivo de Cámara de Comercio. Por favor intenta de nuevo.' },
          { status: 500 },
        )
      }
    }

    // ─── Create Lead record only (no User, no Store, no Subscription) ───
    await db.lead.create({
      data: {
        ownerFullName: data.ownerFullName.trim(),
        ownerCedula: data.ownerCedula.trim(),
        ownerEmail: data.ownerEmail?.trim() || null,
        ownerPhone: data.ownerPhone?.trim() || null,
        ownerPassword: passwordHash,
        storeName: data.storeName.trim(),
        nit: data.nit.trim(),
        legalName: data.legalName.trim(),
        businessType: data.businessType,
        storePhone: data.storePhone?.trim() || null,
        department: data.department || null,
        cityName: data.cityName?.trim() || null,
        address: data.address?.trim() || null,
        hasCamaraComercio: data.hasCamaraComercio ?? false,
        registrationNumber: data.registrationNumber?.trim() || null,
        // ── File paths ──
        rutFilePath,
        rutFileName: data.rutFileName?.trim() || null,
        rutFileSize,
        rutFileType: data.rutFileType?.trim() || null,
        camaraFilePath,
        camaraFileName: data.camaraFileName?.trim() || null,
        camaraFileSize,
        camaraFileType: data.camaraFileType?.trim() || null,
        status: 'NEW',
        source: 'WEB',
      },
    })

    logger.info(`[TrialSignup] New lead: ${data.storeName}, cedula=${data.ownerCedula}, nit=${data.nit}`)

    const response = attachRateLimitHeaders(
      NextResponse.json({
        message: '¡Solicitud enviada exitosamente! Nuestro equipo revisará tu solicitud y se pondrá en contacto contigo para activar tu cuenta.',
      }, { status: 201 }),
      rl.result,
    )

    return response
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      )
    }
    logger.error('[TrialSignup] Error creating lead:', error)
    return NextResponse.json(
      { error: 'Error al enviar la solicitud. Por favor intenta de nuevo.' },
      { status: 500 },
    )
  }
}
