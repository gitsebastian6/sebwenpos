// ============================================================
// SEBWEN POS — JournalingOnOrderCompleted (Domain Event handler)
// CONTEXT_MAP: Accounting se suscribe a Sales.OrderCompleted.
// ──────────────────────────────────────────────────────────
// Extrae la contabilidad de partida doble de la ruta de ventas:
// la ruta publica `OrderCompleted` y este handler escribe los
// asientos (Caja/CxC DEBIT, Ventas CREDIT, Descuentos, Propina).
// Misma lógica línea por línea que antes vivía en orders/route.ts.
// ============================================================

import { Prisma } from '@prisma/client'
import { onDomainEvent, type OrderCompletedPayload } from '@/domain/shared/domain-events'

/** Registra el handler en el bus. Idempotente (auto-registro al importar). */
let registered = false
export function registerJournalingHandler(): void {
  if (registered) return
  registered = true
  onDomainEvent<OrderCompletedPayload>('OrderCompleted', journalOrder)
}

// Auto-registro: basta con importar este módulo para que Accounting
// quede suscrito a Sales.OrderCompleted.
registerJournalingHandler()

async function journalOrder(
  tx: Prisma.TransactionClient,
  data: OrderCompletedPayload,
): Promise<void> {
  const { storeId, orderId, orderNumber, paymentMethod, subtotal, discountAmount, tipAmount, total } = data
  const paymentSplits = data.paymentSplits

  // Descuentos en Ventas: contra-revenue account so a discounted sale still
  // balances (DEBIT Caja/CxC total + DEBIT Descuento = CREDIT Ventas subtotal).
  const getDescuentoAccount = async () => {
    const existing = await tx.ledgerAccount.findFirst({
      where: { storeId, name: 'Descuentos en Ventas' },
    })
    if (existing) return existing
    return tx.ledgerAccount.create({
      data: { storeId, name: 'Descuentos en Ventas', type: 'EXPENSE', isDefault: false },
    })
  }

  if (paymentMethod !== 'CREDIT' && paymentMethod !== 'FIADO') {
    const cajaAccount = await tx.ledgerAccount.findFirst({
      where: { storeId, type: 'ASSET', isDefault: true },
    })
    const ventasAccount = await tx.ledgerAccount.findFirst({
      where: { storeId, name: 'Ventas' },
    })

    // DEBIT payment accounts. Split-tender (MIXED) posts each method to its own
    // asset account; single-method sales keep posting the full total to Caja.
    const splitLabels: Record<string, string> = {
      CASH: 'Efectivo', DAVIPLATA: 'Daviplata', NEQUI: 'Nequi',
      CARD: 'Tarjeta', TRANSFER: 'Transferencia', WOMPI: 'Wompi',
    }
    const getPaymentAccount = async (method: string) => {
      if (method === 'DAVIPLATA' || method === 'NEQUI' || method === 'TRANSFER') {
        const name = method === 'DAVIPLATA' ? 'Cuenta Daviplata' : method === 'NEQUI' ? 'Cuenta Nequi' : 'Cuenta Bancaria'
        const existing = await tx.ledgerAccount.findFirst({ where: { storeId, name } })
        if (existing) return existing
        return tx.ledgerAccount.create({
          data: { storeId, name, type: 'ASSET', isDefault: false },
        })
      }
      return cajaAccount
    }

    const isSplit = (paymentSplits && paymentSplits.length > 0) || false
    if (isSplit && cajaAccount) {
      // Defense-in-depth: splits must cover the exact total so the books stay balanced
      const splitTotal = paymentSplits!.reduce((sum, split) => sum + split.amount, 0)
      if (splitTotal !== total) {
        throw new Error(`La suma de los pagos (${splitTotal.toLocaleString()}) no coincide con el total (${total.toLocaleString()})`)
      }
      for (const split of paymentSplits!) {
        const account = await getPaymentAccount(split.method)
        if (account) {
          const label = splitLabels[split.method] || split.method
          await tx.journalEntry.create({
            data: {
              storeId,
              ledgerAccountId: account.id,
              amount: split.amount,
              direction: 'DEBIT',
              description: `Venta ${orderNumber} — ${label}${split.reference ? ` (Ref: ${split.reference})` : ''}`,
              referenceType: 'ORDER',
              referenceId: orderId,
            },
          })
        }
      }
    } else if (cajaAccount) {
      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: cajaAccount.id,
          amount: total,
          direction: 'DEBIT',
          description: `Venta ${orderNumber}${tipAmount > 0 ? ` + Propina $${tipAmount.toLocaleString()}` : ''}`,
          referenceType: 'ORDER',
          referenceId: orderId,
        },
      })
    }
    if (ventasAccount) {
      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: ventasAccount.id,
          amount: subtotal,
          direction: 'CREDIT',
          description: `Venta ${orderNumber}`,
          referenceType: 'ORDER',
          referenceId: orderId,
        },
      })
    }
    if (discountAmount > 0) {
      const descuentoAccount = await getDescuentoAccount()
      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: descuentoAccount.id,
          amount: discountAmount,
          direction: 'DEBIT',
          description: `Descuento venta ${orderNumber}`,
          referenceType: 'ORDER',
          referenceId: orderId,
        },
      })
    }
    if (tipAmount > 0) {
      const propinaAccount = await tx.ledgerAccount.findFirst({
        where: { storeId, name: 'Propina' },
      })
      if (propinaAccount) {
        await tx.journalEntry.create({
          data: {
            storeId,
            ledgerAccountId: propinaAccount.id,
            amount: tipAmount,
            direction: 'CREDIT',
            description: `Propina venta ${orderNumber}`,
            referenceType: 'ORDER',
            referenceId: orderId,
          },
        })
      }
    }
    return
  }

  // Venta fiada (CREDIT/FIADO): asientos contra CxC, sin tocar Caja
  const cuentasPorCobrar = await tx.ledgerAccount.findFirst({
    where: { storeId, name: { contains: 'Cuentas por Cobrar' } },
  })
  const ventasAccount = await tx.ledgerAccount.findFirst({
    where: { storeId, name: 'Ventas' },
  })
  if (cuentasPorCobrar) {
    await tx.journalEntry.create({
      data: {
        storeId,
        ledgerAccountId: cuentasPorCobrar.id,
        amount: total,
        direction: 'DEBIT',
        description: `Venta fiada ${orderNumber}`,
        referenceType: 'ORDER',
        referenceId: orderId,
      },
    })
  }
  if (ventasAccount) {
    await tx.journalEntry.create({
      data: {
        storeId,
        ledgerAccountId: ventasAccount.id,
        amount: subtotal,
        direction: 'CREDIT',
        description: `Venta fiada ${orderNumber}`,
        referenceType: 'ORDER',
        referenceId: orderId,
      },
    })
  }
  if (discountAmount > 0) {
    const descuentoAccount = await getDescuentoAccount()
    await tx.journalEntry.create({
      data: {
        storeId,
        ledgerAccountId: descuentoAccount.id,
        amount: discountAmount,
        direction: 'DEBIT',
        description: `Descuento venta fiada ${orderNumber}`,
        referenceType: 'ORDER',
        referenceId: orderId,
      },
    })
  }
}
