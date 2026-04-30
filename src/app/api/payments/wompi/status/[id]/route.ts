import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'
import { getTransaction, WompiApiError, isWompiDemoMode, getDemoTransactionStatus } from '@/lib/wompi/client'
import { processDemoApproval } from '@/lib/wompi/demo-processor'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/payments/wompi/status/[id]
// Gets WompiTransaction details from DB.
// Optionally refreshes from Wompi API when ?refresh=true.
//
// In demo mode: simulates APPROVED status after 10 seconds.
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

    // ── Parse metadata to check for demo mode ──
    let txMetadata: Record<string, unknown> = {}
    try {
      txMetadata = JSON.parse(wompiTx.metadata || '{}')
    } catch { /* ignore */ }

    const isDemo = isWompiDemoMode() || txMetadata.demoMode === true

    // ── Optionally refresh status ──
    const url = new URL(request.url)
    const shouldRefresh = url.searchParams.get('refresh') === 'true'
    let refreshedFromWompi = false

    if (shouldRefresh && isDemo && wompiTx.status === 'PENDING') {
      // ── Demo Mode: simulate auto-approval after delay ──
      const demoStatus = getDemoTransactionStatus(
        wompiTx.createdAt,
        wompiTx.amount,
        wompiTx.reference,
      )

      if (demoStatus.status === 'APPROVED') {
        // Use the shared demo processor (handles WompiTransaction update + subscription logic)
        try {
          await processDemoApproval(wompiTx.id)
        } catch (err) {
          logger.error(`[Wompi Demo] Error processing demo approval for tx ${wompiTx.id}:`, err)
        }

        refreshedFromWompi = true
        logger.info(`[Wompi Demo] Transaction ${wompiTx.id} auto-approved via status poll`)
      }
    } else if (shouldRefresh && !isDemo && wompiTx.wompiId) {
      // ── Real Mode: refresh from Wompi API ──
      try {
        const refreshedData = await getTransaction(wompiTx.wompiId)
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
        refreshedFromWompi = true
      } catch (error) {
        if (error instanceof WompiApiError) {
          logger.warn(`[Wompi] API error refreshing transaction ${wompiTx.wompiId}: ${error.message}`)
        } else {
          logger.error('[Wompi] Error refreshing transaction:', error)
        }
      }
    }

    // ── Re-fetch the transaction to get latest state ──
    const latestTx = refreshedFromWompi
      ? await db.wompiTransaction.findUnique({
          where: { id: wompiTransactionId },
          include: {
            store: { select: { id: true, name: true } },
            subscription: { select: { id: true, status: true, plan: { select: { name: true } } } },
            receipt: { select: { id: true, status: true } },
          },
        })
      : wompiTx

    if (!latestTx) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      id: latestTx.id,
      storeId: latestTx.storeId,
      store: latestTx.store,
      subscriptionId: latestTx.subscriptionId,
      subscription: latestTx.subscription,
      orderId: latestTx.orderId,
      receiptId: latestTx.receiptId,
      receipt: latestTx.receipt,
      wompiId: latestTx.wompiId,
      wompiPaymentLinkId: latestTx.wompiPaymentLinkId,
      reference: latestTx.reference,
      amount: latestTx.amount,
      amountInCents: latestTx.amountInCents,
      currency: latestTx.currency,
      paymentMethod: latestTx.paymentMethod,
      paymentMethodType: latestTx.paymentMethodType,
      status: latestTx.status,
      wompiStatus: latestTx.wompiStatus,
      customerEmail: latestTx.customerEmail,
      customerName: latestTx.customerName,
      customerPhone: latestTx.customerPhone,
      customerDocument: latestTx.customerDocument,
      paidAt: latestTx.paidAt,
      expiresAt: latestTx.expiresAt,
      createdAt: latestTx.createdAt,
      updatedAt: latestTx.updatedAt,
      ...(refreshedFromWompi ? { refreshedFromWompi: true } : {}),
      ...(isDemo ? { demoMode: true } : {}),
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
