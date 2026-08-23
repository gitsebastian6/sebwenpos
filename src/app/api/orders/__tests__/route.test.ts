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
  },
  service: {
    findMany: vi.fn(),
  },
  taxRate: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  cashRegister: {
    findFirst: vi.fn(),
  },
  customer: {
    findFirst: vi.fn(),
  },
  order: {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  inventoryMovement: {
    create: vi.fn(),
  },
  serviceTransaction: {
    create: vi.fn(),
  },
  ledgerAccount: {
    findFirst: vi.fn(),
  },
  journalEntry: {
    create: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
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
vi.mock('@/lib/auth', () => ({
  generateOrderNumber: vi.fn().mockReturnValue('ORD-000001'),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  sanitizeUser: vi.fn(),
}))

import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'
import { GET, POST } from '../route'

// ─── Test data ─────────────────────────────────────────────────────────────

const validOrderBody = {
  storeId: 1,
  paymentMethod: 'CASH',
  tipAmount: 0,
  discountType: 'NONE',
  discountAmount: 0,
  items: [
    { productId: 1, quantity: 2 },
  ],
}

const mockProduct = {
  id: 1,
  name: 'Café Colombiano',
  salePrice: 10000,
  currentStock: 50,
  isActive: true,
  taxRate: { id: 1, code: '01', rate: 19, rateType: 'PERCENTAGE', applyTo: 'PRODUCT' },
}

const mockDefaultTaxRate = {
  id: 1,
  code: '01',
  rate: 19,
  rateType: 'PERCENTAGE',
  applyTo: 'PRODUCT',
  name: 'IVA 19%',
}

const mockCashRegister = { id: 10 }

const mockCreatedOrder = {
  id: 1,
  orderNumber: 'ORD-000001',
  status: 'COMPLETED',
  subtotal: 20000,
  taxAmount: 3193,
  tipAmount: 0,
  discountAmount: 0,
  total: 20000,
  paymentMethod: 'CASH',
  createdAt: new Date(),
  customer: { id: null, name: null },
  orderItems: [
    {
      id: 1,
      quantity: 2,
      unitPrice: 10000,
      totalRow: 20000,
      taxCode: '01',
      taxRate: 19,
      taxAmount: 3193,
      taxBase: 16807,
      product: { name: 'Café Colombiano' },
      service: null,
    },
  ],
}

// ─── Helper: setup successful transaction mock ─────────────────────────────

function setupSuccessfulTransactionMocks() {
  // Product lookup
  mockDb.product.findMany.mockResolvedValue([mockProduct])
  // Default tax rate
  mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
  // Cash register (open shift)
  mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)
  // Transaction callback
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      order: { create: vi.fn().mockResolvedValue(mockCreatedOrder) },
      product: {
        findUnique: vi.fn().mockResolvedValue({ currentStock: 50, name: 'Café' }),
        update: vi.fn(),
      },
      inventoryMovement: { create: vi.fn() },
      serviceTransaction: { create: vi.fn() },
      ledgerAccount: { findFirst: vi.fn().mockResolvedValue(null) },
      journalEntry: { create: vi.fn() },
      customer: { update: vi.fn() },
    }
    return cb(mockTx)
  })
  mockDb.taxRate.findMany.mockResolvedValue([mockDefaultTaxRate])
}

// ─── POST /api/orders ──────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiAuth.requireStoreAccess.mockReturnValue(null)
    // Active subscription by default — tests for the 403 subscription-gate path override this
    mockDb.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      plan: { features: '{}' },
    })
  })

  it('creates a simple order with one product', async () => {
    setupSuccessfulTransactionMocks()

    const request = mockPostRequest(validOrderBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(201)
    expect(body.orderNumber).toBe('ORD-000001')
    expect(body.status).toBe('COMPLETED')
    expect(body.paymentMethod).toBe('CASH')
    expect(body.orderItems).toHaveLength(1)
  })

  it('applies a discount proportionally to the IVA base of every line (fiscal correctness)', async () => {
    setupSuccessfulTransactionMocks()

    // Capture the exact payload passed to tx.order.create instead of relying on the fixed mock return
    let capturedOrderCreateArgs: any = null
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        order: { create: vi.fn((args: any) => { capturedOrderCreateArgs = args; return Promise.resolve(mockCreatedOrder) }) },
        product: { findUnique: vi.fn().mockResolvedValue({ currentStock: 50, name: 'Café' }), update: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        serviceTransaction: { create: vi.fn() },
        ledgerAccount: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 99, name: 'Descuentos en Ventas' }) },
        journalEntry: { create: vi.fn() },
        customer: { update: vi.fn() },
      }
      return cb(mockTx)
    })

    // Product: salePrice 10000 x qty 2 = totalRow 20000, 19% IVA => taxBase 16807 / taxAmount 3193
    // 10% discount = 2000 => ratio 0.1 => post-discount taxBase 15126 / taxAmount 2874
    const discountedBody = { ...validOrderBody, discountType: 'PERCENTAGE', discountAmount: 10 }
    const request = mockPostRequest(discountedBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(201)
    const items = capturedOrderCreateArgs.data.orderItems.create
    expect(items[0].taxBase).toBe(15126)
    expect(items[0].taxAmount).toBe(2874)
    expect(capturedOrderCreateArgs.data.taxAmount).toBe(2874)
    expect(capturedOrderCreateArgs.data.discountAmount).toBe(2000)
    // totalRow/unitPrice stay at list price — only the IVA-facing figures are discounted
    expect(items[0].totalRow).toBe(20000)
  })

  it('prices and deducts stock for a product presentation (Six-pack) using the DB record, not the client', async () => {
    const sixPack = { id: 5, productId: 1, name: 'Six-pack', salePrice: 55000, unitsPerPack: 6 }
    mockDb.product.findMany.mockResolvedValue([mockProduct]) // base salePrice 10000, currentStock 50
    mockDb.productPresentation.findMany.mockResolvedValue([sixPack])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)
    mockDb.taxRate.findMany.mockResolvedValue([mockDefaultTaxRate])

    let capturedOrderCreateArgs: any = null
    const inventoryMovementCreate = vi.fn()
    const productUpdate = vi.fn()
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        order: { create: vi.fn((args: any) => { capturedOrderCreateArgs = args; return Promise.resolve(mockCreatedOrder) }) },
        product: { findUnique: vi.fn().mockResolvedValue({ currentStock: 50, name: 'Café Colombiano' }), update: productUpdate },
        inventoryMovement: { create: inventoryMovementCreate },
        serviceTransaction: { create: vi.fn() },
        ledgerAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        journalEntry: { create: vi.fn() },
        customer: { update: vi.fn() },
      }
      return cb(mockTx)
    })

    const body = { ...validOrderBody, items: [{ productId: 1, presentationId: 5, quantity: 1 }] }
    const request = mockPostRequest(body)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(201)
    const createdItem = capturedOrderCreateArgs.data.orderItems.create[0]
    // Price comes from the presentation, not the product's base salePrice
    expect(createdItem.unitPrice).toBe(55000)
    expect(createdItem.totalRow).toBe(55000)
    expect(createdItem.presentationId).toBe(5)
    expect(createdItem.presentationName).toBe('Six-pack')
    expect(createdItem.unitsPerPack).toBe(6)
    // Stock/Kardex move in base units: 1 Six-pack = 6 base units, not 1
    // (quantity/decrement llegan como Prisma.Decimal — comparar con Number)
    const movementCall = inventoryMovementCreate.mock.calls[0][0]
    expect(Number(movementCall.data.quantity)).toBe(-6)
    expect(movementCall.data.movementType).toBe('SALE')
    const productCall = productUpdate.mock.calls[0][0]
    expect(Number(productCall.data.currentStock.decrement)).toBe(6)
  })

  it('rejects a presentationId that does not belong to the given product (400)', async () => {
    // Presentation exists but is registered under a different product — must not be honored
    const foreignPresentation = { id: 5, productId: 999, name: 'Six-pack', salePrice: 55000, unitsPerPack: 6 }
    mockDb.product.findMany.mockResolvedValue([mockProduct])
    mockDb.productPresentation.findMany.mockResolvedValue([foreignPresentation])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const body = { ...validOrderBody, items: [{ productId: 1, presentationId: 5, quantity: 1 }] }
    const request = mockPostRequest(body)
    const response = await POST(request as any)
    const { status, body: respBody } = await parseResponse(response)

    expect(status).toBe(400)
    expect(respBody.error).toContain('presentación')
  })

  it('rejects when combined base-unit stock across multiple lines of the same product is insufficient (400)', async () => {
    // 1 unidad suelta (1) + 2 Six-packs (2 x 6 = 12) = 13 base units needed, only 10 in stock
    const lowStockProduct = { ...mockProduct, currentStock: 10 }
    const sixPack = { id: 5, productId: 1, name: 'Six-pack', salePrice: 55000, unitsPerPack: 6 }
    mockDb.product.findMany.mockResolvedValue([lowStockProduct])
    mockDb.productPresentation.findMany.mockResolvedValue([sixPack])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const body = {
      ...validOrderBody,
      items: [
        { productId: 1, quantity: 1 },
        { productId: 1, presentationId: 5, quantity: 2 },
      ],
    }
    const request = mockPostRequest(body)
    const response = await POST(request as any)
    const { status, body: respBody } = await parseResponse(response)

    expect(status).toBe(400)
    expect(respBody.error).toContain('Stock insuficiente')
  })

  it('rejects order with missing storeId (400)', async () => {
    const invalidBody = { ...validOrderBody, storeId: undefined }
    const request = mockPostRequest(invalidBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects order with empty items array (400)', async () => {
    const invalidBody = { ...validOrderBody, items: [] }
    const request = mockPostRequest(invalidBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects order with invalid paymentMethod (400)', async () => {
    const invalidBody = { ...validOrderBody, paymentMethod: 'BITCOIN' }
    const request = mockPostRequest(invalidBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects order with item that has both productId and serviceId (400)', async () => {
    const invalidBody = {
      ...validOrderBody,
      items: [{ productId: 1, serviceId: 1, quantity: 1 }],
    }
    const request = mockPostRequest(invalidBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects order with item that has neither productId nor serviceId (400)', async () => {
    const invalidBody = {
      ...validOrderBody,
      items: [{ quantity: 1 }],
    }
    const request = mockPostRequest(invalidBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects order when product not found (400)', async () => {
    mockDb.product.findMany.mockResolvedValue([]) // Product doesn't exist
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const request = mockPostRequest(validOrderBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('no encontrado')
  })

  it('rejects order when product has insufficient stock (400)', async () => {
    const lowStockProduct = { ...mockProduct, currentStock: 1 }
    mockDb.product.findMany.mockResolvedValue([lowStockProduct])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const request = mockPostRequest(validOrderBody) // quantity: 2 but stock: 1
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('Stock insuficiente')
  })

  it('sells a product with trackInventory=false even when currentStock is below the quantity requested', async () => {
    const untrackedLowStock = { ...mockProduct, currentStock: 1, trackInventory: false }
    mockDb.product.findMany.mockResolvedValue([untrackedLowStock])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)
    mockDb.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        order: { create: vi.fn().mockResolvedValue(mockCreatedOrder) },
        product: { findUnique: vi.fn().mockResolvedValue({ currentStock: 1, name: 'Café' }), update: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        serviceTransaction: { create: vi.fn() },
        ledgerAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        journalEntry: { create: vi.fn() },
        customer: { update: vi.fn() },
      }
      return cb(mockTx)
    })
    mockDb.taxRate.findMany.mockResolvedValue([mockDefaultTaxRate])

    const request = mockPostRequest(validOrderBody) // quantity: 2 but stock: 1
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(201)
  })

  it('a product missing trackInventory in the DB row defaults to tracked (fails safe, never silently unlimited)', async () => {
    // Simulates a select() that forgot to fetch trackInventory — should NOT
    // be treated as "unlimited stock" just because the field came back undefined.
    const { trackInventory: _omitted, ...productWithoutField } = { ...mockProduct, currentStock: 1, trackInventory: true }
    mockDb.product.findMany.mockResolvedValue([productWithoutField])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const request = mockPostRequest(validOrderBody) // quantity: 2 but stock: 1
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('Stock insuficiente')
  })

  it('rejects CREDIT/FIADO order without customerId (400)', async () => {
    // Must set up valid products + stock + cash register first — the route validates those before checking credit rules
    mockDb.product.findMany.mockResolvedValue([mockProduct])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const creditBody = { ...validOrderBody, paymentMethod: 'CREDIT' }
    const request = mockPostRequest(creditBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('cliente')
  })

  it('rejects FIADO order with tipAmount > 0 (400)', async () => {
    // Must set up valid products + stock + cash register first
    mockDb.product.findMany.mockResolvedValue([mockProduct])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(mockCashRegister)

    const fiadoBody = {
      ...validOrderBody,
      paymentMethod: 'FIADO',
      customerId: 1,
      tipAmount: 5000,
    }
    const request = mockPostRequest(fiadoBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('propina')
  })

  it('rejects order when no cash register is open (400)', async () => {
    mockDb.product.findMany.mockResolvedValue([mockProduct])
    mockDb.taxRate.findFirst.mockResolvedValue(mockDefaultTaxRate)
    mockDb.cashRegister.findFirst.mockResolvedValue(null) // No open register

    const request = mockPostRequest(validOrderBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('caja')
  })

  it('handles database errors (500)', async () => {
    mockDb.product.findMany.mockRejectedValue(new Error('DB connection lost'))

    const request = mockPostRequest(validOrderBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })

  it('handles store access denial (403)', async () => {
    mockApiAuth.requireStoreAccess.mockReturnValue(
      new Response(JSON.stringify({ error: 'No tienes acceso a esta tienda' }), { status: 403 })
    )

    const request = mockPostRequest(validOrderBody)
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(403)
  })
})

// ─── GET /api/orders ───────────────────────────────────────────────────────

describe('GET /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiAuth.requireStoreAccess.mockReturnValue(null)
  })

  it('returns orders for a store', async () => {
    const mockOrders = [
      { id: 1, orderNumber: 'ORD-001', status: 'COMPLETED', paymentMethod: 'CASH', total: 25000, createdAt: new Date(), customer: { name: 'Juan' }, tableSessionId: null, tableSession: null },
    ]
    mockDb.order.count.mockResolvedValue(1)
    mockDb.order.findMany.mockResolvedValue(mockOrders)

    const url = 'http://localhost:3000/api/orders?storeId=1'
    const request = new Request(url, { method: 'GET', headers: new Headers() }) as any

    const response = await GET(request)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.pagination.total).toBe(1)
  })

  it('returns 400 when storeId is missing', async () => {
    const url = 'http://localhost:3000/api/orders'
    const request = new Request(url, { method: 'GET', headers: new Headers() }) as any

    const response = await GET(request)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('storeId')
  })

  it('filters by status when provided', async () => {
    mockDb.order.count.mockResolvedValue(0)
    mockDb.order.findMany.mockResolvedValue([])

    const url = 'http://localhost:3000/api/orders?storeId=1&status=COMPLETED'
    const request = new Request(url, { method: 'GET', headers: new Headers() }) as any

    const response = await GET(request)
    const { status } = await parseResponse(response)

    expect(status).toBe(200)
    // Verify that findMany was called with a status filter
    const findManyCall = mockDb.order.findMany.mock.calls[0][0]
    expect(findManyCall.where.status).toBe('COMPLETED')
  })

  it('does not filter by status when status is ALL', async () => {
    mockDb.order.count.mockResolvedValue(0)
    mockDb.order.findMany.mockResolvedValue([])

    const url = 'http://localhost:3000/api/orders?storeId=1&status=ALL'
    const request = new Request(url, { method: 'GET', headers: new Headers() }) as any

    const response = await GET(request)
    const { status } = await parseResponse(response)

    expect(status).toBe(200)
    const findManyCall = mockDb.order.findMany.mock.calls[0][0]
    expect(findManyCall.where.status).toBeUndefined()
  })

  it('handles database errors (500)', async () => {
    mockDb.order.count.mockRejectedValue(new Error('DB error'))

    const url = 'http://localhost:3000/api/orders?storeId=1'
    const request = new Request(url, { method: 'GET', headers: new Headers() }) as any

    const response = await GET(request)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })
})
