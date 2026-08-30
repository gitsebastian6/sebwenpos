import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validación ───────────────────────────────────────────────

const updateCreditNoteSchema = z.object({
  concept: z.string().min(3).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

// ─── GET: Obtener nota crédito/débito completa ────────────────────────────
// GET /api/credit-notes/[id]?storeId=X

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'invoices')
    if (permErr) return permErr

    const creditNote = await db.creditNote.findFirst({
      where: { id: Number(id), storeId },
      include: {
        store: {
          select: {
            name: true,
            legalName: true,
            nit: true,
            address: true,
            phone: true,
          },
        },
        invoice: {
          select: {
            id: true,
            prefix: true,
            consecutive: true,
            customerName: true,
            customerNit: true,
            order: {
              select: {
                orderNumber: true,
              },
            },
          },
        },
      },
    })

    if (!creditNote) {
      return NextResponse.json(
        { error: 'Nota crédito/débito no encontrada' },
        { status: 404 },
      )
    }

    const result = {
      id: creditNote.id,
      noteNumber: formatInvoiceNumber(creditNote.prefix, creditNote.consecutive),
      noteType: creditNote.noteType,
      prefix: creditNote.prefix,
      consecutive: creditNote.consecutive,
      resolutionNumber: creditNote.resolutionNumber,
      resolutionDate: creditNote.resolutionDate?.toISOString() ?? null,
      startDate: creditNote.startDate?.toISOString() ?? null,
      endDate: creditNote.endDate?.toISOString() ?? null,
      concept: creditNote.concept,
      description: creditNote.description,
      // Cliente
      customerNit: creditNote.customerNit,
      customerName: creditNote.customerName,
      customerEmail: creditNote.customerEmail,
      customerPhone: creditNote.customerPhone,
      customerAddress: creditNote.customerAddress,
      customerRegime: creditNote.customerRegime,
      customerType: creditNote.customerType,
      // Montos
      subtotalBase: Number(creditNote.subtotalBase),
      taxExemptAmount: Number(creditNote.taxExemptAmount),
      taxBreakdown: JSON.parse(creditNote.taxBreakdown || '[]'),
      totalTaxAmount: Number(creditNote.totalTaxAmount),
      totalWithTax: Number(creditNote.totalWithTax),
      discountAmount: Number(creditNote.discountAmount),
      grandTotal: Number(creditNote.grandTotal),
      // DIAN
      cufe: creditNote.cufe,
      qrCode: creditNote.qrCode,
      xmlContent: creditNote.xmlContent,
      // Referencia a factura original
      referencedInvoiceId: creditNote.referencedInvoiceId,
      referencedPrefix: creditNote.referencedPrefix,
      referencedConsec: creditNote.referencedConsec,
      // Estado
      status: creditNote.status,
      dianResponse: creditNote.dianResponse,
      sentAt: creditNote.sentAt?.toISOString() ?? null,
      validatedAt: creditNote.validatedAt?.toISOString() ?? null,
      emailedAt: creditNote.emailedAt?.toISOString() ?? null,
      testMode: creditNote.testMode,
      notes: creditNote.notes,
      // Metadatos
      invoiceId: creditNote.invoiceId,
      createdAt: creditNote.createdAt.toISOString(),
      // Relaciones
      store: creditNote.store,
      invoice: creditNote.invoice
        ? {
            id: creditNote.invoice.id,
            invoiceNumber: formatInvoiceNumber(
              creditNote.invoice.prefix,
              creditNote.invoice.consecutive,
            ),
            orderNumber: creditNote.invoice.order?.orderNumber ?? null,
          }
        : null,
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('GET /api/credit-notes/[id] error:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar la nota crédito/débito' },
      { status: 500 },
    )
  }
}

// ─── PUT: Actualizar nota crédito/débito (solo DRAFT) ─────────────────────
// PUT /api/credit-notes/[id]?storeId=X

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const body = await request.json()
    const data = updateCreditNoteSchema.parse(body)

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'invoices')
    if (permErr) return permErr

    // Verificar que la nota existe
    const existing = await db.creditNote.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Nota crédito/débito no encontrada' },
        { status: 404 },
      )
    }

    // Solo se pueden actualizar notas en estado DRAFT
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        {
          error: `Solo se pueden editar notas en estado BORRADOR (DRAFT). ` +
            `Esta nota está en estado "${existing.status}".`,
        },
        { status: 400 },
      )
    }

    // Construir datos de actualización
    const updateData: Record<string, unknown> = {}

    if (data.concept !== undefined) {
      updateData.concept = data.concept
    }
    if (data.description !== undefined) {
      updateData.description = data.description
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes
    }

    // Actualizar
    const updated = await db.creditNote.update({
      where: { id: Number(id) },
      data: updateData,
    })

    return NextResponse.json({
      id: updated.id,
      noteNumber: formatInvoiceNumber(updated.prefix, updated.consecutive),
      noteType: updated.noteType,
      concept: updated.concept,
      description: updated.description,
      status: updated.status,
      notes: updated.notes,
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/credit-notes/[id] error:', error)
    return NextResponse.json(
      { error: 'Error interno al actualizar la nota crédito/débito' },
      { status: 500 },
    )
  }
}

// ─── DELETE: Eliminar nota crédito/débito (solo DRAFT) ────────────────────
// DELETE /api/credit-notes/[id]?storeId=X

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'invoices')
    if (permErr) return permErr

    const creditNote = await db.creditNote.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!creditNote) {
      return NextResponse.json(
        { error: 'Nota crédito/débito no encontrada' },
        { status: 404 },
      )
    }

    if (creditNote.status !== 'DRAFT') {
      return NextResponse.json(
        {
          error: `Solo se pueden eliminar notas en estado BORRADOR (DRAFT). ` +
            `Esta nota está en estado "${creditNote.status}".`,
        },
        { status: 400 },
      )
    }

    await db.creditNote.delete({
      where: { id: Number(id) },
    })

    return NextResponse.json({
      message: `Nota ${formatInvoiceNumber(creditNote.prefix, creditNote.consecutive)} eliminada correctamente`,
    })
  } catch (error) {
    logger.error('DELETE /api/credit-notes/[id] error:', error)
    return NextResponse.json(
      { error: 'Error interno al eliminar la nota crédito/débito' },
      { status: 500 },
    )
  }
}
