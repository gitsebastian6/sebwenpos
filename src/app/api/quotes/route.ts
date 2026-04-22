import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod schemas ─────────────────────────────────────────────

const quoteItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  productName: z.string().min(1, 'Nombre del producto requerido'),
  quantity: z.number().int().min(1, 'Cantidad mínima es 1'),
  unitPrice: z.number().int().min(0, 'Precio unitario mínimo es 0'),
  taxRate: z.number().int().min(0).default(0),
  notes: z.string().max(200).optional(),
}).refine((d) => d.productId || d.serviceId, {
  message: 'Debe especificar productId o serviceId',
}).refine((d) => !(d.productId && d.serviceId), {
  message: 'Solo puede especificar productId o serviceId, no ambos',
})

const createQuoteSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  customerName: z.string().max(150).nullable().optional(),
  customerPhone: z.string().max(20).nullable().optional(),
  customerEmail: z.string().email().max(200).nullable().optional(),
  validityDays: z.number().int().min(1).max(365).default(15),
  notes: z.string().max(1000).nullable().optional(),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
  discountAmount: z.number().int().min(0).default(0),
  items: z.array(quoteItemSchema).min(1, 'La cotización debe tener al menos un producto o servicio'),
})

// ─── POST: Create quote ─────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createQuoteSchema.parse(body)

    // Validate store exists
    const store = await db.store.findUnique({
      where: { id: data.storeId },
      select: { id: true },
    })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 400 })
    }

    // Validate customer exists if provided
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, storeId: data.storeId },
        select: { id: true, name: true, phone: true, email: true },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 400 })
      }
    }

    // Validate products/services exist
    const productIds = data.items.filter(i => i.productId).map(i => i.productId!)
    const serviceIds = data.items.filter(i => i.serviceId).map(i => i.serviceId!)

    if (productIds.length > 0) {
      const products = await db.product.findMany({
        where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, salePrice: true },
      })
      const productMap = new Map(products.map(p => [p.id, p]))
      for (const item of data.items.filter(i => i.productId)) {
        const product = productMap.get(item.productId!)
        if (!product) {
          return NextResponse.json(
            { error: `Producto con ID ${item.productId} no encontrado o inactivo` },
            { status: 400 },
          )
        }
      }
    }

    if (serviceIds.length > 0) {
      const services = await db.service.findMany({
        where: { id: { in: serviceIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, price: true },
      })
      const serviceMap = new Map(services.map(s => [s.id, s]))
      for (const item of data.items.filter(i => i.serviceId)) {
        const service = serviceMap.get(item.serviceId!)
        if (!service) {
          return NextResponse.json(
            { error: `Servicio con ID ${item.serviceId} no encontrado o inactivo` },
            { status: 400 },
          )
        }
      }
    }

    // Calculate totals
    let subtotal = 0
    let totalTax = 0
    const quoteItemsData = data.items.map(item => {
      const totalRow = item.unitPrice * item.quantity
      const taxAmount = item.taxRate > 0 ? Math.round(totalRow * item.taxRate / (100 + item.taxRate)) : 0
      subtotal += totalRow
      totalTax += taxAmount
      return {
        productId: item.productId ?? null,
        serviceId: item.serviceId ?? null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalRow,
        taxRate: item.taxRate,
        taxAmount,
        notes: item.notes ?? null,
      }
    })

    // Calculate discount
    let discountAmount = 0
    if (data.discountType === 'PERCENTAGE' && data.discountAmount > 0) {
      discountAmount = Math.round(subtotal * (data.discountAmount / 100))
    } else if (data.discountType === 'FIXED') {
      discountAmount = Math.min(data.discountAmount, subtotal)
    }

    const total = subtotal - discountAmount + totalTax

    // Generate quote number: COT-000001 format
    const lastQuote = await db.quote.findFirst({
      where: { storeId: data.storeId },
      orderBy: { id: 'desc' },
      select: { quoteNumber: true },
    })
    let nextNumber = 1
    if (lastQuote?.quoteNumber) {
      const match = lastQuote.quoteNumber.match(/COT-(\d+)/)
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1
      }
    }
    const quoteNumber = `COT-${nextNumber.toString().padStart(6, '0')}`

    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + data.validityDays)

    // Customer name: use provided or from customer record
    let customerName = data.customerName
    if (!customerName && data.customerId) {
      const cust = await db.customer.findUnique({
        where: { id: data.customerId },
        select: { name: true, phone: true, email: true },
      })
      if (cust) {
        customerName = cust.name
      }
    }

    // Create quote with items in transaction
    const quote = await db.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          storeId: data.storeId,
          quoteNumber,
          customerId: data.customerId ?? null,
          customerName: customerName ?? null,
          customerPhone: data.customerPhone ?? null,
          customerEmail: data.customerEmail ?? null,
          subtotal,
          taxAmount: totalTax,
          discountAmount,
          discountType: data.discountType,
          total,
          status: 'DRAFT',
          validityDays: data.validityDays,
          expiresAt,
          notes: data.notes ?? null,
          items: { create: quoteItemsData },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          items: true,
        },
      })
      return created
    })

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/quotes error:', error)
    return NextResponse.json({ error: 'Error interno al crear la cotización' }, { status: 500 })
  }
}

// ─── GET: List quotes ───────────────────────────────────────

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
      where.createdAt = {}
      if (from) {
        where.createdAt.gte = new Date(from)
      }
      if (to) {
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = endDate
      }
    }

    if (q) {
      where.OR = [
        { quoteNumber: { contains: q } },
        { customerName: { contains: q } },
        { customerPhone: { contains: q } },
        { customerEmail: { contains: q } },
      ]
    }

    const quotes = await db.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        quoteNumber: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        discountType: true,
        total: true,
        status: true,
        validityDays: true,
        expiresAt: true,
        createdAt: true,
        customer: {
          select: { name: true },
        },
        _count: {
          select: { items: true },
        },
      },
    })

    // Check for expired quotes and update them
    const now = new Date()
    const expiredIds = quotes
      .filter(q => q.status === 'DRAFT' && q.expiresAt && new Date(q.expiresAt) < now)
      .map(q => q.id)

    if (expiredIds.length > 0) {
      await db.quote.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      })
      // Update local status for response
      for (const q of quotes) {
        if (expiredIds.includes(q.id)) {
          q.status = 'EXPIRED'
        }
      }
    }

    const result = quotes.map((quote) => ({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      customerName: quote.customer?.name ?? quote.customerName ?? null,
      customerPhone: quote.customerPhone ?? null,
      customerEmail: quote.customerEmail ?? null,
      subtotal: Number(quote.subtotal),
      taxAmount: Number(quote.taxAmount),
      discountAmount: Number(quote.discountAmount),
      discountType: quote.discountType,
      total: Number(quote.total),
      status: quote.status,
      validityDays: quote.validityDays,
      expiresAt: quote.expiresAt?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
      itemCount: quote._count.items,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/quotes error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
