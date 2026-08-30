import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { verifyCronSecret, unauthorizedResponse } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

// Pedidos de la tienda virtual que quedaron PENDING sin que nadie los atienda:
// tras N días pasan a CANCELLED (dejan de contar en la bandeja y en KPIs).
// Datos personales (teléfono/dirección) de un pedido que nunca se concretó.
const STALE_DAYS = Number(process.env.ONLINE_ORDER_STALE_DAYS || 3)

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) return unauthorizedResponse()

  try {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)
    const { count } = await db.onlineOrder.updateMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      data: { status: 'CANCELLED', rejectionReason: 'Expirado automáticamente (sin atender)' },
    })
    logger.info('[cron] online-orders-cleanup', { cancelled: count, staleDays: STALE_DAYS })
    return NextResponse.json({ ok: true, cancelled: count })
  } catch (error) {
    logger.error('[cron] online-orders-cleanup error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// Algunos schedulers hacen GET — se acepta igual con el mismo secret.
export const GET = POST
