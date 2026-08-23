import { describe, it, expect } from 'vitest'
import {
  formatCOP,
  formatCOPSimple,
  paymentMethodLabel,
  orderStatusLabel,
  parseQtyInput,
  roundQty,
  floorQty,
  formatQty,
  qtyStepFor,
  isFractionalUnit,
  clampQty,
} from '../format'

describe('format', () => {
  describe('formatCOP', () => {
    it('formats zero', () => {
      expect(formatCOP(0)).toContain('0')
    })

    it('formats 100000 as Colombian pesos', () => {
      const result = formatCOP(100000)
      expect(result).toContain('100')
    })

    it('formats negative amounts', () => {
      const result = formatCOP(-50000)
      expect(result).toBeTruthy()
    })

    it('handles string input', () => {
      const result = formatCOP(Number('200000'))
      expect(result).toBeTruthy()
    })
  })

  describe('formatCOPSimple', () => {
    it('formats number with dots', () => {
      expect(formatCOPSimple(1000000)).toContain('1.000.000')
    })

    it('formats zero', () => {
      expect(formatCOPSimple(0)).toContain('0')
    })
  })

  describe('paymentMethodLabel', () => {
    it('maps CASH', () => {
      expect(paymentMethodLabel('CASH')).toBeTruthy()
    })

    it('maps CARD', () => {
      expect(paymentMethodLabel('CARD')).toBeTruthy()
    })

    it('handles unknown method', () => {
      expect(paymentMethodLabel('UNKNOWN')).toBeTruthy()
    })
  })

  describe('orderStatusLabel', () => {
    it('maps COMPLETED', () => {
      expect(orderStatusLabel('COMPLETED')).toBeTruthy()
    })

    it('maps CANCELLED', () => {
      expect(orderStatusLabel('CANCELLED')).toBeTruthy()
    })

    it('handles unknown status', () => {
      expect(orderStatusLabel('UNKNOWN')).toBeTruthy()
    })
  })

  describe('parseQtyInput', () => {
    it('normalizes comma decimal (es-CO)', () => {
      expect(parseQtyInput('1,5')).toBe(1.5)
    })

    it('accepts dot decimal (en-US)', () => {
      expect(parseQtyInput('1.5')).toBe(1.5)
    })

    it('treats 3 trailing digits after comma as thousands', () => {
      expect(parseQtyInput('1,500')).toBe(1500)
    })

    it('handles both comma and dot (thousands + decimal)', () => {
      expect(parseQtyInput('1.500,50')).toBe(1500.5)
    })

    it('returns 0 for invalid input', () => {
      expect(parseQtyInput('abc')).toBe(0)
      expect(parseQtyInput('')).toBe(0)
    })
  })

  describe('roundQty / floorQty / formatQty', () => {
    it('rounds to 3 decimals', () => {
      expect(roundQty(1.0005)).toBe(1.001)
      expect(roundQty(1.0004)).toBe(1)
    })

    it('floors to 3 decimals', () => {
      expect(floorQty(1.9999)).toBe(1.999)
      expect(floorQty(1.0001)).toBe(1)
    })

    it('formats trimming trailing zeros', () => {
      expect(formatQty(2)).toBe('2')
      expect(formatQty(1.5)).toBe('1,5')
      expect(formatQty(1.25)).toBe('1,25')
    })
  })

  describe('qtyStepFor / isFractionalUnit', () => {
    it('fractional units step by 0.1', () => {
      expect(qtyStepFor('KG')).toBe(0.1)
      expect(qtyStepFor('L')).toBe(0.1)
      expect(qtyStepFor('M')).toBe(0.1)
    })

    it('menudeo units step by 0.25', () => {
      expect(qtyStepFor('POR')).toBe(0.25)
      expect(qtyStepFor('RAC')).toBe(0.25)
    })

    it('discrete units step by 1', () => {
      expect(qtyStepFor('UND')).toBe(1)
      expect(qtyStepFor('CAJ')).toBe(1)
      expect(qtyStepFor(undefined)).toBe(1)
    })

    it('supports a custom service step', () => {
      expect(qtyStepFor(undefined, 0.5)).toBe(0.5)
    })

    it('isFractionalUnit flags weight/volume/measure', () => {
      expect(isFractionalUnit('KG')).toBe(true)
      expect(isFractionalUnit('POR')).toBe(true)
      expect(isFractionalUnit('UND')).toBe(false)
      expect(isFractionalUnit(undefined)).toBe(false)
    })
  })

  describe('clampQty', () => {
    it('clamps to min (0.001 default)', () => {
      expect(clampQty(0)).toBe(0.001)
    })

    it('clamps to max and rounds', () => {
      expect(clampQty(10, 0.001, 5)).toBe(5)
    })

    it('keeps value within range rounded to 3 decimals', () => {
      expect(clampQty(1.23456, 0.001, 5)).toBe(1.235)
    })

    it('no max means unbounded', () => {
      expect(clampQty(500, 0.001)).toBe(500)
    })
  })
})
