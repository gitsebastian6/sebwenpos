import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readReceiptFile } from '@/lib/file-storage'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/super-admin/leads/[id]/files?type=rut|camara
 * Serves a lead's uploaded file (RUT or Cámara de Comercio) from disk
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const fileType = searchParams.get('type') // 'rut' or 'camara'

    if (fileType !== 'rut' && fileType !== 'camara') {
      return NextResponse.json(
        { error: 'Parámetro "type" requerido: debe ser "rut" o "camara"' },
        { status: 400 },
      )
    }

    // Fetch lead with only the file fields we need
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        rutFilePath: true,
        rutFileName: true,
        rutFileType: true,
        camaraFilePath: true,
        camaraFileName: true,
        camaraFileType: true,
      },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    // Determine which file to serve
    const filePath = fileType === 'rut' ? lead.rutFilePath : lead.camaraFilePath
    const fileName = fileType === 'rut' ? lead.rutFileName : lead.camaraFileName
    const mimeType = fileType === 'rut' ? lead.rutFileType : lead.camaraFileType

    if (!filePath) {
      return NextResponse.json(
        { error: `El archivo ${fileType === 'rut' ? 'RUT' : 'Cámara de Comercio'} no está disponible.` },
        { status: 404 },
      )
    }

    // Read file from disk
    const buffer = await readReceiptFile(filePath)

    const headers = new Headers()
    headers.set('Content-Type', mimeType || 'application/octet-stream')
    headers.set('Content-Disposition', `inline; filename="${fileName || 'documento'}"`)
    headers.set('Content-Length', buffer.length.toString())
    headers.set('Cache-Control', 'private, max-age=3600')

    return new NextResponse(new Uint8Array(buffer), { headers })
  } catch (error) {
    logger.error('[SuperAdmin] Error serving lead file:', error)
    return NextResponse.json({ error: 'Error al servir archivo' }, { status: 500 })
  }
}
