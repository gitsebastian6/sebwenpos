import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  chatSession: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  chatMessage: { findFirst: vi.fn(), create: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/api-auth', () => ({
  getAuthUser: vi.fn().mockReturnValue({ userId: 1, role: 'OWNER', storeId: null }),
}))

import { POST } from '../route'

// ─── Helpers ──────────────────────────────────────────────────────────────

function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const session = { id: 10, sessionId: 'sess-abc', userId: 1, storeId: null, messages: [] }

beforeEach(() => {
  vi.clearAllMocks()
  // All AI providers fail → the route uses its deterministic fallback response.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  mockDb.chatSession.findUnique.mockResolvedValue(session)
  mockDb.chatSession.findMany.mockResolvedValue([{ tokensUsed: 100 }])
  mockDb.chatSession.update.mockResolvedValue({})
  mockDb.chatMessage.findFirst.mockResolvedValue(null)
  mockDb.chatMessage.create.mockResolvedValue({})
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/ai/chat — idempotency', () => {
  it('401 without auth context', async () => {
    const { getAuthUser } = await import('@/lib/api-auth')
    ;(getAuthUser as unknown as { mockReturnValueOnce: (v: unknown) => void }).mockReturnValueOnce(null)
    const res = await POST(chatRequest({ message: 'hola', sessionId: 'sess-abc' }) as never)
    expect(res.status).toBe(401)
  })

  it('replays the stored assistant reply when the same Idempotency-Key was already processed', async () => {
    mockDb.chatMessage.findFirst.mockResolvedValue({ content: 'respuesta previa', tokens: 42 })

    const res = await POST(
      chatRequest({ message: 'hola', sessionId: 'sess-abc' }, { 'x-idempotency-key': 'KEY-1' }) as never,
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, message: 'respuesta previa', replayed: true })
    // no new work: no user/assistant message, no counter bump
    expect(mockDb.chatMessage.create).not.toHaveBeenCalled()
    expect(mockDb.chatSession.update).not.toHaveBeenCalled()
  })

  it('stamps the key on the assistant message and bumps counters on first use', async () => {
    const res = await POST(
      chatRequest({ message: 'hola', sessionId: 'sess-abc' }, { 'x-idempotency-key': 'KEY-2' }) as never,
    )
    expect(res.status).toBe(200)

    // user message + assistant message
    expect(mockDb.chatMessage.create).toHaveBeenCalledTimes(2)
    const assistantCall = mockDb.chatMessage.create.mock.calls.find((c) => c[0].data.role === 'assistant')
    expect(assistantCall?.[0].data.clientKey).toBe('KEY-2')
    expect(mockDb.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ messageCount: { increment: 2 } }) }),
    )
  })

  it('without a key, the assistant message carries clientKey = null', async () => {
    await POST(chatRequest({ message: 'hola', sessionId: 'sess-abc' }) as never)
    const assistantCall = mockDb.chatMessage.create.mock.calls.find((c) => c[0].data.role === 'assistant')
    expect(assistantCall?.[0].data.clientKey).toBeNull()
  })

  it('a concurrent P2002 on the assistant insert returns the winner reply without double-counting', async () => {
    mockDb.chatMessage.create.mockImplementation(async ({ data }: { data: { role: string } }) => {
      if (data.role === 'assistant') throw Object.assign(new Error('dup'), { code: 'P2002' })
      return {}
    })
    mockDb.chatMessage.findFirst
      .mockResolvedValueOnce(null) // pre-check
      .mockResolvedValueOnce({ content: 'respuesta del ganador', tokens: 7 }) // post-P2002

    const res = await POST(
      chatRequest({ message: 'hola', sessionId: 'sess-abc' }, { 'x-idempotency-key': 'KEY-3' }) as never,
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ message: 'respuesta del ganador', replayed: true })
    expect(mockDb.chatSession.update).not.toHaveBeenCalled()
  })
})
