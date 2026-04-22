import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { EVENT_LABELS, STATUS_LABELS } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/history?storeId=N
 * Returns subscription change history for the store (plan changes, renewals, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = parseInt(req.nextUrl.searchParams.get('storeId') || '0', 10)
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const accessErr = requireStoreAccess(req, storeId)
    if (accessErr) return accessErr

    const history = await db.subscriptionHistory.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(
      history.map((h) => ({
        id: h.id,
        eventType: h.eventType,
        eventLabel: EVENT_LABELS[h.eventType] || h.eventType,
        previousStatus: h.previousStatus ? STATUS_LABELS[h.previousStatus] || h.previousStatus : null,
        newStatus: h.newStatus ? STATUS_LABELS[h.newStatus] || h.newStatus : null,
        previousPlanName: h.previousPlanName,
        newPlanName: h.newPlanName,
        description: h.description,
        metadata: (() => { try { return JSON.parse(h.metadata) } catch { return {} } })(),
        createdAt: h.createdAt,
      }))
    )
  } catch (error) {
    console.error('GET /api/subscription/history error:', error)
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}
