import { describe, it, expect } from 'vitest'
import { getStatus } from '../expirations-view'

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

describe('expirations-view — getStatus', () => {
  it('classifies a past date as vencido, with a positive "days ago" magnitude', () => {
    const result = getStatus(isoDaysFromNow(-5))
    expect(result.status).toBe('vencido')
    expect(result.days).toBeLessThan(0)
  })

  it('classifies today as vencido is false — day 0 counts as within range, not expired', () => {
    const result = getStatus(isoDaysFromNow(0))
    expect(result.status).not.toBe('vencido')
  })

  it('classifies a date within 30 days as próximo', () => {
    const result = getStatus(isoDaysFromNow(15))
    expect(result.status).toBe('proximo')
    expect(result.days).toBe(15)
  })

  it('classifies exactly 30 days out as próximo (inclusive boundary)', () => {
    const result = getStatus(isoDaysFromNow(30))
    expect(result.status).toBe('proximo')
  })

  it('classifies 31+ days out as vigente', () => {
    const result = getStatus(isoDaysFromNow(31))
    expect(result.status).toBe('vigente')
  })
})
