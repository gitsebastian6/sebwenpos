import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReserveStock, mockUpsertBatch, mockConsumeBatchById } = vi.hoisted(() => ({
  mockReserveStock: vi.fn(),
  mockUpsertBatch: vi.fn(),
  mockConsumeBatchById: vi.fn(),
}))
vi.mock('../stock-reserver', () => ({ reserveStock: mockReserveStock }))
vi.mock('../batch-receiver', () => ({ upsertBatch: mockUpsertBatch }))
vi.mock('../batch-consumer', () => ({ consumeBatchById: mockConsumeBatchById }))

import { adjustStock, InsufficientStockError } from '../adjust-stock'

type ProductState = { name: string; costPrice: number; trackExpiration: boolean; currentStock: number }

function makeTx(opts: {
  product: Partial<ProductState> & { currentStock: number }
  batch?: { id: number; quantity: number } | null
}) {
  const state = {
    product: { name: 'Prod', costPrice: 100, trackExpiration: false, ...opts.product } as ProductState,
    batch: opts.batch ?? null,
    movements: [] as Record<string, unknown>[],
  }
  const tx = {
    product: {
      findUnique: async ({ select }: { select?: Record<string, boolean> }) => {
        if (select?.currentStock) return { currentStock: state.product.currentStock }
        return { name: state.product.name, costPrice: state.product.costPrice, trackExpiration: state.product.trackExpiration }
      },
      update: async ({ data }: { data: { currentStock?: { increment?: number } } }) => {
        if (data.currentStock?.increment !== undefined) state.product.currentStock += data.currentStock.increment
        return {}
      },
      updateMany: async ({ where, data }: { where: { currentStock?: { gte?: number } }; data: { currentStock?: { decrement?: number } } }) => {
        const gte = where.currentStock?.gte ?? 0
        if (state.product.currentStock < gte) return { count: 0 }
        state.product.currentStock -= data.currentStock?.decrement ?? 0
        return { count: 1 }
      },
    },
    batch: {
      findFirst: async () => (state.batch ? { id: state.batch.id, quantity: state.batch.quantity } : null),
      update: async ({ data }: { data: { quantity?: number } }) => {
        if (state.batch && data.quantity !== undefined) state.batch.quantity = data.quantity
        return {}
      },
    },
    inventoryMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const m = { id: state.movements.length + 1, ...data }
        state.movements.push(m)
        return m
      },
    },
  }
  return { tx, state }
}

beforeEach(() => {
  mockReserveStock.mockReset()
  mockUpsertBatch.mockReset()
  mockConsumeBatchById.mockReset()
})

describe('adjustStock — entrada de stock', () => {
  it('delta+ sin trackExpiration: sube stock, movimiento con signo, sin lote', async () => {
    const { tx, state } = makeTx({ product: { currentStock: 10 } })
    const r = await adjustStock(tx as never, {
      storeId: 1, productId: 5, baseDelta: 12, movementType: 'ADJUSTMENT',
      presentationId: 3, presentationName: 'Paquete', unitsPerPack: 6,
    })
    expect(state.product.currentStock).toBe(22)
    expect(r.newStock).toBe(22)
    expect(state.movements[0]).toMatchObject({ quantity: 12, movementType: 'ADJUSTMENT', presentationId: 3, unitsPerPack: 6, batchId: null })
    expect(mockUpsertBatch).not.toHaveBeenCalled()
  })

  it('delta+ con trackExpiration + lotNumber: consolida/crea ese lote y el movimiento lo referencia', async () => {
    mockUpsertBatch.mockResolvedValue({ batchId: 77 })
    const { tx, state } = makeTx({ product: { currentStock: 0, trackExpiration: true } })
    await adjustStock(tx as never, {
      storeId: 1, productId: 5, baseDelta: 18, movementType: 'RETURN',
      lotNumber: 'L-C', expiryDate: new Date('2026-10-01'),
    })
    expect(mockUpsertBatch).toHaveBeenCalledWith(tx, expect.objectContaining({ lotNumber: 'L-C', baseUnits: 18, baseUnitCost: 100 }))
    expect(state.movements[0]).toMatchObject({ quantity: 18, batchId: 77 })
  })

  it('delta+ con trackExpiration + batchId: incrementa ese lote existente', async () => {
    const { tx, state } = makeTx({ product: { currentStock: 5, trackExpiration: true }, batch: { id: 7, quantity: 5 } })
    await adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: 3, movementType: 'ADJUSTMENT', batchId: 7 })
    expect(state.batch!.quantity).toBe(8)
    expect(mockUpsertBatch).not.toHaveBeenCalled()
    expect(state.movements[0]).toMatchObject({ batchId: 7 })
  })

  it('delta+ con trackExpiration SIN lote: no crea lote, movimiento sin batchId', async () => {
    const { tx, state } = makeTx({ product: { currentStock: 0, trackExpiration: true } })
    await adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: 8, movementType: 'ADJUSTMENT' })
    expect(mockUpsertBatch).not.toHaveBeenCalled()
    expect(state.product.currentStock).toBe(8)
    expect(state.movements[0]).toMatchObject({ quantity: 8, batchId: null })
  })
})

describe('adjustStock — salida de stock', () => {
  it('delta− con batchId + trackExpiration: decremento atómico + consumo de ESE lote (no FEFO)', async () => {
    mockConsumeBatchById.mockResolvedValue({ consumptions: [{ batchId: 4, lotNumber: 'L-A', quantity: 6 }], uncovered: 0 })
    const { tx, state } = makeTx({ product: { currentStock: 12, trackExpiration: true } })
    const r = await adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: -6, movementType: 'LOSS', batchId: 4 })
    expect(mockConsumeBatchById).toHaveBeenCalledWith(tx, 4, 6)
    expect(mockReserveStock).not.toHaveBeenCalled()
    expect(state.product.currentStock).toBe(6)
    expect(state.movements[0]).toMatchObject({ quantity: -6, batchId: 4 })
    expect(r.batchConsumptions).toHaveLength(1)
  })

  it('delta− sin batchId: delega en reserveStock (FEFO)', async () => {
    mockReserveStock.mockResolvedValue({ success: true, consumptions: [{ batchId: 2, lotNumber: 'A', quantity: 6 }], uncovered: 0 })
    const { tx, state } = makeTx({ product: { currentStock: 10 } })
    await adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: -6, movementType: 'LOSS' })
    expect(mockReserveStock).toHaveBeenCalledWith(tx, 1, 5, 6)
    expect(state.movements[0]).toMatchObject({ quantity: -6, batchId: 2 })
  })

  it('delta− con batchId sin stock suficiente lanza InsufficientStockError', async () => {
    const { tx } = makeTx({ product: { currentStock: 2, trackExpiration: true } })
    await expect(
      adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: -6, movementType: 'LOSS', batchId: 4 })
    ).rejects.toBeInstanceOf(InsufficientStockError)
  })

  it('delta− vía reserveStock sin stock lanza InsufficientStockError', async () => {
    mockReserveStock.mockResolvedValue({ success: false, availableStock: 2, productName: 'Prod', consumptions: [], uncovered: 0 })
    const { tx } = makeTx({ product: { currentStock: 2 } })
    await expect(
      adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: -6, movementType: 'LOSS' })
    ).rejects.toBeInstanceOf(InsufficientStockError)
  })

  it('producto sin trackInventory (reserveStock notTracked) no lanza', async () => {
    mockReserveStock.mockResolvedValue({ success: false, notTracked: true, consumptions: [], uncovered: 0 })
    const { tx, state } = makeTx({ product: { currentStock: 0 } })
    const r = await adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: -6, movementType: 'ADJUSTMENT' })
    expect(state.movements[0]).toMatchObject({ quantity: -6 })
    expect(r.movementId).toBeGreaterThan(0)
  })
})

describe('adjustStock — guardas', () => {
  it('baseDelta 0 lanza', async () => {
    const { tx } = makeTx({ product: { currentStock: 10 } })
    await expect(
      adjustStock(tx as never, { storeId: 1, productId: 5, baseDelta: 0, movementType: 'ADJUSTMENT' })
    ).rejects.toThrow()
  })
})
