// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactNode } from 'react'
import {
  usePosProducts,
  usePosServices,
  usePosCashRegister,
  usePosRecentSales,
  useCreateOrder,
  useCreateInvoice,
  useReturnOrder,
} from '../api/use-pos'

// ─── Test Wrapper ────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// ─── usePosProducts ──────────────────────────────────────────────────────────

describe('usePosProducts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches active products for POS when storeId provided', async () => {
    const mockProducts = [
      { id: 1, name: 'Café', salePrice: 5000, isActive: true },
      { id: 2, name: 'Jugo', salePrice: 7000, isActive: true },
    ]
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockProducts, pagination: { total: 2 } }),
    })

    const { result } = renderHook(() => usePosProducts(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // unwrapArray behavior: returns data property from wrapper
    expect(result.current.data).toHaveLength(2)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('storeId=1'),
    )
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('active=true'),
    )
  })

  it('handles plain array response (no wrapper)', async () => {
    const mockProducts = [{ id: 1, name: 'Arepa' }]
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProducts),
    })

    const { result } = renderHook(() => usePosProducts(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(1)
  })

  it('does not fetch when storeId is null', () => {
    const { result } = renderHook(() => usePosProducts(null), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('handles fetch error gracefully', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => usePosProducts(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('productos')
  })
})

// ─── usePosServices ──────────────────────────────────────────────────────────

describe('usePosServices', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches active services for POS', async () => {
    const mockServices = [
      { id: 1, name: 'Corte de pelo', price: 25000, isActive: true },
      { id: 2, name: 'Manicure', price: 20000, isActive: false },
    ]
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockServices),
    })

    const { result } = renderHook(() => usePosServices(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should filter out inactive services
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.name).toBe('Corte de pelo')
  })

  it('does not fetch when storeId is null', () => {
    const { result } = renderHook(() => usePosServices(null), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
  })
})

// ─── usePosCashRegister ──────────────────────────────────────────────────────

describe('usePosCashRegister', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches current cash register status', async () => {
    const mockCashRegister = {
      id: 1,
      status: 'OPEN',
      openingBalance: 500000,
      openedAt: new Date().toISOString(),
    }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCashRegister),
    })

    const { result } = renderHook(() => usePosCashRegister(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.status).toBe('OPEN')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cash-register/current'),
    )
  })

  it('does not fetch when storeId is null', () => {
    const { result } = renderHook(() => usePosCashRegister(null), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
  })
})

// ─── usePosRecentSales ───────────────────────────────────────────────────────

describe('usePosRecentSales', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches recent completed sales for today', async () => {
    const mockOrders = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      orderNumber: `ORD-${i + 1}`,
      total: 10000 * (i + 1),
      status: 'COMPLETED',
    }))
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockOrders, pagination: { total: 5 } }),
    })

    const { result } = renderHook(() => usePosRecentSales(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(5)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=COMPLETED'),
    )
  })

  it('limits results to 50', async () => {
    const manyOrders = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      orderNumber: `ORD-${i + 1}`,
    }))
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manyOrders),
    })

    const { result } = renderHook(() => usePosRecentSales(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should slice to max 50
    expect(result.current.data).toHaveLength(50)
  })
})

// ─── useCreateOrder (POS) ────────────────────────────────────────────────────

describe('useCreateOrder (POS)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an order via POST', async () => {
    const mockOrder = {
      id: 1,
      orderNumber: 'ORD-001',
      status: 'COMPLETED',
      total: 25000,
    }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOrder),
    })

    const { result } = renderHook(() => useCreateOrder(), { wrapper: createWrapper() })

    result.current.mutate({
      storeId: 1,
      paymentMethod: 'CASH',
      items: [{ productId: 1, quantity: 2 }],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.orderNumber).toBe('ORD-001')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/orders',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('handles order creation error (no cash register)', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Debes abrir la caja antes de registrar una venta' }),
    })

    const { result } = renderHook(() => useCreateOrder(), { wrapper: createWrapper() })

    result.current.mutate({ storeId: 1, paymentMethod: 'CASH', items: [] })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('caja')
  })

  it('handles insufficient stock error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Stock insuficiente para "Café" (disponible: 3)' }),
    })

    const { result } = renderHook(() => useCreateOrder(), { wrapper: createWrapper() })

    result.current.mutate({ storeId: 1, paymentMethod: 'CASH', items: [{ productId: 1, quantity: 10 }] })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('Stock insuficiente')
  })
})

// ─── useCreateInvoice (POS) ──────────────────────────────────────────────────

describe('useCreateInvoice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an electronic invoice via POST', async () => {
    const mockInvoice = { id: 1, invoiceNumber: 'FE-00000001', status: 'PENDING' }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockInvoice),
    })

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() })

    result.current.mutate({ orderId: 1, storeId: 1 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.invoiceNumber).toBe('FE-00000001')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/invoices',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

// ─── useReturnOrder (POS) ────────────────────────────────────────────────────

describe('useReturnOrder (POS)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('processes a return via POST', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, status: 'RETURNED' }),
    })

    const { result } = renderHook(() => useReturnOrder(), { wrapper: createWrapper() })

    result.current.mutate({
      orderId: 1,
      items: [{ orderItemId: 1, quantity: 1 }],
      reason: 'Producto defectuoso',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/orders/1/return',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('handles return error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'La orden ya fue devuelta' }),
    })

    const { result } = renderHook(() => useReturnOrder(), { wrapper: createWrapper() })

    result.current.mutate({
      orderId: 1,
      items: [{ orderItemId: 1, quantity: 1 }],
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('devuelta')
  })
})
