import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'
import { getTransaction, WompiApiError } from '@/lib/wompi/client'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/payments/wompi/status/[id]
// Gets WompiTransaction details from DB.
// Optionally refreshes from Wompi API when ?refresh=true.
// Requires authentication and store access.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const wompiTransactionId = parseInt(id, 10)
    if (isNaN(wompiTransactionId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // ── Find the transaction ──
    const wompiTx = await db.wompiTransaction.findUnique({
      where: { id: wompiTransactionId },
      include: {
        store: { select: { id: true, name: true } },
        subscription: { select: { id: true, status: true, plan: { select: { name: true } } } },
        receipt: { select: { id: true, status: true } },
      },
    })

    if (!wompiTx) {
      return NextResponse.json(
        { error: 'Transacción Wompi no encontrada' },
        { status: 404 },
      )
    }

    // ── Auth check: user must have access to this store ──
    const storeIdOrErr = requireAuthStoreId(request, wompiTx.storeId)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr

    // ── Optionally refresh from Wompi API ──
    const url = new URL(request.url)
    const shouldRefresh = url.searchParams.get('refresh') === 'true'

    let refreshedData = null
    if (shouldRefresh && wompiTx.wompiId) {
      try {
        refreshedData = await getTransaction(wompiTx.wompiId)

        // Update our record with fresh data
        const newStatus = mapWompiStatus(refreshedData.status)
        await db.wompiTransaction.update({
          where: { id: wompiTx.id },
          data: {
            status: newStatus,
            wompiStatus: refreshedData.status,
            paymentMethodType: refreshedData.paymentMethodType || null,
            customerEmail: refreshedData.customerEmail || null,
            customerName: refreshedData.customerName || null,
            customerPhone: refreshedData.customerPhone || null,
            customerDocument: refreshedData.customerDocument || null,
            wompiResponse: JSON.stringify(refreshedData),
            paidAt: newStatus === 'APPROVED' ? (wompiTx.paidAt || new Date()) : null,
          },
        })
      } catch (error) {
        if (error instanceof WompiApiError) {
          logger.warn(`[Wompi] API error refreshing transaction ${wompiTx.wompiId}: ${error.message}`)
        } else {
          logger.error('[Wompi] Error refreshing transaction:', error)
        }
        // Return stale data if refresh fails
      }
    }

    return NextResponse.json({
      id: wompiTx.id,
      storeId: wompiTx.storeId,
      store: wompiTx.store,
      subscriptionId: wompiTx.subscriptionId,
      subscription: wompiTx.subscription,
      orderId: wompiTx.orderId,
      receiptId: wompiTx.receiptId,
      receipt: wompiTx.receipt,
      wompiId: wompiTx.wompiId,
      wompiPaymentLinkId: wompiTx.wompiPaymentLinkId,
      reference: wompiTx.reference,
      amount: wompiTx.amount,
      amountInCents: wompiTx.amountInCents,
      currency: wompiTx.currency,
      paymentMethod: wompiTx.paymentMethod,
      paymentMethodType: wompiTx.paymentMethodType,
      status: wompiTx.status,
      wompiStatus: wompiTx.wompiStatus,
      customerEmail: wompiTx.customerEmail,
      customerName: wompiTx.customerName,
      customerPhone: wompiTx.customerPhone,
      customerDocument: wompiTx.customerDocument,
      paidAt: wompiTx.paidAt,
      expiresAt: wompiTx.expiresAt,
      createdAt: wompiTx.createdAt,
      updatedAt: wompiTx.updatedAt,
      ...(refreshedData ? { refreshedFromWompi: true } : {}),
    })
  } catch (error) {
    logger.error('[Wompi] Error fetching transaction status:', error)
    return NextResponse.json(
      { error: 'Error al consultar estado de transacción' },
      { status: 500 },
    )
  }
}

function mapWompiStatus(wompiStatus: string): string {
  const statusMap: Record<string, string> = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DECLINED: 'DECLINED',
    VOIDED: 'VOIDED',
    ERROR: 'ERROR',
  }
  return statusMap[wompiStatus] || 'ERROR'
}
