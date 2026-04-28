import { describe, it, expect } from 'vitest'
import { rateLimit, getClientIp } from '../rate-limiter'
import { NextRequest } from 'next/server'

// ─── rateLimit ──────────────────────────────────────────────────────────────

describe('rateLimit', () => {
  it('allows requests within limit', () => {
    const result = rateLimit('test-route', '127.0.0.1', { windowSeconds: 60, maxRequests: 5 })
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('blocks requests exceeding limit', () => {
    const config = { windowSeconds: 60, maxRequests: 3 }

    rateLimit('block-test', '127.0.0.1', config) // 1
    rateLimit('block-test', '127.0.0.1', config) // 2
    rateLimit('block-test', '127.0.0.1', config) // 3

    const result = rateLimit('block-test', '127.0.0.1', config) // 4th — blocked
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('tracks different IPs independently', () => {
    const config = { windowSeconds: 60, maxRequests: 2 }

    rateLimit('ip-test', '1.1.1.1', config) // 1
    rateLimit('ip-test', '1.1.1.1', config) // 2 — full

    // Different IP should still be allowed
    const result = rateLimit('ip-test', '2.2.2.2', config)
    expect(result.success).toBe(true)
  })

  it('tracks different routes independently', () => {
    const config = { windowSeconds: 60, maxRequests: 2 }

    rateLimit('route-a', '1.1.1.1', config) // 1
    rateLimit('route-a', '1.1.1.1', config) // 2 — full

    // Different route should be allowed
    const result = rateLimit('route-b', '1.1.1.1', config)
    expect(result.success).toBe(true)
  })

  it('returns remaining count correctly', () => {
    const config = { windowSeconds: 60, maxRequests: 5 }
    
    const r1 = rateLimit('remaining-test', '127.0.0.1', config)
    expect(r1.remaining).toBe(4)

    const r2 = rateLimit('remaining-test', '127.0.0.1', config)
    expect(r2.remaining).toBe(3)
  })
})

// ─── getClientIp ────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': '203.0.113.1, 70.41.3.18' },
    })
    const ip = getClientIp(request)
    expect(ip).toBe('203.0.113.1')
  })

  it('extracts IP from x-real-ip header', () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-real-ip': '203.0.113.2' },
    })
    const ip = getClientIp(request)
    expect(ip).toBe('203.0.113.2')
  })

  it('returns fingerprint when no IP headers present', () => {
    const request = new NextRequest('http://localhost:3000/api/test')
    const ip = getClientIp(request)
    // Should return a fingerprint like fp-xxxx
    expect(ip).toMatch(/^fp-/)
  })
})
