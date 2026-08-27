import { requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { calcLineTax, type TaxRateInfo } from '@/domain/sales/tax-calculator'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ─────────────────────────────────────────────

const updateItemSchema = z.object({
  id: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  productName: z.string().max(200).optional(),
  quantity: z.number().min(0.001).optional(),
  unitPrice: z.number().int().min(0).optional(),
  notes: z.string().max(200).nullable().optional(),
})

const updateQuotationSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  customerName: z.string().max(200).nullable().optional(),
  customerNit: z.string().max(20).nullable().optional(),
  customerEmail: z.string().max(200).email().nullable().optional().or(z.literal('')),
  customerPhone: z.string().max(20).nullable().optional(),
  customerAddress: z.string().max(300).nullable().optional(),
  items: z.array(updateItemSchema).optional(),
  discountAmount: z.number().int().min(0).optional(),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
})

// ─── GET /api/quotations/[id] ───────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const quotation = await db.quotation.findFirst({
      where: { id: Number(id), storeId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, nit: true } },
        items: { orderBy: { id: 'asc' } },
      },
    })

    if (!quotation) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      id: quotation.id,
      storeId: quotation.storeId,
      quotationNumber: quotation.quotationNumber,
      customerName: quotation.customer?.name ?? quotation.customerName ?? null,
      customerNit: quotation.customer?.nit ?? quotation.customerNit ?? null,
      customerEmail: quotation.customer?.email ?? quotation.customerEmail ?? null,
      customerPhone: quotation.customer?.phone ?? quotation.customerPhone ?? null,
      customerAddress: quotation.customerAddress ?? null,
      customerId: quotation.customerId ?? null,
      customer: quotation.customer,
      subtotal: Number(quotation.subtotal),
      taxAmount: Number(quotation.taxAmount),
      taxBreakdown: quotation.taxBreakdown ? JSON.parse(quotation.taxBreakdown) : null,
      discountAmount: Number(quotation.discountAmount),
      discountType: quotation.discountType,
      total: Number(quotation.total),
      validUntil: quotation.validUntil?.toISOString() ?? null,
      notes: quotation.notes,
      status: quotation.status,
      convertedToOrderId: quotation.convertedToOrderId ?? null,
      createdAt: quotation.createdAt.toISOString(),
      updatedAt: quotation.updatedAt.toISOString(),
      items: quotation.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        presentationId: item.presentationId,
        presentationName: item.presentationName,
        unitsPerPack: item.unitsPerPack,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
        taxCode: item.taxCode,
        taxRate: item.taxRate,
        taxAmount: Number(item.taxAmount),
        taxBase: Number(item.taxBase),
        notes: item.notes,
      })),
    })
  } catch (error) {
    logger.error('GET /api/quotations/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ─── PUT /api/quotations/[id] ───────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req_json(request)
    const data = updateQuotationSchema.parse(body)
    const storeId = body.storeId as number

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const quotation = await db.quotation.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!quotation) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    if (quotation.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Solo se pueden editar cotizaciones activas. Estado actual: ${quotation.status}` },
        { status: 400 },
      )
    }

    // If cancelling status
    if (data.status === 'CANCELLED') {
      await db.quotation.update({
        where: { id: quotation.id },
        data: { status: 'CANCELLED' },
      })
      return NextResponse.json({ success: true, message: 'Cotización cancelada' })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (data.customerId !== undefined) updateData.customerId = data.customerId
    if (data.customerName !== undefined) updateData.customerName = data.customerName
    if (data.customerNit !== undefined) updateData.customerNit = data.customerNit
    if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail || null
    if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone
    if (data.customerAddress !== undefined) updateData.customerAddress = data.customerAddress
    if (data.validUntil !== undefined) updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount
    if (data.discountType !== undefined) updateData.discountType = data.discountType

    // Recalculate totals if items changed
    if (data.items && data.items.length > 0) {
      // Fetch tax info for products
      const productIds = [...new Set(data.items.map((i) => i.productId).filter(Boolean) as number[])]
      const products = await db.product.findMany({
        where: { id: { in: productIds }, storeId },
        select: { id: true, name: true, salePrice: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true } } },
      })
      const productMap = new Map<number, typeof products[0]>()
      for (const p of products) productMap.set(p.id, p)

      const defaultTaxRate = await db.taxRate.findFirst({
        where: { storeId, isDefault: true, category: 'SALES_TAX', isActive: true },
      })

      const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
      let totalTaxAmount = 0

      const itemsData = data.items.map((item) => {
        const product = item.productId ? productMap.get(item.productId) : null
        const unitPrice = item.unitPrice ?? product?.salePrice ?? 0
        const qty = item.quantity ?? 1
        const totalRow = unitPrice * qty
        const effectiveTax = product?.taxRate
          ? { code: product.taxRate.code, rate: product.taxRate.rate, rateType: product.taxRate.rateType }
          : defaultTaxRate
            ? { code: defaultTaxRate.code, rate: defaultTaxRate.rate, rateType: defaultTaxRate.rateType }
            : null
        const tax = calcLineTax(totalRow, effectiveTax as TaxRateInfo | null)

        if (tax.taxCode) {
          const key = tax.taxCode
          if (!taxBreakdownMap[key]) {
            taxBreakdownMap[key] = { code: key, name: key, base: 0, rate: tax.taxRate, amount: 0 }
          }
          taxBreakdownMap[key].base += tax.taxBase
          taxBreakdownMap[key].amount += tax.taxAmount
        }
        totalTaxAmount += tax.taxAmount

        return {
          productId: item.productId ?? null,
          productName: item.productName ?? product?.name ?? '',
          quantity: qty,
          unitPrice,
          totalRow,
          taxCode: tax.taxCode,
          taxRate: tax.taxRate,
          taxAmount: tax.taxAmount,
          taxBase: tax.taxBase,
          notes: item.notes ?? null,
        }
      })

      // Resolve tax rate names
      const allTaxCodes = Object.keys(taxBreakdownMap)
      if (allTaxCodes.length > 0) {
        const taxRateRecords = await db.taxRate.findMany({
          where: { storeId, code: { in: allTaxCodes } },
          select: { code: true, name: true },
        })
        for (const tr of taxRateRecords) {
          if (taxBreakdownMap[tr.code]) {
            taxBreakdownMap[tr.code].name = tr.name
          }
        }
      }

      const subtotal = itemsData.reduce((sum, i) => sum + i.totalRow, 0)
      const taxBreakdownJson = Object.keys(taxBreakdownMap).length > 0
        ? JSON.stringify(Object.values(taxBreakdownMap))
        : null

      const discountType = data.discountType ?? quotation.discountType
      const discountAmt = data.discountAmount ?? quotation.discountAmount
      let discountAmount = 0
      if (discountType === 'PERCENTAGE' && discountAmt > 0) {
        discountAmount = Math.round(subtotal * (discountAmt / 100))
      } else if (discountType === 'FIXED') {
        discountAmount = Math.min(discountAmt, subtotal)
      }
      const total = subtotal - discountAmount

      updateData.subtotal = subtotal
      updateData.taxAmount = totalTaxAmount
      updateData.taxBreakdown = taxBreakdownJson
      updateData.discountAmount = discountAmount
      updateData.total = total

      // Delete existing items and recreate
      await db.quotationItem.deleteMany({ where: { quotationId: quotation.id } })
      updateData.items = { create: itemsData }
    }

    const updated = await db.quotation.update({
      where: { id: quotation.id },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true } },
        items: { orderBy: { id: 'asc' } },
      },
    })

    return NextResponse.json({
      id: updated.id,
      quotationNumber: updated.quotationNumber,
      customerName: updated.customer?.name ?? updated.customerName ?? null,
      customerNit: updated.customerNit ?? null,
      subtotal: Number(updated.subtotal),
      taxAmount: Number(updated.taxAmount),
      taxBreakdown: updated.taxBreakdown ? JSON.parse(updated.taxBreakdown) : null,
      discountAmount: Number(updated.discountAmount),
      discountType: updated.discountType,
      total: Number(updated.total),
      validUntil: updated.validUntil?.toISOString() ?? null,
      notes: updated.notes,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      items: updated.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
        taxCode: item.taxCode,
        taxRate: item.taxRate,
        taxAmount: Number(item.taxAmount),
        taxBase: Number(item.taxBase),
        notes: item.notes,
      })),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/quotations/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al actualizar la cotización' }, { status: 500 })
  }
}

// ─── DELETE /api/quotations/[id] ────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const quotation = await db.quotation.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!quotation) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    if (quotation.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Solo se pueden eliminar cotizaciones activas. Estado actual: ${quotation.status}` },
        { status: 400 },
      )
    }

    // Delete items first (cascade should handle, but explicit is safer)
    await db.quotationItem.deleteMany({ where: { quotationId: quotation.id } })
    await db.quotation.delete({ where: { id: quotation.id } })

    return NextResponse.json({ success: true, message: 'Cotización eliminada' })
  } catch (error) {
    logger.error('DELETE /api/quotations/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al eliminar la cotización' }, { status: 500 })
  }
}

// ─── Helper to parse body ───────────────────────────────────

async function req_json(req: NextRequest): Promise<Record<string, unknown>> {
  return req.json()
}
