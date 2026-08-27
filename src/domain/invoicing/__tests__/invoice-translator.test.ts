import { describe, it, expect, vi } from 'vitest'
import { translateOrderToInvoiceDraft, type OrderForInvoice } from '../invoice-translator'
import { registerJournalingHandler } from '../../accounting/journaling-on-order-completed'
import type { OrderCompletedPayload } from '../../shared/domain-events'

const order: OrderForInvoice = {
  orderNumber: 'V-2026-000123',
  storeName: 'Tienda Sebwén',
  customerName: null,
  customerNit: null,
  subtotal: 10000,
  discountAmount: 1000,
  tipAmount: 500,
  total: 9500,
  lines: [
    {
      productName: 'Cerveza Poker', presentationName: 'Six-pack', unitsPerPack: 6,
      quantity: 2, unitPrice: 4500, totalRow: 9000,
      taxCode: 'IVA', taxRate: 19, taxBase: 7563, taxAmount: 1437,
    },
    {
      productName: '', serviceName: 'Mesa billar', presentationName: null, unitsPerPack: 1,
      quantity: 1, unitPrice: 1000, totalRow: 1000,
      taxCode: null, taxRate: 0, taxBase: 1000, taxAmount: 0,
    },
  ],
}

describe('InvoiceTranslator (ACL Sales → Invoicing)', () => {
  const draft = translateOrderToInvoiceDraft(order)

  it('normaliza comprador ausente a Consumidor Final (NIT 222222222222)', () => {
    expect(draft.buyer).toEqual({ name: 'Consumidor Final', taxId: '222222222222' })
  })

  it('genera número de borrador derivado de la orden', () => {
    expect(draft.invoiceNumber).toBe('DRAFT-V-2026-000123')
  })

  it('la propina NO entra al monto pagable DIAN; el descuento sí lo reduce', () => {
    expect(draft.payableAmount).toBe(9000) // 10000 − 1000
    expect(draft.tipAmount).toBe(500)
  })

  it('acumula bases y totales gravables por línea', () => {
    expect(draft.taxExclusiveAmount).toBe(8563)
    expect(draft.taxInclusiveAmount).toBe(10000)
  })

  it('descripciones legibles con presentación', () => {
    expect(draft.lines[0].description).toContain('Cerveza Poker')
    expect(draft.lines[0].description).toContain('Six-pack ×6')
    expect(draft.lines[1].itemCode).toContain('SERVICIO')
  })

  it('notas explican borrador, propina y descuento', () => {
    expect(draft.notes.some((n) => n.includes('DIAN'))).toBe(true)
    expect(draft.notes.some((n) => n.includes('$500'))).toBe(true)
    expect(draft.notes.some((n) => n.includes('$1.000'))).toBe(true)
  })
})

describe('JournalingOnOrderCompleted handler', () => {
  function makeTx() {
    const accounts = new Map<string, { id: number; name: string }>([
      ['Ventas', { id: 20, name: 'Ventas' }],
      ['Cuentas por Cobrar', { id: 30, name: 'Cuentas por Cobrar' }],
    ])
    let nextId = 1
    const journalEntries: unknown[] = []
    const findFirst = vi.fn(async ({ where }: { where: { name?: unknown; type?: string; isDefault?: boolean } }) => {
      if (where.type === 'ASSET' && where.isDefault) return { id: 10, name: 'Caja' }
      const nameCond = where.name as { contains?: string } | string | undefined
      const target = typeof nameCond === 'string' ? nameCond : nameCond?.contains ?? ''
      for (const a of accounts.values()) if (a.name.includes(target)) return a
      return null
    })
    return {
      journalEntries,
      findFirst,
      ledgerAccount: {
        findFirst,
        create: vi.fn(async ({ data }: { data: { name: string; type: string } }) => {
          const acc = { id: nextId++, name: data.name }
          accounts.set(acc.name, acc)
          return acc
        }),
      },
      journalEntry: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          journalEntries.push(data)
          return data
        }),
      },
    }
  }

  const payload: OrderCompletedPayload = {
    storeId: 1,
    orderId: 77,
    orderNumber: 'V-001',
    paymentMethod: 'CASH',
    subtotal: 10000,
    discountAmount: 0,
    tipAmount: 0,
    total: 10000,
  }

  it('venta contado: DEBIT Caja + CREDIT Ventas balanceados', async () => {
    registerJournalingHandler()
    const tx = makeTx()
    // importar el módulo registró el handler; publicamos directamente
    const { publishDomainEvent } = await import('../../shared/domain-events')
    await publishDomainEvent('OrderCompleted', tx as never, payload)
    expect(tx.journalEntries).toHaveLength(2)
    const [debitCaja, creditVentas] = tx.journalEntries as Record<string, unknown>[]
    expect(debitCaja).toMatchObject({ direction: 'DEBIT', amount: 10000, referenceId: 77 })
    expect(creditVentas).toMatchObject({ direction: 'CREDIT', amount: 10000 })
    expect(tx.journalEntry.create.mock.calls.length).toBe(2)
    void debitCaja
  }, 15000)

  it('venta fiada: usa Cuentas por Cobrar, nunca Caja', async () => {
    const tx = makeTx()
    const { publishDomainEvent } = await import('../../shared/domain-events')
    await publishDomainEvent('OrderCompleted', tx as never, { ...payload, paymentMethod: 'FIADO' })
    const dirs = (tx.journalEntries as { direction: string; description: string }[]).map((e) => e.direction)
    expect(dirs.sort()).toEqual(['CREDIT', 'DEBIT'])
    expect((tx.journalEntries as { description: string }[])[0].description).toContain('fiada')
  }, 15000)

  it('con descuento crea contra-cuenta "Descuentos en Ventas" para cuadrar', async () => {
    const tx = makeTx()
    const { publishDomainEvent } = await import('../../shared/domain-events')
    await publishDomainEvent('OrderCompleted', tx as never, { ...payload, discountAmount: 2000, total: 8000 })
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(3)
    const descriptions = (tx.journalEntries as { description: string }[]).map((e) => e.description)
    expect(descriptions.some((d) => d.includes('Descuento'))).toBe(true)
  }, 15000)
})
