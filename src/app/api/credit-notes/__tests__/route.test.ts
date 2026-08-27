import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockTx = vi.hoisted(() => ({ creditNote: { create: vi.fn() } }))

const mockDb = vi.hoisted(() => ({
  invoice: { findFirst: vi.fn() },
  creditNote: { aggregate: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
}))

const mockCounter = vi.hoisted(() => ({ getNextCreditNoteConsecutive: vi.fn() }))

const mockInvoiceUtils = vi.hoisted(() => ({
  formatInvoiceNumber: vi.fn((p: string, c: number) => `${p}-${String(c).padStart(6, '0')}`),
  generateCUDFE: vi.fn(() => 'CUDFE-TEST'),
  generateQRCodeURL: vi.fn(() => 'https://qr.example'),
  validateNITDV: vi.fn(() => true),
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/api-auth', () => ({ requireStoreAccess: vi.fn().mockReturnValue(null) }))
vi.mock('@/lib/invoicing/credit-note-counter', () => mockCounter)
vi.mock('@/lib/invoice-utils', () => mockInvoiceUtils)
vi.mock('@/lib/field-encryption', () => ({ decryptField: vi.fn(() => 'pin') }))
vi.mock('@/lib/constants', () => ({
  DIAN_CONSUMIDOR_FINAL_NIT: '222222222222',
  getSoftwareProviderNIT: vi.fn(() => '900000000'),
}))

import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'
import { POST } from '../route'

// ─── Test data ─────────────────────────────────────────────────────────────

const invoice = {
  id: 20, storeId: 5, grandTotal: 119000, cufe: 'CUFE-ORIG', prefix: 'FE', consecutive: 7,
  customerNit: '222222222222', customerName: 'Consumidor Final', customerEmail: null,
  customerPhone: null, customerAddress: null, customerRegime: 'NO_RESPONSABLE', customerType: 'CC',
  store: {
    id: 5, name: 'Tienda', legalName: 'Tienda SAS', nit: '901112223', address: 'Cra 1', phone: '3000',
    currencyCode: 'COP', countryCode: 'CO', invoicePrefix: 'FE', resolutionNumber: 'RES-1',
    resolutionStartDate: new Date('2026-01-01'), resolutionEndDate: new Date('2027-01-01'),
    resolutionStartNumber: 1, resolutionEndNumber: 1000, invoiceTestMode: true,
    softwarePin: 'enc', divipolaCode: '11001', cityName: 'Bogotá', user: { email: 'o@x.co' },
  },
}

const body = {
  storeId: 5, invoiceId: 20, noteType: 'CREDIT' as const, concept: 'Devolución parcial',
  items: [{ description: 'Café', quantity: 1, unitPrice: 50000 }],
  subtotalBase: 50000, totalTaxAmount: 9500, totalWithTax: 59500, grandTotal: 59500,
}

function createdNote(over: Record<string, unknown> = {}) {
  return {
    id: 88, invoiceId: 20, prefix: 'NC', consecutive: 4, noteType: 'CREDIT',
    concept: 'Devolución parcial', description: null,
    customerNit: '222222222222', customerName: 'Consumidor Final', customerEmail: null,
    customerPhone: null, customerAddress: null, customerRegime: 'NO_RESPONSABLE', customerType: 'CC',
    subtotalBase: 50000, taxExemptAmount: 0, taxBreakdown: '[]', totalTaxAmount: 9500,
    totalWithTax: 59500, discountAmount: 0, grandTotal: 59500, cufe: 'CUDFE-TEST', qrCode: 'https://qr.example',
    status: 'DRAFT', testMode: true, referencedPrefix: 'FE', referencedConsec: 7,
    resolutionNumber: 'RES-1', startDate: null, endDate: null, notes: null,
    createdAt: new Date('2026-08-27T10:00:00Z'),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx))
  mockDb.invoice.findFirst.mockResolvedValue(invoice)
  mockDb.creditNote.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
  mockCounter.getNextCreditNoteConsecutive.mockResolvedValue({ consecutive: 4, prefix: 'NC', noteType: 'CREDIT' })
  mockInvoiceUtils.validateNITDV.mockReturnValue(true)
  mockTx.creditNote.create.mockResolvedValue(createdNote())
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/credit-notes', () => {
  it('404 when the referenced invoice is not found for the store', async () => {
    mockDb.invoice.findFirst.mockResolvedValue(null)
    const res = await POST(mockPostRequest(body) as never)
    expect((await parseResponse(res)).status).toBe(404)
  })

  it('400 (Zod) when invoiceId is missing', async () => {
    const { invoiceId, ...bad } = body
    const res = await POST(mockPostRequest(bad) as never)
    expect((await parseResponse(res)).status).toBe(400)
  })

  it('400 when the customer NIT has an invalid check digit', async () => {
    mockInvoiceUtils.validateNITDV.mockReturnValue(false)
    const res = await POST(mockPostRequest({ ...body, customerNit: '12345678' }) as never)
    const { status, body: b } = await parseResponse(res)
    expect(status).toBe(400)
    expect(b.error).toMatch(/verificaci/i)
    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it('400 when the CREDIT note exceeds the invoice remaining balance', async () => {
    // Invoice total 119000, already 100000 in credit notes → 19000 left, note asks 59500
    mockDb.creditNote.aggregate.mockResolvedValue({ _sum: { grandTotal: 100000 } })
    const res = await POST(mockPostRequest(body) as never)
    const { status, body: b } = await parseResponse(res)
    expect(status).toBe(400)
    expect(b.error).toMatch(/excede/i)
    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it('creates a CREDIT note with the atomic consecutive and returns 201', async () => {
    const res = await POST(mockPostRequest(body) as never)
    const { status, body: b } = await parseResponse(res)

    expect(status).toBe(201)
    expect(mockCounter.getNextCreditNoteConsecutive).toHaveBeenCalledWith(5, 'CREDIT', mockTx)
    expect(mockTx.creditNote.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prefix: 'NC', consecutive: 4, invoiceId: 20, noteType: 'CREDIT' }) }),
    )
    expect(b).toMatchObject({ id: 88, noteNumber: 'NC-000004', consecutive: 4, noteType: 'CREDIT', grandTotal: 59500 })
  })

  it('a CREDIT note within the remaining balance is accepted', async () => {
    mockDb.creditNote.aggregate.mockResolvedValue({ _sum: { grandTotal: 50000 } }) // 69000 left, asks 59500
    const res = await POST(mockPostRequest(body) as never)
    expect((await parseResponse(res)).status).toBe(201)
  })

  it('a DEBIT note skips the invoice-balance check', async () => {
    mockDb.creditNote.aggregate.mockResolvedValue({ _sum: { grandTotal: 200000 } }) // would fail a CREDIT check
    mockCounter.getNextCreditNoteConsecutive.mockResolvedValue({ consecutive: 2, prefix: 'ND', noteType: 'DEBIT' })
    mockTx.creditNote.create.mockResolvedValue(createdNote({ prefix: 'ND', consecutive: 2, noteType: 'DEBIT' }))

    const res = await POST(mockPostRequest({ ...body, noteType: 'DEBIT' }) as never)
    const { status, body: b } = await parseResponse(res)

    expect(status).toBe(201)
    expect(b).toMatchObject({ noteNumber: 'ND-000002', noteType: 'DEBIT' })
    expect(mockDb.creditNote.aggregate).not.toHaveBeenCalled()
  })
})
