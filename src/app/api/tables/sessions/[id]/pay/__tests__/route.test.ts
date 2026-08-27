import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockTx = vi.hoisted(() => ({
  order: { create: vi.fn() },
  comandaItem: { updateMany: vi.fn() },
  inventoryMovement: { create: vi.fn() },
  serviceTransaction: { create: vi.fn() },
  ledgerAccount: { findFirst: vi.fn(), create: vi.fn() },
  journalEntry: { create: vi.fn() },
  customer: { findUnique: vi.fn(), update: vi.fn() },
}))

const mockDb = vi.hoisted(() => ({
  tableSession: { findUnique: vi.fn() },
  comandaItem: { findMany: vi.fn() },
  customer: { findFirst: vi.fn() },
  cashRegister: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
}))

const mockReserve = vi.hoisted(() => ({ reserveStock: vi.fn() }))
const mockSubHelpers = vi.hoisted(() => ({ isSubscriptionActive: vi.fn().mockResolvedValue(true) }))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/api-auth', () => ({
  requireStoreAccess: vi.fn().mockReturnValue(null),
  getAuthUser: vi.fn().mockReturnValue({ userId: 1, role: 'OWNER', storeId: 3, employeeId: 9 }),
}))
vi.mock('@/lib/auth', () => ({ generateOrderNumber: vi.fn(() => 'TK-000001') }))
vi.mock('@/lib/subscription-helpers', () => mockSubHelpers)
vi.mock('@/lib/tables-sync', () => ({ emitComandaItemsUpdated: vi.fn(), emitPaymentProcessed: vi.fn() }))
vi.mock('@/domain/inventory/stock-reserver', () => mockReserve)

import { parseResponse } from '@/lib/__tests__/test-helpers'
import { POST } from '../route'

// ─── Helpers ──────────────────────────────────────────────────────────────

function payRequest(body: unknown, id = '5'): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost:3000/api/tables/sessions/${id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return [req, { params: Promise.resolve({ id }) }]
}

const openSession = {
  id: 5, storeId: 3, status: 'OPEN', customerId: null, barTableId: 2,
  barTable: { number: 4, name: null }, customer: null,
}

function productItem(over: Record<string, unknown> = {}) {
  return {
    id: 100, productId: 50, serviceId: null, presentationId: null, presentationName: null,
    unitsPerPack: 1, quantity: 2, unitPrice: 5000, total: 10000, productName: 'Cerveza',
    product: {
      id: 50, name: 'Cerveza', salePrice: 5000, costPrice: 3000, currentStock: 100,
      taxRate: { id: 1, name: 'IVA 19%', code: '01', rate: 19, rateType: 'PERCENTAGE' },
    },
    service: null,
    ...over,
  }
}

const validBody = {
  storeId: 3,
  itemIds: [100],
  paymentMethod: 'CASH' as const,
  tipAmount: 0,
  discountType: 'NONE' as const,
  discountAmount: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx))
  mockDb.tableSession.findUnique.mockResolvedValue(openSession)
  mockDb.comandaItem.findMany.mockResolvedValue([productItem()])
  mockDb.cashRegister.findFirst.mockResolvedValue({ id: 77 })
  mockDb.customer.findFirst.mockResolvedValue({ id: 1, storeId: 3 })
  mockSubHelpers.isSubscriptionActive.mockResolvedValue(true)
  mockReserve.reserveStock.mockResolvedValue({ success: true, notTracked: false, consumptions: [], productName: 'Cerveza' })
  mockTx.order.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 999, orderNumber: 'TK-000001', status: data.status, paymentMethod: data.paymentMethod,
    subtotal: data.subtotal, taxAmount: data.taxAmount, taxBreakdown: data.taxBreakdown,
    tipAmount: data.tipAmount, discountAmount: data.discountAmount, discountType: data.discountType,
    total: data.total, customer: null, orderItems: [], createdAt: new Date('2026-08-27T12:00:00Z'),
  }))
  mockTx.ledgerAccount.findFirst.mockResolvedValue(null)
  mockTx.ledgerAccount.create.mockResolvedValue({ id: 1 })
  mockTx.customer.findUnique.mockResolvedValue({ totalDebt: 0 })
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/tables/sessions/[id]/pay', () => {
  it('404 when the session does not exist', async () => {
    mockDb.tableSession.findUnique.mockResolvedValue(null)
    const res = await POST(...payRequest(validBody) as [never, never])
    expect((await parseResponse(res)).status).toBe(404)
  })

  it('400 when the session is not OPEN', async () => {
    mockDb.tableSession.findUnique.mockResolvedValue({ ...openSession, status: 'CLOSED' })
    const res = await POST(...payRequest(validBody) as [never, never])
    expect((await parseResponse(res)).status).toBe(400)
  })

  it('400 when the session belongs to another store', async () => {
    const res = await POST(...payRequest({ ...validBody, storeId: 999 }) as [never, never])
    const { status, body } = await parseResponse(res)
    expect(status).toBe(400)
    expect(body.error).toMatch(/no pertenece/i)
  })

  it('403 when the subscription is not active', async () => {
    mockSubHelpers.isSubscriptionActive.mockResolvedValue(false)
    const res = await POST(...payRequest(validBody) as [never, never])
    expect((await parseResponse(res)).status).toBe(403)
  })

  it('400 when no eligible comanda items are found', async () => {
    mockDb.comandaItem.findMany.mockResolvedValue([])
    const res = await POST(...payRequest(validBody) as [never, never])
    expect((await parseResponse(res)).status).toBe(400)
  })

  it('400 when a requested itemId is not eligible', async () => {
    const res = await POST(...payRequest({ ...validBody, itemIds: [100, 101] }) as [never, never])
    const { status, body } = await parseResponse(res)
    expect(status).toBe(400)
    expect(body.error).toMatch(/101/)
  })

  it('400 when there is no open cash register', async () => {
    mockDb.cashRegister.findFirst.mockResolvedValue(null)
    const res = await POST(...payRequest(validBody) as [never, never])
    const { status, body } = await parseResponse(res)
    expect(status).toBe(400)
    expect(body.error).toMatch(/caja/i)
  })

  it('400 when a tip is added to a FIADO sale', async () => {
    const res = await POST(...payRequest({ ...validBody, paymentMethod: 'FIADO', tipAmount: 1000 }) as [never, never])
    expect((await parseResponse(res)).status).toBe(400)
  })

  it('CASH happy path: creates a COMPLETED order, marks items PAID, reserves stock, returns 201', async () => {
    const res = await POST(...payRequest(validBody) as [never, never])
    const { status, body } = await parseResponse(res)

    expect(status).toBe(201)
    expect(body).toMatchObject({ id: 999, orderNumber: 'TK-000001', status: 'COMPLETED', total: 10000, subtotal: 10000 })

    const orderArgs = mockTx.order.create.mock.calls[0][0].data
    expect(orderArgs.status).toBe('COMPLETED')
    expect(orderArgs.tableSessionId).toBe(5)
    expect(orderArgs.cashRegisterId).toBe(77)

    expect(mockTx.comandaItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [100] } },
      data: { status: 'PAID' },
    })
    // stock reserved in base units (qty 2 × unitsPerPack 1)
    expect(mockReserve.reserveStock).toHaveBeenCalledWith(mockTx, 3, 50, 2)
    expect(mockTx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ movementType: 'SALE', referenceId: 999 }) }),
    )
  })

  it('rolls back (500) when stock is insufficient', async () => {
    mockReserve.reserveStock.mockResolvedValue({ success: false, notTracked: false, availableStock: 1, productName: 'Cerveza', consumptions: [] })
    const res = await POST(...payRequest(validBody) as [never, never])
    expect((await parseResponse(res)).status).toBe(500)
    expect(mockTx.comandaItem.updateMany).toHaveBeenCalled() // updateMany runs before the stock loop, tx aborts after
  })

  it('FIADO with a customer: order is CREDIT and the customer debt is incremented by the total', async () => {
    const res = await POST(...payRequest({ ...validBody, paymentMethod: 'FIADO', customerId: 1 }) as [never, never])
    const { status } = await parseResponse(res)

    expect(status).toBe(201)
    expect(mockTx.order.create.mock.calls[0][0].data.status).toBe('CREDIT')
    expect(mockTx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ totalDebt: { increment: 10000 } }) }),
    )
  })

  it('PERCENTAGE discount reduces the order total and the taxable base', async () => {
    const res = await POST(...payRequest({ ...validBody, discountType: 'PERCENTAGE', discountAmount: 10 }) as [never, never])
    expect((await parseResponse(res)).status).toBe(201)

    const data = mockTx.order.create.mock.calls[0][0].data
    expect(data.discountAmount).toBe(1000) // 10% of 10000
    expect(data.total).toBe(9000) // 10000 - 1000 + 0 tip
    // orderItems carry a shrunken taxBase/taxAmount vs the no-discount case
    const line = data.orderItems.create[0]
    expect(line.taxBase).toBeLessThan(line.totalRow)
  })
})
