import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to define mockDb before vi.mock factory runs
const mockDb = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({
  db: mockDb,
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import { GET } from '../init/route'
import { parseResponse } from '@/lib/__tests__/test-helpers'

describe('GET /api/auth/init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns needsSetup=true when no SUPER_ADMIN exists', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)

    const response = await GET()
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.needsSetup).toBe(true)
  })

  it('returns needsSetup=false when SUPER_ADMIN exists', async () => {
    mockDb.user.findFirst.mockResolvedValue({ id: 1 })

    const response = await GET()
    const { status, body } = await parseResponse(response)

    expect(status).toBe(200)
    expect(body.needsSetup).toBe(false)
  })

  it('handles database errors gracefully', async () => {
    mockDb.user.findFirst.mockRejectedValue(new Error('DB connection failed'))

    const response = await GET()
    const { status, body } = await parseResponse(response)

    expect(status).toBe(500)
    expect(body.error).toBeTruthy()
  })

  it('queries for SUPER_ADMIN role specifically', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)

    await GET()

    expect(mockDb.user.findFirst).toHaveBeenCalledWith({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })
  })
})
