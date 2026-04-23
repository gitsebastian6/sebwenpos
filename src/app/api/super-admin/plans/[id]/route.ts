import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { parsePlanFeatures } from '@/lib/subscription-helpers'

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

const updatePlanSchema = z.object({
  name: z.string().min(2, 'Nombre del plan es requerido (mín. 2 caracteres)').optional(),
  description: z.string().optional().nullable(),
  price: z.number().int().min(0, 'El precio debe ser mayor o igual a 0').optional(),
  maxStores: z.number().int().min(1, 'Mín. 1 tienda').optional(),
  maxEmployees: z.number().int().min(-1, 'Use -1 para ilimitado').optional(),
  maxProducts: z.number().int().min(-1, 'Use -1 para ilimitado').optional(),
  features: featuresSchema,
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

/**
 * GET /api/super-admin/plans/[id]
 * Get a single plan by ID
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const planId = Number(id)
    if (isNaN(planId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const plan = await db.plan.findUnique({
      where: { id: planId },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      ...plan,
      features: parsePlanFeatures(plan.features),
      subscriptionCount: plan._count.subscriptions,
    })
  } catch (error) {
    logger.error('Error fetching plan:', error)
    return NextResponse.json({ error: 'Error al obtener plan' }, { status: 500 })
  }
}

/**
 * PUT /api/super-admin/plans/[id]
 * Update an existing plan
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const planId = Number(id)
    if (isNaN(planId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updatePlanSchema.parse(body)

    const existing = await db.plan.findUnique({ where: { id: planId } })
    if (!existing) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }

    // Check name uniqueness if changing
    if (data.name && data.name !== existing.name) {
      const nameTaken = await db.plan.findUnique({ where: { name: data.name } })
      if (nameTaken) {
        return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.price !== undefined) updateData.price = data.price
    if (data.maxStores !== undefined) updateData.maxStores = data.maxStores
    if (data.maxEmployees !== undefined) updateData.maxEmployees = data.maxEmployees
    if (data.maxProducts !== undefined) updateData.maxProducts = data.maxProducts
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.features !== undefined) updateData.features = JSON.stringify(data.features)

    const plan = await db.plan.update({
      where: { id: planId },
      data: updateData,
    })

    return NextResponse.json({
      ...plan,
      features: parsePlanFeatures(plan.features),
      message: `Plan "${plan.name}" actualizado exitosamente`,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Update plan error:', error)
    return NextResponse.json({ error: 'Error al actualizar plan' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/plans/[id]
 * Delete a plan (only if no active subscriptions use it)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const planId = Number(id)
    if (isNaN(planId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const plan = await db.plan.findUnique({
      where: { id: planId },
      include: {
        subscriptions: {
          where: {
            status: { in: ['TRIAL', 'ACTIVE'] },
          },
        },
      },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }

    if (plan.subscriptions.length > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar el plan "${plan.name}". Tiene ${plan.subscriptions.length} suscripción(es) activa(s).`,
        },
        { status: 409 },
      )
    }

    await db.plan.delete({ where: { id: planId } })

    return NextResponse.json({ message: `Plan "${plan.name}" eliminado exitosamente` })
  } catch (error) {
    logger.error('Delete plan error:', error)
    return NextResponse.json({ error: 'Error al eliminar plan' }, { status: 500 })
  }
}
