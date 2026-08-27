import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockTx = vi.hoisted(() => ({
  store: {},
  invoice: { create: vi.fn() },
  invoiceCounter: {},
}))

const mockDb = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  subscription: { findFirst: vi.fn() },
  invoice: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
}))

const mockConsecutive = vi.hoisted(() => ({
  getNextConsecutive: vi.fn(),
}))

const mockInvoiceUtils = vi.hoisted(() => ({
  calculateInvoiceFromOrder: vi.fn(),
  formatInvoiceNumber: vi.fn((p: string, c: number) => `${p}-${String(c).padStart(6, '0')}`),
  generateCUFE: vi.fn(() => 'CUFE-TEST'),
  generateQRCodeURL: vi.fn(() => 'https://qr.example'),
  getDIANPaymentCode: vi.fn(() => '1'),
  validateNITDV: vi.fn(() => true),
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/api-auth', () => ({ requireStoreAccess: vi.fn().mockReturnValue(null) }))
vi.mock('@/lib/invoicing/consecutive-counter', () => mockConsecutive)
vi.mock('@/lib/invoice-utils', () => mockInvoiceUtils)
vi.mock('@/lib/invoicing/xml-generator', () => ({ generateUBL21XML: vi.fn(() => '<Invoice/>') }))
vi.mock('@/lib/invoicing/certificate', () => ({ signXMLForDIAN: vi.fn() }))
vi.mock('@/lib/invoicing/soap-client', () => ({ sendBillAsync: vi.fn(), pollForStatus: vi.fn() }))
vi.mock('@/lib/field-encryption', () => ({ decryptField: vi.fn(() => 'pin') }))
vi.mock('@/lib/audit-logger', () => ({ auditLogFromRequest: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/constants', () => ({
  DIAN_CONSUMIDOR_FINAL_NIT: '222222222222',
  getSoftwareName: vi.fn(() => 'Sebwen POS'),
  getSoftwareProviderNIT: vi.fn(() => '900000000'),
  unitCodeFor: vi.fn(() => 'NIU'),
}))

import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'
import { POST } from '../route'

// ─── Test data ─────────────────────────────────────────────────────────────

const baseOrder = {
  id: 10,
  storeId: 7,
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  orderItems: [
    { quantity: 1, unitPrice: 100000, totalRow: 119000, taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000, notes: null, product: { name: 'Café', unitLabel: 'UND' }, presentation: null, service: null, presentationName: null },
  ],
  customer: null,
  store: {
    id: 7, name: 'Mi Tienda', legalName: 'Mi Tienda SAS', nit: '901112223', address: 'Calle 1',
    phone: '3000000000', user: { email: 'owner@x.co' }, currencyCode: 'COP', countryCode: 'CO',
    invoicePrefix: 'FE', resolutionNumber: 'RES-1', resolutionStartDate: new Date('2026-01-01'),
    resolutionEndDate: new Date('2027-01-01'), resolutionStartNumber: 1, resolutionEndNumber: 1000,
    invoiceTestMode: true, softwarePin: 'enc', divipolaCode: '11001', cityName: 'Bogotá', providerConfig: '{}',
  },
}

const calc = {
  subtotalBase: 100000, taxExemptAmount: 0,
  taxBreakdown: [{ code: '01', base: 100000, amount: 19000, rate: 19, name: 'IVA' }],
  totalTaxAmount: 19000, totalWithTax: 119000, discountAmount: 0, tipAmount: 0, grandTotal: 119000,
}

function createdInvoice(consecutive: number) {
  return {
    id: 55, storeId: 7, orderId: 10, prefix: 'FE', consecutive,
    resolutionNumber: 'RES-1', resolutionDate: null, startDate: null, endDate: null,
    startNumber: 1, endNumber: 1000, customerNit: '222222222222', customerName: 'Consumidor Final',
    customerAddress: null, customerPhone: null, customerEmail: null, customerRegime: 'NO_RESPONSABLE', customerType: 'CC',
    subtotalBase: 100000, taxExemptAmount: 0, taxBreakdown: JSON.stringify(calc.taxBreakdown),
    totalTaxAmount: 19000, totalWithTax: 119000, discountAmount: 0, tipAmount: 0, grandTotal: 119000,
    paymentMethod: '1', cufe: 'CUFE-TEST', qrCode: 'https://qr.example', notes: null,
    status: 'DRAFT', testMode: true, createdAt: new Date('2026-08-27T10:00:00Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx))
  mockDb.order.findUnique.mockResolvedValue(baseOrder)
  mockDb.subscription.findFirst.mockResolvedValue({ id: 1 })
  mockDb.invoice.findFirst.mockResolvedValue(null)
  mockDb.invoice.update.mockResolvedValue({})
  mockConsecutive.getNextConsecutive.mockResolvedValue({
    consecutive: 8, prefix: 'FE', resolutionNumber: 'RES-1', resolutionDate: new Date('2026-01-01'),
    startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), startNumber: 1, endNumber: 1000, warning: undefined,
  })
  mockInvoiceUtils.calculateInvoiceFromOrder.mockReturnValue(calc)
  mockInvoiceUtils.validateNITDV.mockReturnValue(true)
  mockTx.invoice.create.mockResolvedValue(createdInvoice(8))
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/invoices', () => {
  it('404 when the order does not exist', async () => {
    mockDb.order.findUnique.mockResolvedValue(null)
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    expect((await parseResponse(res)).status).toBe(404)
  })

  it('403 when the store has no active/trial subscription (feature gate)', async () => {
    mockDb.subscription.findFirst.mockResolvedValue(null)
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    const { status, body } = await parseResponse(res)
    expect(status).toBe(403)
    expect(body.error).toMatch(/suscripci/i)
  })

  it('400 when the order is CANCELLED', async () => {
    mockDb.order.findUnique.mockResolvedValue({ ...baseOrder, status: 'CANCELLED' })
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    expect((await parseResponse(res)).status).toBe(400)
  })

  it('409 when the order already has an invoice', async () => {
    mockDb.invoice.findFirst.mockResolvedValue({ id: 1, prefix: 'FE', consecutive: 3 })
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    expect((await parseResponse(res)).status).toBe(409)
  })

  it('400 when the store has no NIT configured', async () => {
    mockDb.order.findUnique.mockResolvedValue({ ...baseOrder, store: { ...baseOrder.store, nit: null } })
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    const { status, body } = await parseResponse(res)
    expect(status).toBe(400)
    expect(body.error).toMatch(/NIT/)
  })

  it('400 (Zod) when orderId is missing', async () => {
    const res = await POST(mockPostRequest({}) as never)
    expect((await parseResponse(res)).status).toBe(400)
  })

  it('creates the invoice with the atomic consecutive and returns 201', async () => {
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(201)
    // consecutive comes from getNextConsecutive, called with the tx-scoped clients
    expect(mockConsecutive.getNextConsecutive).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ store: mockTx.store, invoice: mockTx.invoice, invoiceCounter: mockTx.invoiceCounter }),
    )
    // invoice row written inside the same transaction with that consecutive
    expect(mockTx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutive: 8, prefix: 'FE', orderId: 10 }) }),
    )
    expect(body).toMatchObject({
      id: 55, consecutive: 8, invoiceNumber: 'FE-000008', grandTotal: 119000, status: 'DRAFT', orderId: 10,
    })
  })

  it('400 when the customer NIT has an invalid check digit', async () => {
    mockInvoiceUtils.validateNITDV.mockReturnValue(false)
    const res = await POST(mockPostRequest({ orderId: 10, customerNit: '12345678' }) as never)
    const { status, body } = await parseResponse(res)
    expect(status).toBe(400)
    expect(body.error).toMatch(/verificaci/i)
    expect(mockTx.invoice.create).not.toHaveBeenCalled()
  })

  it('still returns 201 if XML generation fails (invoice already committed)', async () => {
    const { generateUBL21XML } = await import('@/lib/invoicing/xml-generator')
    ;(generateUBL21XML as unknown as { mockImplementation: (f: () => never) => void }).mockImplementation(() => { throw new Error('xml boom') })
    const res = await POST(mockPostRequest({ orderId: 10 }) as never)
    expect((await parseResponse(res)).status).toBe(201)
  })
})
