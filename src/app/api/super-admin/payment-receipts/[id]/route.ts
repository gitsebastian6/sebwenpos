import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logSubscriptionHistory, createBillingRecord, BILLING_PERIODS, calculateBillingPrice } from '@/lib/subscription-helpers'
import { logStoreEvent, logSubscriptionChange, logPlanChange } from '@/lib/event-logger'
import { deleteReceiptFile, readReceiptFile } from '@/lib/file-storage'
import { invalidateSubscriptionCache } from '@/lib/subscription-cache'

export const dynamic = 'force-dynamic'

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reviewNotes: z.string().max(500).optional().or(z.literal('')),
})

/**
 * PUT /api/super-admin/payment-receipts/[id]
 * Aprueba o rechaza un comprobante de pago y actualiza la suscripción
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const receiptId = parseInt(id, 10)
    if (isNaN(receiptId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = reviewSchema.parse(body)

    // Find the receipt with subscription info
    const receipt = await db.paymentReceipt.findUnique({
      where: { id: receiptId },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
    }

    if (receipt.status !== 'PENDING') {
      return NextResponse.json({
        error: `Este comprobante ya fue ${receipt.status === 'APPROVED' ? 'aprobado' : 'rechazado'}`,
      }, { status: 409 })
    }

    const newStatus = data.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    // Update receipt status
    const updated = await db.paymentReceipt.update({
      where: { id: receiptId },
      data: {
        status: newStatus,
        reviewedBy: 'SUPER_ADMIN',
        reviewNotes: data.reviewNotes || null,
        reviewedAt: new Date(),
      },
      include: {
        store: { select: { id: true, name: true } },
        subscription: {
          include: { plan: { select: { name: true } } },
        },
      },
    })

    // If approved, extend subscription (and handle plan change if requested)
    if (data.action === 'APPROVE' && receipt.subscription) {
      const sub = receipt.subscription
      const now = new Date()

      // ── Detect plan change request from notes metadata ──
      let planChangeReq: {
        planChangeRequest: boolean
        requestedPlanId: number
        requestedPlanName: string
        requestedBillingPeriod: string
        userNotes: string | null
      } | null = null
      try {
        const parsed = JSON.parse(receipt.notes || '{}')
        if (parsed.planChangeRequest && parsed.requestedPlanId) {
          planChangeReq = parsed
        }
      } catch { /* notes is not JSON or doesn't have plan change info */ }

      // ── Block: Trial subscriptions should NOT accept payments unless it's a plan change ──
      // Trial is free. Payments only make sense when upgrading to a paid plan.
      if (sub.plan?.price === 0 && !planChangeReq) {
        return NextResponse.json({
          error: 'No se puede aprobar un pago para un plan Trial (gratis). El usuario debe cambiar a un plan de pago.',
        }, { status: 400 })
      }

      // ── Determine billing period and plan ──
      let effectivePlanId = sub.planId
      let effectiveBillingPeriod = sub.billingPeriod
      let newPlanName: string | null = null

      if (planChangeReq) {
        // Verify the requested plan exists
        const targetPlan = await db.plan.findUnique({
          where: { id: planChangeReq.requestedPlanId },
        })
        if (targetPlan && targetPlan.isActive) {
          effectivePlanId = targetPlan.id
          newPlanName = targetPlan.name
          effectiveBillingPeriod = planChangeReq.requestedBillingPeriod || 'MONTHLY'
        }
      }

      if (!effectiveBillingPeriod || effectiveBillingPeriod === 'TRIAL') {
        // If still TRIAL after plan change resolution, it means the target plan is also free.
        // This should not happen in practice, but handle gracefully.
        return NextResponse.json({
          error: 'No se puede procesar un pago para un plan gratuito. Seleccione un plan de pago.',
        }, { status: 400 })
      }

      let newEndDate: Date
      if (sub.endDate && new Date(sub.endDate) > now) {
        newEndDate = new Date(sub.endDate)
      } else {
        newEndDate = new Date(now)
      }

      // Add days based on billing period
      const billingDays: Record<string, number> = {
        TRIAL: 7, MONTHLY: 30, QUARTERLY: 90, SEMI_ANNUAL: 180, ANNUAL: 365,
      }
      const days = billingDays[effectiveBillingPeriod] || 30
      newEndDate.setDate(newEndDate.getDate() + days)

      // Calculate nextBillingAt (1 day after new endDate)
      const newNextBillingAt = new Date(newEndDate)
      newNextBillingAt.setDate(newNextBillingAt.getDate() + 1)

      // Calculate billing price from the plan
      const targetPlanForPrice = await db.plan.findUnique({ where: { id: effectivePlanId } })
      const billingPrice = targetPlanForPrice?.price || sub.plan?.price || 0
      // Calculate billing price with discounts (single source of truth)
      const periodPrice = calculateBillingPrice(billingPrice, effectiveBillingPeriod).discountedPrice

      // Update subscription: reactivate, extend, and change plan if requested
      const previousStatus = sub.status
      const previousPlanName = sub.plan.name
      const previousPlanId = sub.planId

      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          planId: effectivePlanId,
          endDate: newEndDate,
          nextBillingAt: newNextBillingAt,
          lastBilledAt: now,
          // R-04 FIX: Preserve original startDate on reactivation (don't reset customer tenure)
          // Only reset startDate if there's no existing startDate (data integrity edge case)
          startDate: sub.startDate || now,
          billingPeriod: effectiveBillingPeriod,
          billingPrice: periodPrice,
          cancelReason: null,
          // Store proration info if plan changed
          ...(planChangeReq && newPlanName ? {
            previousPlanId: sub.planId,
            previousPlanName: sub.plan.name,
          } : {}),
          // Reset alert flags on renewal
          alertSentAt3d: null,
          alertSentAt1d: null,
          ...(sub.status === 'EXPIRED' || sub.status === 'PAST_DUE' ? { graceEndDate: null } : {}),
        },
      })

      // ── Log to subscription history ──
      const isReactivation = previousStatus === 'CANCELLED' || previousStatus === 'EXPIRED'
      const isPlanChange = effectivePlanId !== previousPlanId

      // ─── Event logging (fire-and-forget) ───
      await logSubscriptionChange(receipt.storeId, previousStatus, 'ACTIVE', { receiptId })
      if (isPlanChange && newPlanName) {
        await logPlanChange(receipt.storeId, { name: previousPlanName, price: 0 }, { name: newPlanName, price: 0 })
      }

      if (isReactivation) {
        await logSubscriptionHistory({
          storeId: receipt.storeId,
          subscriptionId: sub.id,
          eventType: 'REACTIVATED',
          previousStatus,
          newStatus: 'ACTIVE',
          previousPlanId,
          newPlanId: effectivePlanId,
          previousPlanName,
          newPlanName: newPlanName || previousPlanName,
          description: `Suscripción reactivada por aprobación de comprobante #${receiptId}`,
          metadata: { receiptId, reviewedBy: 'SUPER_ADMIN' },
        })
      } else if (isPlanChange) {
        await logSubscriptionHistory({
          storeId: receipt.storeId,
          subscriptionId: sub.id,
          eventType: 'PLAN_CHANGED',
          previousStatus,
          newStatus: 'ACTIVE',
          previousPlanId,
          newPlanId: effectivePlanId,
          previousPlanName,
          newPlanName: newPlanName || previousPlanName,
          description: `Plan cambiado: ${previousPlanName} → ${newPlanName || 'Desconocido'}`,
          metadata: { receiptId, reviewedBy: 'SUPER_ADMIN' },
        })
      } else {
        await logSubscriptionHistory({
          storeId: receipt.storeId,
          subscriptionId: sub.id,
          eventType: 'RENEWED',
          previousStatus,
          newStatus: 'ACTIVE',
          previousPlanId,
          newPlanId: effectivePlanId,
          previousPlanName,
          newPlanName: previousPlanName,
          description: `Suscripción renovada por ${BILLING_PERIODS[effectiveBillingPeriod]?.label || effectiveBillingPeriod}`,
          metadata: { receiptId, reviewedBy: 'SUPER_ADMIN', billingPeriod: effectiveBillingPeriod },
        })
      }

      // ── Create billing record ──
      const periodStart = sub.endDate && new Date(sub.endDate) > now
        ? new Date(sub.endDate)
        : new Date(now)
      await createBillingRecord({
        storeId: receipt.storeId,
        subscriptionId: sub.id,
        receiptId,
        planId: effectivePlanId,
        planName: newPlanName || previousPlanName,
        billingPeriod: effectiveBillingPeriod,
        amount: periodPrice,
        prorationCredit: 0,
        status: 'PAID',
        paymentMethod: receipt.paymentMethod,
        periodStart,
        periodEnd: newEndDate,
        notes: isReactivation ? 'Reactivación de suscripción' : isPlanChange ? `Cambio de plan: ${previousPlanName} → ${newPlanName}` : `Renovación ${BILLING_PERIODS[effectiveBillingPeriod]?.label || effectiveBillingPeriod}`,
      })

      if (planChangeReq && newPlanName) {
        logger.info(`Plan changed for store ${receipt.storeId}: ${sub.plan.name} → ${newPlanName} (receipt #${receiptId})`)
      }

      // Invalidate subscription cache so middleware picks up the new status
      invalidateSubscriptionCache(receipt.storeId)
    }

    return NextResponse.json({
      message: data.action === 'APPROVE'
        ? 'Comprobante aprobado. Suscripción extendida.'
        : 'Comprobante rechazado.',
      receipt: updated,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error reviewing receipt:', error)
    return NextResponse.json({ error: 'Error al procesar comprobante' }, { status: 500 })
  }
}

/**
 * GET /api/super-admin/payment-receipts/[id]
 * Obtiene un comprobante individual con datos del archivo (para previsualizar)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const receiptId = parseInt(id, 10)
    if (isNaN(receiptId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const receipt = await db.paymentReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true,
        subscriptionId: true,
        storeId: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        filePath: true,
        // fileData is excluded from default response — use /api/files/[id] for file content
        // But for backward compat with super admin preview, include it only if no filePath
        fileData: true,
        amount: true,
        reference: true,
        paymentMethod: true,
        notes: true,
        status: true,
        reviewedBy: true,
        reviewNotes: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        store: {
          select: { id: true, name: true, nit: true, user: { select: { fullName: true, phone: true } } },
        },
        subscription: {
          select: { id: true, status: true, plan: { select: { name: true, price: true } }, endDate: true },
        },
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
    }

    // If file is on disk, read it and return as base64 for backward compat with the preview component
    // (the preview component expects fileData in the JSON response)
    if (receipt.filePath && !receipt.fileData) {
      try {
        const buffer = await readReceiptFile(receipt.filePath)
        if (buffer) {
          receipt.fileData = buffer.toString('base64')
        }
      } catch {
        receipt.fileData = null
      }
    }

    return NextResponse.json(receipt)
  } catch (error) {
    logger.error('Error fetching receipt:', error)
    return NextResponse.json({ error: 'Error al obtener comprobante' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/payment-receipts/[id]
 * Elimina un comprobante (solo PENDING)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const receiptId = parseInt(id, 10)
    if (isNaN(receiptId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const receipt = await db.paymentReceipt.findUnique({ where: { id: receiptId } })
    if (!receipt) {
      return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
    }

    if (receipt.status !== 'PENDING') {
      return NextResponse.json({ error: 'Solo se pueden eliminar comprobantes pendientes' }, { status: 409 })
    }

    // Delete file from disk if it exists
    if (receipt.filePath) {
      await deleteReceiptFile(receipt.filePath)
    }

    await db.paymentReceipt.delete({ where: { id: receiptId } })

    return NextResponse.json({ message: 'Comprobante eliminado' })
  } catch (error) {
    logger.error('Error deleting receipt:', error)
    return NextResponse.json({ error: 'Error al eliminar comprobante' }, { status: 500 })
  }
}
