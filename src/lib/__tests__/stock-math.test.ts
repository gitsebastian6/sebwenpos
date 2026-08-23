import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  add,
  div,
  eq,
  floorQty,
  gt,
  gte,
  isPositive,
  isZero,
  lt,
  lte,
  mul,
  registerDecimalSerialization,
  roundQty,
  sub,
  toDec,
  toNum,
} from '../stock-math'

describe('stock-math', () => {
  describe('toDec / toNum', () => {
    it('converts null/undefined to 0', () => {
      expect(toNum(null)).toBe(0)
      expect(toNum(undefined)).toBe(0)
      expect(toDec(null).toString()).toBe('0')
    })

    it('converts number and string', () => {
      expect(toNum('1.5')).toBe(1.5)
      expect(toNum(2)).toBe(2)
      expect(toDec('1.5').toString()).toBe('1.5')
    })

    it('keeps an existing Decimal as-is', () => {
      const d = new Prisma.Decimal('3.14')
      expect(toDec(d)).toBe(d)
    })
  })

  describe('arithmetic', () => {
    it('adds without float error (0.1 + 0.2 = 0.3)', () => {
      expect(add(0.1, 0.2).toString()).toBe('0.3')
    })

    it('subtracts', () => {
      expect(sub(5, 2.5).toString()).toBe('2.5')
    })

    it('multiplies', () => {
      expect(mul(2, 3).toString()).toBe('6')
    })

    it('divides', () => {
      expect(div(10, 4).toString()).toBe('2.5')
    })

    it('works with Decimal inputs', () => {
      const a = new Prisma.Decimal('1.1')
      const b = new Prisma.Decimal('2.2')
      expect(add(a, b).toString()).toBe('3.3')
    })
  })

  describe('rounding', () => {
    it('rounds to QTY_PRECISION (3) decimal places', () => {
      expect(roundQty(1.0005).toString()).toBe('1.001')
      expect(roundQty(1.0004).toString()).toBe('1')
    })

    it('floors to QTY_PRECISION (3) decimal places', () => {
      expect(floorQty(1.9999).toString()).toBe('1.999')
      expect(floorQty(1.0001).toString()).toBe('1')
    })
  })

  describe('comparisons', () => {
    it('gte / lte / gt / lt / eq', () => {
      expect(gte(5, 5)).toBe(true)
      expect(gte(6, 5)).toBe(true)
      expect(lte(5, 5)).toBe(true)
      expect(lte(4, 5)).toBe(true)
      expect(gt(6, 5)).toBe(true)
      expect(gt(5, 5)).toBe(false)
      expect(lt(4, 5)).toBe(true)
      expect(lt(5, 5)).toBe(false)
      expect(eq('1.5', 1.5)).toBe(true)
    })

    it('isZero / isPositive', () => {
      expect(isZero(0)).toBe(true)
      expect(isZero('0.000')).toBe(true)
      expect(isZero(0.001)).toBe(false)
      expect(isPositive(1)).toBe(true)
      expect(isPositive(0)).toBe(false)
      expect(isPositive(-1)).toBe(false)
    })
  })

  describe('serialization', () => {
    it('registers toJSON → number (idempotent)', () => {
      registerDecimalSerialization()
      registerDecimalSerialization() // second call must not throw
      const d = new Prisma.Decimal('12.5')
      expect(JSON.parse(JSON.stringify(d))).toBe(12.5)
    })
  })
})
