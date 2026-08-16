import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const WARNING_WINDOW_DAYS = 30

/**
 * GET /api/super-admin/crm/alerts
 * Leads (draft resolution, pre-conversion) and active clients (Store) whose
 * DIAN resolution is already expired or expires within 30 days.
 */
export async function GET(_req: NextRequest) {
  try {
    const now = new Date()
    const warningThreshold = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const [leadsAtRisk, storesAtRisk] = await Promise.all([
      db.lead.findMany({
        where: {
          stage: { not: 'CLIENTE_ACTIVO' },
          resolutionEndDate: { not: null, lte: warningThreshold },
        },
        select: {
          id: true, storeName: true, nit: true, stage: true,
          resolutionEndDate: true, assignedTo: { select: { id: true, fullName: true } },
        },
        orderBy: { resolutionEndDate: 'asc' },
      }),
      db.store.findMany({
        where: { resolutionEndDate: { not: null, lte: warningThreshold } },
        select: { id: true, name: true, nit: true, resolutionEndDate: true },
        orderBy: { resolutionEndDate: 'asc' },
      }),
    ])

    const withStatus = <T extends { resolutionEndDate: Date | null }>(rows: T[]) =>
      rows.map((r) => ({
        ...r,
        alertStatus: r.resolutionEndDate && r.resolutionEndDate <= now ? 'EXPIRED' : 'EXPIRING_SOON',
        daysRemaining: r.resolutionEndDate
          ? Math.ceil((r.resolutionEndDate.getTime() - now.getTime()) / 86400000)
          : null,
      }))

    return NextResponse.json({
      leads: withStatus(leadsAtRisk),
      stores: withStatus(storesAtRisk),
      warningWindowDays: WARNING_WINDOW_DAYS,
    })
  } catch (error) {
    logger.error('[SuperAdmin] Error fetching CRM alerts:', error)
    return NextResponse.json({ error: 'Error al obtener alertas' }, { status: 500 })
  }
}
