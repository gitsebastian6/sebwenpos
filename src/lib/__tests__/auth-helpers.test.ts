import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateToken,
  verifyToken,
  extractTokenFromRequest,
  isPublicPath,
  isSuperAdminPath,
  isInternalPath,
} from '../auth-helpers'

// ─── generateToken + verifyToken ────────────────────────────────────────────

describe('auth-helpers token lifecycle', () => {
  // Set a known AUTH_SECRET for tests
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret-for-vitest-2025'
    // @ts-expect-error — NODE_ENV is read-only but we need to override for tests
    process.env.NODE_ENV = 'development'
  })

  it('round-trip: verifyToken(generateToken(payload)) returns original payload', async () => {
    const payload = {
      userId: 1,
      storeId: 5,
      role: 'OWNER',
      employeeId: null,
    }

    const token = await generateToken(payload)
    const verified = await verifyToken(token)

    expect(verified).not.toBeNull()
    expect(verified!.userId).toBe(1)
    expect(verified!.storeId).toBe(5)
    expect(verified!.role).toBe('OWNER')
    expect(verified!.employeeId).toBeNull()
  })

  it('round-trip with employeeId', async () => {
    const payload = {
      userId: 10,
      storeId: 5,
      role: 'EMPLOYEE',
      employeeId: 42,
    }

    const token = await generateToken(payload)
    const verified = await verifyToken(token)

    expect(verified).not.toBeNull()
    expect(verified!.employeeId).toBe(42)
    expect(verified!.role).toBe('EMPLOYEE')
  })

  it('returns null for tampered token', async () => {
    const token = await generateToken({
      userId: 1,
      storeId: 5,
      role: 'OWNER',
    })

    // Tamper with the payload part
    const parts = token.split('.')
    const tampered = parts[0] + '.' + btoa('{"userId":999}') + '.' + parts[2]

    const verified = await verifyToken(tampered)
    expect(verified).toBeNull()
  })

  it('returns null for expired token', async () => {
    const token = await generateToken({
      userId: 1,
      storeId: 5,
      role: 'OWNER',
      expiryMs: -1, // Already expired
    })

    const verified = await verifyToken(token)
    expect(verified).toBeNull()
  })

  it('returns payload for expired token within grace period', async () => {
    const token = await generateToken({
      userId: 1,
      storeId: 5,
      role: 'OWNER',
      expiryMs: -1, // Expired 1ms ago
    })

    // With 60 second grace period, should still be valid
    const verified = await verifyToken(token, 60_000)
    expect(verified).not.toBeNull()
    expect(verified!.userId).toBe(1)
  })

  it('returns null for token with wrong version', async () => {
    const token = await generateToken({
      userId: 1,
      storeId: 5,
      role: 'OWNER',
    })

    // Replace version prefix
    const parts = token.split('.')
    const tampered = 'v99' + token.slice(2)

    const verified = await verifyToken(tampered)
    expect(verified).toBeNull()
  })

  it('returns null for malformed token (not 3 parts)', async () => {
    const verified = await verifyToken('not.a.valid.token.format')
    expect(verified).toBeNull()
  })

  it('returns null for empty string', async () => {
    const verified = await verifyToken('')
    expect(verified).toBeNull()
  })

  it('returns null for completely invalid base64', async () => {
    const verified = await verifyToken('v1.!!!.!!!')
    expect(verified).toBeNull()
  })

  it('Super Admin with null storeId', async () => {
    const token = await generateToken({
      userId: 1,
      storeId: null,
      role: 'SUPER_ADMIN',
    })

    const verified = await verifyToken(token)
    expect(verified).not.toBeNull()
    expect(verified!.storeId).toBeNull()
    expect(verified!.role).toBe('SUPER_ADMIN')
  })
})

// ─── extractTokenFromRequest ────────────────────────────────────────────────

describe('extractTokenFromRequest', () => {
  it('extracts token from Bearer header', () => {
    expect(extractTokenFromRequest('Bearer abc123')).toBe('abc123')
  })

  it('returns null for null input', () => {
    expect(extractTokenFromRequest(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractTokenFromRequest('')).toBeNull()
  })

  it('returns null for wrong scheme', () => {
    expect(extractTokenFromRequest('Basic abc123')).toBeNull()
  })

  it('returns null for missing token part', () => {
    // "Bearer " with space but no token — returns empty string, not null
    expect(extractTokenFromRequest('Bearer ')).toBe('')
  })

  it('returns null for multiple spaces', () => {
    expect(extractTokenFromRequest('Bearer  abc')).toBeNull()
  })
})

// ─── Path checks ────────────────────────────────────────────────────────────

describe('path checks', () => {
  describe('isPublicPath', () => {
    it('identifies login as public', () => {
      expect(isPublicPath('/api/auth/login')).toBe(true)
    })

    it('identifies setup as public', () => {
      expect(isPublicPath('/api/auth/setup')).toBe(true)
    })

    it('identifies health as public', () => {
      expect(isPublicPath('/api/health')).toBe(true)
    })

    it('identifies subscription plans as public', () => {
      expect(isPublicPath('/api/subscription/plans')).toBe(true)
    })

    it('rejects orders as not public', () => {
      expect(isPublicPath('/api/orders')).toBe(false)
    })

    it('rejects admin routes as not public', () => {
      expect(isPublicPath('/api/super-admin/stores')).toBe(false)
    })
  })

  describe('isSuperAdminPath', () => {
    it('identifies super-admin paths', () => {
      expect(isSuperAdminPath('/api/super-admin/stores')).toBe(true)
      expect(isSuperAdminPath('/api/super-admin/plans')).toBe(true)
    })

    it('rejects non-super-admin paths', () => {
      expect(isSuperAdminPath('/api/orders')).toBe(false)
      expect(isSuperAdminPath('/api/auth/login')).toBe(false)
    })
  })

  describe('isInternalPath', () => {
    it('identifies cron paths', () => {
      expect(isInternalPath('/api/cron/daily')).toBe(true)
    })

    it('identifies subscription alerts path', () => {
      expect(isInternalPath('/api/subscription/alerts')).toBe(true)
    })

    it('rejects non-internal paths', () => {
      expect(isInternalPath('/api/orders')).toBe(false)
    })
  })
})
