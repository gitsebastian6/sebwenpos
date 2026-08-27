import { describe, it, expect } from 'vitest'
import {
  getCountdownTarget,
  computeDaysRemaining,
  formatCountdown,
} from '../countdown'

// ---------------------------------------------------------------------------
// Sebwen POS — Countdown helpers (pure) validation
// ---------------------------------------------------------------------------
// Three responsibilities are validated:
//  1. getCountdownTarget   — the correct reference date per subscription status
//  2. computeDaysRemaining — consistent day-granular semantics everywhere
//  3. formatCountdown      — exact "d h m s" rendering (minutes included)
// ---------------------------------------------------------------------------

describe('getCountdownTarget', () => {
  it('uses trialEndDate for TRIAL when present, ignoring endDate/graceEndDate', () => {
    expect(getCountdownTarget('TRIAL', {
      trialEndDate: '2026-08-26T10:00:00Z',
      endDate: '2026-09-01T10:00:00Z',
      graceEndDate: '2026-09-05T10:00:00Z',
    })).toBe('2026-08-26T10:00:00Z')
  })

  it('falls back to endDate for TRIAL when trialEndDate is missing', () => {
    expect(getCountdownTarget('TRIAL', {
      trialEndDate: null,
      endDate: '2026-09-01T10:00:00Z',
      graceEndDate: '2026-09-05T10:00:00Z',
    })).toBe('2026-09-01T10:00:00Z')
  })

  it('returns null for TRIAL when no date is available', () => {
    expect(getCountdownTarget('TRIAL', { trialEndDate: null, endDate: null })).toBeNull()
  })

  it('uses endDate for ACTIVE even when a trialEndDate is present', () => {
    expect(getCountdownTarget('ACTIVE', {
      trialEndDate: '2026-08-26T10:00:00Z',
      endDate: '2026-09-30T10:00:00Z',
    })).toBe('2026-09-30T10:00:00Z')
  })

  it('uses graceEndDate for PAST_DUE', () => {
    expect(getCountdownTarget('PAST_DUE', {
      trialEndDate: null,
      endDate: '2026-08-20T10:00:00Z',
      graceEndDate: '2026-08-27T10:00:00Z',
    })).toBe('2026-08-27T10:00:00Z')
  })

  it('returns null for EXPIRED / CANCELLED regardless of dates present', () => {
    expect(getCountdownTarget('EXPIRED', {
      endDate: '2026-08-20T10:00:00Z',
      graceEndDate: '2026-08-27T10:00:00Z',
    })).toBeNull()
    expect(getCountdownTarget('CANCELLED', {
      endDate: '2026-08-20T10:00:00Z',
    })).toBeNull()
  })
})

describe('computeDaysRemaining', () => {
  const now = new Date(2026, 7, 23, 10, 0, 0) // Aug 23, 10:00 local

  it('returns 0 when the target is later on the same calendar day', () => {
    expect(computeDaysRemaining(new Date(2026, 7, 23, 14, 0, 0), now)).toBe(0)
  })

  it('returns 1 day for a target tomorrow', () => {
    expect(computeDaysRemaining(new Date(2026, 7, 24, 9, 0, 0), now)).toBe(1)
  })

  it('rounds up partial days (1d 23h left → 2 days)', () => {
    expect(computeDaysRemaining(new Date(2026, 7, 25, 9, 0, 0), now)).toBe(2)
  })

  it('returns negative for dates already passed', () => {
    expect(computeDaysRemaining(new Date(2026, 7, 22, 14, 0, 0), now)).toBe(-1)
  })

  it('accepts ISO string targets', () => {
    const target = new Date(2026, 7, 25, 9, 0, 0)
    expect(computeDaysRemaining(target.toISOString(), now)).toBe(2)
  })

  it('returns null when there is no target date', () => {
    expect(computeDaysRemaining(null, now)).toBeNull()
    expect(computeDaysRemaining(undefined, now)).toBeNull()
  })
})

describe('formatCountdown', () => {
  it('renders days + padded h/m/s for multi-day targets', () => {
    expect(formatCountdown({ days: 2, hours: 3, minutes: 4, seconds: 5 }))
      .toBe('2d 03h 04m 05s')
  })

  it('drops zero days but keeps exact minutes/seconds', () => {
    expect(formatCountdown({ days: 0, hours: 2, minutes: 3, seconds: 4 }))
      .toBe('02h 03m 04s')
  })

  it('drops zero hours and keeps exact minutes/seconds', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 3, seconds: 4 }))
      .toBe('03m 04s')
  })

  it('keeps minutes as an anchor when it is zero', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 9 }))
      .toBe('00m 09s')
  })

  it('handles a fully zeroed decomposition', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 }))
      .toBe('00m 00s')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatCountdown(null)).toBe('')
    expect(formatCountdown(undefined)).toBe('')
  })
})