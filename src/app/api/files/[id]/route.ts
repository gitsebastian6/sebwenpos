import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readReceiptFile, getUploadsDir } from '@/lib/file-storage'
import { logger } from '@/lib/logger'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getAuthUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/files/[id]
 * Serves a receipt file from disk or falls back to base64 data in DB.
 * Only authenticated users with access to the receipt's store can view it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const receiptId = parseInt(idStr, 10)

    if (isNaN(receiptId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // Get auth info from headers (set by middleware) using api-auth helper
    const auth = getAuthUser(req)

    // Fetch receipt from DB
    const receipt = await db.paymentReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true,
        storeId: true,
        fileName: true,
        fileType: true,
        filePath: true,
        fileData: true,
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
    }

    // Authorization: owner of the store or super admin
    if (!auth || (auth.role !== 'SUPER_ADMIN' && auth.storeId !== receipt.storeId)) {
      return NextResponse.json({ error: 'Sin permisos para ver este archivo' }, { status: 403 })
    }

    // Strategy 1: Serve from disk (new system)
    if (receipt.filePath) {
      try {
        const buffer = await readReceiptFile(receipt.filePath)
        if (!buffer) {
          logger.warn(`[files] File not found on disk: ${receipt.filePath}, falling back to DB data`)
        } else {
          const headers = new Headers()
          headers.set('Content-Type', receipt.fileType || 'application/octet-stream')
          headers.set('Content-Disposition', `inline; filename="${receipt.fileName}"`)
          headers.set('Cache-Control', 'private, max-age=3600')

          return new NextResponse(new Uint8Array(buffer), { headers })
        }
      } catch (error) {
        logger.warn(`[files] Error reading file from disk: ${receipt.filePath}, falling back to DB data`)
        // Fall through to base64 fallback
      }
    }

    // Strategy 2: Serve from DB base64 data (legacy fallback)
    if (receipt.fileData) {
      const buffer = Buffer.from(receipt.fileData, 'base64')
      const headers = new Headers()
      headers.set('Content-Type', receipt.fileType || 'application/octet-stream')
      headers.set('Content-Disposition', `inline; filename="${receipt.fileName}"`)
      headers.set('Cache-Control', 'private, max-age=3600')

      return new NextResponse(new Uint8Array(buffer), { headers })
    }

    return NextResponse.json({ error: 'Archivo no disponible' }, { status: 404 })
  } catch (error) {
    logger.error('[files] Error serving file:', error)
    return NextResponse.json({ error: 'Error al servir archivo' }, { status: 500 })
  }
}
