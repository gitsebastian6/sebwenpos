import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const featuresSchema = z.object({
  electronicInvoicing: z.boolean().optional(),
  multiStore: z.boolean().optional(),
  reports: z.boolean().optional(),
  support: z.enum(['none', 'email', 'dedicated']).optional(),
  priority: z.boolean().optional(),
  advancedInventory: z.boolean().optional(),
  api: z.boolean().optional(),
  customBranding: z.boolean().optional(),
  multiCurrency: z.boolean().optional(),
}).optional()

const createPlanSchema = z.object({
  name: z.string().min(2, 'Nombre del plan es requerido (mín. 2 caracteres)'),
  description: z.string().optional().nullable(),
  price: z.number().int().min(0, 'El precio debe ser mayor o igual a 0'),
  maxStores: z.number().int().min(1, 'Mín. 1 tienda').default(1),
  maxEmployees: z.number().int().min(-1, 'Use -1 para ilimitado').default(5),
  maxProducts: z.number().int().min(-1, 'Use -1 para ilimitado').default(100),
  features: featuresSchema.default({}),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

/**
 * GET /api/super-admin/plans
 * List all plans ordered by sortOrder
 */
export async function GET() {
  try {
    const plans = await db.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    })

    const formatted = plans.map(plan => ({
      ...plan,
      features: JSON.parse(plan.features),
      subscriptionCount: plan._count.subscriptions,
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    logger.error('Error listing plans:', error)
    return NextResponse.json({ error: 'Error al listar planes' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/plans
 * Create a new plan
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createPlanSchema.parse(body)

    const existing = await db.plan.findUnique({ where: { name: data.name } })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 400 })
    }

    const plan = await db.plan.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        maxStores: data.maxStores,
        maxEmployees: data.maxEmployees,
        maxProducts: data.maxProducts,
        features: JSON.stringify(data.features),
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    })

    return NextResponse.json({
      ...plan,
      features: JSON.parse(plan.features),
      message: `Plan "${data.name}" creado exitosamente`,
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Create plan error:', error)
    return NextResponse.json({ error: 'Error al crear plan' }, { status: 500 })
  }
}
