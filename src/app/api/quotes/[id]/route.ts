import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod schemas ─────────────────────────────────────────────

const updateQuoteItemSchema = z.object({
  id: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  productName: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().int().min(0).optional(),
  taxRate: z.number().int().min(0).optional(),
  notes: z.string().max(200).nullable().optional(),
}).refine((d) => !d.productId || !d.serviceId, {
  message: 'Solo puede especificar productId o serviceId, no ambos',
})

const updateQuoteSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
  customerName: z.string().max(150).nullable().optional(),
  customerPhone: z.string().max(20).nullable().optional(),
  customerEmail: z.string().email().max(200).nullable().optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(1000).nullable().optional(),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).optional(),
  discountAmount: z.number().int().min(0).optional(),
  items: z.array(updateQuoteItemSchema).min(1).optional(),
})

// ─── GET: Quote detail ──────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const quoteId = parseInt(id, 10)
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, nit: true } },
        items: {
          include: {
            product: { select: { name: true, salePrice: true, currentStock: true, category: { select: { name: true } } } },
            service: { select: { name: true, price: true } },
          },
        },
        order: { select: { id: true, orderNumber: true, status: true, total: true, createdAt: true } },
      },
    })

    if (!quote) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    // Check for expired
    const now = new Date()
    let status = quote.status
    if (status === 'DRAFT' && quote.expiresAt && new Date(quote.expiresAt) < now) {
      await db.quote.update({ where: { id: quoteId }, data: { status: 'EXPIRED' } })
      status = 'EXPIRED'
    }

    return NextResponse.json({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      customerName: quote.customer?.name ?? quote.customerName ?? null,
      customerPhone: quote.customer?.phone ?? quote.customerPhone ?? null,
      customerEmail: quote.customer?.email ?? quote.customerEmail ?? null,
      customerNit: quote.customer?.nit ?? null,
      subtotal: Number(quote.subtotal),
      taxAmount: Number(quote.taxAmount),
      discountAmount: Number(quote.discountAmount),
      discountType: quote.discountType,
      total: Number(quote.total),
      status,
      validityDays: quote.validityDays,
      expiresAt: quote.expiresAt?.toISOString() ?? null,
      notes: quote.notes,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      convertedOrder: quote.order ? {
        id: quote.order.id,
        orderNumber: quote.order.orderNumber,
        status: quote.order.status,
        total: Number(quote.order.total),
        createdAt: quote.order.createdAt.toISOString(),
      } : null,
      items: quote.items.map(item => ({
        id: item.id,
        productId: item.productId,
        serviceId: item.serviceId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
        taxRate: item.taxRate,
        taxAmount: Number(item.taxAmount),
        notes: item.notes,
        product: item.product ? {
          name: item.product.name,
          salePrice: Number(item.product.salePrice),
          currentStock: item.product.currentStock,
          category: item.product.category?.name ?? null,
        } : null,
        service: item.service ? {
          name: item.service.name,
          price: Number(item.service.price),
        } : null,
      })),
    })
  } catch (error) {
    console.error('GET /api/quotes/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ─── PUT: Update quote ──────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const quoteId = parseInt(id, 10)
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const data = updateQuoteSchema.parse(body)

    // Check quote exists
    const existing = await db.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, status: true, storeId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    // Cannot update CONVERTED or REJECTED quotes (except status)
    if ((existing.status === 'CONVERTED' || existing.status === 'REJECTED') && !data.status) {
      return NextResponse.json(
        { error: 'No se puede modificar una cotización convertida o rechazada' },
        { status: 400 },
      )
    }

    // Status transitions validation
    if (data.status) {
      const validTransitions: Record<string, string[]> = {
        DRAFT: ['SENT', 'REJECTED'],
        SENT: ['APPROVED', 'REJECTED'],
        APPROVED: ['REJECTED'],
        REJECTED: [],
        EXPIRED: [],
        CONVERTED: [],
      }
      const allowed = validTransitions[existing.status] || []
      if (!allowed.includes(data.status)) {
        return NextResponse.json(
          { error: `Transición de estado no permitida: ${existing.status} → ${data.status}` },
          { status: 400 },
        )
      }
    }

    // Calculate new totals if items are provided
    const quote = await db.$transaction(async (tx) => {
      if (data.items) {
        // Delete existing items
        await tx.quoteItem.deleteMany({ where: { quoteId } })

        // Create new items and calculate totals
        let subtotal = 0
        let totalTax = 0
        const itemsData = data.items.map(item => {
          const qty = item.quantity ?? 1
          const price = item.unitPrice ?? 0
          const totalRow = price * qty
          const taxRate = item.taxRate ?? 0
          const taxAmount = taxRate > 0 ? Math.round(totalRow * taxRate / (100 + taxRate)) : 0
          subtotal += totalRow
          totalTax += taxAmount
          return {
            productId: item.productId ?? null,
            serviceId: item.serviceId ?? null,
            productName: item.productName ?? 'Producto',
            quantity: qty,
            unitPrice: price,
            totalRow,
            taxRate,
            taxAmount,
            notes: item.notes ?? null,
          }
        })

        // Calculate discount
        const discType = data.discountType ?? 'NONE'
        const discAmt = data.discountAmount ?? 0
        let discountAmount = 0
        if (discType === 'PERCENTAGE' && discAmt > 0) {
          discountAmount = Math.round(subtotal * (discAmt / 100))
        } else if (discType === 'FIXED') {
          discountAmount = Math.min(discAmt, subtotal)
        }

        const total = subtotal - discountAmount + totalTax

        const updated = await tx.quote.update({
          where: { id: quoteId },
          data: {
            status: data.status ?? existing.status,
            customerName: data.customerName !== undefined ? data.customerName : undefined,
            customerPhone: data.customerPhone !== undefined ? data.customerPhone : undefined,
            customerEmail: data.customerEmail !== undefined ? data.customerEmail : undefined,
            validityDays: data.validityDays,
            notes: data.notes !== undefined ? data.notes : undefined,
            discountType: data.discountType ?? 'NONE',
            discountAmount,
            subtotal,
            taxAmount: totalTax,
            total,
            expiresAt: data.validityDays ? (() => {
              const exp = new Date()
              exp.setDate(exp.getDate() + data.validityDays!)
              return exp
            })() : undefined,
            items: { create: itemsData },
          },
          include: {
            customer: { select: { id: true, name: true, phone: true, email: true } },
            items: true,
          },
        })
        return updated
      } else {
        // Simple update without items
        const updateData: Record<string, unknown> = {}
        if (data.status) updateData.status = data.status
        if (data.customerName !== undefined) updateData.customerName = data.customerName
        if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone
        if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail
        if (data.validityDays) {
          updateData.validityDays = data.validityDays
          const exp = new Date()
          exp.setDate(exp.getDate() + data.validityDays)
          updateData.expiresAt = exp
        }
        if (data.notes !== undefined) updateData.notes = data.notes
        if (data.discountType) updateData.discountType = data.discountType
        if (data.discountAmount !== undefined) {
          updateData.discountAmount = data.discountAmount
          // Recalculate total
          const current = await tx.quote.findUnique({ where: { id: quoteId } })
          if (current) {
            let discAmt = 0
            if (data.discountType === 'PERCENTAGE' && data.discountAmount > 0) {
              discAmt = Math.round(Number(current.subtotal) * (data.discountAmount / 100))
            } else if (data.discountType === 'FIXED') {
              discAmt = Math.min(data.discountAmount, Number(current.subtotal))
            }
            updateData.discountAmount = discAmt
            updateData.total = Number(current.subtotal) - discAmt + Number(current.taxAmount)
          }
        }

        const updated = await tx.quote.update({
          where: { id: quoteId },
          data: updateData,
          include: {
            customer: { select: { id: true, name: true, phone: true, email: true } },
            items: true,
          },
        })
        return updated
      }
    })

    return NextResponse.json({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      customerName: quote.customer?.name ?? quote.customerName ?? null,
      customerPhone: quote.customer?.phone ?? quote.customerPhone ?? null,
      customerEmail: quote.customer?.email ?? quote.customerEmail ?? null,
      subtotal: Number(quote.subtotal),
      taxAmount: Number(quote.taxAmount),
      discountAmount: Number(quote.discountAmount),
      discountType: quote.discountType,
      total: Number(quote.total),
      status: quote.status,
      validityDays: quote.validityDays,
      expiresAt: quote.expiresAt?.toISOString() ?? null,
      notes: quote.notes,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      items: quote.items.map(item => ({
        id: item.id,
        productId: item.productId,
        serviceId: item.serviceId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
        taxRate: item.taxRate,
        taxAmount: Number(item.taxAmount),
        notes: item.notes,
      })),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('PUT /api/quotes/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al actualizar la cotización' }, { status: 500 })
  }
}

// ─── DELETE: Delete draft quote ─────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const quoteId = parseInt(id, 10)
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, status: true, quoteNumber: true },
    })

    if (!quote) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    if (quote.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar cotizaciones en estado Borrador' },
        { status: 400 },
      )
    }

    await db.quote.delete({ where: { id: quoteId } })

    return NextResponse.json({ success: true, message: `Cotización ${quote.quoteNumber} eliminada` })
  } catch (error) {
    console.error('DELETE /api/quotes/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al eliminar la cotización' }, { status: 500 })
  }
}
