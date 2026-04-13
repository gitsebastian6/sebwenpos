import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createProductSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  sku: z.string().max(100).optional(),
  categoryId: z.number().int().positive().optional(),
  providerId: z.number().int().positive().optional(),
  taxRateId: z.number().int().positive().optional(),
  description: z.string().max(1000).optional(),
  imgUrl: z.string().max(500).nullable().optional(),
  costPrice: z.number().int().min(0).default(0),
  salePrice: z.number().int().min(1, 'El precio de venta debe ser mayor a 0'),
  minStock: z.number().int().min(0).default(5),
  isActive: z.boolean().default(true),
})

// GET /api/products?storeId=X&q=search&categoryId=Y&active=true
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')
    const q = searchParams.get('q') || ''
    const categoryId = searchParams.get('categoryId')
    const active = searchParams.get('active')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const where: Record<string, unknown> = {
      storeId: Number(storeId),
    }

    if (q) {
      where.name = { contains: q }
    }

    if (categoryId && categoryId !== 'all') {
      where.categoryId = Number(categoryId)
    }

    if (active && active !== 'all') {
      where.isActive = active === 'true'
    }

    const products = await db.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true, icon: true },
        },
        provider: {
          select: { id: true, name: true },
        },
        taxRate: {
          select: { id: true, name: true, code: true, rate: true, rateType: true },
        },
        _count: {
          select: { orderItems: true },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error('GET /api/products error:', error)
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 })
  }
}

// POST /api/products
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createProductSchema.parse(body)

    // Verify category belongs to store if provided
    if (data.categoryId) {
      const category = await db.category.findFirst({
        where: { id: data.categoryId, storeId: data.storeId },
      })
      if (!category) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 400 })
      }
    }

    const product = await db.product.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        sku: data.sku || null,
        categoryId: data.categoryId || null,
        providerId: data.providerId || null,
        taxRateId: data.taxRateId || null,
        description: data.description || null,
        imgUrl: data.imgUrl || null,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        minStock: data.minStock,
        isActive: data.isActive,
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true },
        },
        provider: {
          select: { id: true, name: true },
        },
        taxRate: {
          select: { id: true, name: true, code: true, rate: true, rateType: true },
        },
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json({ error: 'Ya existe un producto con ese nombre o SKU' }, { status: 409 })
    }
    console.error('POST /api/products error:', error)
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 })
  }
}
