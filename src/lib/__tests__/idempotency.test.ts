import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { claimExternalEvent } from '../idempotency'

function makeTx(failWith: Error | null) {
  return {
    processedEvent: {
      create: vi.fn(async () => {
        if (failWith) throw failWith
        return {}
      }),
    },
  } as never
}

const P2002 = () =>
  Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    name: 'PrismaClientKnownRequestError',
  }) as unknown as Prisma.PrismaClientKnownRequestError

describe('claimExternalEvent — idempotencia de eventos externos', () => {
  it('primer evento: claimed=true y registra en ProcessedEvent', async () => {
    const tx = makeTx(null)
    const result = await claimExternalEvent(tx, 'WOMPI', 'tx-123', { type: 'WompiTransaction', id: 7 })
    expect(result.claimed).toBe(true)
    expect((tx as { processedEvent: { create: ReturnType<typeof vi.fn> } }).processedEvent.create)
      .toHaveBeenCalledWith({
        data: { source: 'WOMPI', externalId: 'tx-123', entityType: 'WompiTransaction', entityId: 7 },
      })
  })

  it('reintento duplicado (P2002): claimed=false, sin lanzar error', async () => {
    const result = await claimExternalEvent(makeTx(P2002()), 'WOMPI', 'tx-123')
    expect(result.claimed).toBe(false)
  })

  it('errores distintos de P2002 se propagan', async () => {
    const boom = new Error('connection refused')
    await expect(claimExternalEvent(makeTx(boom), 'CRON', 'x')).rejects.toThrow('connection refused')
  })

  it('lock de cron: mismo bucket → segundo es rechazado', async () => {
    const first = await claimExternalEvent(makeTx(null), 'CRON', 'poll-dian-status:2026-08-24T10:00')
    const second = await claimExternalEvent(makeTx(P2002()), 'CRON', 'poll-dian-status:2026-08-24T10:00')
    expect(first.claimed).toBe(true)
    expect(second.claimed).toBe(false)
  })
})
