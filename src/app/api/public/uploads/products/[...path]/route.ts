import { NextRequest, NextResponse } from 'next/server'
import { readReceiptFile } from '@/lib/file-storage'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/**
 * GET /api/public/uploads/products/[...path]
 * Publicly serves an uploaded product photo — intentionally unauthenticated,
 * since these images are meant to show up on the public Tienda Virtual
 * storefront for anonymous visitors. Scoped strictly to the "products"
 * upload category (never receipts/lead-docs, which stay private) and
 * filenames are random UUIDs, so there's nothing sensitive to leak here.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params

  // Reject empty/traversal segments — path.join with ".." could otherwise
  // escape the "products" category into receipts/lead-docs territory.
  if (!segments.length || segments.some((s) => !s || s === '..' || s.includes('/') || s.includes('\\'))) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 })
  }

  const relativePath = `products/${segments.join('/')}`
  const ext = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase()
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) {
    return NextResponse.json({ error: 'Tipo de archivo no soportado' }, { status: 400 })
  }

  try {
    const buffer = await readReceiptFile(relativePath)
    if (!buffer) {
      return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Content-Length', buffer.length.toString())
    // Filenames are content-addressed (random UUID, never overwritten) — safe to cache forever.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new NextResponse(new Uint8Array(buffer), { headers })
  } catch (error) {
    logger.error(`[public/uploads/products] Error serving ${relativePath}:`, error)
    return NextResponse.json({ error: 'Error al servir la imagen' }, { status: 500 })
  }
}
