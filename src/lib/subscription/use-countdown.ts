'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CountdownTime } from './countdown'

export type { CountdownTime }

// ---------------------------------------------------------------------------
// Sebwen POS — Live Countdown Hook
// ---------------------------------------------------------------------------
// Returns a live { days, hours, minutes, seconds } decomposition of the time
// remaining until `target` (a future date). Updates every second so the
// subscription countdown ticks in real time.
//
// - target null / undefined / invalid  → returns null (no timer)
// - target already in the past          → returns null (timer ended)
//
// The interval is set up only while a valid future target exists, and is
// always cleared on unmount / target change.
// ---------------------------------------------------------------------------

export function useCountdown(
  target: string | Date | null | undefined,
): CountdownTime | null {
  const compute = useCallback((): CountdownTime | null => {
    if (!target) return null
    const end = new Date(target).getTime()
    if (Number.isNaN(end)) return null
    const diff = end - Date.now()
    if (diff <= 0) return null
    const totalSeconds = Math.floor(diff / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return { days, hours, minutes, seconds }
  }, [target])

  const [time, setTime] = useState<CountdownTime | null>(compute)

  useEffect(() => {
    const update = () => setTime(compute())
    // Sync immediately in case the target changed.
    update()
    // Only keep an interval alive while there is a live future target.
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [compute])

  return time
}
