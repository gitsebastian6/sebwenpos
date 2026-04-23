import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const payDebtSchema = z.object({
  storeId: z.number().positive(),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  note: z.string().optional(),
})

// POST /api/customers/[id]/pay-debt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = payDebtSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { storeId, amount, note } = parsed.data
    const customerId = Number(id)

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr


    // Get current customer
    const customer = await db.customer.findUnique({
      where: { id: customerId, storeId },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    if (customer.totalDebt <= 0) {
      return NextResponse.json({ error: 'El cliente no tiene deuda' }, { status: 400 })
    }

    if (amount > customer.totalDebt) {
      return NextResponse.json(
        { error: `El monto no puede superar la deuda actual ($${customer.totalDebt.toLocaleString('es-CO')})` },
        { status: 400 }
      )
    }

    // ── Process payment allocation (FIFO) ──
    let remainingPayment = amount
    const ordersUpdated: Array<{
      orderId: number
      orderNumber: string
      amountApplied: number
      orderTotal: number
      wasFullyPaid: boolean
    }> = []

    await db.$transaction(async (tx) => {
      // Re-read customer inside transaction to prevent race condition
      const freshCustomer = await tx.customer.findFirst({
        where: { id: customerId, storeId },
      })
      if (!freshCustomer || freshCustomer.totalDebt <= 0) {
        throw new Error('El cliente no tiene deuda')
      }
      const effectiveAmount = Math.min(amount, freshCustomer.totalDebt)

      // Re-fetch credit orders INSIDE transaction to prevent stale data
      const creditOrders = await tx.order.findMany({
        where: { customerId, storeId, status: 'CREDIT' },
        orderBy: { createdAt: 'asc' },
      })

      for (const order of creditOrders) {
        if (remainingPayment <= 0) break

        const orderDebt = order.total // Full order amount is the pending debt
        const appliedToOrder = Math.min(remainingPayment, orderDebt)
        const isFullyPaid = appliedToOrder >= orderDebt

        // Mark order as COMPLETED if fully paid
        if (isFullyPaid) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'COMPLETED' },
          })
        }

        ordersUpdated.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          amountApplied: appliedToOrder,
          orderTotal: orderDebt,
          wasFullyPaid: isFullyPaid,
        })

        remainingPayment -= appliedToOrder
      }

      // Update customer debt
      const newDebt = freshCustomer.totalDebt - effectiveAmount
      await tx.customer.update({
        where: { id: customerId },
        data: { totalDebt: newDebt },
      })

      // Find or create a Caja ledger account for the journal entry
      let account = await tx.ledgerAccount.findFirst({
        where: { storeId, type: 'ASSET', name: { contains: 'Caja' } },
      })

      if (!account) {
        account = await tx.ledgerAccount.create({
          data: {
            storeId,
            name: 'Caja General',
            type: 'ASSET',
          },
        })
      }

      // Build description with order details
      const orderDetails = ordersUpdated
        .map((o) => `${o.orderNumber}${o.wasFullyPaid ? ' ✓' : ` ($${o.amountApplied.toLocaleString('es-CO')})`}`)
        .join(', ')

      // Record journal entry: DEBIT cash received, CREDIT debt reduction
      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: account.id,
          amount: effectiveAmount,
          direction: 'DEBIT',
          description: `Abono deuda - ${customer.name}${note ? ` (${note})` : ''} [${orderDetails}]`,
          referenceType: 'DEBT_PAYMENT',
          referenceId: customerId,
        },
      })

      // Create a CREDIT journal entry for the CxC (Cuentas por Cobrar) reduction
      let cxcAccount = await tx.ledgerAccount.findFirst({
        where: { storeId, type: 'ASSET', name: { contains: 'Cuentas por Cobrar' } },
      })

      if (!cxcAccount) {
        cxcAccount = await tx.ledgerAccount.create({
          data: {
            storeId,
            name: 'Cuentas por Cobrar',
            type: 'ASSET',
          },
        })
      }

      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: cxcAccount.id,
          amount: effectiveAmount,
          direction: 'CREDIT',
          description: `Reducción CxC - Abono ${customer.name}${note ? ` (${note})` : ''} [${orderDetails}]`,
          referenceType: 'DEBT_PAYMENT',
          referenceId: customerId,
        },
      })
    })

    const newDebt = Math.max(0, customer.totalDebt - Math.min(amount, customer.totalDebt))
    const fullyPaidOrders = ordersUpdated.filter((o) => o.wasFullyPaid)
    const partiallyPaidOrders = ordersUpdated.filter((o) => !o.wasFullyPaid)

    return NextResponse.json({
      success: true,
      customer: { ...customer, totalDebt: newDebt },
      paidAmount: amount,
      remainingDebt: newDebt,
      ordersSettled: fullyPaidOrders.length,
      ordersPartiallyPaid: partiallyPaidOrders.length,
      orderDetails: ordersUpdated,
      isFullyPaid: newDebt === 0,
      message:
        fullyPaidOrders.length > 0
          ? fullyPaidOrders.length === 1
            ? `¡Orden ${fullyPaidOrders[0].orderNumber} saldada! ${newDebt > 0 ? `Deuda restante: $${newDebt.toLocaleString('es-CO')}` : 'Deuda saldada completamente.'}`
            : `${fullyPaidOrders.length} órdenes saldadas. ${newDebt > 0 ? `Deuda restante: $${newDebt.toLocaleString('es-CO')}` : 'Deuda saldada completamente.'}`
          : `Abono de $${amount.toLocaleString('es-CO')} registrado. Deuda restante: $${newDebt.toLocaleString('es-CO')}`,
    })
  } catch (error) {
    logger.error('POST /api/customers/[id]/pay-debt error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
