import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { processPendingDemoTransactions } from '@/lib/wompi/demo-processor'
import { timingSafeEqual } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/payments/wompi/demo-process
// ---------------------------------------------------------------------------
// Internal endpoint called by the subscription cron service every 30 seconds.
// Requires X-Internal-Secret header — CRITICAL: prevents unauthorized
// auto-approval of demo transactions.
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a)
  const bBuf = encoder.encode(b)
  const result = new Uint8Array(aBuf.length)
  for (let i = 0; i < aBuf.length; i++) {
    result[i] = aBuf[i] ^ bBuf[i]
  }
  return result.every(byte => byte === 0)
}

export async function POST(req: NextRequest) {
  try {
    // CRITICAL FIX: Require internal secret
    const internalSecret = req.headers.get('x-internal-secret')
    const expectedSecret = process.env.INTERNAL_SECRET
    if (!expectedSecret || !internalSecret || !safeEqual(internalSecret, expectedSecret)) {
      logger.warn('[Wompi Demo] demo-process called without valid internal secret')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

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
