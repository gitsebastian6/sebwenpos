import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readReceiptFile } from '@/lib/file-storage'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function encodeContentDisposition(filename: string): string {
  const safeName = filename.replace(/"/g, "'")
  const encoded = encodeURIComponent(safeName)
  return `inline; filename="${safeName}"; filename*=UTF-8''${encoded}`
}

/**
 * GET /api/super-admin/leads/[id]/documents/[docId]/file
 * Serves a specific LeadDocument version's file from disk (RUT, Cámara,
 * cédula, or resolución DIAN) for viewing in the Expediente Legal screen.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: idStr, docId: docIdStr } = await params
  const leadId = parseInt(idStr, 10)
  const docId = parseInt(docIdStr, 10)
  if (isNaN(leadId) || isNaN(docId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  try {
    const doc = await db.leadDocument.findFirst({ where: { id: docId, leadId } })
    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    const buffer = await readReceiptFile(doc.filePath)
    if (!buffer) {
      logger.warn(`[SuperAdmin] Lead document file not found on disk: leadId=${leadId}, docId=${docId}, path=${doc.filePath}`)
      return NextResponse.json({ error: 'El archivo no se encontró en el servidor.' }, { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', doc.fileType || 'application/octet-stream')
    headers.set('Content-Disposition', encodeContentDisposition(doc.fileName))
    headers.set('Content-Length', buffer.length.toString())
    headers.set('Cache-Control', 'private, max-age=3600')

    return new NextResponse(new Uint8Array(buffer), { headers })
  } catch (error) {
    logger.error(`[SuperAdmin] Error serving lead document file (leadId=${leadId}, docId=${docId}):`, error)
    return NextResponse.json({ error: 'Error al servir archivo' }, { status: 500 })
  }
}
