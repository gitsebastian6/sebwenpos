import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { saveLeadDocumentFile } from '@/lib/file-storage'
import { getAuthUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Todos los tipos de documento que se pueden subir en el expediente legal.
export const ALL_DOCUMENT_TYPES = ['RUT', 'CAMARA_COMERCIO', 'CEDULA_REPRESENTANTE', 'RESOLUCION_DIAN'] as const
// Los únicos 3 que son obligatorios para aprobar el negocio y convertirlo en cuenta.
// La Resolución DIAN es opcional — un negocio puede operar sin facturación
// electrónica activada todavía y configurarla más adelante desde Configuración.
export const REQUIRED_DOCUMENT_TYPES = ['RUT', 'CAMARA_COMERCIO', 'CEDULA_REPRESENTANTE'] as const

const uploadDocumentSchema = z.object({
  documentType: z.enum(ALL_DOCUMENT_TYPES),
  fileBase64: z.string().min(1),
  fileName: z.string().max(300),
  fileType: z.string().max(80),
})

/**
 * GET /api/super-admin/leads/[id]/documents
 * Lists every document version for a lead, most recent first.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const documents = await db.leadDocument.findMany({
      where: { leadId },
      orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
      include: { reviewer: { select: { id: true, fullName: true } } },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    logger.error('[SuperAdmin] Error listing lead documents:', error)
    return NextResponse.json({ error: 'Error al listar documentos' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/leads/[id]/documents
 * Uploads a new version of a legal document (RUT, Cámara, cédula, resolución).
 * Auto-advances the lead from DOC_PENDIENTE to VALIDACION_LEGAL once all 4
 * required document types have at least one uploaded version.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }
    if (lead.stage === 'CLIENTE_ACTIVO') {
      return NextResponse.json({ error: 'No se pueden modificar documentos de un cliente ya activo.' }, { status: 409 })
    }

    const body = await req.json()
    const data = uploadDocumentSchema.parse(body)
    const auth = getAuthUser(req)

    const filePath = await saveLeadDocumentFile({
      base64Data: data.fileBase64,
      fileName: data.fileName,
      fileType: data.fileType,
    })
    const rawBase64 = data.fileBase64.replace(/^data:[^;]+;base64,/, '')
    const fileSize = Math.floor(Buffer.byteLength(rawBase64, 'base64'))

    const lastVersion = await db.leadDocument.findFirst({
      where: { leadId, documentType: data.documentType },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    const created = await db.leadDocument.create({
      data: {
        leadId,
        documentType: data.documentType,
        filePath,
        fileName: data.fileName,
        fileSize,
        fileType: data.fileType,
        status: 'PENDING',
        version: (lastVersion?.version ?? 0) + 1,
      },
    })

    await db.leadActivity.create({
      data: {
        leadId,
        type: 'DOCUMENT_EVENT',
        title: `Documento subido: ${data.documentType} (v${created.version})`,
        createdById: auth?.userId ?? null,
      },
    })

    // Auto-advance DOC_PENDIENTE → VALIDACION_LEGAL once every required type has a version
    let newStage: string | null = null
    if (lead.stage === 'DOC_PENDIENTE') {
      const allDocs = await db.leadDocument.findMany({ where: { leadId }, select: { documentType: true } })
      const uploadedTypes = new Set(allDocs.map((d) => d.documentType))
      const allUploaded = REQUIRED_DOCUMENT_TYPES.every((t) => uploadedTypes.has(t))
      if (allUploaded) {
        newStage = 'VALIDACION_LEGAL'
        await db.lead.update({ where: { id: leadId }, data: { stage: newStage } })
        await db.leadActivity.create({
          data: { leadId, type: 'STAGE_CHANGE', title: 'Etapa: Documentación Pendiente → Validación Legal', createdById: null },
        })
      }
    }

    return NextResponse.json({ document: created, newStage }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error uploading lead document:', error)
    return NextResponse.json({ error: 'Error al subir documento' }, { status: 500 })
  }
}
