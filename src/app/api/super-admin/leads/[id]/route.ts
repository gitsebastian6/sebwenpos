import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { saveReceiptFile, deleteReceiptFile } from '@/lib/file-storage'
import { getAuthUser } from '@/lib/api-auth'

const STAGE_LABELS: Record<string, string> = {
  LEAD: 'Lead', CONTACTADO: 'Contactado', DOC_PENDIENTE: 'Documentación Pendiente',
  VALIDACION_LEGAL: 'Validación Legal', CLIENTE_ACTIVO: 'Cliente Activo', RECHAZADO: 'Rechazado',
}

export const dynamic = 'force-dynamic'

const validStatuses = ['NEW', 'CONTACTED', 'APPROVED', 'REJECTED', 'CONVERTED'] as const
const validStages = ['LEAD', 'CONTACTADO', 'DOC_PENDIENTE', 'VALIDACION_LEGAL', 'CLIENTE_ACTIVO', 'RECHAZADO'] as const

const updateLeadSchema = z.object({
  // Original fields
  status: z.enum(validStatuses).optional(),
  notes: z.string().max(2000).optional(),
  reviewedBy: z.string().max(100).optional(),
  // Pipeline CRM
  stage: z.enum(validStages).optional(),
  assignedToId: z.number().int().positive().nullable().optional(),
  // Datos fiscales
  taxRegime: z.string().max(100).nullable().optional(),
  fiscalResponsibilities: z.string().max(500).nullable().optional(),
  // Resolución DIAN (borrador, se copia a Store en la conversión)
  resolutionPrefix: z.string().max(10).nullable().optional(),
  resolutionNumber: z.string().max(50).nullable().optional(),
  resolutionStartDate: z.string().nullable().optional(),
  resolutionEndDate: z.string().nullable().optional(),
  resolutionStartNumber: z.number().int().min(0).nullable().optional(),
  resolutionEndNumber: z.number().int().min(0).nullable().optional(),
  // Contact fields
  ownerFullName: z.string().max(200).optional(),
  ownerEmail: z.string().email().max(200).nullable().optional(),
  ownerPhone: z.string().max(30).nullable().optional(),
  // Company fields
  storeName: z.string().max(200).optional(),
  nit: z.string().max(30).optional(),
  legalName: z.string().max(200).optional(),
  businessType: z.enum(['NATURAL', 'JURIDICA']).optional(),
  storePhone: z.string().max(30).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  cityName: z.string().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  // Document metadata
  hasCamaraComercio: z.boolean().optional(),
  registrationNumber: z.string().max(100).nullable().optional(),
  // File uploads - RUT
  rutFileBase64: z.string().optional(),
  rutFileName: z.string().max(300).optional(),
  rutFileType: z.string().max(50).optional(),
  // File uploads - Cámara de Comercio
  camaraFileBase64: z.string().optional(),
  camaraFileName: z.string().max(300).optional(),
  camaraFileType: z.string().max(50).optional(),
})

/**
 * GET /api/super-admin/leads/[id]
 * Returns a single lead by ID with all fields
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    return NextResponse.json(lead)
  } catch (error) {
    logger.error('[SuperAdmin] Error fetching lead:', error)
    return NextResponse.json({ error: 'Error al obtener lead' }, { status: 500 })
  }
}

/**
 * PATCH /api/super-admin/leads/[id]
 * Updates lead fields, status, notes, and file uploads
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const body = await req.json()
    const data = updateLeadSchema.parse(body)

    // Prevent updating already-converted leads
    if (lead.status === 'CONVERTED') {
      return NextResponse.json(
        { error: 'No se puede modificar un lead ya convertido.' },
        { status: 409 },
      )
    }

    // ── Handle file uploads ──
    let rutFilePath = lead.rutFilePath
    let rutFileSize: number | null | undefined = lead.rutFileSize
    let rutFileName: string | null | undefined = lead.rutFileName
    let rutFileType: string | null | undefined = lead.rutFileType

    let camaraFilePath = lead.camaraFilePath
    let camaraFileSize: number | null | undefined = lead.camaraFileSize
    let camaraFileName: string | null | undefined = lead.camaraFileName
    let camaraFileType: string | null | undefined = lead.camaraFileType

    // RUT file upload
    if (data.rutFileBase64 && data.rutFileName && data.rutFileType) {
      // Delete old file if exists
      if (lead.rutFilePath) {
        deleteReceiptFile(lead.rutFilePath).catch(() => {})
      }
      const savedPath = await saveReceiptFile({
        base64Data: data.rutFileBase64,
        fileName: data.rutFileName,
        fileType: data.rutFileType,
      })
      rutFilePath = savedPath
      // Estimate size from base64 (base64 is ~4/3 of raw size)
      const rawBase64 = data.rutFileBase64.replace(/^data:[^;]+;base64,/, '')
      rutFileSize = Math.floor(Buffer.byteLength(rawBase64, 'base64'))
      rutFileName = data.rutFileName
      rutFileType = data.rutFileType
    }

    // Cámara de Comercio file upload
    if (data.camaraFileBase64 && data.camaraFileName && data.camaraFileType) {
      // Delete old file if exists
      if (lead.camaraFilePath) {
        deleteReceiptFile(lead.camaraFilePath).catch(() => {})
      }
      const savedPath = await saveReceiptFile({
        base64Data: data.camaraFileBase64,
        fileName: data.camaraFileName,
        fileType: data.camaraFileType,
      })
      camaraFilePath = savedPath
      const rawBase64 = data.camaraFileBase64.replace(/^data:[^;]+;base64,/, '')
      camaraFileSize = Math.floor(Buffer.byteLength(rawBase64, 'base64'))
      camaraFileName = data.camaraFileName
      camaraFileType = data.camaraFileType
    }

    const auth = getAuthUser(req)
    const stageChanged = data.stage !== undefined && data.stage !== lead.stage

    const updated = await db.lead.update({
      where: { id: leadId },
      data: {
        // Contact fields
        ...(data.ownerFullName !== undefined ? { ownerFullName: data.ownerFullName } : {}),
        ...(data.ownerEmail !== undefined ? { ownerEmail: data.ownerEmail } : {}),
        ...(data.ownerPhone !== undefined ? { ownerPhone: data.ownerPhone } : {}),
        // Company fields
        ...(data.storeName !== undefined ? { storeName: data.storeName } : {}),
        ...(data.nit !== undefined ? { nit: data.nit } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        ...(data.businessType !== undefined ? { businessType: data.businessType } : {}),
        ...(data.storePhone !== undefined ? { storePhone: data.storePhone } : {}),
        ...(data.department !== undefined ? { department: data.department } : {}),
        ...(data.cityName !== undefined ? { cityName: data.cityName } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        // Document metadata
        ...(data.hasCamaraComercio !== undefined ? { hasCamaraComercio: data.hasCamaraComercio } : {}),
        ...(data.registrationNumber !== undefined ? { registrationNumber: data.registrationNumber } : {}),
        // File paths/sizes
        rutFilePath,
        rutFileSize,
        rutFileName,
        rutFileType,
        camaraFilePath,
        camaraFileSize,
        camaraFileName,
        camaraFileType,
        // Pipeline CRM
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
        // Datos fiscales
        ...(data.taxRegime !== undefined ? { taxRegime: data.taxRegime } : {}),
        ...(data.fiscalResponsibilities !== undefined ? { fiscalResponsibilities: data.fiscalResponsibilities } : {}),
        // Resolución DIAN (borrador)
        ...(data.resolutionPrefix !== undefined ? { resolutionPrefix: data.resolutionPrefix } : {}),
        ...(data.resolutionNumber !== undefined ? { resolutionNumber: data.resolutionNumber } : {}),
        ...(data.resolutionStartDate !== undefined ? { resolutionStartDate: data.resolutionStartDate ? new Date(data.resolutionStartDate) : null } : {}),
        ...(data.resolutionEndDate !== undefined ? { resolutionEndDate: data.resolutionEndDate ? new Date(data.resolutionEndDate) : null } : {}),
        ...(data.resolutionStartNumber !== undefined ? { resolutionStartNumber: data.resolutionStartNumber } : {}),
        ...(data.resolutionEndNumber !== undefined ? { resolutionEndNumber: data.resolutionEndNumber } : {}),
        // Status/notes/reviewer
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.reviewedBy ? { reviewedBy: data.reviewedBy } : {}),
        // Auto-set reviewedAt when status or reviewedBy is provided
        ...(data.status || data.reviewedBy ? { reviewedAt: new Date() } : {}),
      },
    })

    // Log stage changes in the activity timeline, and auto-create a follow-up
    // task when the advisor requests documents (moves the lead to DOC_PENDIENTE)
    if (stageChanged) {
      await db.leadActivity.create({
        data: {
          leadId,
          type: 'STAGE_CHANGE',
          title: `Etapa: ${STAGE_LABELS[lead.stage] || lead.stage} → ${STAGE_LABELS[data.stage!] || data.stage}`,
          createdById: auth?.userId ?? null,
        },
      })
      if (data.stage === 'DOC_PENDIENTE') {
        await db.leadActivity.create({
          data: {
            leadId,
            type: 'TASK',
            title: 'Confirmar que el cliente recibió la solicitud de documentos',
            description: 'Se solicitaron RUT, Cámara de Comercio, cédula del representante legal y Resolución DIAN.',
            dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
            createdById: auth?.userId ?? null,
          },
        })
      }
    }

    logger.info(`[SuperAdmin] Lead #${leadId} updated: status=${data.status || 'unchanged'}, stage=${data.stage || 'unchanged'}, fields=${JSON.stringify(Object.keys(body))}`)

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error updating lead:', error)
    return NextResponse.json({ error: 'Error al actualizar lead' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/leads/[id]
 * Deletes a lead (only if status is NEW or REJECTED)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    if (lead.status !== 'NEW' && lead.status !== 'REJECTED') {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar leads con estado NUEVO o RECHAZADO.' },
        { status: 409 },
      )
    }

    // Delete associated files from disk
    if (lead.rutFilePath || lead.camaraFilePath) {
      if (lead.rutFilePath) {
        deleteReceiptFile(lead.rutFilePath).catch(() => {})
      }
      if (lead.camaraFilePath) {
        deleteReceiptFile(lead.camaraFilePath).catch(() => {})
      }
    }

    await db.lead.delete({ where: { id: leadId } })

    logger.info(`[SuperAdmin] Lead #${leadId} deleted`)

    return NextResponse.json({ message: 'Lead eliminado correctamente' })
  } catch (error) {
    logger.error('[SuperAdmin] Error deleting lead:', error)
    return NextResponse.json({ error: 'Error al eliminar lead' }, { status: 500 })
  }
}
