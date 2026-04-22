import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess, getAuthUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const paymentSchema = z.object({
  amount: z.number().int().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CHECK', 'CARD']).default('CASH'),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
})

// POST /api/purchases/[id]/payments — Registrar abono/pago a una compra
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const purchaseId = Number(id)

    if (isNaN(purchaseId)) {
      return NextResponse.json({ error: 'ID de compra inválido' }, { status: 400 })
    }

    // Parse body
    let body: z.infer<typeof paymentSchema>
    try {
      const raw = await request.json()
      body = paymentSchema.parse(raw)
    } catch (e: unknown) {
      const msg = e instanceof z.ZodError ? e.issues[0]?.message : 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Fetch purchase
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, purchase.storeId)
    if (storeAccessErr) return storeAccessErr

    if (purchase.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'No se puede registrar pagos a una compra cancelada' },
        { status: 400 },
      )
    }

    // Validate payment amount doesn't exceed remaining balance
    const remaining = purchase.total - purchase.amountPaid
    if (body.amount > remaining) {
      return NextResponse.json(
        { error: `El monto excede el saldo pendiente. Saldo: $${remaining.toLocaleString('es-CO')}` },
        { status: 400 },
      )
    }

    // Validate not a CONTADO purchase that's already paid
    if (purchase.paymentStatus === 'PAID') {
      return NextResponse.json(
        { error: 'Esta compra ya está totalmente pagada' },
        { status: 400 },
      )
    }

    const auth = getAuthUser(request)

    // Create payment and update purchase in transaction
    const result = await db.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.purchasePayment.create({
        data: {
          purchaseId,
          storeId: purchase.storeId,
          amount: body.amount,
          paymentMethod: body.paymentMethod,
          reference: body.reference || null,
          notes: body.notes || null,
          createdById: auth?.userId || null,
        },
      })

      // Update purchase payment status
      const newAmountPaid = purchase.amountPaid + body.amount
      let newPaymentStatus: string
      if (newAmountPaid >= purchase.total) {
        newPaymentStatus = 'PAID'
      } else {
        newPaymentStatus = 'PARTIAL'
      }

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          amountPaid: newAmountPaid,
          paymentStatus: newPaymentStatus,
        },
      })

      // Update provider debt if purchase is on credit
      if (purchase.providerId) {
        const debtReduction = Math.min(body.amount, Math.max(0, purchase.total - purchase.amountPaid))
        if (debtReduction > 0) {
          await tx.provider.update({
            where: { id: purchase.providerId },
            data: { totalDebt: { decrement: debtReduction } },
          })
        }
      }

      return { payment, newAmountPaid, newPaymentStatus, remaining: purchase.total - newAmountPaid }
    })

    return NextResponse.json({
      id: result.payment.id,
      amount: result.payment.amount,
      newAmountPaid: result.newAmountPaid,
      paymentStatus: result.newPaymentStatus,
      remaining: result.remaining,
      message: result.newPaymentStatus === 'PAID'
        ? 'Compra pagada totalmente'
        : `Abono registrado. Saldo pendiente: $${result.remaining.toLocaleString('es-CO')}`,
    })
  } catch (error: unknown) {
    logger.error('POST /api/purchases/[id]/payments error:', error)
    const message = error instanceof Error ? error.message : 'Error al registrar pago'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
