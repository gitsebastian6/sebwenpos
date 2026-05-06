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

const attachFileSchema = z.object({
  fileData: z.string().min(1, 'El archivo es obligatorio'),
  fileName: z.string().min(1, 'El nombre del archivo es obligatorio').max(255),
  fileSize: z.number().int().positive('El tamaño del archivo debe ser positivo'),
  fileType: z.string().min(1),
})

/**
 * PATCH /api/payment-receipts/[id]
 * Owner attaches a receipt file to an existing PENDING receipt that was created without one.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const receiptId = parseInt(id, 10)
    if (isNaN(receiptId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const storeId = req.headers.get('x-auth-store-id')
    if (!storeId) {
      return NextResponse.json({ error: 'Tienda no identificada' }, { status: 401 })
    }

    const storeAccessErr = requireStoreAccess(req, parseInt(storeId, 10))
    if (storeAccessErr) return storeAccessErr

    const body = await req.json()
    const data = attachFileSchema.parse(body)

    // Validate file type
    if (!ALLOWED_TYPES.includes(data.fileType)) {
      return NextResponse.json({
        error: 'Tipo de archivo no permitido. Formatos aceptados: PNG, JPG, WebP, HEIC, PDF',
      }, { status: 400 })
    }

    // Validate file size
    if (data.fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'El archivo excede el tamaño máximo de 5MB',
      }, { status: 400 })
    }

    // Validate base64 data
    const base64Match = data.fileData.match(/^data:[^;]+;base64,(.+)$/)
    const rawBase64 = base64Match ? base64Match[1] : data.fileData

    try {
      const decodedLength = Buffer.byteLength(rawBase64, 'base64')
      if (decodedLength === 0) {
        return NextResponse.json({ error: 'Archivo vacío o inválido' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 })
    }

    // Find the receipt — must belong to this store and be PENDING
    const receipt = await db.paymentReceipt.findUnique({
      where: { id: receiptId },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
    }

    if (receipt.storeId !== parseInt(storeId, 10)) {
      return NextResponse.json({ error: 'No tienes acceso a este comprobante' }, { status: 403 })
    }

    if (receipt.status !== 'PENDING') {
      return NextResponse.json({
        error: 'Solo se puede agregar comprobante a solicitudes pendientes',
      }, { status: 409 })
    }

    if (receipt.fileName) {
      return NextResponse.json({
        error: 'Este comprobante ya tiene un archivo adjunto',
      }, { status: 409 })
    }

    // Save file to disk
    let filePath: string | null = null
    try {
      filePath = await saveReceiptFile({
        base64Data: rawBase64,
        fileName: data.fileName,
        fileType: data.fileType,
      })
    } catch (fsError) {
      logger.error('[payment-receipts PATCH] Failed to save file to disk, storing in DB:', fsError)
    }

    // Update the receipt with the file
    const updated = await db.paymentReceipt.update({
      where: { id: receiptId },
      data: {
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        filePath: filePath,
        fileData: filePath ? null : rawBase64,
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
      message: 'Comprobante adjuntado correctamente. El administrador lo revisará.',
      receipt: updated,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error attaching receipt file:', error)
    return NextResponse.json({ error: 'Error al adjuntar comprobante' }, { status: 500 })
  }
}
