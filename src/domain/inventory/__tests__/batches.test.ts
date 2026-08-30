import { describe, it, expect } from 'vitest'
import { consumeBatchById, consumeBatchesFEFO, sortBatchesFEFO } from '../batch-consumer'
import { receiveBatchFromPurchase } from '../batch-receiver'

describe('sortBatchesFEFO', () => {
  const d = (s: string) => new Date(s)
  it('vencen antes primero; sin fecha al final por createdAt; no muta el original', () => {
    const input = [
      { id: 1, expiryDate: null, createdAt: d('2025-03-01') },
      { id: 2, expiryDate: d('2026-06-01'), createdAt: d('2025-01-01') },
      { id: 3, expiryDate: d('2026-01-01'), createdAt: d('2025-02-01') },
      { id: 4, expiryDate: null, createdAt: d('2025-01-15') },
    ]
    const out = sortBatchesFEFO(input)
    expect(out.map((b) => b.id)).toEqual([3, 2, 4, 1])
    expect(input.map((b) => b.id)).toEqual([1, 2, 3, 4]) // intacto
  })
})

// ── FEFO (consumo por lotes) ─────────────────────────────────────

type BatchRow = {
  id: number
  lotNumber: string
  storeId: number
  productId: number
  status: string
  quantity: number | { toNumber(): number }
  expiryDate: Date | null
  createdAt: Date
}

function makeTx(batches: BatchRow[]) {
  return {
    batch: {
      findMany: async ({ where }: { where: { status: string; quantity: { gt: number } } }) =>
        batches.filter((b) => b.status === where.status && Number(b.quantity) > 0),
      update: async ({ where, data }: { where: { id: number }; data: { quantity?: number; status?: string } }) => {
        const b = batches.find((x) => x.id === where.id)!
        if (data.quantity !== undefined) b.quantity = data.quantity
        if (data.status !== undefined) b.status = data.status
        return b
      },
    },
  }
}

function dec(n: number) {
  return {
    toNumber: () => n,
    // Los Decimal reales exponen valueOf → Number(d) funciona
    valueOf: () => String(n),
  }
}

describe('consumeBatchesFEFO', () => {
  const base = {
    storeId: 1,
    productId: 10,
    status: 'ACTIVE',
    createdAt: new Date('2025-01-01'),
  }

  it('consume primero el lote más próximo a vencer (FEFO)', async () => {
    const batches: BatchRow[] = [
      { ...base, id: 2, lotNumber: 'B', quantity: 50, expiryDate: new Date('2026-06-01') },
      { ...base, id: 1, lotNumber: 'A', quantity: 30, expiryDate: new Date('2026-01-01') },
    ]
    const result = await consumeBatchesFEFO(makeTx(batches) as never, 1, 10, 40)
    expect(result.uncovered).toBe(0)
    // Lote A (vence antes) se agota completo; del B salen 10
    expect(result.consumptions).toEqual([
      { batchId: 1, lotNumber: 'A', quantity: 30 },
      { batchId: 2, lotNumber: 'B', quantity: 10 },
    ])
    expect(Number(batches.find((b) => b.id === 1)!.quantity)).toBe(0)
    expect(batches.find((b) => b.id === 1)!.status).toBe('DEPLETED')
    expect(Number(batches.find((b) => b.id === 2)!.quantity)).toBe(40)
  })

  it('reporta como uncovered lo que no cubren los lotes (stock legacy)', async () => {
    const batches: BatchRow[] = [
      { ...base, id: 1, lotNumber: 'A', quantity: dec(5), expiryDate: null },
    ]
    const result = await consumeBatchesFEFO(makeTx(batches) as never, 1, 10, 12)
    expect(result.consumptions).toHaveLength(1)
    expect(result.uncovered).toBeCloseTo(7)
  })

  it('no hace nada con cantidad 0', async () => {
    const result = await consumeBatchesFEFO(makeTx([]) as never, 1, 10, 0)
    expect(result.consumptions).toHaveLength(0)
    expect(result.uncovered).toBe(0)
  })
})

// ── Recepción de lotes desde compras ────────────────────────────

function makeReceiverTx(existing: { id: number; quantity: number | { toNumber(): number }; unitCost: number } | null) {
  const created: unknown[] = []
  let row = existing
  const tx = {
    batch: {
      findUnique: async () => row,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        row = { ...(row as object), id: where.id, ...data } as typeof existing
        return row
      },
      create: async ({ data }: { data: unknown }) => {
        created.push(data)
        return data
      },
    },
  }
  return { tx, created, getRow: () => row }
}

describe('receiveBatchFromPurchase', () => {
  it('crea un lote nuevo con los datos de la línea', async () => {
    const { tx, created } = makeReceiverTx(null)
    await receiveBatchFromPurchase(tx as never, {
      storeId: 1,
      productId: 10,
      purchaseItemId: 99,
      lotNumber: ' L2026 ',
      expiryDate: new Date('2026-12-31'),
      baseUnits: 24,
      baseUnitCost: 2500,
    })
    expect(created).toHaveLength(1)
    expect((created[0] as { lotNumber: string }).lotNumber).toBe('L2026')
    expect((created[0] as { quantity: number }).quantity).toBe(24)
  })

  it('consolida lote existente sumando cantidad y promediando costo', async () => {
    const { tx, getRow } = makeReceiverTx({ id: 1, quantity: 10, unitCost: 2000 })
    await receiveBatchFromPurchase(tx as never, {
      storeId: 1,
      productId: 10,
      purchaseItemId: null,
      lotNumber: 'L1',
      baseUnits: 10,
      baseUnitCost: 3000,
    })
    const row = getRow()!
    expect(Number(row!.quantity)).toBe(20)
    // CPP del lote: (10×2000 + 10×3000)/20 = 2500
    expect(row!.unitCost).toBe(2500)
  })

  it('ignora líneas sin lote o con cantidad 0', async () => {
    const { tx, created } = makeReceiverTx(null)
    await receiveBatchFromPurchase(tx as never, {
      storeId: 1,
      productId: 10,
      lotNumber: '  ',
      baseUnits: 5,
      baseUnitCost: 100,
    })
    await receiveBatchFromPurchase(tx as never, {
      storeId: 1,
      productId: 10,
      lotNumber: 'L',
      baseUnits: 0,
      baseUnitCost: 100,
    })
    expect(created).toHaveLength(0)
  })
})

// ── consumeBatchById (pérdida / ajuste dirigido a un lote) ───────────────

function makeByIdTx(batch: { id: number; lotNumber: string; quantity: number; status: string } | null) {
  let row = batch
  return {
    tx: {
      batch: {
        findUnique: async () => row,
        update: async ({ data }: { data: { quantity?: number; status?: string } }) => {
          if (row) row = { ...row, ...data } as typeof batch
          return row
        },
      },
    },
    getRow: () => row,
  }
}

describe('consumeBatchById', () => {
  it('descuenta del lote indicado y lo marca DEPLETED al llegar a 0', async () => {
    const { tx, getRow } = makeByIdTx({ id: 4, lotNumber: 'L-A', quantity: 6, status: 'ACTIVE' })
    const res = await consumeBatchById(tx as never, 4, 6)
    expect(res.consumptions).toEqual([{ batchId: 4, lotNumber: 'L-A', quantity: 6 }])
    expect(res.uncovered).toBe(0)
    expect(getRow()!.quantity).toBe(0)
    expect(getRow()!.status).toBe('DEPLETED')
  })

  it('lo que el lote no cubre queda como uncovered', async () => {
    const { tx } = makeByIdTx({ id: 4, lotNumber: 'L-A', quantity: 2, status: 'ACTIVE' })
    const res = await consumeBatchById(tx as never, 4, 5)
    expect(res.consumptions[0].quantity).toBe(2)
    expect(res.uncovered).toBe(3)
  })

  it('lote inexistente o no ACTIVE → todo uncovered', async () => {
    const { tx } = makeByIdTx(null)
    const res = await consumeBatchById(tx as never, 99, 5)
    expect(res.consumptions).toHaveLength(0)
    expect(res.uncovered).toBe(5)
  })
})
