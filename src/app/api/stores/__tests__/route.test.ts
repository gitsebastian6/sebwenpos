import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  store: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/api-auth', () => ({
  requireStoreAccess: vi.fn().mockReturnValue(null),
}))

import { GET, PUT } from '../route'
import { parseResponse } from '@/lib/__tests__/test-helpers'

// Helper to create a NextRequest-like mock with nextUrl
function mockNextGetRequest(url: string) {
  return { nextUrl: new URL(url), headers: new Headers(), method: 'GET' } as any
}

function mockNextPutRequest(url: string, body: unknown) {
  return {
    nextUrl: new URL(url),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    method: 'PUT',
    json: () => Promise.resolve(body),
  } as any
}

describe('GET /api/stores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns store by storeId', async () => {
    const mockStore = { id: 1, name: 'Mi Tienda', currencyCode: 'COP' }
    mockDb.store.findUnique.mockResolvedValue(mockStore)

    const response = await GET(mockNextGetRequest('http://localhost:3000/api/stores?storeId=1'))
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.name).toBe('Mi Tienda')
  })

  it('returns stores by userId', async () => {
    const mockStores = [{ id: 1, name: 'Tienda 1' }, { id: 2, name: 'Tienda 2' }]
    mockDb.store.findMany.mockResolvedValue(mockStores)

    const response = await GET(mockNextGetRequest('http://localhost:3000/api/stores?userId=1'))
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body).toHaveLength(2)
  })

  it('returns 400 when no storeId or userId provided', async () => {
    const response = await GET(mockNextGetRequest('http://localhost:3000/api/stores'))
    const { status, body } = await parseResponse(response)

    expect(status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it('returns 404 when store not found', async () => {
    mockDb.store.findUnique.mockResolvedValue(null)

    const response = await GET(mockNextGetRequest('http://localhost:3000/api/stores?storeId=999'))
    const { status } = await parseResponse(response)

    expect(status).toBe(404)
  })

  it('handles database errors (500)', async () => {
    mockDb.store.findUnique.mockRejectedValue(new Error('DB error'))

    const response = await GET(mockNextGetRequest('http://localhost:3000/api/stores?storeId=1'))
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })
})

describe('PUT /api/stores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates store name successfully', async () => {
    const existingStore = { id: 1, name: 'Old Name' }
    const updatedStore = { id: 1, name: 'New Name' }

    mockDb.store.findUnique.mockResolvedValue(existingStore)
    mockDb.store.update.mockResolvedValue(updatedStore)

    const response = await PUT(mockNextPutRequest('http://localhost:3000/api/stores?storeId=1', { name: 'New Name' }))
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.name).toBe('New Name')
  })

  it('returns 400 when storeId missing', async () => {
    const response = await PUT(mockNextPutRequest('http://localhost:3000/api/stores', { name: 'Test' }))
    const { status } = await parseResponse(response)

    expect(status).toBe(400)
  })

  it('returns 404 when store not found for update', async () => {
    mockDb.store.findUnique.mockResolvedValue(null)

    const response = await PUT(mockNextPutRequest('http://localhost:3000/api/stores?storeId=999', { name: 'Test' }))
    const { status } = await parseResponse(response)

    expect(status).toBe(404)
  })

  it('handles database errors during update (500)', async () => {
    mockDb.store.findUnique.mockResolvedValue({ id: 1, name: 'Test' })
    mockDb.store.update.mockRejectedValue(new Error('DB error'))

    const response = await PUT(mockNextPutRequest('http://localhost:3000/api/stores?storeId=1', { name: 'Updated' }))
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })
})
