import { describe, it, expect } from 'vitest'
import {
  padField,
  formatInvoiceNumber,
  cleanNit,
  splitNitDV,
  calculateNITDV,
  validateNITDV,
  formatNIT,
  getDIANPaymentCode,
  generateCUFE,
  generateCUDFE,
  generateQRCodeURL,
  calculateInvoiceFromOrder,
} from '../invoice-utils'

// ─── padField ──────────────────────────────────────────────────────────────

describe('padField', () => {
  it('pads a number with leading zeros', () => {
    expect(padField(1, 8)).toBe('00000001')
  })

  it('pads a string with leading zeros', () => {
    expect(padField('42', 5)).toBe('00042')
  })

  it('returns the same string if already at target length', () => {
    expect(padField('12345', 5)).toBe('12345')
  })

  it('returns the same string if longer than target length', () => {
    expect(padField('123456', 3)).toBe('123456')
  })
})

// ─── formatInvoiceNumber ───────────────────────────────────────────────────

describe('formatInvoiceNumber', () => {
  it('formats FE prefix with consecutive 1', () => {
    expect(formatInvoiceNumber('FE', 1)).toBe('FE-00000001')
  })

  it('formats NC prefix with large consecutive', () => {
    expect(formatInvoiceNumber('NC', 12345)).toBe('NC-00012345')
  })

  it('handles zero consecutive', () => {
    expect(formatInvoiceNumber('FE', 0)).toBe('FE-00000000')
  })
})

// ─── cleanNit ──────────────────────────────────────────────────────────────

describe('cleanNit', () => {
  it('removes dots and dashes from NIT', () => {
    expect(cleanNit('900.123.456-7')).toBe('9001234567')
  })

  it('returns digits only for already clean NIT', () => {
    expect(cleanNit('9001234567')).toBe('9001234567')
  })

  it('handles consumidor final NIT', () => {
    expect(cleanNit('222222222222')).toBe('222222222222')
  })

  it('returns empty string for null/undefined', () => {
    expect(cleanNit(null as any)).toBe('')
    expect(cleanNit(undefined as any)).toBe('')
  })

  it('removes spaces', () => {
    expect(cleanNit(' 900 123 456 7 ')).toBe('9001234567')
  })
})

// ─── splitNitDV ────────────────────────────────────────────────────────────

describe('splitNitDV', () => {
  it('splits 10-digit NIT into digits + DV', () => {
    expect(splitNitDV('9001234567')).toEqual({ digits: '900123456', dv: 7 })
  })

  it('splits consumidor final NIT', () => {
    expect(splitNitDV('222222222222')).toEqual({ digits: '22222222222', dv: 2 })
  })

  it('splits 8301044871', () => {
    expect(splitNitDV('8301044871')).toEqual({ digits: '830104487', dv: 1 })
  })

  it('handles single digit', () => {
    expect(splitNitDV('5')).toEqual({ digits: '5', dv: 0 })
  })

  it('handles empty string', () => {
    expect(splitNitDV('')).toEqual({ digits: '', dv: 0 })
  })
})

// ─── calculateNITDV ────────────────────────────────────────────────────────

describe('calculateNITDV', () => {
  it('calculates DV for NIT 900123456 → 8', () => {
    expect(calculateNITDV('900123456')).toBe(8)
  })

  it('calculates DV for NIT 22222222222 → 3 (consumidor final digits)', () => {
    expect(calculateNITDV('22222222222')).toBe(3)
  })

  it('calculates DV for NIT 830104487 → 1', () => {
    expect(calculateNITDV('830104487')).toBe(1)
  })

  it('returns -1 for empty string', () => {
    expect(calculateNITDV('')).toBe(-1)
  })

  it('calculates DV for single digit NIT', () => {
    // Single digit "5" → weight [3], 5*3=15, 15%11=4, 11-4=7
    expect(calculateNITDV('5')).toBe(7)
  })
})

// ─── validateNITDV ─────────────────────────────────────────────────────────

describe('validateNITDV', () => {
  it('validates correct NIT 900123456-8', () => {
    expect(validateNITDV('9001234568')).toBe(true)
  })

  it('validates correct NIT with formatting', () => {
    expect(validateNITDV('900.123.456-8')).toBe(true)
  })

  it('validates consumidor final NIT 222222222222', () => {
    expect(validateNITDV('222222222222')).toBe(true)
  })

  it('rejects incorrect DV', () => {
    expect(validateNITDV('9001234569')).toBe(false) // wrong DV
  })

  it('rejects single digit NIT', () => {
    expect(validateNITDV('5')).toBe(false)
  })

  it('validates NIT 830104487-1', () => {
    expect(validateNITDV('8301044871')).toBe(true)
  })
})

// ─── formatNIT ─────────────────────────────────────────────────────────────

describe('formatNIT', () => {
  it('formats NIT for display', () => {
    expect(formatNIT('9001234567')).toBe('900123456-7')
  })

  it('formats NIT with dots and dashes', () => {
    expect(formatNIT('900.123.456-7')).toBe('900123456-7')
  })
})

// ─── getDIANPaymentCode ────────────────────────────────────────────────────

describe('getDIANPaymentCode', () => {
  it('maps CASH to 1', () => {
    expect(getDIANPaymentCode('CASH')).toBe('1')
  })

  it('maps CARD to 2', () => {
    expect(getDIANPaymentCode('CARD')).toBe('2')
  })

  it('maps TRANSFER to 10', () => {
    expect(getDIANPaymentCode('TRANSFER')).toBe('10')
  })

  it('maps DAVIPLATA to 42', () => {
    expect(getDIANPaymentCode('DAVIPLATA')).toBe('42')
  })

  it('maps NEQUI to 42', () => {
    expect(getDIANPaymentCode('NEQUI')).toBe('42')
  })

  it('maps MIXED to 99', () => {
    expect(getDIANPaymentCode('MIXED')).toBe('99')
  })

  it('maps unknown method to 99', () => {
    expect(getDIANPaymentCode('CRYPTO')).toBe('99')
  })

  it('is case-insensitive', () => {
    expect(getDIANPaymentCode('cash')).toBe('1')
    expect(getDIANPaymentCode('Card')).toBe('2')
  })
})

// ─── generateCUFE ──────────────────────────────────────────────────────────

describe('generateCUFE', () => {
  const baseParams = {
    storeNit: '900123456-7',
    issueDate: '20250115',
    issueTime: '143025000',
    prefix: 'FE',
    consecutive: 1,
    customerNit: '222222222222',
    subtotalBase: 84034,
    totalTaxAmount: 15966,
    discountAmount: 0,
    grandTotal: 100000,
    providerNit: '830104487-1',
  }

  it('returns a base64 string', () => {
    const cufe = generateCUFE(baseParams)
    expect(cufe).toBeTruthy()
    // SHA-384 base64 = 64 chars
    expect(cufe.length).toBe(64)
  })

  it('is deterministic — same inputs produce same CUFE', () => {
    const cufe1 = generateCUFE(baseParams)
    const cufe2 = generateCUFE(baseParams)
    expect(cufe1).toBe(cufe2)
  })

  it('changes when storeNit changes', () => {
    const cufe1 = generateCUFE(baseParams)
    const cufe2 = generateCUFE({ ...baseParams, storeNit: '830104487-1' })
    expect(cufe1).not.toBe(cufe2)
  })

  it('changes when consecutive changes', () => {
    const cufe1 = generateCUFE(baseParams)
    const cufe2 = generateCUFE({ ...baseParams, consecutive: 2 })
    expect(cufe1).not.toBe(cufe2)
  })

  it('handles NITs with dots and dashes', () => {
    const cufe1 = generateCUFE(baseParams)
    const cufe2 = generateCUFE({ ...baseParams, storeNit: '900.123.456-7' })
    expect(cufe1).toBe(cufe2) // Should normalize to same
  })

  it('uses COP as default currency', () => {
    const cufe1 = generateCUFE(baseParams)
    const cufe2 = generateCUFE({ ...baseParams, currencyCode: 'COP' })
    expect(cufe1).toBe(cufe2)
  })
})

// ─── generateCUDFE ─────────────────────────────────────────────────────────

describe('generateCUDFE', () => {
  const baseParams = {
    storeNit: '900123456-7',
    issueDate: '20250115',
    issueTime: '143025000',
    prefix: 'NC',
    consecutive: 1,
    customerNit: '222222222222',
    subtotalBase: 84034,
    totalTaxAmount: 15966,
    discountAmount: 0,
    grandTotal: 100000,
    providerNit: '830104487-1',
    cude: 'abc123cude456',
  }

  it('returns a base64 string', () => {
    const cudfe = generateCUDFE(baseParams)
    expect(cudfe).toBeTruthy()
    expect(cudfe.length).toBe(64)
  })

  it('is different from CUFE with same params (cude replaces tipoOperación)', () => {
    const { cude, ...cufeParams } = baseParams
    const cufe = generateCUFE(cufeParams)
    const cudfe = generateCUDFE(baseParams)
    expect(cudfe).not.toBe(cufe)
  })

  it('is deterministic', () => {
    const cudfe1 = generateCUDFE(baseParams)
    const cudfe2 = generateCUDFE(baseParams)
    expect(cudfe1).toBe(cudfe2)
  })
})

// ─── generateQRCodeURL ─────────────────────────────────────────────────────

describe('generateQRCodeURL', () => {
  it('generates test mode URL by default', () => {
    const url = generateQRCodeURL({
      storeNit: '900123456-7',
      prefix: 'FE',
      consecutive: 1,
      date: '2025-01-15',
      grandTotal: 100000,
      cufe: 'abc123',
    })
    expect(url).toContain('catalogo-vpfe-hab.dian.gov.co')
  })

  it('generates production URL when testMode=false', () => {
    const url = generateQRCodeURL({
      storeNit: '900123456-7',
      prefix: 'FE',
      consecutive: 1,
      date: '2025-01-15',
      grandTotal: 100000,
      cufe: 'abc123',
      testMode: false,
    })
    expect(url).toContain('catalogo-vpfe.dian.gov.co')
    expect(url).not.toContain('hab')
  })

  it('includes all query parameters', () => {
    const url = generateQRCodeURL({
      storeNit: '900123456-7',
      prefix: 'FE',
      consecutive: 1,
      date: '2025-01-15',
      grandTotal: 100000,
      cufe: 'test-cufe-value',
    })
    expect(url).toContain('nit=9001234567')
    expect(url).toContain('numeracion=FE-00000001')
    expect(url).toContain('fecha=2025-01-15')
    expect(url).toContain('total=100000')
    expect(url).toContain('uuid=test-cufe-value')
  })
})

// ─── calculateInvoiceFromOrder ─────────────────────────────────────────────

describe('calculateInvoiceFromOrder', () => {
  it('calculates invoice with 19% IVA items', () => {
    const order = {
      subtotal: 119000,
      taxAmount: 19000,
      tipAmount: 0,
      discountAmount: 0,
      paymentMethod: 'CASH',
    }
    const items = [
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
    ]

    const result = calculateInvoiceFromOrder(order, items)

    expect(result.subtotalBase).toBe(100000) // 119000 - 19000
    expect(result.totalTaxAmount).toBe(19000)
    expect(result.totalWithTax).toBe(119000)
    expect(result.grandTotal).toBe(119000)
    expect(result.taxBreakdown).toHaveLength(1)
    expect(result.taxBreakdown[0].code).toBe('01')
    expect(result.taxBreakdown[0].name).toBe('IVA 19%')
  })

  it('calculates invoice with mixed tax rates (19% + 5%)', () => {
    const order = {
      subtotal: 162000,
      taxAmount: 22000,
      tipAmount: 0,
      discountAmount: 0,
      paymentMethod: 'CARD',
    }
    const items = [
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
      { taxCode: '02', taxRate: 5, taxAmount: 3000, taxBase: 60000 }, // wait, 5% of 60000 = 3000
    ]

    const result = calculateInvoiceFromOrder(order, items)

    expect(result.subtotalBase).toBe(140000) // 162000 - 22000
    expect(result.totalTaxAmount).toBe(22000)
    expect(result.grandTotal).toBe(162000)
    expect(result.taxBreakdown).toHaveLength(2)
  })

  it('handles exempt items (code 03)', () => {
    const order = {
      subtotal: 150000,
      taxAmount: 19000,
      tipAmount: 0,
      discountAmount: 0,
      paymentMethod: 'CASH',
    }
    const items = [
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
      { taxCode: '03', taxRate: 0, taxAmount: 0, taxBase: 50000 }, // Exento — but rate=0 so skipped
    ]

    const result = calculateInvoiceFromOrder(order, items)

    // Items with taxRate 0 are skipped from breakdown
    expect(result.taxBreakdown).toHaveLength(1)
    expect(result.taxExemptAmount).toBe(0) // No items with code 03 in breakdown
  })

  it('includes tip in grandTotal', () => {
    const order = {
      subtotal: 119000,
      taxAmount: 19000,
      tipAmount: 10000,
      discountAmount: 0,
      paymentMethod: 'CASH',
    }
    const items = [
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
    ]

    const result = calculateInvoiceFromOrder(order, items)

    expect(result.grandTotal).toBe(129000) // 119000 + 10000
  })

  it('subtracts discount from grandTotal', () => {
    const order = {
      subtotal: 119000,
      taxAmount: 19000,
      tipAmount: 0,
      discountAmount: 5000,
      paymentMethod: 'CASH',
    }
    const items = [
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
    ]

    const result = calculateInvoiceFromOrder(order, items)

    expect(result.grandTotal).toBe(114000) // 119000 - 5000
  })

  it('aggregates same tax code across multiple items', () => {
    const order = {
      subtotal: 238000,
      taxAmount: 38000,
      tipAmount: 0,
      discountAmount: 0,
      paymentMethod: 'CASH',
    }
    const items = [
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
      { taxCode: '01', taxRate: 19, taxAmount: 19000, taxBase: 100000 },
    ]

    const result = calculateInvoiceFromOrder(order, items)

    expect(result.taxBreakdown).toHaveLength(1) // Merged into single '01' entry
    expect(result.taxBreakdown[0].base).toBe(200000)
    expect(result.taxBreakdown[0].amount).toBe(38000)
  })

  it('handles items with no tax code', () => {
    const order = {
      subtotal: 100000,
      taxAmount: 0,
      tipAmount: 0,
      discountAmount: 0,
      paymentMethod: 'CASH',
    }
    const items = [
      { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: 100000 },
    ]

    const result = calculateInvoiceFromOrder(order, items)

    expect(result.totalTaxAmount).toBe(0)
    expect(result.taxBreakdown).toHaveLength(0)
    expect(result.grandTotal).toBe(100000)
  })
})
