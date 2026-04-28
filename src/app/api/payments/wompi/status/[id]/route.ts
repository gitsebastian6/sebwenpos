import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'
import { getTransaction, WompiApiError, isWompiDemoMode, getDemoTransactionStatus } from '@/lib/wompi/client'

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
        // Auto-approve the demo transaction
        await db.wompiTransaction.update({
          where: { id: wompiTx.id },
          data: {
            status: 'APPROVED',
            wompiStatus: 'APPROVED',
            paymentMethodType: 'CARD',
            paidAt: new Date(),
            wompiResponse: JSON.stringify({
              demoMode: true,
              autoApproved: true,
              paymentMethod: 'CARD',
              brand: 'VISA',
              lastFour: '4242',
              approvedAt: new Date().toISOString(),
            }),
          },
        })

        // Trigger the same webhook processing logic
        // Import and call the webhook handler internally
        try {
          await processDemoApproval(wompiTx.id)
        } catch (err) {
          logger.error(`[Wompi Demo] Error processing demo approval for tx ${wompiTx.id}:`, err)
        }

        refreshedFromWompi = true
        logger.info(`[Wompi Demo] Transaction ${wompiTx.id} auto-approved`)
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

/**
 * Process demo approval: same logic as the webhook handler for APPROVED transactions.
 * This reuses the subscription extension logic.
 */
async function processDemoApproval(wompiTxId: number): Promise<void> {
  // Dynamic import to avoid circular deps
  const { logSubscriptionHistory, createBillingRecord, BILLING_PERIODS } = await import('@/lib/subscription-helpers')
  const { logSubscriptionChange } = await import('@/lib/event-logger')

  const wompiTx = await db.wompiTransaction.findUnique({
    where: { id: wompiTxId },
    include: {
      receipt: {
        include: {
          subscription: {
            include: { plan: true },
          },
        },
      },
      subscription: {
        include: { plan: true },
      },
      order: {
        select: { id: true, orderNumber: true, status: true, total: true, paymentMethod: true, notes: true },
      },
    },
  })

  if (!wompiTx) return

  const receipt = wompiTx.receipt
  const subscription = wompiTx.subscription || receipt?.subscription

  // ── Handle POS order ──
  if (wompiTx.order && !wompiTx.subscription && !wompiTx.receipt) {
    await db.order.update({
      where: { id: wompiTx.order.id },
      data: {
        notes: [wompiTx.order.notes, `Pago Wompi (Demo) aprobado — Ref: ${wompiTx.reference}`].filter(Boolean).join('\n'),
      },
    })
    logger.info(`[Wompi Demo] POS order ${wompiTx.order.orderNumber} payment approved`)
    return
  }

  if (!subscription) {
    logger.warn(`[Wompi Demo] No subscription found for WompiTransaction ${wompiTx.id}`)
    return
  }

  const now = new Date()

  // ── Auto-approve linked PaymentReceipt ──
  if (receipt && receipt.status === 'PENDING') {
    await db.paymentReceipt.update({
      where: { id: receipt.id },
      data: {
        status: 'APPROVED',
        reviewedBy: 'WOMPI_DEMO_AUTO',
        reviewNotes: `Aprobado automáticamente (Demo) — transacción ${wompiTx.reference}`,
        reviewedAt: now,
      },
    })
  }

  // ── Extend subscription ──
  const effectiveBillingPeriod = subscription.billingPeriod === 'TRIAL' ? 'MONTHLY' : subscription.billingPeriod
  let newEndDate: Date
  if (subscription.endDate && new Date(subscription.endDate) > now) {
    newEndDate = new Date(subscription.endDate)
  } else {
    newEndDate = new Date(now)
  }

  const billingDays: Record<string, number> = {
    MONTHLY: 30, QUARTERLY: 90, SEMI_ANNUAL: 180, ANNUAL: 365,
  }
  const days = billingDays[effectiveBillingPeriod] || 30
  newEndDate.setDate(newEndDate.getDate() + days)

  const newNextBillingAt = new Date(newEndDate)
  newNextBillingAt.setDate(newNextBillingAt.getDate() + 1)

  const plan = subscription.plan
  const billingMonths: Record<string, number> = {
    MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12,
  }
  const months = billingMonths[effectiveBillingPeriod] || 1
  const periodPrice = plan.price * months

  const previousStatus = subscription.status

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'ACTIVE',
      endDate: newEndDate,
      nextBillingAt: newNextBillingAt,
      lastBilledAt: now,
      billingPeriod: effectiveBillingPeriod,
      billingPrice: periodPrice,
      cancelReason: null,
      alertSentAt3d: null,
      alertSentAt1d: null,
      ...(previousStatus === 'EXPIRED' || previousStatus === 'PAST_DUE' ? { graceEndDate: null } : {}),
    },
  })

  // ── Log history ──
  const isReactivation = previousStatus === 'CANCELLED' || previousStatus === 'EXPIRED' || previousStatus === 'PAST_DUE'

  await logSubscriptionChange(wompiTx.storeId, previousStatus, 'ACTIVE', {
    wompiTransactionId: wompiTx.id,
    wompiReference: wompiTx.reference,
    demoMode: true,
  })

  await logSubscriptionHistory({
    storeId: wompiTx.storeId,
    subscriptionId: subscription.id,
    eventType: isReactivation ? 'REACTIVATED' : 'RENEWED',
    previousStatus,
    newStatus: 'ACTIVE',
    previousPlanId: plan.id,
    newPlanId: plan.id,
    previousPlanName: plan.name,
    newPlanName: plan.name,
    description: isReactivation
      ? `Suscripción reactivada por pago Demo — referencia ${wompiTx.reference}`
      : `Suscripción renovada (${BILLING_PERIODS[effectiveBillingPeriod]?.label || effectiveBillingPeriod}) vía Demo`,
    metadata: { wompiTransactionId: wompiTx.id, paymentMethod: 'WOMPI_DEMO', billingPeriod: effectiveBillingPeriod, wompiReference: wompiTx.reference, demoMode: true },
  })

  // ── Create billing record ──
  const periodStart = subscription.endDate && new Date(subscription.endDate) > now
    ? new Date(subscription.endDate) : new Date(now)

  await createBillingRecord({
    storeId: wompiTx.storeId,
    subscriptionId: subscription.id,
    receiptId: receipt?.id ?? null,
    planId: plan.id,
    planName: plan.name,
    billingPeriod: effectiveBillingPeriod,
    amount: periodPrice,
    prorationCredit: 0,
    status: 'PAID',
    paymentMethod: 'WOMPI_DEMO',
    periodStart,
    periodEnd: newEndDate,
    notes: isReactivation
      ? 'Reactivación de suscripción (Demo)'
      : `Renovación ${BILLING_PERIODS[effectiveBillingPeriod]?.label || effectiveBillingPeriod} (Demo)`,
  })

  logger.info(`[Wompi Demo] Subscription ${subscription.id} extended to ${newEndDate.toISOString()} for store ${wompiTx.storeId}`)
}
