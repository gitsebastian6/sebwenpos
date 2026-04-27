import { describe, it, expect } from 'vitest'
import { formatCOP, formatCOPSimple, paymentMethodLabel, orderStatusLabel } from '../format'

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
})
