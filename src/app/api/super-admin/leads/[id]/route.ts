import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { saveReceiptFile, deleteReceiptFile } from '@/lib/file-storage'

export const dynamic = 'force-dynamic'

const validStatuses = ['NEW', 'CONTACTED', 'APPROVED', 'REJECTED', 'CONVERTED'] as const

const updateLeadSchema = z.object({
  // Original fields
  status: z.enum(validStatuses).optional(),
  notes: z.string().max(2000).optional(),
  reviewedBy: z.string().max(100).optional(),
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
        // Status/notes/reviewer
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.reviewedBy ? { reviewedBy: data.reviewedBy } : {}),
        // Auto-set reviewedAt when status or reviewedBy is provided
        ...(data.status || data.reviewedBy ? { reviewedAt: new Date() } : {}),
      },
    })

    logger.info(`[SuperAdmin] Lead #${leadId} updated: status=${data.status || 'unchanged'}, fields=${JSON.stringify(Object.keys(body))}`)

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
