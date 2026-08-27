// ---------------------------------------------------------------------------
// Sebwen POS — Live Countdown helpers (pure, no server/browser dependencies)
// ---------------------------------------------------------------------------
// Shared by the settings Suscripción UI (client) and the subscription API
// routes (server) so the remaining-time logic is identical everywhere:
//
// - getCountdownTarget   : resolves which date drives the live countdown per
//                          subscription status (trialEndDate / endDate /
//                          graceEndDate)
// - computeDaysRemaining : day-granular remaining days used by API responses
// - formatCountdown      : exact "2d 03h 12m 45s" string for UI pills
// ---------------------------------------------------------------------------

export interface CountdownTime {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export type DateLike = string | Date | null | undefined

export interface SubscriptionDates {
  trialEndDate?: DateLike
  endDate?: DateLike
  graceEndDate?: DateLike
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Resolve the reference date that drives the live countdown for a status:
 * - TRIAL    → trialEndDate, falling back to endDate
 * - ACTIVE   → endDate
 * - PAST_DUE → graceEndDate
 * - others   → null (no timer)
 */
export function getCountdownTarget(
  status: string,
  dates: SubscriptionDates,
): DateLike {
  if (status === 'TRIAL') return dates.trialEndDate ?? dates.endDate
  if (status === 'ACTIVE') return dates.endDate
  if (status === 'PAST_DUE') return dates.graceEndDate
  return null
}

/**
 * Day-granular remaining days until `target` using identical "calendar-day"
 * semantics everywhere: compare truncated days and round up, so a subscription
 * ending at 14:00 on day +2 (1d 23h left) reports 2 days remaining. Returns
 * null when there is no target date. Can be negative for dates already passed.
 */
export function computeDaysRemaining(
  target: DateLike,
  now: Date = new Date(),
): number | null {
  if (!target) return null
  const end = new Date(target)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.ceil((endDay.getTime() - today.getTime()) / MS_PER_DAY)
}

/**
 * Format a CountdownTime decomposition into an exact, compact string:
 *   {d:2,h:3,m:4,s:5} → "2d 03h 04m 05s"
 *   {d:0,h:2,m:3,s:4} → "02h 03m 04s"
 *   {d:0,h:0,m:3,s:4} → "03m 04s"
 *   {d:0,h:0,m:0,s:9} → "00m 09s"
 * Leading zero units are dropped (minutes & seconds are always shown) and the
 * shown units are zero-padded for a stable, tabular look.
 */
export function formatCountdown(
  time: CountdownTime | null | undefined,
): string {
  if (!time) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const parts: string[] = []
  if (time.days > 0) parts.push(`${time.days}d`)
  if (time.days > 0 || time.hours > 0) parts.push(`${pad(time.hours)}h`)
  if (time.days > 0 || time.hours > 0 || time.minutes > 0) {
    parts.push(`${pad(time.minutes)}m`)
  } else {
    // Anchor on minutes even when zero (e.g. "00m 09s")
    parts.push('00m')
  }
  parts.push(`${pad(time.seconds)}s`)
  return parts.join(' ')
}