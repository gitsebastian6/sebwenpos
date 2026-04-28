import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { processPendingDemoTransactions } from '@/lib/wompi/demo-processor'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/payments/wompi/demo-process
// ---------------------------------------------------------------------------
// Internal endpoint called by the subscription cron service every 30 seconds.
// Finds all PENDING WompiTransactions in demo mode that have exceeded the
// 10-second approval delay and auto-processes them.
//
// No auth required — called internally by the cron service (protected by
// INTERNAL_SECRET header if desired).
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const processedCount = await processPendingDemoTransactions()

    return NextResponse.json({
      success: true,
      processed: processedCount,
      message: processedCount > 0
        ? `${processedCount} transacción(es) demo procesada(s)`
        : 'No hay transacciones demo pendientes para procesar',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('[Wompi Demo] Error in demo-process endpoint:', error)
    return NextResponse.json(
      { error: 'Error al procesar transacciones demo' },
      { status: 500 },
    )
  }
}
