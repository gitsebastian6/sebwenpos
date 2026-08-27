// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '../use-countdown'

// ---------------------------------------------------------------------------
// Sebwen POS — Live Countdown Hook tests
// ---------------------------------------------------------------------------
// Validates the grace-period timer logic used in the settings Suscripción view
// when a subscription is PAST_DUE (en gracia): remaining time decomposition,
// live ticking, and the null-return when the deadline has passed.
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-23T10:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useCountdown', () => {
  it('returns null when target is null', () => {
    const { result } = renderHook(() => useCountdown(null))
    expect(result.current).toBeNull()
  })

  it('returns null when target is undefined', () => {
    const { result } = renderHook(() => useCountdown(undefined))
    expect(result.current).toBeNull()
  })

  it('returns null when target is an invalid date', () => {
    const { result } = renderHook(() => useCountdown('not-a-date'))
    expect(result.current).toBeNull()
  })

  it('returns null when target is already in the past', () => {
    const { result } = renderHook(() =>
      useCountdown('2026-08-23T09:00:00Z'),
    )
    expect(result.current).toBeNull()
  })

  it('decomposes a future target into days/hours/minutes/seconds', () => {
    // 1 day 2h 3m 4s ahead of NOW
    const target = new Date('2026-08-24T12:03:04Z')
    const { result } = renderHook(() => useCountdown(target))
    expect(result.current).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
    })
  })

  it('shows the exact minutes remaining (2h 3m 4s) and ticks them down', () => {
    // NOW is 10:00:00Z, target 12:03:04Z → exactly 2h 3m 4s left
    const target = new Date('2026-08-23T12:03:04Z')
    const { result } = renderHook(() => useCountdown(target))
    expect(result.current).toEqual({
      days: 0,
      hours: 2,
      minutes: 3,
      seconds: 4,
    })

    // After one minute the minutes counter must go 3 → 2 (seconds still exact)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toEqual({
      days: 0,
      hours: 2,
      minutes: 2,
      seconds: 4,
    })
  })

  it('ticks down every second as time advances', () => {
    // 10 seconds remaining
    const target = new Date('2026-08-23T10:00:10Z')
    const { result } = renderHook(() => useCountdown(target))
    expect(result.current?.seconds).toBe(10)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 9,
    })

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current?.seconds).toBe(6)
  })

  it('returns null once the target boundary is crossed', () => {
    // 5 seconds remaining
    const target = new Date('2026-08-23T10:00:05Z')
    const { result } = renderHook(() => useCountdown(target))
    expect(result.current?.seconds).toBe(5)

    // Cross the deadline
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(result.current).toBeNull()
  })

  it('updates live across a day boundary', () => {
    const target = new Date('2026-08-24T10:00:00Z') // exactly 24h ahead
    const { result } = renderHook(() => useCountdown(target))
    expect(result.current).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })

    // 1 second before expiry → 1 second left
    act(() => {
      vi.advanceTimersByTime(24 * 3600 * 1000 - 1000)
    })
    expect(result.current).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    })

    // Cross the boundary → null
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBeNull()
  })
})

