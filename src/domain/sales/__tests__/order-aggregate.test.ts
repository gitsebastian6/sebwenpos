import { describe, it, expect, vi } from 'vitest'
import { validateOrder } from '../order-aggregate'

const line = (over: Partial<Parameters<typeof validateOrder>[0][number]> = {}) => ({
  productId: 1,
  serviceId: null,
  presentationId: null,
  quantity: 2,
  unitPrice: 1000,
  totalRow: 2000,
  ...over,
})

const totals = (over: Partial<Parameters<typeof validateOrder>[1]> = {}) => ({
  subtotal: 2000,
  taxAmount: 0,
  discountAmount: 0,
  tipAmount: 0,
  total: 2000,
  ...over,
})

describe('Order aggregate — invariantes de la raíz', () => {
  it('I1: rechaza orden sin ítems', () => {
    expect(validateOrder([], totals())).toMatchObject({ ok: false, invariant: 'I1' })
  })

  it('I2: rechaza línea con producto Y servicio', () => {
    expect(validateOrder([line({ productId: 1, serviceId: 5 })], totals()))
      .toMatchObject({ ok: false, invariant: 'I2' })
  })

  it('I2: rechaza línea sin producto ni servicio', () => {
    expect(validateOrder([line({ productId: null, serviceId: null })], totals()))
      .toMatchObject({ ok: false, invariant: 'I2' })
  })

  it('I3: rechaza cantidad <= 0', () => {
    expect(validateOrder([line({ quantity: 0 })], totals()))
      .toMatchObject({ ok: false, invariant: 'I3' })
  })

  it('I4: rechaza líneas duplicadas mismo producto+presentación', () => {
    expect(validateOrder([line(), line()], totals({ subtotal: 4000, total: 4000 })))
      .toMatchObject({ ok: false, invariant: 'I4' })
  })

  it('I4: permite mismo producto con distinta presentación', () => {
    const r = validateOrder(
      [line(), line({ presentationId: 9 })],
      totals({ subtotal: 4000, total: 4000 }),
    )
    expect(r.ok).toBe(true)
  })

  it('I5: subtotal debe ser la suma de totalRow', () => {
    expect(validateOrder([line()], totals({ subtotal: 999 })))
      .toMatchObject({ ok: false, invariant: 'I5' })
  })

  it('I7: descuento no puede superar el subtotal', () => {
    expect(validateOrder([line()], totals({ discountAmount: 3000, total: -1000 })))
      .toMatchObject({ ok: false, invariant: 'I7' })
  })

  it('I6: total = subtotal − descuento + propina', () => {
    expect(validateOrder([line()], totals({ discountAmount: 500, tipAmount: 100, total: 1700 })))
      .toMatchObject({ ok: false, invariant: 'I6' })
  })

  it('acepta una venta válida con descuento y propina', () => {
    expect(validateOrder([line()], totals({ discountAmount: 500, tipAmount: 100, total: 1600 })).ok)
      .toBe(true)
  })
})

describe('Domain events — bus in-process', () => {
  it('ejecuta los handlers registrados con el payload', async () => {
    const { onDomainEvent, publishDomainEvent } = await import('../../shared/domain-events')
    const seen: string[] = []
    onDomainEvent<{ v: number }>('TestEvt', async (_tx, p) => { seen.push(`h1:${p.v}`) })
    onDomainEvent<{ v: number }>('TestEvt', async (_tx, p) => { seen.push(`h2:${p.v}`) })
    await publishDomainEvent('TestEvt', {} as never, { v: 42 })
    expect(seen).toEqual(['h1:42', 'h2:42'])
  })

  it('propaga el error del handler (consistencia fuerte en la tx)', async () => {
    const { onDomainEvent, publishDomainEvent } = await import('../../shared/domain-events')
    onDomainEvent('BoomEvt', async () => { throw new Error('boom') })
    await expect(publishDomainEvent('BoomEvt', {} as never, {})).rejects.toThrow('boom')
  })
})
