import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/invoices/resolution-status?storeId=X
// Returns the store's DIAN resolution info with usage statistics

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const storeId = z.coerce.number().int().positive().parse(url.searchParams.get('storeId'))

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    // Fetch store with resolution fields
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        nit: true,
        invoicePrefix: true,
        resolutionNumber: true,
        resolutionStartDate: true,
        resolutionEndDate: true,
        resolutionStartNumber: true,
        resolutionEndNumber: true,
        invoiceTestMode: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // If no resolution configured, return not_configured
    if (!store.resolutionNumber || !store.resolutionStartNumber || !store.resolutionEndNumber) {
      return NextResponse.json({
        resolution: {
          prefix: store.invoicePrefix || null,
          resolutionNumber: store.resolutionNumber || null,
          startNumber: store.resolutionStartNumber || null,
          endNumber: store.resolutionEndNumber || null,
          startDate: store.resolutionStartDate?.toISOString() ?? null,
          endDate: store.resolutionEndDate?.toISOString() ?? null,
          testMode: store.invoiceTestMode,
        },
        used: 0,
        remaining: 0,
        currentConsecutive: null,
        status: 'not_configured',
      })
    }

    // Count invoices created for this store
    const usedCount = await db.invoice.count({
      where: { storeId },
    })

    const startNumber = store.resolutionStartNumber
    const endNumber = store.resolutionEndNumber
    const totalRange = endNumber - startNumber + 1
    const currentConsecutive = startNumber + usedCount - 1
    const remaining = Math.max(0, endNumber - currentConsecutive)

    // Determine status
    const now = new Date()
    let status: 'active' | 'expired' | 'exhausted' | 'not_configured' = 'active'

    if (store.resolutionEndDate && new Date(store.resolutionEndDate) < now) {
      status = 'expired'
    } else if (remaining <= 0) {
      status = 'exhausted'
    }

    return NextResponse.json({
      resolution: {
        prefix: store.invoicePrefix || null,
        resolutionNumber: store.resolutionNumber,
        startNumber,
        endNumber,
        startDate: store.resolutionStartDate?.toISOString() ?? null,
        endDate: store.resolutionEndDate?.toISOString() ?? null,
        testMode: store.invoiceTestMode,
      },
      used: usedCount,
      remaining,
      currentConsecutive,
      status,
    })
  } catch (error) {
    logger.error('GET /api/invoices/resolution-status error:', error)
    return NextResponse.json({ error: 'Error interno al consultar estado de resolución' }, { status: 500 })
  }
}
