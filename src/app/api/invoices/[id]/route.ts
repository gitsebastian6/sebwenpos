import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission, requireAnyPermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validacion ───────────────────────────────────────────────

const updateInvoiceSchema = z.object({
  status: z.enum([
    'DRAFT',
    'PENDING_VALIDATE',
    'VALIDATED',
    'DELIVERED',
    'REJECTED',
    'CANCELLED',
  ]).optional(),
  dianResponse: z.string().max(5000).optional(),
  dianErrorCode: z.string().max(50).optional(),
  sentAt: z.string().datetime().optional().nullable(),
  validatedAt: z.string().datetime().optional().nullable(),
  emailedAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional(),
})

// ─── GET: Obtener factura completa ────────────────────────────────────────
// GET /api/invoices/[id]?storeId=X

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const permErr = await requireAnyPermission(request, ['invoices', 'pos'])
    if (permErr) return permErr

    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
      include: {
        order: {
          include: {
            customer: {
              select: { name: true, phone: true, email: true },
            },
            orderItems: {
              include: {
                product: { select: { name: true } },
                service: { select: { name: true } },
              },
            },
          },
        },
        store: {
          select: {
            name: true,
            legalName: true,
            nit: true,
            address: true,
            phone: true,
            currencyCode: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const result = {
      id: invoice.id,
      invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
      prefix: invoice.prefix,
      consecutive: invoice.consecutive,
      resolutionNumber: invoice.resolutionNumber,
      resolutionDate: invoice.resolutionDate?.toISOString() ?? null,
      // Cliente
      customerNit: invoice.customerNit,
      customerName: invoice.customerName,
      customerAddress: invoice.customerAddress,
      customerPhone: invoice.customerPhone,
      customerEmail: invoice.customerEmail,
      customerRegime: invoice.customerRegime,
      customerType: invoice.customerType,
      // Tributario
      subtotalBase: Number(invoice.subtotalBase),
      taxExemptAmount: Number(invoice.taxExemptAmount),
      taxBreakdown: JSON.parse(invoice.taxBreakdown || '[]'),
      totalTaxAmount: Number(invoice.totalTaxAmount),
      totalWithTax: Number(invoice.totalWithTax),
      discountAmount: Number(invoice.discountAmount),
      tipAmount: Number(invoice.tipAmount),
      grandTotal: Number(invoice.grandTotal),
      paymentMethod: invoice.paymentMethod,
      paymentNotes: invoice.paymentNotes,
      // DIAN
      cufe: invoice.cufe,
      qrCode: invoice.qrCode,
      xmlContent: invoice.xmlContent,
      // Estado
      status: invoice.status,
      dianResponse: invoice.dianResponse,
      dianErrorCode: invoice.dianErrorCode,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      validatedAt: invoice.validatedAt?.toISOString() ?? null,
      emailedAt: invoice.emailedAt?.toISOString() ?? null,
      notes: invoice.notes,
      testMode: invoice.testMode,
      // Metadatos
      orderId: invoice.orderId,
      createdAt: invoice.createdAt.toISOString(),
      // Relaciones
      order: {
        id: invoice.order.id,
        orderNumber: invoice.order.orderNumber,
        paymentMethod: invoice.order.paymentMethod,
        customer: invoice.order.customer,
        orderItems: invoice.order.orderItems.map((item) => ({
          id: item.id,
          productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
          productId: item.productId,
          serviceId: item.serviceId,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalRow: Number(item.totalRow),
          taxCode: item.taxCode,
          taxRate: item.taxRate,
          taxAmount: Number(item.taxAmount),
          taxBase: Number(item.taxBase),
          notes: item.notes,
        })),
      },
      store: invoice.store,
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('GET /api/invoices/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al consultar la factura' }, { status: 500 })
  }
}

// ─── PUT: Actualizar factura ──────────────────────────────────────────────
// PUT /api/invoices/[id]?storeId=X

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const body = await request.json()
    const data = updateInvoiceSchema.parse(body)

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'invoices')
    if (permErr) return permErr

    // Verificar que la factura existe
    const existing = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // Construir datos de actualizacion
    const updateData: Record<string, unknown> = {}

    if (data.status !== undefined) {
      // Validar transiciones de estado
      const validTransitions: Record<string, string[]> = {
        'DRAFT': ['PENDING_VALIDATE', 'CANCELLED'],
        'PENDING_VALIDATE': ['VALIDATED', 'REJECTED', 'CANCELLED'],
        'VALIDATED': ['DELIVERED', 'CANCELLED'],
        'DELIVERED': ['CANCELLED'],
        'REJECTED': ['PENDING_VALIDATE'],
        'CANCELLED': [],
      }

      const allowedNext = validTransitions[existing.status] || []
      if (!allowedNext.includes(data.status)) {
        return NextResponse.json(
          {
            error: `Transicion de estado invalida. No se puede pasar de "${existing.status}" a "${data.status}". ` +
              `Estados permitidos: ${allowedNext.length > 0 ? allowedNext.join(', ') : 'ninguno'}.`,
          },
          { status: 400 },
        )
      }

      updateData.status = data.status

      // Auto-set timestamps segun el nuevo estado
      if (data.status === 'PENDING_VALIDATE') {
        updateData.sentAt = new Date()
      }
      if (data.status === 'VALIDATED') {
        updateData.validatedAt = new Date()
      }
    }

    if (data.dianResponse !== undefined) {
      updateData.dianResponse = data.dianResponse || null
    }
    if (data.dianErrorCode !== undefined) {
      updateData.dianErrorCode = data.dianErrorCode || null
    }
    if (data.sentAt !== undefined) {
      updateData.sentAt = data.sentAt ? new Date(data.sentAt) : null
    }
    if (data.validatedAt !== undefined) {
      updateData.validatedAt = data.validatedAt ? new Date(data.validatedAt) : null
    }
    if (data.emailedAt !== undefined) {
      updateData.emailedAt = data.emailedAt ? new Date(data.emailedAt) : null
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes || null
    }

    // Actualizar
    const updated = await db.invoice.update({
      where: { id: Number(id) },
      data: updateData,
    })

    return NextResponse.json({
      id: updated.id,
      invoiceNumber: formatInvoiceNumber(updated.prefix, updated.consecutive),
      status: updated.status,
      dianResponse: updated.dianResponse,
      dianErrorCode: updated.dianErrorCode,
      sentAt: updated.sentAt?.toISOString() ?? null,
      validatedAt: updated.validatedAt?.toISOString() ?? null,
      emailedAt: updated.emailedAt?.toISOString() ?? null,
      notes: updated.notes,
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/invoices/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al actualizar la factura' }, { status: 500 })
  }
}

// ─── DELETE: Eliminar factura (solo DRAFT) ────────────────────────────────
// DELETE /api/invoices/[id]?storeId=X

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    if (invoice.status !== 'DRAFT') {
      return NextResponse.json(
        {
          error: `Solo se pueden eliminar facturas en estado BORRADOR (DRAFT). ` +
            `Esta factura esta en estado "${invoice.status}".`,
        },
        { status: 400 },
      )
    }

    await db.invoice.delete({
      where: { id: Number(id) },
    })

    return NextResponse.json({
      message: `Factura ${formatInvoiceNumber(invoice.prefix, invoice.consecutive)} eliminada correctamente`,
    })
  } catch (error) {
    logger.error('DELETE /api/invoices/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al eliminar la factura' }, { status: 500 })
  }
}
