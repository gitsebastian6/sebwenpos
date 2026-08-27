// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactNode } from 'react'
import { usePosCart } from '../pos/use-pos-cart'
import type { CartItem } from '@/types'

// ─── Mocks ────────────────────────────────────────────────────────────────
const { createOrderMock, toastMock, soundsMock } = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  soundsMock: { playCartAdd: vi.fn(), playError: vi.fn(), playSaleSuccess: vi.fn() },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    store: { id: 1, name: 'Tienda Test', currencyCode: 'COP', invoiceEnabled: false, nit: '900000000', invoiceTestMode: true },
  }),
}))

vi.mock('@/hooks/api/use-pos', () => ({
  useCreateInvoice: () => ({ mutateAsync: vi.fn() }),
  useCreateOrder: () => ({ mutateAsync: createOrderMock }),
}))

vi.mock('@/lib/offline/offline-provider', () => ({
  useOffline: () => ({ isOnline: true }),
}))

vi.mock('@/lib/pos-sounds', () => soundsMock)

vi.mock('sonner', () => ({ toast: toastMock }))

// ─── Wrapper / deps ───────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const deps = {
  products: [
    { id: 1, name: 'Arepa', salePrice: 5000, currentStock: 50, unitLabel: 'UND', trackInventory: true, presentations: [] },
    { id: 2, name: 'Café', salePrice: 3000, currentStock: 20, unitLabel: 'UND', trackInventory: true, presentations: [] },
  ] as any,
  openCashRegisters: [{ id: 1, status: 'OPEN', initialAmount: 0 }] as any,
  selectedCashRegisterId: '1',
  customers: [] as any,
  fetchOpenCashRegisters: vi.fn(),
}
// ─── Cart quantity (product counter) ──────────────────────────────────────

describe('usePosCart — contador de producto (cantidades)', () => {
  beforeEach(() => {
    createOrderMock.mockReset()
    createOrderMock.mockResolvedValue({ id: 1, orderNumber: 'SALE-0001' })
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.warning.mockReset()
  })

  it('updateQuantity aumenta y decrementa la cantidad del producto', () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    act(() => result.current.addToCart(deps.products[0]))
    expect(result.current.cartItemCount).toBe(1)

    act(() => result.current.updateQuantity(1, 1, false))
    expect(result.current.cart[0].quantity).toBe(2)

    act(() => result.current.updateQuantity(1, -1, false))
    expect(result.current.cart[0].quantity).toBe(1)
  })

  it('setQuantity fija una cantidad exacta y no deja superar el stock', () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    act(() => result.current.addToCart(deps.products[0]))
    act(() => result.current.setQuantity(1, 5, false))
    expect(result.current.cart[0].quantity).toBe(5)

    // maxStock = currentStock 50 -> no supera
    act(() => result.current.setQuantity(1, 999, false))
    expect(result.current.cart[0].quantity).toBe(50)
  })
// ─── Split-tender (varios medios de pago) ─────────────────────────────────

describe('usePosCart — split-tender (pago dividido)', () => {
  beforeEach(() => {
    createOrderMock.mockReset()
    createOrderMock.mockResolvedValue({ id: 1, orderNumber: 'SALE-0001' })
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.warning.mockReset()
  })

  it('agrega y elimina splits y mantiene allocatedSum al día', () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    // Arepa $5.000 => total 5.000
    act(() => result.current.addToCart(deps.products[0]))
    act(() =>
      result.current.setPaymentSplits([{ id: 's1', method: 'CASH', amount: 3000, reference: '' }])
    )
    act(() => result.current.addPaymentSplit()) // remaining = 2.000
    expect(result.current.paymentSplits).toHaveLength(2)
    expect(result.current.allocatedSum).toBe(5000)

    act(() => result.current.updatePaymentSplit(result.current.paymentSplits[0].id, { method: 'NEQUI' }))
    expect(result.current.paymentSplits[0].method).toBe('NEQUI')

    act(() => result.current.removePaymentSplit(result.current.paymentSplits[0].id))
    expect(result.current.paymentSplits).toHaveLength(1)
    expect(result.current.allocatedSum).toBe(2000)
  })

  it('envía paymentMethod MIXED + paymentSplits en el payload al cobrar', async () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    act(() => result.current.addToCart(deps.products[0])) // 5.000
    act(() =>
      result.current.setPaymentSplits([
        { id: 's1', method: 'CASH', amount: 3000, reference: '' },
        { id: 's2', method: 'DAVIPLATA', amount: 2000, reference: '3119876543' },
      ])
    )

    await act(async () => {
      await result.current.handleSubmitOrder()
    })

    expect(createOrderMock).toHaveBeenCalledTimes(1)
    const payload = createOrderMock.mock.calls[0][0]
    expect(payload.paymentMethod).toBe('MIXED')
    expect(payload.paymentSplits).toEqual([
      { method: 'CASH', amount: 3000, reference: '' },
      { method: 'DAVIPLATA', amount: 2000, reference: '3119876543' },
    ])
    expect(toastMock.success).toHaveBeenCalled()
    expect(result.current.paymentSplits).toHaveLength(0) // reset post-venta
  })

  it('bloquea la venta si la suma de pagos no cubre el total', async () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    act(() => result.current.addToCart(deps.products[0])) // 5.000
    act(() =>
      result.current.setPaymentSplits([{ id: 's1', method: 'CASH', amount: 2000, reference: '' }])
    )

    await act(async () => {
      await result.current.handleSubmitOrder()
    })

    expect(createOrderMock).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith('La suma de los pagos debe ser igual al total')
  })

  it('exige la referencia para medios digitales en un pago dividido', async () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    act(() => result.current.addToCart(deps.products[0])) // 5.000
    act(() =>
      result.current.setPaymentSplits([
        { id: 's1', method: 'CASH', amount: 3000, reference: '' },
        { id: 's2', method: 'NEQUI', amount: 2000, reference: '' }, // sin referencia
      ])
    )

    await act(async () => {
      await result.current.handleSubmitOrder()
    })

    expect(createOrderMock).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalled()
  })
})

  it('removeFromCart elimina la línea del carrito', () => {
    const { result } = renderHook(() => usePosCart(deps), { wrapper })

    act(() => result.current.addToCart(deps.products[0]))
    act(() => result.current.addToCart(deps.products[1]))
    expect((result.current.cart as CartItem[]).length).toBe(2)

    act(() => result.current.removeFromCart(1, false))
    const remaining = result.current.cart
    expect(remaining.length).toBe(1)
    expect(remaining[0].productId).toBe(2)
  })
})