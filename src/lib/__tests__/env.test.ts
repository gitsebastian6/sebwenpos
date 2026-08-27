import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set env vars BEFORE importing env.ts
process.env.AUTH_SECRET = 'test-secret'
process.env.INTERNAL_SECRET = 'test-internal'
process.env.NEXT_PUBLIC_APP_URL = 'https://test.example.com'
process.env.SMTP_FROM = 'test@example.com'
process.env.ALERT_API_BASE = 'https://test.example.com/api/subscription/alerts'
// @ts-expect-error
      process.env.NODE_ENV = 'development'

import { requireEnv, envOrDefault, envOrDefaultInt, envOrDefaultBool, assertRequiredEnv } from '../env'

describe('env utilities', () => {
  beforeEach(() => {
    delete process.env.TEST_VAR
    delete process.env.TEST_INT
    delete process.env.TEST_BOOL
  })

  // ─── requireEnv ──────────────────────────────────────────────────────────

  describe('requireEnv', () => {
    it('returns value when env var is set', () => {
      process.env.TEST_VAR = 'hello'
      expect(requireEnv('TEST_VAR')).toBe('hello')
    })

    it('trims whitespace from value', () => {
      process.env.TEST_VAR = '  hello  '
      expect(requireEnv('TEST_VAR')).toBe('hello')
    })

    it('returns empty string in development when not set', () => {
      // @ts-expect-error
      process.env.NODE_ENV = 'development'
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(requireEnv('MISSING_VAR_XYZ')).toBe('')
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('throws in production when not set', () => {
      // @ts-expect-error
      process.env.NODE_ENV = 'production'
      expect(() => requireEnv('MISSING_VAR_XYZ')).toThrow('FATAL')
      // @ts-expect-error
      process.env.NODE_ENV = 'development'
    })
  })

  // ─── assertRequiredEnv ───────────────────────────────────────────────────

  describe('assertRequiredEnv', () => {
    it('does not throw when all required vars are set', () => {
      // @ts-expect-error
      process.env.NODE_ENV = 'production'
      expect(() => assertRequiredEnv()).not.toThrow()
      // @ts-expect-error
      process.env.NODE_ENV = 'development'
    })

    it('throws in production listing every missing required var', () => {
      // @ts-expect-error
      process.env.NODE_ENV = 'production'
      const saved = { auth: process.env.AUTH_SECRET, internal: process.env.INTERNAL_SECRET }
      delete process.env.AUTH_SECRET
      delete process.env.INTERNAL_SECRET
      try {
        expect(() => assertRequiredEnv()).toThrow(/AUTH_SECRET.*INTERNAL_SECRET|INTERNAL_SECRET.*AUTH_SECRET/)
      } finally {
        process.env.AUTH_SECRET = saved.auth
        process.env.INTERNAL_SECRET = saved.internal
        // @ts-expect-error
        process.env.NODE_ENV = 'development'
      }
    })

    it('only warns in development when a required var is missing', () => {
      // @ts-expect-error
      process.env.NODE_ENV = 'development'
      const saved = process.env.AUTH_SECRET
      delete process.env.AUTH_SECRET
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(() => assertRequiredEnv()).not.toThrow()
        expect(warnSpy).toHaveBeenCalled()
      } finally {
        warnSpy.mockRestore()
        process.env.AUTH_SECRET = saved
      }
    })
  })

  // ─── envOrDefault ────────────────────────────────────────────────────────

  describe('envOrDefault', () => {
    it('returns env value when set', () => {
      process.env.TEST_VAR = 'my-value'
      expect(envOrDefault('TEST_VAR', 'default')).toBe('my-value')
    })

    it('returns default when not set', () => {
      expect(envOrDefault('TEST_VAR', 'default')).toBe('default')
    })

    it('returns default when value is empty string', () => {
      process.env.TEST_VAR = ''
      expect(envOrDefault('TEST_VAR', 'default')).toBe('default')
    })

    it('trims whitespace', () => {
      process.env.TEST_VAR = '  value  '
      expect(envOrDefault('TEST_VAR', 'default')).toBe('value')
    })
  })

  // ─── envOrDefaultInt ─────────────────────────────────────────────────────

  describe('envOrDefaultInt', () => {
    it('parses valid integer', () => {
      process.env.TEST_INT = '8080'
      expect(envOrDefaultInt('TEST_INT', 3000)).toBe(8080)
    })

    it('returns default when not set', () => {
      expect(envOrDefaultInt('TEST_INT', 3000)).toBe(3000)
    })

    it('returns default for non-numeric value', () => {
      process.env.TEST_INT = 'not-a-number'
      expect(envOrDefaultInt('TEST_INT', 3000)).toBe(3000)
    })

    it('returns default for empty string', () => {
      process.env.TEST_INT = ''
      expect(envOrDefaultInt('TEST_INT', 3000)).toBe(3000)
    })

    it('parses negative numbers', () => {
      process.env.TEST_INT = '-1'
      expect(envOrDefaultInt('TEST_INT', 0)).toBe(-1)
    })
  })

  // ─── envOrDefaultBool ────────────────────────────────────────────────────

  describe('envOrDefaultBool', () => {
    it('returns true for "true"', () => {
      process.env.TEST_BOOL = 'true'
      expect(envOrDefaultBool('TEST_BOOL', false)).toBe(true)
    })

    it('returns true for "TRUE" (case insensitive)', () => {
      process.env.TEST_BOOL = 'TRUE'
      expect(envOrDefaultBool('TEST_BOOL', false)).toBe(true)
    })

    it('returns false for "false"', () => {
      process.env.TEST_BOOL = 'false'
      expect(envOrDefaultBool('TEST_BOOL', true)).toBe(false)
    })

    it('returns default when not set', () => {
      expect(envOrDefaultBool('TEST_BOOL', true)).toBe(true)
      expect(envOrDefaultBool('TEST_BOOL', false)).toBe(false)
    })

    it('returns false for random string', () => {
      process.env.TEST_BOOL = 'yes'
      expect(envOrDefaultBool('TEST_BOOL', false)).toBe(false)
    })
  })
})
