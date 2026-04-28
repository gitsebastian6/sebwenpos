import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks (available before vi.mock factory runs) ─────────────────

const mockDb = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}))

const mockAuth = vi.hoisted(() => ({
  hashPassword: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  verifyPassword: vi.fn(),
  sanitizeUser: vi.fn((user) => {
    const { passwordHash, ...rest } = user
    return rest
  }),
  generateOrderNumber: vi.fn(),
}))

const mockRateLimiter = vi.hoisted(() => ({
  withRateLimit: vi.fn().mockReturnValue({ allowed: true, result: { remaining: 2, resetIn: 60, limit: 3, success: true } }),
  SETUP_RATE_LIMIT: { maxRequests: 3, windowSeconds: 300 },
  attachRateLimitHeaders: vi.fn((res) => res),
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/auth', () => mockAuth)
vi.mock('@/lib/rate-limiter', () => mockRateLimiter)

import { POST } from '../setup/route'
import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'

describe('POST /api/auth/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validBody = {
    cedula: '1234567890',
    password: 'SecurePass123',
    fullName: 'Admin Principal',
    email: 'admin@ventify.com',
  }

  it('creates SUPER_ADMIN successfully', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.create.mockResolvedValue({
      id: 1,
      cedula: validBody.cedula,
      fullName: validBody.fullName,
      email: validBody.email,
      role: 'SUPER_ADMIN',
    })

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(201)
    expect(body.created).toBe(true)
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cedula: validBody.cedula,
        role: 'SUPER_ADMIN',
      }),
    })
  })

  it('rejects when SUPER_ADMIN already exists (403)', async () => {
    mockDb.user.findFirst.mockResolvedValue({ id: 1, role: 'SUPER_ADMIN' })

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(403)
    expect(body.error).toContain('ya está configurado')
  })

  it('rejects duplicate cedula (409)', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.findUnique.mockResolvedValue({ id: 5, cedula: validBody.cedula })

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(409)
    expect(body.error).toContain('identificación')
  })

  it('rejects invalid body — cedula too short (400)', async () => {
    const request = mockPostRequest({ ...validBody, cedula: '12' })
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects invalid body — password too short (400)', async () => {
    const request = mockPostRequest({ ...validBody, password: '123' })
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects invalid body — fullName too short (400)', async () => {
    const request = mockPostRequest({ ...validBody, fullName: 'AB' })
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('handles database errors (500)', async () => {
    mockDb.user.findFirst.mockRejectedValue(new Error('DB error'))

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })

  it('works without email (optional field)', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.create.mockResolvedValue({ id: 1, cedula: validBody.cedula })

    const request = mockPostRequest({ ...validBody, email: '' })
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(201)
  })

  it('hashes the password before storing', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.create.mockResolvedValue({ id: 1 })

    const request = mockPostRequest(validBody)
    await POST(request as any)

    expect(mockAuth.hashPassword).toHaveBeenCalledWith(validBody.password)
  })
})
