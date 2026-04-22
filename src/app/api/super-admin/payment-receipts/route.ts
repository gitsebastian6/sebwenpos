import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const uploadSchema = z.object({
  storeId: z.number().int().positive(),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(['NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'BANCARY', 'EFFECTIVE', 'OTHER']),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  fileData: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  fileType: z.string().min(1),
  // Si true (default), el comprobante se aprueba automáticamente y extiende la suscripción
  autoApprove: z.boolean().default(true),
  reviewNotes: z.string().max(500).optional(),
})

const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Calcula la nueva fecha de fin de suscripción según el período de facturación
 */
function calculateNewEndDate(sub: { billingPeriod: string; endDate: Date | string | null }): Date {
  const now = new Date()
  let base: Date

  if (sub.endDate && new Date(sub.endDate) > now) {
    base = new Date(sub.endDate)
  } else {
    base = new Date(now)
  }

  switch (sub.billingPeriod) {
    case 'TRIAL':
      base.setDate(base.getDate() + 7)
      break
    case 'MONTHLY':
      base.setDate(base.getDate() + 30)
      break
    case 'QUARTERLY':
      base.setDate(base.getDate() + 90)
      break
    case 'SEMI_ANNUAL':
      base.setDate(base.getDate() + 180)
      break
    case 'ANNUAL':
      base.setDate(base.getDate() + 365)
      break
    default:
      base.setDate(base.getDate() + 30)
  }

  return base
}

/**
 * GET /api/super-admin/payment-receipts
 * Lista todos los comprobantes de pago con info de tienda, para el super admin
 */
export async function GET() {
  try {
    const receipts = await db.paymentReceipt.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            nit: true,
            phone: true,
            user: { select: { fullName: true, phone: true } },
          },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            plan: { select: { name: true, price: true } },
            endDate: true,
          },
        },
      },
    })

    return NextResponse.json(receipts)
  } catch (error) {
    logger.error('Error listing all receipts:', error)
    return NextResponse.json({ error: 'Error al listar comprobantes' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/payment-receipts
 * El Super Admin registra un comprobante de pago en nombre de una tienda.
 * 
 * Si autoApprove=true (default):
 *   - Se crea como APROVED inmediatamente
 *   - Se extiende la suscripción del cliente según su período de facturación
 *   - El cliente verá su suscripción actualizada al recargar
 * 
 * Si autoApprove=false:
 *   - Se crea como PENDING (flujo de revisión manual)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = uploadSchema.parse(body)

    // Validate file type
    if (!ALLOWED_TYPES.includes(data.fileType)) {
      return NextResponse.json({
        error: 'Tipo de archivo no permitido. Use PNG, JPG, WebP, HEIC o PDF.',
      }, { status: 400 })
    }

    // Validate file size
    if (data.fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'El archivo excede el tamaño máximo de 5MB.',
      }, { status: 400 })
    }

    // Validate base64 data
    try {
      Buffer.from(data.fileData, 'base64')
    } catch {
      return NextResponse.json({
        error: 'Datos del archivo inválidos (base64).',
      }, { status: 400 })
    }

    // Verify store exists with subscription and plan
    const storeData = await db.store.findUnique({
      where: { id: data.storeId },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    })

    if (!storeData) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    if (!storeData.subscriptionId) {
      return NextResponse.json({ error: 'La tienda no tiene suscripción asociada' }, { status: 400 })
    }

    if (!storeData.subscription) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    // Check if there's already a PENDING receipt for this store's subscription
    const existingPending = await db.paymentReceipt.findFirst({
      where: {
        subscriptionId: storeData.subscriptionId,
        status: 'PENDING',
      },
    })

    if (existingPending) {
      return NextResponse.json({
        error: 'Ya existe un comprobante pendiente para esta tienda. Revísalo o elimínalo primero.',
      }, { status: 409 })
    }

    const now = new Date()
    const isAutoApprove = data.autoApprove !== false // default true

    // Create the receipt
    const receipt = await db.paymentReceipt.create({
      data: {
        storeId: data.storeId,
        subscriptionId: storeData.subscriptionId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        reference: data.reference || null,
        notes: data.notes || null,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        fileData: data.fileData,
        status: isAutoApprove ? 'APPROVED' : 'PENDING',
        reviewedBy: isAutoApprove ? 'SUPER_ADMIN' : null,
        reviewedAt: isAutoApprove ? now : null,
        reviewNotes: isAutoApprove ? (data.reviewNotes || 'Registro directo desde panel de administración') : null,
      },
      include: {
        store: {
          select: { id: true, name: true, nit: true, user: { select: { fullName: true, phone: true } } },
        },
        subscription: {
          select: { id: true, status: true, plan: { select: { name: true, price: true } }, endDate: true },
        },
      },
    })

    // If auto-approved, extend the subscription immediately
    if (isAutoApprove) {
      const sub = storeData.subscription
      const newEndDate = calculateNewEndDate(sub)

      // Calculate nextBillingAt (1 day after new endDate)
      const newNextBillingAt = new Date(newEndDate)
      newNextBillingAt.setDate(newNextBillingAt.getDate() + 1)

      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          endDate: newEndDate,
          nextBillingAt: newNextBillingAt,
          lastBilledAt: now,
          startDate: (sub.status === 'EXPIRED' || sub.status === 'TRIAL') ? now : sub.startDate,
          billingPeriod: sub.billingPeriod === 'TRIAL' ? 'MONTHLY' : sub.billingPeriod,
          // Reset alert flags on renewal
          alertSentAt3d: null,
          alertSentAt1d: null,
        },
      })

      const billingPeriodLabel: Record<string, string> = {
        TRIAL: '7 días (prueba)',
        MONTHLY: '30 días (mensual)',
        QUARTERLY: '90 días (trimestral)',
        SEMI_ANNUAL: '180 días (semestral)',
        ANNUAL: '365 días (anual)',
      }

      return NextResponse.json({
        message: `✅ Comprobante aprobado automáticamente. Suscripción extendida por ${billingPeriodLabel[sub.billingPeriod] || '30 días'} hasta ${newEndDate.toLocaleDateString('es-CO')}.`,
        receipt,
        subscriptionExtended: true,
        newEndDate: newEndDate.toISOString(),
      }, { status: 201 })
    }

    return NextResponse.json({
      message: 'Comprobante registrado como pendiente. Debe ser aprobado manualmente.',
      receipt,
      subscriptionExtended: false,
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error uploading receipt (super-admin):', error)
    return NextResponse.json({ error: 'Error al registrar comprobante' }, { status: 500 })
  }
}
