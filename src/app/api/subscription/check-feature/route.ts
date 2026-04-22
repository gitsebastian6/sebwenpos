import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { storeHasFeature, PLAN_FEATURES, featureGatedResponse } from '@/lib/subscription-helpers'
import type { PlanFeatureKey } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/check-feature?storeId=N&feature=electronicInvoicing
 * Checks if a store's current plan has a specific feature enabled.
 * Used by frontend to gate UI features and by APIs to block feature access.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = req.nextUrl
    const storeId = parseInt(searchParams.get('storeId') || '0', 10)
    const feature = searchParams.get('feature') as PlanFeatureKey | null

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }
    if (!feature || !(feature in PLAN_FEATURES)) {
      return NextResponse.json(
        { error: `feature inválida. Valores: ${Object.keys(PLAN_FEATURES).join(', ')}` },
        { status: 400 }
      )
    }

    const hasFeature = await storeHasFeature(storeId, feature)

    if (!hasFeature) {
      const check = await (await import('@/lib/subscription-helpers')).checkFeatureAccess(storeId, feature)
      return NextResponse.json({
        enabled: false,
        ...featureGatedResponse(check.feature, check.planName),
      })
    }

    return NextResponse.json({ enabled: true, feature, label: PLAN_FEATURES[feature] })
  } catch (error) {
    console.error('GET /api/subscription/check-feature error:', error)
    return NextResponse.json({ error: 'Error al verificar feature' }, { status: 500 })
  }
}
