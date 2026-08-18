import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// A product's own sku/barcode/salePrice/costPrice ARE its "Unidad" (base)
// presentation — this array only covers EXTRA presentations (max 2, so 3 total).
const presentationSchema = z.object({
  name: z.string().min(1, 'El nombre de la presentación es obligatorio').max(100),
  unitLabel: z.string().max(10).default('UND'),
  barcode: z.string().max(100).optional().or(z.literal('')),
  sku: z.string().max(100).optional().or(z.literal('')),
  unitsPerPack: z.number().int().min(1, 'Debe equivaler a 1 o más unidades base'),
  salePrice: z.number().int().min(1, 'El precio de venta debe ser mayor a 0'),
  costPrice: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const createProductSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  unitLabel: z.string().max(10).default('UND'),
  categoryId: z.number().int().positive().optional(),
  providerId: z.number().int().positive().optional(),
  taxRateId: z.number().int().positive().optional(),
  description: z.string().max(1000).optional(),
  imgUrl: z.string().max(500).nullable().optional(),
  invima: z.string().max(100).nullable().optional(),
  costPrice: z.number().int().min(0).default(0),
  salePrice: z.number().int().min(1, 'El precio de venta debe ser mayor a 0'),
  minStock: z.number().int().min(0).default(5),
  trackInventory: z.boolean().default(true),
  trackExpiration: z.boolean().default(false),
  isActive: z.boolean().default(true),
  presentations: z.array(presentationSchema).max(2, 'Máximo 2 presentaciones adicionales').optional(),
})

// GET /api/products?storeId=X&q=search&categoryId=Y&active=true
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')
    const q = searchParams.get('q') || ''
    const categoryId = searchParams.get('categoryId')
    const active = searchParams.get('active')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100')))
    const skip = (page - 1) * limit

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeIdNum = Number(storeId)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, storeIdNum)
    if (storeAccessError) return storeAccessError

    const where: Record<string, unknown> = {
      storeId: storeIdNum,
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

    const [total, products] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        skip,
        take: limit,
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
        presentations: { orderBy: { sortOrder: 'asc' } },
        _count: {
          select: { orderItems: true },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    }),
    ])

    return NextResponse.json({
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('GET /api/products error:', error)
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 })
  }
}

// POST /api/products
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createProductSchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError

    // Verify category belongs to store if provided
    if (data.categoryId) {
      const category = await db.category.findFirst({
        where: { id: data.categoryId, storeId: data.storeId },
      })
      if (!category) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 400 })
      }
    }

    // Verify provider belongs to store if provided
    if (data.providerId) {
      const provider = await db.provider.findFirst({
        where: { id: data.providerId, storeId: data.storeId },
      })
      if (!provider) {
        return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })
      }
    }

    // Verify tax rate belongs to store if provided
    if (data.taxRateId) {
      const taxRate = await db.taxRate.findFirst({
        where: { id: data.taxRateId, storeId: data.storeId },
      })
      if (!taxRate) {
        return NextResponse.json({ error: 'Tasa de impuesto no encontrada' }, { status: 400 })
      }
    }

    // ---- CHECK SUBSCRIPTION PLAN LIMIT ----
    const subscription = await db.subscription.findUnique({
      where: { storeId: data.storeId },
      include: { plan: { select: { maxProducts: true } } },
    })

    if (subscription) {
      const maxProducts = subscription.plan.maxProducts
      if (maxProducts !== -1) {
        const currentCount = await db.product.count({
          where: { storeId: data.storeId },
        })
        if (currentCount >= maxProducts) {
          return NextResponse.json({
            error: `Límite de productos alcanzado (${maxProducts}). Actualice su plan para agregar más productos.`,
            limitReached: true,
            current: currentCount,
            max: maxProducts,
          }, { status: 403 })
        }
      }
    }

    const product = await db.product.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        sku: data.sku || null,
        barcode: data.barcode || null,
        unitLabel: data.unitLabel,
        categoryId: data.categoryId || null,
        providerId: data.providerId || null,
        taxRateId: data.taxRateId || null,
        description: data.description || null,
        imgUrl: data.imgUrl || null,
        invima: data.invima || null,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        minStock: data.minStock,
        trackInventory: data.trackInventory,
        trackExpiration: data.trackExpiration,
        isActive: data.isActive,
        ...(data.presentations?.length ? {
          presentations: {
            create: data.presentations.map((p, i) => ({
              name: p.name,
              unitLabel: p.unitLabel,
              barcode: p.barcode || null,
              sku: p.sku || null,
              unitsPerPack: p.unitsPerPack,
              salePrice: p.salePrice,
              costPrice: p.costPrice,
              isActive: p.isActive,
              sortOrder: i,
            })),
          },
        } : {}),
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
        presentations: { orderBy: { sortOrder: 'asc' } },
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
    logger.error('POST /api/products error:', error)
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 })
  }
}
