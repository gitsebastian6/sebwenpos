/**
 * Sebwen POS — Logger
 * ─────────────────────
 * Wraps console methods. In production, suppresses debug/info logs
 * and only emits warnings and errors.
 */

const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug('[Sebwen]', ...args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info('[Sebwen]', ...args)
  },
  warn: (...args: unknown[]) => {
    console.warn('[Sebwen]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[Sebwen]', ...args)
  },
}
