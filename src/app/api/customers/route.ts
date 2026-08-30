import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const createCustomerSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  phone: z.string().max(30).optional().nullable().default(null),
  email: z.string().email('Email inválido').max(200).optional().nullable().default(null),
  nit: z.string().max(30).optional().nullable().default(null),
  documentType: z.string().max(20).optional().nullable().default(null),
  address: z.string().max(300).optional().nullable().default(null),
  regime: z.string().max(50).optional().nullable().default(null),
})

// GET /api/customers?storeId=X&q=search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const q = searchParams.get('q')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const skip = (page - 1) * limit

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const where: Record<string, unknown> = { storeId }

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
      ]
    }

    const [total, customers] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        nit: true,
        totalDebt: true,
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    }),
    ])

    return NextResponse.json({
      data: customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('GET /api/customers error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/customers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createCustomerSchema.parse(body)

    const storeAccessErr = requireStoreAccess(request, data.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'customers')
    if (permErr) return permErr

    const customer = await db.customer.create({
      data: {
        storeId: data.storeId,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        nit: data.nit?.trim() || null,
        documentType: data.documentType || null,
        address: data.address?.trim() || null,
        regime: data.regime || null,
      },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/customers error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
