import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { saveProductImageFile } from '@/lib/file-storage'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

const uploadSchema = z.object({
  storeId: z.number().int().positive(),
  fileData: z.string().min(1, 'El archivo es obligatorio'),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1),
})

/**
 * POST /api/products/upload-image
 * Uploads a product photo and returns its public URL — usable directly as
 * Product.imgUrl. Not tied to a specific product id, so it also works while
 * creating a brand-new product (before it has an id).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = uploadSchema.parse(body)

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr

    if (!ALLOWED_TYPES.includes(data.fileType)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Formatos aceptados: PNG, JPG, WebP' },
        { status: 400 },
      )
    }

    const rawBase64 = data.fileData.replace(/^data:[^;]+;base64,/, '')
    const decodedSize = Buffer.byteLength(rawBase64, 'base64')
    if (decodedSize === 0) {
      return NextResponse.json({ error: 'Archivo vacío o inválido' }, { status: 400 })
    }
    if (decodedSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo de 5MB' }, { status: 400 })
    }

    const relativePath = await saveProductImageFile({
      base64Data: rawBase64,
      fileName: data.fileName,
      fileType: data.fileType,
    })

    // relativePath looks like "products/2026/08/uuid.jpg" — strip the
    // leading "products/" since the public route already scopes to it.
    const publicSuffix = relativePath.replace(/^products\//, '')
    const url = `/api/public/uploads/products/${publicSuffix}`

    return NextResponse.json({ url }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error uploading product image:', error)
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 })
  }
}
