/**
 * Ventify POS — Logger
 * ─────────────────────
 * Wraps console methods. In production, suppresses debug/info logs
 * and only emits warnings and errors.
 */

const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug('[Ventify]', ...args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info('[Ventify]', ...args)
  },
  warn: (...args: unknown[]) => {
    console.warn('[Ventify]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[Ventify]', ...args)
  },
}
