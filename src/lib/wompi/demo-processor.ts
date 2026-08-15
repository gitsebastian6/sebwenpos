// ---------------------------------------------------------------------------
// Viva POS — Shared Demo Transaction Processor
// ---------------------------------------------------------------------------
// Extracts the processDemoApproval logic from the status route so it can be
// reused by the /api/payments/wompi/demo-process endpoint and the
// subscription cron service.
//
// Two public functions:
//   1. processDemoApproval(wompiTxId)      — approve a single transaction
//   2. processPendingDemoTransactions()     — batch-process all due demo txs
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { calculateBillingPrice } from '@/lib/subscription-helpers'
import { isWompiDemoMode, getDemoTransactionStatus } from '@/lib/wompi/client'

/** Demo auto-approval delay in milliseconds (10 seconds) — matches client.ts */
const DEMO_APPROVAL_DELAY_MS = 10_000

// ---------------------------------------------------------------------------
// 1. Single-transaction approval
// ---------------------------------------------------------------------------

/**
 * Process demo approval for a single WompiTransaction.
 *
 * This is the same logic that was previously the private `processDemoApproval`
 * function in the status/[id] route.  It handles:
 *   - POS order payments
 *   - Subscription payments (extend subscription, approve receipt, create billing)
 *
 * Idempotent — only processes transactions still in PENDING status.
 */
export async function processDemoApproval(wompiTxId: number): Promise<boolean> {
  // Dynamic imports to avoid circular deps
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

  if (!wompiTx) return false

  // Idempotency guard: only process PENDING transactions
  if (wompiTx.status !== 'PENDING') return false

  // ── Mark the WompiTransaction as APPROVED ──
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
    return true
  }

  if (!subscription) {
    logger.warn(`[Wompi Demo] No subscription found for WompiTransaction ${wompiTx.id}`)
    return true // Transaction was approved but no subscription to extend
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
  const periodPrice = calculateBillingPrice(plan.price, effectiveBillingPeriod).discountedPrice

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
  return true
}

// ---------------------------------------------------------------------------
// 2. Batch processing of all pending demo transactions
// ---------------------------------------------------------------------------

/**
 * Process all pending demo transactions that have exceeded the approval delay.
 *
 * Called by:
 *   - POST /api/payments/wompi/demo-process (API endpoint)
 *   - Subscription cron service (every 30 seconds)
 *
 * Returns the number of transactions successfully processed.
 * Idempotent — only processes transactions still in PENDING status.
 */
export async function processPendingDemoTransactions(): Promise<number> {
  // Only run in demo mode
  if (!isWompiDemoMode()) {
    logger.debug('[Wompi Demo] Not in demo mode — skipping pending demo processing')
    return 0
  }

  const cutoff = new Date(Date.now() - DEMO_APPROVAL_DELAY_MS)

  // Find all PENDING WompiTransactions where:
  //   - metadata contains demoMode: true
  //   - createdAt is more than 10 seconds ago
  const pendingDemoTxs = await db.wompiTransaction.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
  })

  // Filter for demo transactions (metadata.demoMode === true)
  // SQLite doesn't support JSON queries well in Prisma, so filter in JS
  const demoTxs = pendingDemoTxs.filter((tx) => {
    try {
      const metadata = JSON.parse(tx.metadata || '{}')
      return metadata.demoMode === true
    } catch {
      return false
    }
  })

  if (demoTxs.length === 0) {
    return 0
  }

  logger.info(`[Wompi Demo] Found ${demoTxs.length} pending demo transaction(s) to process`)

  let processedCount = 0

  for (const tx of demoTxs) {
    try {
      // Double-check that the delay has truly passed using the same logic as the status route
      const demoStatus = getDemoTransactionStatus(
        tx.createdAt,
        tx.amount,
        tx.reference,
      )

      if (demoStatus.status !== 'APPROVED') {
        continue // Not yet time
      }

      const result = await processDemoApproval(tx.id)
      if (result) {
        processedCount++
        logger.info(`[Wompi Demo] Auto-processed pending demo transaction ${tx.id} (ref: ${tx.reference})`)
      }
    } catch (err) {
      logger.error(`[Wompi Demo] Error processing demo approval for tx ${tx.id}:`, err)
    }
  }

  logger.info(`[Wompi Demo] Batch processing complete: ${processedCount}/${demoTxs.length} transaction(s) processed`)
  return processedCount
}
