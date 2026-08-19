import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ─────────────────────────────────────────────

const quotationItemSchema = z.object({
  productId: z.number().int().positive(),
  // Extra presentation being quoted (e.g. "Caja x24"). Omit for the
  // product's own base "Unidad" — matches the same pattern as Compras/Órdenes.
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1),
  notes: z.string().max(200).optional(),
})

const createQuotationSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive().optional(),
  customerName: z.string().max(200).optional(),
  customerNit: z.string().max(20).optional(),
  customerEmail: z.string().max(200).email().optional().or(z.literal('')),
  customerPhone: z.string().max(20).optional(),
  customerAddress: z.string().max(300).optional(),
  items: z.array(quotationItemSchema).min(1, 'La cotización debe tener al menos un producto'),
  discountAmount: z.number().int().min(0).default(0),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
  validUntil: z.string().optional().nullable(),
  notes: z.string().max(500).optional(),
})

// ─── Helper: Calculate Colombian tax-inclusive pricing ──────

function calcTax(totalRow: number, taxRateInfo: { code: string; rate: number; rateType: string } | null) {
  if (!taxRateInfo) {
    return { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: totalRow }
  }
  if (taxRateInfo.code === '03' || taxRateInfo.code === '04') {
    return { taxCode: taxRateInfo.code, taxRate: 0, taxAmount: 0, taxBase: totalRow }
  }
  if (taxRateInfo.rateType === 'PERCENTAGE' && taxRateInfo.rate > 0) {
    const taxBase = Math.round(totalRow / (1 + taxRateInfo.rate / 100))
    const taxAmount = totalRow - taxBase
    return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount, taxBase }
  }
  return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount: 0, taxBase: totalRow }
}

// ─── Helper: Generate sequential quotation number ───────────

async function generateQuotationNumber(storeId: number): Promise<string> {
  const now = new Date()
  const dateStr = now.getFullYear().toString().slice(2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0')
  const prefix = `COT-${dateStr}-`

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const todayCount = await db.quotation.count({
    where: {
      storeId,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  })

  const sequential = (todayCount + 1).toString().padStart(4, '0')
  return `${prefix}${sequential}`
}

// ─── POST: Create quotation ─────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createQuotationSchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError

    // Fetch store's default tax rate
    const defaultTaxRate = await db.taxRate.findFirst({
      where: { storeId: data.storeId, isDefault: true, category: 'SALES_TAX', isActive: true },
    })

    // Resolve products
    const productIds = data.items.map((i) => i.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
      select: { id: true, name: true, salePrice: true, currentStock: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true, applyTo: true } } },
    })
    const productMap = new Map<number, typeof products[0]>()
    for (const p of products) productMap.set(p.id, p)

    // Validate all products exist
    for (const item of data.items) {
      if (!productMap.has(item.productId)) {
        return NextResponse.json(
          { error: `Producto con ID ${item.productId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
    }

    // Resolve presentations (Caja x24, etc.) — always from the DB, and must
    // actually belong to the product they're being quoted under.
    const presentationMap = new Map<number, { id: number; productId: number; name: string; unitLabel: string; unitsPerPack: number; salePrice: number }>()
    const presentationIds = data.items.map((i) => i.presentationId).filter((id): id is number => !!id)
    if (presentationIds.length > 0) {
      const presentations = await db.productPresentation.findMany({
        where: { id: { in: presentationIds }, isActive: true, product: { storeId: data.storeId } },
        select: { id: true, productId: true, name: true, unitLabel: true, unitsPerPack: true, salePrice: true },
      })
      for (const p of presentations) presentationMap.set(p.id, p)
    }
    for (const item of data.items) {
      if (!item.presentationId) continue
      const presentation = presentationMap.get(item.presentationId)
      if (!presentation || presentation.productId !== item.productId) {
        const product = productMap.get(item.productId)
        return NextResponse.json(
          { error: `La presentación seleccionada para "${product?.name || item.productId}" ya no existe o fue desactivada` },
          { status: 400 },
        )
      }
    }

    // Tax breakdown accumulator
    const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
    let totalTaxAmount = 0

    const quotationItemsData = data.items.map((item) => {
      const product = productMap.get(item.productId)!
      const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
      const unitPrice = presentation ? presentation.salePrice : product.salePrice
      const totalRow = unitPrice * item.quantity
      const effectiveTax = product.taxRate
        ? { code: product.taxRate.code, rate: product.taxRate.rate, rateType: product.taxRate.rateType }
        : defaultTaxRate
          ? { code: defaultTaxRate.code, rate: defaultTaxRate.rate, rateType: defaultTaxRate.rateType }
          : null
      const tax = calcTax(totalRow, effectiveTax)

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
        productId: item.productId,
        productName: product.name,
        presentationId: presentation ? presentation.id : null,
        presentationName: presentation ? presentation.name : null,
        unitsPerPack: presentation ? presentation.unitsPerPack : 1,
        quantity: item.quantity,
        unitPrice,
        totalRow,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        taxBase: tax.taxBase,
        notes: item.notes || null,
      }
    })

    // Resolve tax rate names
    const allTaxCodes = Object.keys(taxBreakdownMap)
    if (allTaxCodes.length > 0) {
      const taxRateRecords = await db.taxRate.findMany({
        where: { storeId: data.storeId, code: { in: allTaxCodes } },
        select: { code: true, name: true },
      })
      for (const tr of taxRateRecords) {
        if (taxBreakdownMap[tr.code]) {
          taxBreakdownMap[tr.code].name = tr.name
        }
      }
    }

    const subtotal = quotationItemsData.reduce((sum, i) => sum + i.totalRow, 0)
    const taxBreakdownJson = Object.keys(taxBreakdownMap).length > 0
      ? JSON.stringify(Object.values(taxBreakdownMap))
      : null

    // Calculate discount
    let discountAmount = 0
    if (data.discountType === 'PERCENTAGE' && data.discountAmount > 0) {
      discountAmount = Math.round(subtotal * (data.discountAmount / 100))
    } else if (data.discountType === 'FIXED') {
      discountAmount = Math.min(data.discountAmount, subtotal)
    }
    const total = subtotal - discountAmount

    const quotationNumber = await generateQuotationNumber(data.storeId)

    const quotation = await db.quotation.create({
      data: {
        storeId: data.storeId,
        customerId: data.customerId ?? null,
        quotationNumber,
        customerName: data.customerName || null,
        customerNit: data.customerNit || null,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        customerAddress: data.customerAddress || null,
        subtotal,
        taxAmount: totalTaxAmount,
        taxBreakdown: taxBreakdownJson,
        discountAmount,
        discountType: data.discountType,
        total,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes || null,
        status: 'ACTIVE',
        items: { create: quotationItemsData },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        items: true,
      },
    })

    return NextResponse.json({
      id: quotation.id,
      storeId: quotation.storeId,
      quotationNumber: quotation.quotationNumber,
      customerName: quotation.customerName,
      customerNit: quotation.customerNit,
      customerEmail: quotation.customerEmail,
      customerPhone: quotation.customerPhone,
      customerAddress: quotation.customerAddress,
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
      createdAt: quotation.createdAt.toISOString(),
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
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/quotations error:', error)
    return NextResponse.json({ error: 'Error interno al crear la cotización' }, { status: 500 })
  }
}

// ─── GET: List quotations ───────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const q = searchParams.get('q')?.trim()

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const where: Record<string, unknown> = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) {
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        dateFilter.lte = endDate
      }
      where.createdAt = dateFilter
    }

    if (q) {
      where.OR = [
        { quotationNumber: { contains: q } },
        { customerName: { contains: q } },
      ]
    }

    const quotations = await db.quotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        quotationNumber: true,
        customerName: true,
        customerNit: true,
        total: true,
        status: true,
        validUntil: true,
        createdAt: true,
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    })

    return NextResponse.json(quotations.map((q) => ({
      id: q.id,
      quotationNumber: q.quotationNumber,
      customerName: q.customer?.name ?? q.customerName ?? null,
      customerNit: q.customerNit ?? null,
      total: Number(q.total),
      status: q.status,
      validUntil: q.validUntil?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
      itemCount: q._count.items,
    })))
  } catch (error) {
    logger.error('GET /api/quotations error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
