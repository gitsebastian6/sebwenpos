import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockTx = vi.hoisted(() => ({
  processedEvent: { create: vi.fn() },
  wompiTransaction: { updateMany: vi.fn() },
  order: { update: vi.fn() },
  paymentReceipt: { update: vi.fn() },
  subscription: { update: vi.fn() },
  plan: { findUnique: vi.fn() },
}))

const mockDb = vi.hoisted(() => ({
  wompiTransaction: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
}))

const mockWompiClient = vi.hoisted(() => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
}))

const mockSubHelpers = vi.hoisted(() => ({
  logSubscriptionHistory: vi.fn().mockResolvedValue(undefined),
  createBillingRecord: vi.fn().mockResolvedValue(undefined),
  calculateBillingPrice: vi.fn().mockReturnValue({ fullPrice: 50000, discount: 0, discountedPrice: 50000 }),
  BILLING_PERIODS: { MONTHLY: { days: 30, label: 'Mensual' } } as Record<string, { days: number; label: string }>,
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/wompi/client', () => mockWompiClient)
vi.mock('@/lib/subscription-helpers', () => mockSubHelpers)
vi.mock('@/lib/event-logger', () => ({ logSubscriptionChange: vi.fn().mockResolvedValue(undefined) }))

import { parseResponse } from '@/lib/__tests__/test-helpers'
import { POST } from '../route'

// ─── Helpers ──────────────────────────────────────────────────────────────

function webhookRequest(rawBody: string): Request {
  return new Request('http://localhost:3000/api/webhooks/wompi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  })
}

function event(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: 'transaction.updated',
    timestamp: 1_700_000_000,
    signature: { checksum: 'abc', properties: ['transaction.id'] },
    data: {
      transaction: {
        id: 12345,
        reference: 'REF-XYZ',
        status: 'APPROVED',
        amountInCents: 5_000_000,
        paymentMethodType: 'CARD',
        customerEmail: 'a@b.co',
        ...(overrides.transaction as object ?? {}),
      },
    },
    ...overrides,
  })
}

const subscriptionTx = {
  id: 1,
  storeId: 7,
  amount: 50000,
  amountInCents: 5_000_000,
  wompiId: null,
  reference: 'REF-XYZ',
  subscriptionId: 3,
  receiptId: null,
  metadata: '{}',
  receipt: null,
  order: null,
  subscription: {
    id: 3,
    status: 'PAST_DUE',
    planId: 2,
    billingPeriod: 'MONTHLY',
    endDate: null,
    startDate: new Date('2026-01-01'),
    plan: { id: 2, name: 'Pro', price: 50000 },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx))
  mockWompiClient.verifyWebhookSignature.mockReturnValue(true)
  mockTx.processedEvent.create.mockResolvedValue({})
  mockTx.wompiTransaction.updateMany.mockResolvedValue({ count: 1 })
  mockTx.subscription.update.mockResolvedValue({})
  mockTx.order.update.mockResolvedValue({})
  mockTx.paymentReceipt.update.mockResolvedValue({})
  delete process.env.WOMPI_ENV
  delete process.env.WOMPI_SKIP_SIGNATURE
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/wompi', () => {
  it('rejects invalid JSON with 400', async () => {
    const res = await POST(webhookRequest('this is not json') as never)
    const { status, body } = await parseResponse(res)
    expect(status).toBe(400)
    expect(body.error).toMatch(/JSON/i)
  })

  it('rejects a missing signature with 401 (outside production/skip)', async () => {
    const raw = JSON.stringify({ event: 'transaction.updated', data: { transaction: { id: 1 } } })
    const res = await POST(webhookRequest(raw) as never)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockDb.wompiTransaction.findFirst).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature with 401', async () => {
    mockWompiClient.verifyWebhookSignature.mockReturnValue(false)
    const res = await POST(webhookRequest(event()) as never)
    const { status, body } = await parseResponse(res)
    expect(status).toBe(401)
    expect(body.error).toMatch(/signature/i)
    expect(mockDb.wompiTransaction.findFirst).not.toHaveBeenCalled()
  })

  it('ignores unhandled event types with 200', async () => {
    const res = await POST(webhookRequest(event({ event: 'nequi.token.updated' })) as never)
    const { status, body } = await parseResponse(res)
    expect(status).toBe(200)
    expect(body).toEqual({ received: true })
    expect(mockDb.wompiTransaction.findFirst).not.toHaveBeenCalled()
  })

  it('returns 200 and no-ops when no local WompiTransaction matches', async () => {
    mockDb.wompiTransaction.findFirst.mockResolvedValue(null)
    const res = await POST(webhookRequest(event()) as never)
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it('APPROVED: claims the event, flips status atomically, extends the subscription', async () => {
    mockDb.wompiTransaction.findFirst.mockResolvedValue(subscriptionTx)

    const res = await POST(webhookRequest(event()) as never)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body).toEqual({ received: true })

    // event-identity claim happened first
    expect(mockTx.processedEvent.create).toHaveBeenCalledWith({
      data: { source: 'WOMPI', externalId: '12345', entityType: 'WompiTransaction', entityId: 1 },
    })
    // atomic status guard: only updates rows not already terminal
    const updateArgs = mockTx.wompiTransaction.updateMany.mock.calls[0][0]
    expect(updateArgs.where.status.notIn).toEqual(expect.arrayContaining(['APPROVED', 'DECLINED', 'VOIDED']))
    expect(updateArgs.data.status).toBe('APPROVED')
    // side effects ran
    expect(mockTx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: expect.objectContaining({ status: 'ACTIVE' }) }),
    )
    expect(mockSubHelpers.createBillingRecord).toHaveBeenCalled()
  })

  it('idempotency (event claim): a replayed webhook is skipped before any write', async () => {
    mockDb.wompiTransaction.findFirst.mockResolvedValue(subscriptionTx)
    mockTx.processedEvent.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))

    const res = await POST(webhookRequest(event()) as never)
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    expect(mockTx.wompiTransaction.updateMany).not.toHaveBeenCalled()
    expect(mockTx.subscription.update).not.toHaveBeenCalled()
  })

  it('idempotency (atomic guard): already-terminal transaction runs no side effects', async () => {
    mockDb.wompiTransaction.findFirst.mockResolvedValue(subscriptionTx)
    mockTx.wompiTransaction.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(webhookRequest(event()) as never)
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    expect(mockTx.subscription.update).not.toHaveBeenCalled()
    expect(mockSubHelpers.createBillingRecord).not.toHaveBeenCalled()
  })

  it('DECLINED: cancels a linked pending POS order', async () => {
    mockDb.wompiTransaction.findFirst.mockResolvedValue({
      ...subscriptionTx,
      subscription: null,
      receipt: null,
      order: { id: 99, orderNumber: 'ORD-99', status: 'PENDING_PAYMENT', total: 50000, paymentMethod: 'WOMPI', notes: null },
    })

    const res = await POST(webhookRequest(event({ transaction: { id: 12345, reference: 'REF-XYZ', status: 'DECLINED', amountInCents: 5_000_000, paymentMethodType: 'CARD' } })) as never)
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99 }, data: expect.objectContaining({ status: 'CANCELLED' }) }),
    )
  })

  it('returns 500 (so Wompi retries) on an unrecoverable error', async () => {
    mockDb.wompiTransaction.findFirst.mockRejectedValue(new Error('db down'))
    const res = await POST(webhookRequest(event()) as never)
    const { status } = await parseResponse(res)
    expect(status).toBe(500)
  })
})
