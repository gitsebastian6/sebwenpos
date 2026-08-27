import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  productPresentation: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  provider: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  purchase: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  costHistory: {
    create: vi.fn(),
  },
  inventoryMovement: {
    create: vi.fn(),
  },
  purchasePayment: {
    create: vi.fn(),
  },
  providerProductMapping: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}))

const mockApiAuth = vi.hoisted(() => ({
  requireStoreAccess: vi.fn().mockReturnValue(null),
  getAuthUser: vi.fn().mockReturnValue({ userId: 1, role: 'OWNER', storeId: 1, employeeId: null }),
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/api-auth', () => mockApiAuth)

import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'
import { POST } from '../route'

// ─── Test data ─────────────────────────────────────────────────────────────

const validPurchaseBody = {
  storeId: 1,
  documentType: 'FACTURA_COMPRA',
  paymentTerms: 'CONTADO',
  items: [
    { productId: 1, quantity: 2, unitCost: 5000, ivaRate: 19 },
  ],
}

const mockProduct = { id: 1, name: 'Gaseosa Lux 350ml', costPrice: 4000, currentStock: 10 }

const mockCajaX24 = { id: 7, productId: 1, name: 'Caja x24', unitsPerPack: 24 }

describe('POST /api/purchases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiAuth.requireStoreAccess.mockReturnValue(null)
    mockDb.product.findMany.mockResolvedValue([mockProduct])
    mockDb.productPresentation.findMany.mockResolvedValue([])
  })

  it('creates a simple purchase and increments stock by the raw quantity (no presentation = base units)', async () => {
    let capturedProductUpdate: any = null
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        purchase: { create: vi.fn().mockResolvedValue({ id: 1, consecutiveNumber: 'PC-0001' }), findFirst: vi.fn().mockResolvedValue(null) },
        product: {
          findUnique: vi.fn().mockResolvedValue({ costPrice: mockProduct.costPrice, currentStock: mockProduct.currentStock }),
          update: vi.fn((args: any) => { capturedProductUpdate = args; return Promise.resolve({}) }),
        },
        productPresentation: { update: vi.fn() },
        costHistory: { create: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        purchasePayment: { create: vi.fn() },
        provider: { update: vi.fn() },
        providerProductMapping: { upsert: vi.fn() },
      }
      return cb(mockTx)
    })

    const request = mockPostRequest(validPurchaseBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(201)
    // Stock: existing 10 + 2 (quantity, unitsPerPack=1) = increment by 2
    // (increment llega como Prisma.Decimal — comparar con Number)
    expect(Number(capturedProductUpdate.data.currentStock.increment)).toBe(2)
    // CPP: (10*4000 + 2*5000) / (10+2) = 50000/12 = 4166.67 -> 4167
    expect(capturedProductUpdate.data.costPrice).toBe(4167)
  })

  it('resolves a presentation (Caja x24): stock increments in base units and cost is weighted per base unit', async () => {
    mockDb.productPresentation.findMany.mockResolvedValue([mockCajaX24])
    let capturedProductUpdate: any = null
    let capturedPresentationUpdate: any = null
    let capturedMovement: any = null
    let capturedPurchaseCreate: any = null
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        purchase: { create: vi.fn((args: any) => { capturedPurchaseCreate = args; return Promise.resolve({ id: 1, consecutiveNumber: 'PC-0001' }) }), findFirst: vi.fn().mockResolvedValue(null) },
        product: {
          findUnique: vi.fn().mockResolvedValue({ costPrice: mockProduct.costPrice, currentStock: mockProduct.currentStock }),
          update: vi.fn((args: any) => { capturedProductUpdate = args; return Promise.resolve({}) }),
        },
        productPresentation: { update: vi.fn((args: any) => { capturedPresentationUpdate = args; return Promise.resolve({}) }) },
        costHistory: { create: vi.fn() },
        inventoryMovement: { create: vi.fn((args: any) => { capturedMovement = args; return Promise.resolve({}) }) },
        purchasePayment: { create: vi.fn() },
        provider: { update: vi.fn() },
        providerProductMapping: { upsert: vi.fn() },
      }
      return cb(mockTx)
    })

    // Buy 1 "Caja x24" at 96000 (=4000/unit) — product already has 10 units @ 4000
    const body = {
      ...validPurchaseBody,
      items: [{ productId: 1, presentationId: 7, quantity: 1, unitCost: 96000, ivaRate: 19 }],
    }
    const request = mockPostRequest(body)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(201)
    // Base units = 1 * 24 = 24 -> stock increments by 24, not 1
    expect(Number(capturedProductUpdate.data.currentStock.increment)).toBe(24)
    // CPP: (10*4000 + 1*96000) / (10+24) = 136000/34 = 4000 exactly
    expect(capturedProductUpdate.data.costPrice).toBe(4000)
    // The presentation's own displayed cost is synced to what was just paid
    expect(capturedPresentationUpdate.where.id).toBe(7)
    expect(capturedPresentationUpdate.data.costPrice).toBe(96000)
    // Inventory movement is always in base units
    expect(Number(capturedMovement.data.quantity)).toBe(24)
    expect(capturedMovement.data.movementType).toBe('PURCHASE')
    // The created purchase item snapshots the presentation
    const createdItem = capturedPurchaseCreate.data.purchaseItems.create[0]
    expect(createdItem.presentationId).toBe(7)
    expect(createdItem.presentationName).toBe('Caja x24')
    expect(createdItem.unitsPerPack).toBe(24)
    expect(createdItem.quantity).toBe(1) // stays in the presentation's own unit
    expect(createdItem.unitCost).toBe(96000)
  })

  it('rejects a presentationId that does not belong to the given product (400)', async () => {
    const foreignPresentation = { id: 7, productId: 999, name: 'Caja x24', unitsPerPack: 24 }
    mockDb.productPresentation.findMany.mockResolvedValue([foreignPresentation])

    const body = {
      ...validPurchaseBody,
      items: [{ productId: 1, presentationId: 7, quantity: 1, unitCost: 96000, ivaRate: 19 }],
    }
    const request = mockPostRequest(body)
    const response = await POST(request as any)
    const { status, body: respBody } = await parseResponse(response)

    expect(status).toBe(400)
    expect(respBody.error).toContain('presentación')
  })

  it('rejects purchase when a product is not found for the store (400)', async () => {
    mockDb.product.findMany.mockResolvedValue([])
    const request = mockPostRequest(validPurchaseBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('no encontrados')
  })

  it('handles database errors (500)', async () => {
    mockDb.product.findMany.mockRejectedValue(new Error('DB connection lost'))
    const request = mockPostRequest(validPurchaseBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })

  it('compounds CPP correctly across two lines of the SAME product in one purchase (paid line + $0 bonus line) — regression test for the stale-snapshot bug', async () => {
    // Simulates a real DB row: findUnique always returns whatever the last
    // update() actually wrote, proving the fix reads live state, not the
    // stale `products` array fetched once before the transaction.
    const liveProduct = { costPrice: mockProduct.costPrice, currentStock: mockProduct.currentStock }
    const capturedUpdates: any[] = []
    const capturedCostHistory: any[] = []
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        purchase: { create: vi.fn().mockResolvedValue({ id: 1, consecutiveNumber: 'PC-0001' }), findFirst: vi.fn().mockResolvedValue(null) },
        product: {
          findUnique: vi.fn(() => Promise.resolve({ ...liveProduct })),
          update: vi.fn((args: any) => {
            capturedUpdates.push(args)
            // increment llega como Prisma.Decimal — convertir a number para
            // simular la lectura en vivo del stock (evita concatenación de string)
            if (args.data.currentStock?.increment) liveProduct.currentStock += Number(args.data.currentStock.increment)
            if (typeof args.data.costPrice === 'number') liveProduct.costPrice = args.data.costPrice
            return Promise.resolve({})
          }),
        },
        productPresentation: { update: vi.fn() },
        costHistory: { create: vi.fn((args: any) => { capturedCostHistory.push(args); return Promise.resolve({}) }) },
        inventoryMovement: { create: vi.fn() },
        purchasePayment: { create: vi.fn() },
        provider: { update: vi.fn() },
        providerProductMapping: { upsert: vi.fn() },
      }
      return cb(mockTx)
    })

    // Line 1: 10 units paid at 5000. Line 2: 10 "bonus" units of the SAME
    // product at 0 — the exact scenario the stale-snapshot bug corrupted.
    const body = {
      ...validPurchaseBody,
      items: [
        { productId: 1, quantity: 10, unitCost: 5000, ivaRate: 19 },
        { productId: 1, quantity: 10, unitCost: 0, ivaRate: 19, isBonus: true },
      ],
    }
    const response = await POST(mockPostRequest(body) as any)
    const { status } = await parseResponse(response)
    expect(status).toBe(201)

    // Manually pre-merged equivalent: qty=20, cost=only the paid amount (5000*10=50000)
    // CPP = (10*4000 + 50000) / (10+20) = 90000/30 = 3000
    expect(capturedUpdates[capturedUpdates.length - 1].data.costPrice).toBe(3000)
    expect(liveProduct.currentStock).toBe(30) // 10 existing + 10 + 10

    // The second costHistory entry must use the cost the FIRST line just wrote
    // (4444, from (10*4000+10*5000)/20), not the stale original 4000 — proof
    // the fix reads live state between lines, not the pre-transaction snapshot.
    expect(capturedCostHistory).toHaveLength(2)
    expect(capturedCostHistory[0].data.previousCost).toBe(4000)
    expect(capturedCostHistory[1].data.previousCost).toBe(capturedUpdates[0].data.costPrice)
  })

  it('flows isBonus through to the created purchase item', async () => {
    let capturedPurchaseCreate: any = null
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        purchase: { create: vi.fn((args: any) => { capturedPurchaseCreate = args; return Promise.resolve({ id: 1, consecutiveNumber: 'PC-0001' }) }), findFirst: vi.fn().mockResolvedValue(null) },
        product: {
          findUnique: vi.fn().mockResolvedValue({ costPrice: mockProduct.costPrice, currentStock: mockProduct.currentStock }),
          update: vi.fn().mockResolvedValue({}),
        },
        productPresentation: { update: vi.fn() },
        costHistory: { create: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        purchasePayment: { create: vi.fn() },
        provider: { update: vi.fn() },
        providerProductMapping: { upsert: vi.fn() },
      }
      return cb(mockTx)
    })

    const body = { ...validPurchaseBody, items: [{ productId: 1, quantity: 2, unitCost: 0, ivaRate: 19, isBonus: true }] }
    const response = await POST(mockPostRequest(body) as any)
    expect((await parseResponse(response)).status).toBe(201)
    expect(capturedPurchaseCreate.data.purchaseItems.create[0].isBonus).toBe(true)
  })

  it('saves a provider product mapping (homologación) when the line carries a sellerSku and a providerId', async () => {
    mockDb.provider.findFirst.mockResolvedValue({ id: 5, regime: 'NO_RESPONSABLE' })
    let capturedUpsert: any = null
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        purchase: { create: vi.fn().mockResolvedValue({ id: 1, consecutiveNumber: 'PC-0001' }), findFirst: vi.fn().mockResolvedValue(null) },
        product: {
          findUnique: vi.fn().mockResolvedValue({ costPrice: mockProduct.costPrice, currentStock: mockProduct.currentStock }),
          update: vi.fn().mockResolvedValue({}),
        },
        productPresentation: { update: vi.fn() },
        costHistory: { create: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        purchasePayment: { create: vi.fn() },
        provider: { update: vi.fn() },
        providerProductMapping: { upsert: vi.fn((args: any) => { capturedUpsert = args; return Promise.resolve({}) }) },
      }
      return cb(mockTx)
    })

    const body = {
      ...validPurchaseBody,
      providerId: 5,
      items: [{ productId: 1, quantity: 2, unitCost: 5000, ivaRate: 19, sellerSku: 'PROV-CODE-9' }],
    }
    const response = await POST(mockPostRequest(body) as any)
    expect((await parseResponse(response)).status).toBe(201)
    expect(capturedUpsert.where.providerId_sellerSku).toEqual({ providerId: 5, sellerSku: 'prov-code-9' })
    expect(capturedUpsert.create.productId).toBe(1)
  })
})
