import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  purchase: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  provider: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  product: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  productPresentation: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  costHistory: {
    create: vi.fn(),
  },
  inventoryMovement: {
    create: vi.fn(),
  },
  purchaseItem: {
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
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

import { PUT } from '../route'
import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'

// A purchase with one item: originally bought 3 (of a Caja x24 presentation,
// unitsPerPack=24), 2 already returned — so only 1 is still "available" in stock.
const basePurchase = {
  id: 2,
  storeId: 1,
  providerId: null,
  status: 'COMPLETED',
  paymentTerms: 'CONTADO',
  paymentStatus: 'PAID',
  amountPaid: 149940,
  total: 149940,
  date: new Date('2026-08-10'),
  purchasePayments: [{ id: 1, amount: 149940 }],
  purchaseItems: [
    {
      id: 2, purchaseId: 2, productId: 80, presentationId: 5, presentationName: 'Caja x24',
      unitsPerPack: 24, quantity: 3, returnedQuantity: 2, unitCost: 42000, ivaRate: 19,
      ivaAmount: 23940, discountAmount: 0, lotNumber: null, expiryDate: null, manufacturingDate: null,
      total: 149940,
      product: { id: 80, name: 'Gaseosa Lux 350ml', costPrice: 1750, currentStock: 24 },
    },
  ],
}

function setupTxMock() {
  let capturedProductUpdate: any = null
  const mockTx = {
    provider: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    product: { update: vi.fn((args: any) => { capturedProductUpdate = args; return Promise.resolve({}) }), findUnique: vi.fn() },
    productPresentation: { update: vi.fn() },
    costHistory: { create: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    purchaseItem: { update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    purchase: { update: vi.fn().mockResolvedValue({ id: 2 }) },
  }
  mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(mockTx))
  return { mockTx, getCapturedProductUpdate: () => capturedProductUpdate }
}

describe('PUT /api/purchases/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiAuth.requireStoreAccess.mockReturnValue(null)
    mockDb.purchase.findUnique.mockResolvedValue(basePurchase)
    mockDb.productPresentation.findMany.mockResolvedValue([])
  })

  it('re-saving an item with its ORIGINAL quantity after a partial return does not re-inflate stock', async () => {
    const { getCapturedProductUpdate } = setupTxMock()

    // Item id=2 resent with its unchanged original quantity (3) — the return
    // already reduced stock by 2*24=48 base units at return time; this edit
    // must NOT try to "restore" that as if the quantity had increased.
    const body = { items: [{ id: 2, quantity: 3, unitCost: 42000, ivaRate: 19 }] }
    const request = mockPostRequest(body)
    const response = await PUT(request as any, { params: Promise.resolve({ id: '2' }) })
    const { status } = await parseResponse(response)

    expect(status).toBe(200)
    // No stock adjustment should have been made for this line at all
    expect(getCapturedProductUpdate()).toBeNull()
  })

  it('increasing the purchased quantity beyond the original still adds only the real delta (not inflated by the return)', async () => {
    const { getCapturedProductUpdate } = setupTxMock()

    // Correcting the invoice: actually bought 4 Cajas x24, not 3 (2 already returned)
    const body = { items: [{ id: 2, quantity: 4, unitCost: 42000, ivaRate: 19 }] }
    const request = mockPostRequest(body)
    const response = await PUT(request as any, { params: Promise.resolve({ id: '2' }) })
    const { status } = await parseResponse(response)

    expect(status).toBe(200)
    // qtyDiff = 4 - 3 (original) = 1 -> 1 * unitsPerPack(24) = 24 base units
    expect(getCapturedProductUpdate().data.currentStock).toEqual({ increment: 24 })
  })

  it('rejects reducing the purchased quantity below what has already been returned', async () => {
    setupTxMock()

    // Already returned 2 of 3 — can't edit the purchased quantity down to 1
    const body = { items: [{ id: 2, quantity: 1, unitCost: 42000, ivaRate: 19 }] }
    const request = mockPostRequest(body)
    const response = await PUT(request as any, { params: Promise.resolve({ id: '2' }) })
    const { body: respBody } = await parseResponse(response)

    expect(respBody.error).toContain('devuelto')
  })
})
