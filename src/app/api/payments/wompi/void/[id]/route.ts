import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'
import { voidTransaction, WompiApiError } from '@/lib/wompi/client'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/payments/wompi/void/[id]
// Void (cancel) a Wompi transaction before settlement.
// Requires authentication and store access.
// Only PENDING or APPROVED transactions can be voided.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const wompiTransactionId = parseInt(id, 10)
    if (isNaN(wompiTransactionId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // ── Parse body for wompiTransactionId (Wompi API transaction ID) ──
    let body: { wompiTransactionId?: number | string }
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    if (!body.wompiTransactionId) {
      return NextResponse.json(
        { error: 'wompiTransactionId es requerido' },
        { status: 400 },
      )
    }

    // ── Find the local WompiTransaction record ──
    const wompiTx = await db.wompiTransaction.findUnique({
      where: { id: wompiTransactionId },
      include: {
        subscription: {
          select: { id: true, status: true },
        },
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

    // ── Only allow voiding PENDING or APPROVED transactions ──
    if (wompiTx.status !== 'PENDING' && wompiTx.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `No se puede anular una transacción en estado ${wompiTx.status}. Solo se pueden anular transacciones PENDING o APPROVED.` },
        { status: 400 },
      )
    }

    // ── Call Wompi API to void the transaction ──
    try {
      await voidTransaction(body.wompiTransactionId)
    } catch (error) {
      if (error instanceof WompiApiError) {
        logger.error(`[Wompi Void] API error voiding transaction ${body.wompiTransactionId}: ${error.message}`)
        return NextResponse.json(
          { error: `Error de Wompi al anular transacción: ${error.message}` },
          { status: 502 },
        )
      }
      throw error
    }

    // ── Update local WompiTransaction status to VOIDED ──
    await db.wompiTransaction.update({
      where: { id: wompiTx.id },
      data: {
        status: 'VOIDED',
        wompiStatus: 'VOIDED',
        wompiResponse: JSON.stringify({ voidedAt: new Date().toISOString(), voidedBy: 'API_REQUEST' }),
      },
    })

    // ── If linked to a subscription, log the event but don't change subscription status ──
    // Voiding a payment should not automatically cancel a subscription — that's a separate decision
    if (wompiTx.subscriptionId && wompiTx.subscription) {
      logger.info(
        `[Wompi Void] Transaction ${wompiTx.id} linked to subscription ${wompiTx.subscriptionId} (status: ${wompiTx.subscription.status}) — voiding payment, NOT changing subscription status`,
      )
      await db.storeEventLog.create({
        data: {
          storeId: wompiTx.storeId,
          eventType: 'SUBSCRIPTION_ACTIVE', // reuse closest event type; metadata carries the detail
          previousValue: 'PAYMENT_VOIDED',
          newValue: wompiTx.subscription.status,
          metadata: JSON.stringify({
            wompiTransactionId: wompiTx.id,
            subscriptionId: wompiTx.subscriptionId,
            action: 'PAYMENT_VOIDED',
            note: 'Payment voided via API; subscription status unchanged',
            wompiReference: wompiTx.reference,
          }),
        },
      })
    }

    logger.info(`[Wompi Void] Transaction ${wompiTx.id} (wompiId: ${body.wompiTransactionId}) voided successfully`)

    return NextResponse.json({
      id: wompiTx.id,
      status: 'VOIDED',
      wompiTransactionId: body.wompiTransactionId,
      subscriptionId: wompiTx.subscriptionId,
      message: 'Transacción anulada exitosamente',
    })
  } catch (error) {
    logger.error('[Wompi Void] Error voiding transaction:', error)
    return NextResponse.json(
      { error: 'Error al anular transacción' },
      { status: 500 },
    )
  }
}
