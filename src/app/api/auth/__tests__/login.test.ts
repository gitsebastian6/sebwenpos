import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  store: {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]), // No branches by default
  },
  subscription: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  plan: {
    findFirst: vi.fn(),
  },
}))

const mockAuth = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  sanitizeUser: vi.fn((user) => {
    const { passwordHash, ...rest } = user
    return rest
  }),
  generateOrderNumber: vi.fn(),
}))

const mockAuthHelpers = vi.hoisted(() => ({
  generateToken: vi.fn().mockResolvedValue('v1.mocktoken.mocksig'),
  verifyToken: vi.fn(),
  extractTokenFromRequest: vi.fn(),
  isPublicPath: vi.fn(),
  isSuperAdminPath: vi.fn(),
  isInternalPath: vi.fn(),
}))

const mockRateLimiter = vi.hoisted(() => ({
  withRateLimit: vi.fn().mockReturnValue({ allowed: true, result: { remaining: 4, resetIn: 60, limit: 5, success: true } }),
  LOGIN_RATE_LIMIT: { maxRequests: 5, windowSeconds: 60 },
  attachRateLimitHeaders: vi.fn((res) => res),
}))

const mockSubHelpers = vi.hoisted(() => ({
  transitionOverdueSubscriptions: vi.fn(),
  getSubscriptionInfo: vi.fn().mockResolvedValue({
    hasSubscription: true,
    subscriptionStatus: 'ACTIVE',
    subscriptionId: 1,
    planId: 1,
    planName: 'Pro',
    planPrice: 99000,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    trialEndDate: null,
    graceEndDate: null,
    graceDaysRemaining: null,
    billingPeriod: 'MONTHLY',
    daysRemaining: 300,
    planLimits: { maxEmployees: 10, maxProducts: 500, features: {} },
  }),
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/auth', () => mockAuth)
vi.mock('@/lib/auth-helpers', () => mockAuthHelpers)
vi.mock('@/lib/rate-limiter', () => mockRateLimiter)
vi.mock('@/lib/subscription-helpers', () => mockSubHelpers)

import { POST } from '../login/route'
import { mockPostRequest, parseResponse } from '@/lib/__tests__/test-helpers'

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validBody = {
    cedula: '1234567890',
    password: 'password123',
  }

  const mockUser = {
    id: 1,
    cedula: '1234567890',
    fullName: 'Admin User',
    email: 'admin@test.com',
    phone: '3001234567',
    passwordHash: '$2b$12$hashed',
    role: 'OWNER',
    store: {
      id: 1,
      name: 'Mi Tienda',
      legalName: 'Mi Tienda SAS',
      nit: '9001234567',
      address: 'Calle 1 #2-3',
      phone: '6011234567',
      currencyCode: 'COP',
      countryCode: 'CO',
      invoiceEnabled: false,
      invoiceTestMode: true,
      invoicePrefix: 'FE',
      resolutionNumber: '18764',
      parentStoreId: null,
      // Tienda Virtual + domicilio — deben viajar en el login o el próximo
      // inicio de sesión pisa el `store` completo con uno parcial.
      storeSlug: 'mi-tienda',
      storeDescription: 'La mejor tienda',
      storeWhatsapp: '3009998877',
      storeActive: true,
      deliveryEnabled: true,
      deliveryFee: 5000,
      deliveryFreeAbove: 50000,
      deliveryMinOrder: 10000,
      acceptingOrders: true,
      subscription: {
        id: 1,
        status: 'ACTIVE',
        planId: 1,
        endDate: new Date('2025-12-31'),
        trialEndDate: null,
        plan: {
          id: 1,
          name: 'Pro',
          price: 99000,
          maxProducts: 500,
          maxEmployees: 10,
          maxStores: 1,
        },
      },
    },
    employee: null,
  }

  it('logs in OWNER successfully with active subscription', async () => {
    mockDb.user.findUnique.mockResolvedValue(mockUser)
    mockAuth.verifyPassword.mockResolvedValue(true)

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.token).toBeTruthy()
    expect(body.isSuperAdmin).toBe(false)
    expect(body.user).toBeTruthy()
    expect(body.store).toBeTruthy()
  })

  it('logs in SUPER_ADMIN successfully', async () => {
    const superAdmin = { ...mockUser, role: 'SUPER_ADMIN', store: null, employee: null }
    mockDb.user.findUnique.mockResolvedValue(superAdmin)
    mockAuth.verifyPassword.mockResolvedValue(true)

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.isSuperAdmin).toBe(true)
    expect(body.token).toBeTruthy()
  })

  it('rejects unknown user (401)', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(401)
    expect(body.error).toContain('Credenciales')
  })

  it('rejects wrong password (401)', async () => {
    mockDb.user.findUnique.mockResolvedValue(mockUser)
    mockAuth.verifyPassword.mockResolvedValue(false)

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(401)
    expect(body.error).toContain('Credenciales')
  })

  it('rejects OWNER without store (400)', async () => {
    const userNoStore = { ...mockUser, store: null, employee: null, role: 'OWNER' }
    mockDb.user.findUnique.mockResolvedValue(userNoStore)
    mockAuth.verifyPassword.mockResolvedValue(true)

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toContain('tienda')
  })

  it('rejects empty cedula (400)', async () => {
    const request = mockPostRequest({ cedula: '', password: 'pass' })
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('rejects missing password (400)', async () => {
    const request = mockPostRequest({ cedula: '123', password: '' })
    const response = await POST(request as any)
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('handles database errors (500)', async () => {
    mockDb.user.findUnique.mockRejectedValue(new Error('DB error'))

    const request = mockPostRequest(validBody)
    const response = await POST(request as any)
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })

  it('queries user by cedula with store and subscription includes', async () => {
    mockDb.user.findUnique.mockResolvedValue(mockUser)
    mockAuth.verifyPassword.mockResolvedValue(true)

    const request = mockPostRequest(validBody)
    await POST(request as any)

    expect(mockDb.user.findUnique).toHaveBeenCalledWith({
      where: { cedula: validBody.cedula },
      include: expect.any(Object),
    })
  })

  it('selects the Tienda Virtual / delivery columns (regression: config must survive re-login)', async () => {
    mockDb.user.findUnique.mockResolvedValue(mockUser)
    mockAuth.verifyPassword.mockResolvedValue(true)

    await POST(mockPostRequest(validBody) as any)

    const arg = mockDb.user.findUnique.mock.calls[0][0]
    const ownerSelect = arg.include.store.select
    const employeeSelect = arg.include.employee.include.store.select
    for (const sel of [ownerSelect, employeeSelect]) {
      expect(sel.storeSlug).toBe(true)
      expect(sel.storeActive).toBe(true)
      expect(sel.storeWhatsapp).toBe(true)
      expect(sel.storeDescription).toBe(true)
      expect(sel.debtOverdueDays).toBe(true)
      expect(sel.deliveryEnabled).toBe(true)
      expect(sel.deliveryFee).toBe(true)
      expect(sel.deliveryFreeAbove).toBe(true)
      expect(sel.deliveryMinOrder).toBe(true)
      expect(sel.acceptingOrders).toBe(true)
    }
    // Secretos NUNCA deben ir al cliente
    expect(ownerSelect.certificatePassword).toBeUndefined()
    expect(ownerSelect.softwarePin).toBeUndefined()
    expect(ownerSelect.pteApiKey).toBeUndefined()
    expect(ownerSelect.providerConfig).toBeUndefined()
  })

  it('returns the Tienda Virtual config in the store payload', async () => {
    mockDb.user.findUnique.mockResolvedValue(mockUser)
    mockAuth.verifyPassword.mockResolvedValue(true)

    const { status, body } = await parseResponse(await POST(mockPostRequest(validBody) as any))

    expect(status).toBe(200)
    expect(body.store.storeSlug).toBe('mi-tienda')
    expect(body.store.storeActive).toBe(true)
    expect(body.store.deliveryFee).toBe(5000)
    expect(body.store.acceptingOrders).toBe(true)
  })
})
