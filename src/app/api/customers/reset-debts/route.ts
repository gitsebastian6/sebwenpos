import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const resetSchema = z.object({
  storeId: z.number().int().positive(),
  note: z.string().max(500).optional(),
})

// POST /api/customers/reset-debts
// Resetea todas las deudas de clientes a $0 y marca órdenes fiadas como saldadas
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = resetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { storeId, note } = parsed.data

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    // Get all customers with debt
    const customersWithDebt = await db.customer.findMany({
      where: { storeId, totalDebt: { gt: 0 } },
    })

    if (customersWithDebt.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay deudas pendientes para resetear',
        customersReset: 0,
        totalDebtReset: 0,
      })
    }

    // Get all CREDIT orders for this store
    const creditOrders = await db.order.findMany({
      where: { storeId, status: 'CREDIT' },
    })

    const totalDebtReset = customersWithDebt.reduce((sum, c) => sum + c.totalDebt, 0)

    await db.$transaction(async (tx) => {
      // 1. Reset all customer debts to 0
      await tx.customer.updateMany({
        where: { storeId, totalDebt: { gt: 0 } },
        data: { totalDebt: 0, debtSince: null },
      })

      // 2. Mark all CREDIT orders as COMPLETED
      if (creditOrders.length > 0) {
        await tx.order.updateMany({
          where: { storeId, status: 'CREDIT' },
          data: { status: 'COMPLETED' },
        })
      }

      // 3. Reset CxC (Cuentas por Cobrar) ledger account
      const cxcAccount = await tx.ledgerAccount.findFirst({
        where: { storeId, name: { contains: 'Cuentas por Cobrar' } },
      })

      if (cxcAccount) {
        // Create a CREDIT journal entry to zero out the CxC balance
        await tx.journalEntry.create({
          data: {
            storeId,
            ledgerAccountId: cxcAccount.id,
            amount: totalDebtReset,
            direction: 'CREDIT',
            description: `RESETEO DE SALDOS${note ? ` - ${note}` : ''} (${customersWithDebt.length} clientes, ${creditOrders.length} órdenes fiadas)`,
            referenceType: 'DEBT_RESET',
            referenceId: 0,
          },
        })
      }

      // 4. Create a reference journal entry in a concession expense account
      let concessionAccount = await tx.ledgerAccount.findFirst({
        where: { storeId, name: 'Concesiones y Castigos' },
      })

      if (!concessionAccount) {
        concessionAccount = await tx.ledgerAccount.create({
          data: {
            storeId,
            name: 'Concesiones y Castigos',
            type: 'EXPENSE',
          },
        })
      }

      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: concessionAccount.id,
          amount: totalDebtReset,
          direction: 'DEBIT',
          description: `RESETEO DE SALDOS${note ? ` - ${note}` : ''} - Condonación de deudas (${customersWithDebt.length} clientes)`,
          referenceType: 'DEBT_RESET',
          referenceId: 0,
        },
      })
    })

    return NextResponse.json({
      success: true,
      message: `Saldos reseteados: ${customersWithDebt.length} clientes, ${creditOrders.length} órdenes fiadas condonadas ($${totalDebtReset.toLocaleString('es-CO')})`,
      customersReset: customersWithDebt.length,
      ordersSettled: creditOrders.length,
      totalDebtReset,
    })
  } catch (error) {
    logger.error('POST /api/customers/reset-debts error:', error)
    return NextResponse.json({ error: 'Error al resetear saldos' }, { status: 500 })
  }
}
