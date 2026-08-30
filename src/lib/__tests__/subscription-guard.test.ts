import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHelpers = vi.hoisted(() => ({
  isSubscriptionActive: vi.fn(),
  storeHasFeature: vi.fn(),
}))
vi.mock('@/lib/subscription-helpers', () => mockHelpers)

import { requireActiveSubscription, requireFeature } from '../subscription-guard'

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

describe('requireFeature', () => {
  it('returns null when the plan includes the feature', async () => {
    mockHelpers.storeHasFeature.mockResolvedValue(true)
    expect(await requireFeature(5, 'reports')).toBeNull()
    expect(mockHelpers.storeHasFeature).toHaveBeenCalledWith(5, 'reports')
  })

  it('returns 403 with upgradeRequired when the plan lacks the feature', async () => {
    mockHelpers.storeHasFeature.mockResolvedValue(false)
    const res = await requireFeature(5, 'reports')
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ upgradeRequired: true })
  })
})
