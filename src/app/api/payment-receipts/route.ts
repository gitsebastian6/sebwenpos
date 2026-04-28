import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { saveReceiptFile } from '@/lib/file-storage'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]

const paymentMethods = ['NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'BANCARY', 'EFFECTIVE', 'OTHER'] as const

const uploadSchema = z.object({
  fileData: z.string().min(1, 'El archivo es obligatorio'),
  fileName: z.string().min(1, 'El nombre del archivo es obligatorio').max(255),
  fileSize: z.number().int().positive('El tamaño del archivo debe ser positivo'),
  fileType: z.string().min(1),
  amount: z.number().int().positive('El monto debe ser mayor a 0'),
  reference: z.string().max(100).optional().or(z.literal('')),
  paymentMethod: z.enum(paymentMethods),
  notes: z.string().max(1000).optional().or(z.literal('')),
  requestedPlanId: z.number().int().positive().optional(),
  requestedPlanName: z.string().max(50).optional(),
  requestedBillingPeriod: z.string().max(20).optional(),
})

/**
 * GET /api/payment-receipts
 * Lista los comprobantes de pago de la tienda del usuario autenticado
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.headers.get('x-auth-store-id')
    if (!storeId) {
      return NextResponse.json({ error: 'Tienda no identificada' }, { status: 401 })
    }

    const storeAccessErr = requireStoreAccess(req, parseInt(storeId, 10))
    if (storeAccessErr) return storeAccessErr

    const receipts = await db.paymentReceipt.findMany({
      where: { storeId: parseInt(storeId, 10) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        filePath: true,
        amount: true,
        reference: true,
        paymentMethod: true,
        notes: true,
        status: true,
        reviewNotes: true,
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(receipts)
  } catch (error) {
    logger.error('Error listing receipts:', error)
    return NextResponse.json({ error: 'Error al listar comprobantes' }, { status: 500 })
  }
}

/**
 * POST /api/payment-receipts
 * Sube un comprobante de pago (desde la vista del owner)
 * Now saves file to disk instead of base64 in DB.
 */
export async function POST(req: NextRequest) {
  try {
    const storeId = req.headers.get('x-auth-store-id')
    if (!storeId) {
      return NextResponse.json({ error: 'Tienda no identificada' }, { status: 401 })
    }

    const storeAccessErr = requireStoreAccess(req, parseInt(storeId, 10))
    if (storeAccessErr) return storeAccessErr

    const body = await req.json()
    const data = uploadSchema.parse(body)

    // Validate file type
    if (!ALLOWED_TYPES.includes(data.fileType)) {
      return NextResponse.json({
        error: `Tipo de archivo no permitido. Formatos aceptados: PNG, JPG, WebP, HEIC, PDF`,
      }, { status: 400 })
    }

    // Validate file size
    if (data.fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `El archivo excede el tamaño máximo de 5MB`,
      }, { status: 400 })
    }

    // Validate base64 data
    const base64Match = data.fileData.match(/^data:[^;]+;base64,(.+)$/)
    const rawBase64 = base64Match ? base64Match[1] : data.fileData

    // Verify base64 is valid by checking length
    try {
      const decodedLength = Buffer.byteLength(rawBase64, 'base64')
      if (decodedLength === 0) {
        return NextResponse.json({ error: 'Archivo vacío o inválido' }, { status: 400 })
      }
      // Check if decoded size roughly matches reported size (allow 20% margin for base64 encoding differences)
      if (data.fileSize > 0 && decodedLength > data.fileSize * 3) {
        return NextResponse.json({ error: 'El tamaño del archivo no coincide' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 })
    }

    // Find the subscription for this store
    const subscription = await db.subscription.findUnique({
      where: { storeId: parseInt(storeId, 10) },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'No hay suscripción activa para esta tienda' }, { status: 404 })
    }

    // Check if there's already a PENDING receipt (prevent spam)
    const pendingReceipt = await db.paymentReceipt.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: 'PENDING',
      },
    })

    if (pendingReceipt) {
      return NextResponse.json({
        error: 'Ya tiene un comprobante pendiente de revisión. Espere a que sea aprobado o rechazado.',
      }, { status: 409 })
    }

    // Save file to disk instead of DB
    let filePath: string | null = null
    try {
      filePath = await saveReceiptFile({
        base64Data: rawBase64,
        fileName: data.fileName,
        fileType: data.fileType,
      })
    } catch (fsError) {
      logger.error('[payment-receipts] Failed to save file to disk, storing in DB as fallback:', fsError)
      // Fallback: store base64 in DB if disk save fails
    }

    // Build notes with plan change metadata if provided
    let notesData = data.notes || null
    if (data.requestedPlanId && data.requestedPlanName) {
      const planChangeInfo = {
        planChangeRequest: true,
        requestedPlanId: data.requestedPlanId,
        requestedPlanName: data.requestedPlanName,
        requestedBillingPeriod: data.requestedBillingPeriod || 'MONTHLY',
        userNotes: data.notes || null,
      }
      notesData = JSON.stringify(planChangeInfo)
    }

    // Create the receipt
    const receipt = await db.paymentReceipt.create({
      data: {
        subscriptionId: subscription.id,
        storeId: parseInt(storeId, 10),
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        filePath: filePath,
        fileData: filePath ? null : rawBase64, // Only store base64 if disk save failed
        amount: data.amount,
        reference: data.reference || null,
        paymentMethod: data.paymentMethod,
        notes: notesData,
      },
      select: {
        id: true,
        fileName: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      message: 'Comprobante de pago enviado correctamente',
      receipt,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error uploading receipt:', error)
    return NextResponse.json({ error: 'Error al subir comprobante' }, { status: 500 })
  }
}
