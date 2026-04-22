import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { BILLING_PERIODS, formatCOP } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/billing-history?storeId=N
 * Returns billing records for the store (invoices per payment period).
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = parseInt(req.nextUrl.searchParams.get('storeId') || '0', 10)
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const accessErr = requireStoreAccess(req, storeId)
    if (accessErr) return accessErr

    const records = await db.billingRecord.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const summary = {
      totalBilled: 0,
      totalPaid: 0,
      totalCredits: 0,
      recordCount: records.length,
    }

    const items = records.map((r) => {
      summary.totalBilled += r.amount
      if (r.status === 'PAID') summary.totalPaid += r.netAmount
      summary.totalCredits += r.prorationCredit

      return {
        id: r.id,
        planName: r.planName,
        billingPeriod: BILLING_PERIODS[r.billingPeriod]?.label || r.billingPeriod,
        amountFormatted: formatCOP(r.amount),
        prorationCreditFormatted: r.prorationCredit > 0 ? `-${formatCOP(r.prorationCredit)}` : null,
        netAmountFormatted: formatCOP(r.netAmount),
        status: r.status,
        statusLabel: r.status === 'PAID' ? 'Pagado' : r.status === 'PENDING' ? 'Pendiente' : 'Fallido',
        paymentMethod: r.paymentMethod,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        notes: r.notes,
        createdAt: r.createdAt,
      }
    })

    return NextResponse.json({
      items,
      summary: {
        ...summary,
        totalBilledFormatted: formatCOP(summary.totalBilled),
        totalPaidFormatted: formatCOP(summary.totalPaid),
        totalCreditsFormatted: formatCOP(summary.totalCredits),
      },
    })
  } catch (error) {
    console.error('GET /api/subscription/billing-history error:', error)
    return NextResponse.json({ error: 'Error al obtener historial de facturación' }, { status: 500 })
  }
}
