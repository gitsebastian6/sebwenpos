import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'
import { createPaymentLink, WompiApiError } from '@/lib/wompi/client'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/payments/wompi/create-link
// Creates a Wompi payment link for subscription or POS payments.
// Requires authentication and store access.
// ---------------------------------------------------------------------------

const createLinkSchema = z.object({
  storeId: z.number().int().positive(),
  amount: z.number().int().positive(), // COP (whole pesos, not cents)
  planId: z.number().int().positive().optional(),
  planName: z.string().max(100).optional(),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']).optional(),
  type: z.enum(['SUBSCRIPTION', 'POS']),
  customerEmail: z.string().email().optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  customerDocument: z.string().max(50).optional(), // Cédula/NIT
  description: z.string().max(500).optional(),
  expiresAt: z.string().optional(), // ISO 8601
})

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const body = await request.json()
    const data = createLinkSchema.parse(body)

    const storeIdOrErr = requireAuthStoreId(request, data.storeId)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeId = storeIdOrErr

    // ── Validate store exists ──
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, nit: true },
    })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // ── For subscription type, find/validate subscription ──
    let subscriptionId: number | null = null
    if (data.type === 'SUBSCRIPTION') {
      const subscription = await db.subscription.findUnique({
        where: { storeId },
        include: { plan: true },
      })
      if (!subscription) {
        return NextResponse.json(
          { error: 'No se encontró una suscripción para esta tienda' },
          { status: 404 },
        )
      }
      subscriptionId = subscription.id
    }

    // ── Generate unique reference ──
    const reference = `VNT-${storeId}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    // ── Convert COP to cents for Wompi ──
    const amountInCents = data.amount * 100

    // ── Build payment link name/description ──
    const linkName = data.type === 'SUBSCRIPTION'
      ? `Suscripción VentifyPOS — ${data.planName || 'Plan'}`
      : `Pago POS — ${store.name}`

    const linkDescription = data.description || (data.type === 'SUBSCRIPTION'
      ? `Pago de suscripción ${data.billingPeriod || 'MONTHLY'} para ${store.name}`
      : `Pago de punto de venta para ${store.name}`)

    // ── Create WompiTransaction record (PENDING) ──
    const wompiTx = await db.wompiTransaction.create({
      data: {
        storeId,
        subscriptionId,
        reference,
        amount: data.amount,
        amountInCents,
        currency: 'COP',
        status: 'PENDING',
        customerEmail: data.customerEmail || null,
        customerName: data.customerName || null,
        customerPhone: data.customerPhone || null,
        customerDocument: data.customerDocument || null,
        metadata: JSON.stringify({
          type: data.type,
          planId: data.planId || null,
          planName: data.planName || null,
          billingPeriod: data.billingPeriod || null,
          storeName: store.name,
          storeNit: store.nit,
        }),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    })

    // ── Call Wompi API to create payment link ──
    let paymentLink
    try {
      paymentLink = await createPaymentLink({
        name: linkName,
        description: linkDescription,
        amountInCents,
        currency: 'COP',
        reference,
        singleUse: true,
        expiresAt: data.expiresAt,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerDocument: data.customerDocument,
      })
    } catch (error) {
      // If Wompi API fails, update our record to ERROR status
      await db.wompiTransaction.update({
        where: { id: wompiTx.id },
        data: {
          status: 'ERROR',
          wompiResponse: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
      })

      if (error instanceof WompiApiError) {
        logger.error(`[Wompi] API error creating payment link: ${error.message}`)
        return NextResponse.json(
          { error: 'Error al crear enlace de pago en Wompi', details: error.message },
          { status: 502 },
        )
      }

      throw error
    }

    // ── Update WompiTransaction with payment link info ──
    await db.wompiTransaction.update({
      where: { id: wompiTx.id },
      data: {
        wompiPaymentLinkId: String(paymentLink.id),
        wompiResponse: JSON.stringify(paymentLink),
      },
    })

    logger.info(`[Wompi] Payment link created: store=${storeId}, ref=${reference}, link=${paymentLink.id}`)

    return NextResponse.json({
      checkoutUrl: paymentLink.checkoutUrl,
      reference,
      wompiTransactionId: wompiTx.id,
      wompiPaymentLinkId: paymentLink.id,
      amount: data.amount,
      amountInCents,
      currency: 'COP',
      expiresAt: paymentLink.expiresAt,
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      )
    }
    logger.error('[Wompi] Error creating payment link:', error)
    return NextResponse.json(
      { error: 'Error al crear enlace de pago' },
      { status: 500 },
    )
  }
}
