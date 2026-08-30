import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHelpers = vi.hoisted(() => ({ isSubscriptionActive: vi.fn() }))
vi.mock('@/lib/subscription-helpers', () => mockHelpers)

import { requireActiveSubscription } from '../subscription-guard'

beforeEach(() => vi.clearAllMocks())

describe('requireActiveSubscription', () => {
  it('returns null when the subscription is active', async () => {
    mockHelpers.isSubscriptionActive.mockResolvedValue(true)
    expect(await requireActiveSubscription(5)).toBeNull()
    expect(mockHelpers.isSubscriptionActive).toHaveBeenCalledWith(5)
  })

  it('returns a 403 when the subscription is not active', async () => {
    mockHelpers.isSubscriptionActive.mockResolvedValue(false)
    const res = await requireActiveSubscription(5)
    expect(res?.status).toBe(403)
  })
})
