import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

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
        { error: `El monto no puede superar la deuda actual ($${customer.totalDebt})` },
        { status: 400 }
      )
    }

    const newDebt = customer.totalDebt - amount

    // Update customer debt
    const updated = await db.customer.update({
      where: { id: customerId },
      data: { totalDebt: newDebt },
    })

    // Find or create a CASH/DEBT ledger account
    let account = await db.ledgerAccount.findFirst({
      where: { storeId, type: 'ASSET', name: { contains: 'Caja' } },
    })

    if (!account) {
      account = await db.ledgerAccount.create({
        data: {
          storeId,
          name: 'Caja General',
          type: 'ASSET',
        },
      })
    }

    // Record in journal (debit: cash received, credit: debt reduction)
    await db.journalEntry.create({
      data: {
        storeId,
        ledgerAccountId: account.id,
        amount: amount,
        direction: 'DEBIT',
        description: `Abono deuda - ${customer.name}${note ? ` (${note})` : ''}`,
        referenceType: 'DEBT_PAYMENT',
        referenceId: customerId,
      },
    })

    const isFullyPaid = newDebt === 0

    return NextResponse.json({
      success: true,
      customer: updated,
      paidAmount: amount,
      remainingDebt: newDebt,
      isFullyPaid,
      message: isFullyPaid
        ? `Deuda saldada completamente. ¡Gracias ${customer.name}!`
        : `Abono de $${amount.toLocaleString()} registrado. Deuda restante: $${newDebt.toLocaleString()}`,
    })
  } catch (error) {
    console.error('POST /api/customers/[id]/pay-debt error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
