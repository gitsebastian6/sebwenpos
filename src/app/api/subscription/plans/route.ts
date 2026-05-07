import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parsePlanFeatures } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/plans
 * Public endpoint: returns active plans for owner plan selection UI.
 */
export async function GET() {
  try {
    const plans = await db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        maxStores: true,
        maxEmployees: true,
        maxProducts: true,
        features: true,
        isActive: true,
      },
    })

    const formatted = plans.map(plan => ({
      ...plan,
      features: parsePlanFeatures(plan.features),
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('GET /api/subscription/plans error:', error)
    return NextResponse.json({ error: 'Error al obtener planes' }, { status: 500 })
  }
}
