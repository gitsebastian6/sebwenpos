// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  calcLineTax,
  buildTaxBreakdown,
  prorateDiscountOverTax,
  resolveDiscount,
  EXEMPT_CODES,
  type TaxRateInfo,
  type TaxableLine,
} from '../tax-calculator'

// ============================================================
// Domain Tests — TaxCalculator
// Pruebas PURAS (sin DB, sin mocks). Verifican las reglas DIAN de
// pricing tax-inclusive que antes vivían embebidas en los handlers.
// ============================================================

const IVA19: TaxRateInfo = { code: '01', rate: 19, rateType: 'PERCENTAGE' }
const IVA5: TaxRateInfo = { code: '02', rate: 5, rateType: 'PERCENTAGE' }
const EXENTO: TaxRateInfo = { code: '03', rate: 0, rateType: 'PERCENTAGE' }
const EXCLUIDO: TaxRateInfo = { code: '04', rate: 0, rateType: 'PERCENTAGE' }
const IMPOCONSUMO: TaxRateInfo = { code: '05', rate: 50, rateType: 'FIXED_AMOUNT' }

// ─── calcLineTax ─────────────────────────────────────────────

describe('calcLineTax', () => {
  it('devuelve sin impuesto cuando no hay tasa', () => {
    const r = calcLineTax(100000, null)
    expect(r).toEqual({ taxCode: null, taxRate: 0, taxAmount: 0, taxBase: 100000 })
  })

  it('calcula IVA 19% incluido (119000 → base 100000, impuesto 19000)', () => {
    const r = calcLineTax(119000, IVA19)
    expect(r.taxBase).toBe(100000)
    expect(r.taxAmount).toBe(19000)
    expect(r.taxCode).toBe('01')
    expect(r.taxRate).toBe(19)
  })

  it('calcula IVA 5% incluido (105000 → base 100000, impuesto 5000)', () => {
    const r = calcLineTax(105000, IVA5)
    expect(r.taxBase).toBe(100000)
    expect(r.taxAmount).toBe(5000)
  })

  it('trata Exento (03) como base = total, impuesto = 0', () => {
    const r = calcLineTax(50000, EXENTO)
    expect(r.taxBase).toBe(50000)
    expect(r.taxAmount).toBe(0)
    expect(r.taxCode).toBe('03')
  })

  it('trata Excluido (04) como base = total, impuesto = 0', () => {
    const r = calcLineTax(50000, EXCLUIDO)
    expect(r.taxBase).toBe(50000)
    expect(r.taxAmount).toBe(0)
    expect(r.taxCode).toBe('04')
  })

  it('para FIXED_AMOUNT (impoconsumo) hoy deja impuesto = 0', () => {
    const r = calcLineTax(10000, IMPOCONSUMO)
    expect(r.taxBase).toBe(10000)
    expect(r.taxAmount).toBe(0)
    expect(r.taxCode).toBe('05')
  })

  it('redondea la base a entero COP (cantidad fraccionaria)', () => {
    // 0.333 KG × $10000 = $3330 → IVA 19% incluido
    const r = calcLineTax(3330, IVA19)
    expect(Number.isInteger(r.taxBase)).toBe(true)
    expect(Number.isInteger(r.taxAmount)).toBe(true)
    expect(r.taxBase + r.taxAmount).toBe(3330)
  })

  it('PERCENTAGE con rate 0 no aplica la rama de IVA (cae al default)', () => {
    const zeroRate: TaxRateInfo = { code: '01', rate: 0, rateType: 'PERCENTAGE' }
    const r = calcLineTax(100000, zeroRate)
    expect(r.taxAmount).toBe(0)
    expect(r.taxBase).toBe(100000)
  })
})

// ─── buildTaxBreakdown ───────────────────────────────────────

describe('buildTaxBreakdown', () => {
  function line(code: string, base: number, amount: number, rate = 19): TaxableLine {
    return { taxCode: code, taxRate: rate, taxAmount: amount, taxBase: base, totalRow: base + amount }
  }

  it('agrupa líneas con el mismo código en una sola entrada', () => {
    const lines = [line('01', 100000, 19000), line('01', 100000, 19000)]
    const bd = buildTaxBreakdown(lines)
    expect(bd).toHaveLength(1)
    expect(bd[0].base).toBe(200000)
    expect(bd[0].amount).toBe(38000)
  })

  it('mantiene códigos distintos separados (19% + 5%)', () => {
    const lines = [line('01', 100000, 19000), line('02', 60000, 3000, 5)]
    const bd = buildTaxBreakdown(lines)
    expect(bd).toHaveLength(2)
  })

  it('ignora líneas sin taxCode', () => {
    const lines: TaxableLine[] = [
      { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: 50000, totalRow: 50000 },
      line('01', 100000, 19000),
    ]
    const bd = buildTaxBreakdown(lines)
    expect(bd).toHaveLength(1)
  })

  it('devuelve array vacío si ninguna línea tiene taxCode', () => {
    const lines: TaxableLine[] = [
      { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: 50000, totalRow: 50000 },
    ]
    expect(buildTaxBreakdown(lines)).toEqual([])
  })
})

// ─── prorateDiscountOverTax ──────────────────────────────────

describe('prorateDiscountOverTax', () => {
  function line(code: string, base: number, amount: number, totalRow: number, rate = 19): TaxableLine {
    return { taxCode: code, taxRate: rate, taxAmount: amount, taxBase: base, totalRow }
  }

  it('reduce base e impuesto proporcionalmente al descuento (regla DIAN)', () => {
    const lines = [line('01', 100000, 19000, 119000), line('01', 100000, 19000, 119000)]
    const { lines: adjusted, totalTax } = prorateDiscountOverTax(lines, 23800, 238000)
    // ratio = 0.1 → cada base queda en 90000, impuesto en 17100
    expect(adjusted[0].taxBase).toBe(90000)
    expect(adjusted[0].taxAmount).toBe(17100)
    expect(totalTax).toBe(34200)
  })

  it('conserva totalRow intacto (precio de lista para el ticket)', () => {
    const lines = [line('01', 100000, 19000, 119000)]
    const { lines: adjusted } = prorateDiscountOverTax(lines, 10000, 119000)
    expect(adjusted[0].totalRow).toBe(119000)
  })

  it('no altera las líneas si discountAmount <= 0', () => {
    const lines = [line('01', 100000, 19000, 119000)]
    const { lines: adjusted, totalTax } = prorateDiscountOverTax(lines, 0, 119000)
    expect(adjusted[0].taxBase).toBe(100000)
    expect(adjusted[0].taxAmount).toBe(19000)
    expect(totalTax).toBe(19000)
  })

  it('no altera las líneas si subtotal <= 0 (evita división por cero)', () => {
    const lines = [line('01', 100000, 19000, 119000)]
    const { lines: adjusted } = prorateDiscountOverTax(lines, 5000, 0)
    expect(adjusted[0].taxBase).toBe(100000)
    expect(adjusted[0].taxAmount).toBe(19000)
  })

  it('no muta las líneas originales', () => {
    const lines = [line('01', 100000, 19000, 119000)]
    const original = { ...lines[0] }
    prorateDiscountOverTax(lines, 10000, 119000)
    expect(lines[0].taxBase).toBe(original.taxBase)
    expect(lines[0].taxAmount).toBe(original.taxAmount)
  })
})

// ─── resolveDiscount ─────────────────────────────────────────

describe('resolveDiscount', () => {
  it('calcula descuento porcentual', () => {
    expect(resolveDiscount('PERCENTAGE', 10, 100000)).toBe(10000)
  })

  it('acota el descuento fijo al subtotal', () => {
    expect(resolveDiscount('FIXED', 150000, 100000)).toBe(100000)
  })

  it('descuento fijo menor al subtotal pasa entero', () => {
    expect(resolveDiscount('FIXED', 5000, 100000)).toBe(5000)
  })

  it('NONE siempre devuelve 0', () => {
    expect(resolveDiscount('NONE', 999, 100000)).toBe(0)
  })

  it('PERCENTAGE con valor 0 devuelve 0', () => {
    expect(resolveDiscount('PERCENTAGE', 0, 100000)).toBe(0)
  })
})

// ─── Constantes ──────────────────────────────────────────────

describe('EXEMPT_CODES', () => {
  it('contiene 03 (Exento) y 04 (Excluido)', () => {
    expect(EXEMPT_CODES.has('03')).toBe(true)
    expect(EXEMPT_CODES.has('04')).toBe(true)
    expect(EXEMPT_CODES.has('01')).toBe(false)
  })
})
