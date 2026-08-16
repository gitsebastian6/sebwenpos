import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getAuthUser } from '@/lib/api-auth'
import { REQUIRED_DOCUMENT_TYPES } from '../route'

export const dynamic = 'force-dynamic'

const DOC_LABELS: Record<string, string> = {
  RUT: 'RUT',
  CAMARA_COMERCIO: 'Cámara de Comercio',
  CEDULA_REPRESENTANTE: 'Cédula Rep. Legal',
  RESOLUCION_DIAN: 'Resolución DIAN',
}

/**
 * Notifies the lead's owner (email + WhatsApp) that a document was rejected
 * and needs a corrected re-upload. Fire-and-forget — never blocks the response.
 */
async function notifyDocumentRejected(lead: { ownerFullName: string; ownerEmail: string | null; ownerPhone: string | null; storeName: string }, documentType: string, reason: string) {
  const documentLabel = DOC_LABELS[documentType] ?? documentType
  // Non-throwing: a missing SUPPORT_PHONE shouldn't block the email channel too.
  const supportPhone = process.env.SUPPORT_PHONE || ''

  if (lead.ownerEmail) {
    try {
      const { getSmtpConfig, createTransport } = await import('@/lib/invoicing/email-sender')
      const { buildDocumentRejectedHtml } = await import('@/lib/leads/notification-email')
      const config = getSmtpConfig()
      if (config && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.ownerEmail)) {
        const transporter = createTransport(config)
        const fromName = config.fromName ?? 'Sebwen POS'
        const fromHeader = config.from.includes('<') ? `${fromName} ${config.from}` : `"${fromName}" <${config.from}>`
        await transporter.sendMail({
          from: fromHeader,
          to: lead.ownerEmail,
          subject: `📄 Necesitamos corregir un documento — ${lead.storeName}`,
          html: buildDocumentRejectedHtml({
            ownerName: lead.ownerFullName,
            storeName: lead.storeName,
            documentLabel,
            reason,
            supportPhone,
          }),
        })
      }
    } catch (err) {
      logger.error('[LeadNotify] Error sending document-rejected email:', err)
    }
  }

  if (lead.ownerPhone) {
    try {
      const { sendWhatsAppMessage } = await import('@/lib/messagebird')
      await sendWhatsAppMessage(
        lead.ownerPhone,
        `Hola ${lead.ownerFullName}, revisamos el documento "${documentLabel}" que enviaste para "${lead.storeName}" y no pudimos aprobarlo. Motivo: ${reason}. Por favor respóndenos con una versión corregida.`,
      )
    } catch (err) {
      logger.error('[LeadNotify] Error sending document-rejected WhatsApp:', err)
    }
  }
}

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
}).refine((d) => d.status !== 'REJECTED' || !!d.rejectionReason?.trim(), {
  message: 'Debes indicar el motivo del rechazo',
})

/**
 * PATCH /api/super-admin/leads/[id]/documents/[docId]
 * Approves or rejects a document version. Rejecting the latest version of a
 * type moves the lead back to DOC_PENDIENTE if that breaks the 4/4 "todo
 * subido" condition needed to stay in VALIDACION_LEGAL.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const { id: idStr, docId: docIdStr } = await params
    const leadId = parseInt(idStr, 10)
    const docId = parseInt(docIdStr, 10)
    if (isNaN(leadId) || isNaN(docId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const doc = await db.leadDocument.findFirst({ where: { id: docId, leadId } })
    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const data = reviewSchema.parse(body)
    const auth = getAuthUser(req)

    const updated = await db.leadDocument.update({
      where: { id: docId },
      data: {
        status: data.status,
        rejectionReason: data.status === 'REJECTED' ? data.rejectionReason!.trim() : null,
        reviewedBy: auth?.userId ?? null,
        reviewedAt: new Date(),
      },
    })

    await db.leadActivity.create({
      data: {
        leadId,
        type: 'DOCUMENT_EVENT',
        title: data.status === 'APPROVED'
          ? `Documento aprobado: ${doc.documentType}`
          : `Documento rechazado: ${doc.documentType} — ${data.rejectionReason}`,
        createdById: auth?.userId ?? null,
      },
    })

    if (data.status === 'REJECTED') {
      notifyDocumentRejected(lead, doc.documentType, data.rejectionReason!.trim()).catch(() => {})
    }

    // If this rejection leaves the type without any pending/approved version,
    // the lead can no longer be considered "fully documented" — send it back.
    let newStage: string | null = null
    if (data.status === 'REJECTED' && lead.stage === 'VALIDACION_LEGAL') {
      const remaining = await db.leadDocument.count({
        where: { leadId, documentType: doc.documentType, status: { in: ['PENDING', 'APPROVED'] } },
      })
      if (remaining === 0) {
        newStage = 'DOC_PENDIENTE'
        await db.lead.update({ where: { id: leadId }, data: { stage: newStage } })
        await db.leadActivity.create({
          data: { leadId, type: 'STAGE_CHANGE', title: 'Etapa: Validación Legal → Documentación Pendiente (documento rechazado)', createdById: null },
        })
      }
    }

    return NextResponse.json({ document: updated, newStage, requiredTypes: REQUIRED_DOCUMENT_TYPES })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error reviewing lead document:', error)
    return NextResponse.json({ error: 'Error al revisar documento' }, { status: 500 })
  }
}
