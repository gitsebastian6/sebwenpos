import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { verifyWebhookSignature, type WompiWebhookEvent, type WompiTransaction } from '@/lib/wompi/client'
import { logSubscriptionHistory, createBillingRecord, BILLING_PERIODS } from '@/lib/subscription-helpers'
import { logSubscriptionChange } from '@/lib/event-logger'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Wompi Webhook Handler — PUBLIC route (no auth required)
// ---------------------------------------------------------------------------
// Receives transaction status updates from Wompi and processes them:
//   - APPROVED → Auto-approve PaymentReceipt, extend subscription, create BillingRecord
//   - DECLINED / VOIDED → Mark receipt as REJECTED
//   - Other statuses → Update WompiTransaction record
// ---------------------------------------------------------------------------

/**
 * POST /api/webhooks/wompi
 * Handles incoming Wompi webhook events.
 * This is a PUBLIC endpoint — Wompi calls it directly without authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    let payload: WompiWebhookEvent

    try {
      payload = JSON.parse(rawBody)
    } catch {
      logger.error('[Wompi Webhook] Invalid JSON payload')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    logger.info(`[Wompi Webhook] Received event: ${payload.event}`)

    // ── Verify webhook signature ──
    const checksum = payload.signature?.checksum
    const timestamp = payload.timestamp

    if (!checksum || !timestamp) {
      logger.warn('[Wompi Webhook] Missing signature or timestamp — skipping verification (development mode)')
      // In production, you should reject unsigned webhooks
      if (process.env.WOMPI_ENV === 'production') {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
      }
    } else if (!verifyWebhookSignature(payload, checksum, timestamp)) {
      logger.error('[Wompi Webhook] Invalid signature — possible tampering')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // ── Process event ──
    if (payload.event === 'transaction.updated') {
      const transaction = payload.data?.transaction
      if (!transaction) {
        logger.error('[Wompi Webhook] Missing transaction data in event')
        return NextResponse.json({ error: 'Missing transaction data' }, { status: 400 })
      }

      await processTransactionUpdate(transaction)
    } else {
      logger.info(`[Wompi Webhook] Unhandled event type: ${payload.event}`)
    }

    // Always return 200 so Wompi doesn't retry
    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('[Wompi Webhook] Error processing webhook:', error)
    // Still return 200 to prevent Wompi retries — we'll reconcile manually
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

// ---------------------------------------------------------------------------
// Transaction Processing Logic
// ---------------------------------------------------------------------------

/**
 * Process a transaction status update from Wompi.
 * - Finds the matching WompiTransaction by wompiId or reference
 * - Updates the local record with the new status
 * - If APPROVED: auto-approves the linked PaymentReceipt and extends subscription
 * - If DECLINED/VOIDED: marks the receipt as REJECTED
 */
async function processTransactionUpdate(transaction: WompiTransaction): Promise<void> {
  const { id: wompiId, reference, status: wompiStatus, paymentMethodType } = transaction

  logger.info(`[Wompi Webhook] Processing transaction ${wompiId}, status: ${wompiStatus}`)

  // Find the matching local WompiTransaction
  const wompiTx = await db.wompiTransaction.findFirst({
    where: {
      OR: [
        { wompiId: String(wompiId) },
        { reference },
      ],
    },
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
    },
  })

  if (!wompiTx) {
    logger.warn(`[Wompi Webhook] No matching WompiTransaction for wompiId=${wompiId}, reference=${reference}`)
    return
  }

  // Skip if already processed with same status
  if (wompiTx.wompiStatus === wompiStatus && wompiTx.status !== 'PENDING') {
    logger.info(`[Wompi Webhook] Transaction ${wompiId} already processed with status ${wompiStatus}`)
    return
  }

  // Map Wompi status to our internal status
  const internalStatus = mapWompiStatus(wompiStatus)

  // Update the WompiTransaction record
  await db.wompiTransaction.update({
    where: { id: wompiTx.id },
    data: {
      status: internalStatus,
      wompiStatus,
      wompiId: String(wompiId),
      paymentMethodType: paymentMethodType || null,
      customerEmail: transaction.customerEmail || null,
      customerName: transaction.customerName || null,
      customerPhone: transaction.customerPhone || null,
      customerDocument: transaction.customerDocument || null,
      wompiResponse: JSON.stringify(transaction),
      paidAt: internalStatus === 'APPROVED' ? new Date() : null,
    },
  })

  // ── Process based on status ──
  if (internalStatus === 'APPROVED') {
    await handleApprovedTransaction(wompiTx)
  } else if (internalStatus === 'DECLINED' || internalStatus === 'VOIDED') {
    await handleDeclinedTransaction(wompiTx)
  }

  logger.info(`[Wompi Webhook] Transaction ${wompiId} updated to ${internalStatus}`)
}

/**
 * Handle an APPROVED transaction:
 * 1. Auto-approve the linked PaymentReceipt (if exists)
 * 2. Extend the subscription
 * 3. Create a BillingRecord
 */
async function handleApprovedTransaction(
  wompiTx: {
    id: number
    storeId: number
    wompiId: string | null
    reference: string
    subscriptionId: number | null
    receiptId: number | null
    receipt: {
      id: number
      status: string
      subscriptionId: number
      subscription: {
        id: number
        status: string
        planId: number
        billingPeriod: string
        endDate: Date | null
        startDate: Date
        plan: { id: number; name: string; price: number }
      }
    } | null
    subscription: {
      id: number
      status: string
      planId: number
      billingPeriod: string
      endDate: Date | null
      startDate: Date
      plan: { id: number; name: string; price: number }
    } | null
  },
): Promise<void> {
  const receipt = wompiTx.receipt
  const subscription = wompiTx.subscription || receipt?.subscription

  if (!subscription) {
    logger.warn(`[Wompi Webhook] No subscription found for WompiTransaction ${wompiTx.id}`)
    return
  }

  const now = new Date()

  // ── Auto-approve the linked PaymentReceipt (if exists and PENDING) ──
  if (receipt && receipt.status === 'PENDING') {
    await db.paymentReceipt.update({
      where: { id: receipt.id },
      data: {
        status: 'APPROVED',
        reviewedBy: 'WOMPI_AUTO',
        reviewNotes: `Aprobado automáticamente por Wompi — transacción ${wompiTx.wompiId || wompiTx.reference}`,
        reviewedAt: now,
      },
    })
    logger.info(`[Wompi Webhook] Auto-approved PaymentReceipt #${receipt.id}`)
  }

  // ── Extend the subscription ──
  const effectiveBillingPeriod = subscription.billingPeriod || 'MONTHLY'
  if (effectiveBillingPeriod === 'TRIAL') {
    // Trial period can't be extended via payment — upgrade to MONTHLY
    logger.info(`[Wompi Webhook] Trial subscription ${subscription.id} — upgrading to MONTHLY on payment`)
  }

  const billingPeriodToUse = effectiveBillingPeriod === 'TRIAL' ? 'MONTHLY' : effectiveBillingPeriod

  let newEndDate: Date
  if (subscription.endDate && new Date(subscription.endDate) > now) {
    newEndDate = new Date(subscription.endDate)
  } else {
    newEndDate = new Date(now)
  }

  const billingDays: Record<string, number> = {
    TRIAL: 7, MONTHLY: 30, QUARTERLY: 90, SEMI_ANNUAL: 180, ANNUAL: 365,
  }
  const days = billingDays[billingPeriodToUse] || 30
  newEndDate.setDate(newEndDate.getDate() + days)

  // Calculate nextBillingAt (1 day after new endDate)
  const newNextBillingAt = new Date(newEndDate)
  newNextBillingAt.setDate(newNextBillingAt.getDate() + 1)

  // Calculate billing price from the plan
  const plan = subscription.plan
  const billingMonths: Record<string, number> = {
    MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12,
  }
  const months = billingMonths[billingPeriodToUse] || 1
  const periodPrice = plan.price * months

  // Update subscription
  const previousStatus = subscription.status
  const previousPlanName = plan.name
  const previousPlanId = plan.id

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'ACTIVE',
      endDate: newEndDate,
      nextBillingAt: newNextBillingAt,
      lastBilledAt: now,
      startDate: subscription.startDate || now,
      billingPeriod: billingPeriodToUse,
      billingPrice: periodPrice,
      cancelReason: null,
      // Reset alert flags on renewal
      alertSentAt3d: null,
      alertSentAt1d: null,
      ...(previousStatus === 'EXPIRED' || previousStatus === 'PAST_DUE' ? { graceEndDate: null } : {}),
    },
  })

  // ── Log to subscription history ──
  const isReactivation = previousStatus === 'CANCELLED' || previousStatus === 'EXPIRED' || previousStatus === 'PAST_DUE'

  await logSubscriptionChange(wompiTx.storeId, previousStatus, 'ACTIVE', {
    wompiTransactionId: wompiTx.id,
    wompiReference: wompiTx.reference,
  })

  if (isReactivation) {
    await logSubscriptionHistory({
      storeId: wompiTx.storeId,
      subscriptionId: subscription.id,
      eventType: 'REACTIVATED',
      previousStatus,
      newStatus: 'ACTIVE',
      previousPlanId,
      newPlanId: plan.id,
      previousPlanName,
      newPlanName: plan.name,
      description: `Suscripción reactivada por pago Wompi — referencia ${wompiTx.reference}`,
      metadata: { wompiTransactionId: wompiTx.id, paymentMethod: 'WOMPI', wompiReference: wompiTx.reference },
    })
  } else {
    await logSubscriptionHistory({
      storeId: wompiTx.storeId,
      subscriptionId: subscription.id,
      eventType: 'RENEWED',
      previousStatus,
      newStatus: 'ACTIVE',
      previousPlanId,
      newPlanId: plan.id,
      previousPlanName,
      newPlanName: plan.name,
      description: `Suscripción renovada por ${BILLING_PERIODS[billingPeriodToUse]?.label || billingPeriodToUse} vía Wompi`,
      metadata: { wompiTransactionId: wompiTx.id, paymentMethod: 'WOMPI', billingPeriod: billingPeriodToUse, wompiReference: wompiTx.reference },
    })
  }

  // ── Create billing record ──
  const periodStart = subscription.endDate && new Date(subscription.endDate) > now
    ? new Date(subscription.endDate)
    : new Date(now)

  await createBillingRecord({
    storeId: wompiTx.storeId,
    subscriptionId: subscription.id,
    receiptId: receipt?.id ?? null,
    planId: plan.id,
    planName: plan.name,
    billingPeriod: billingPeriodToUse,
    amount: periodPrice,
    prorationCredit: 0,
    status: 'PAID',
    paymentMethod: 'WOMPI',
    periodStart,
    periodEnd: newEndDate,
    notes: isReactivation
      ? 'Reactivación de suscripción vía Wompi'
      : `Renovación ${BILLING_PERIODS[billingPeriodToUse]?.label || billingPeriodToUse} vía Wompi`,
  })

  logger.info(`[Wompi Webhook] Subscription ${subscription.id} extended to ${newEndDate.toISOString()} for store ${wompiTx.storeId}`)
}

/**
 * Handle a DECLINED or VOIDED transaction:
 * 1. Mark the linked PaymentReceipt as REJECTED (if exists and PENDING)
 */
async function handleDeclinedTransaction(
  wompiTx: {
    id: number
    storeId: number
    wompiId: string | null
    reference: string
    receipt: {
      id: number
      status: string
    } | null
  },
): Promise<void> {
  const receipt = wompiTx.receipt

  if (receipt && receipt.status === 'PENDING') {
    await db.paymentReceipt.update({
      where: { id: receipt.id },
      data: {
        status: 'REJECTED',
        reviewedBy: 'WOMPI_AUTO',
        reviewNotes: `Rechazado automáticamente por Wompi — transacción ${wompiTx.wompiId || wompiTx.reference}`,
        reviewedAt: new Date(),
      },
    })
    logger.info(`[Wompi Webhook] Auto-rejected PaymentReceipt #${receipt.id}`)
  }

  logger.info(`[Wompi Webhook] Transaction ${wompiTx.id} declined/voided for store ${wompiTx.storeId}`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map Wompi transaction status to our internal status.
 */
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
