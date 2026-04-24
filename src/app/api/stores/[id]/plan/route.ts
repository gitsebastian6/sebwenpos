import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calculatePlanDates } from '@/lib/plan-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const updatePlanSchema = z.object({
  plan: z.enum(['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE']),
  days: z.number().int().min(1).optional(),
})

// PUT /api/stores/[id]/plan — Change a store's plan (super admin only via UI gate)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = updatePlanSchema.parse(body)

    const store = await db.store.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true, name: true,
        subscription: { select: { plan: true, startDate: true, endDate: true } },
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const { planStartDate, planExpiresAt } = calculatePlanDates(data.plan, data.days)

    const updated = await db.store.update({
      where: { id: parseInt(id) },
      data: {
        subscription: {
          upsert: {
            create: { planId: 1, status: data.plan === 'TRIAL' ? 'TRIAL' : 'ACTIVE', startDate: planStartDate, endDate: planExpiresAt, billingPeriod: data.plan === 'TRIAL' ? 'TRIAL' : 'MONTHLY', billingPrice: 0 },
            update: { startDate: planStartDate, endDate: planExpiresAt },
          },
        },
      },
      select: {
        id: true,
        name: true,
        subscription: { select: { plan: true, startDate: true, endDate: true } },
      },
    })

    return NextResponse.json({
      message: `Plan de "${store.name}" actualizado a ${data.plan}`,
      store: {
        id: updated.id,
        name: updated.name,
        plan: updated.subscription?.plan?.name || data.plan,
        planStartDate: updated.subscription?.startDate?.toISOString() || planStartDate?.toISOString() || null,
        planExpiresAt: updated.subscription?.endDate?.toISOString() || planExpiresAt?.toISOString() || null,
      },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al actualizar el plan' }, { status: 500 })
  }
}
