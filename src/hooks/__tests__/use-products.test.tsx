// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactNode } from 'react'
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from '../api/use-products'

// ─── Test QueryClient + Wrapper ──────────────────────────────────────────────

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

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockProductsResponse = {
  data: [
    { id: 1, name: 'Café Colombiano', salePrice: 15000, currentStock: 50, isActive: true },
    { id: 2, name: 'Arepa', salePrice: 5000, currentStock: 100, isActive: true },
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
}

const mockProduct = { id: 1, name: 'Café Colombiano', salePrice: 15000 }

// ─── useProducts ─────────────────────────────────────────────────────────────

describe('useProducts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches products when storeId is provided', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProductsResponse),
    })

    const { result } = renderHook(() => useProducts(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockProductsResponse)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products?storeId=1'),
    )
  })

  it('does not fetch when storeId is null', () => {
    const { result } = renderHook(() => useProducts(null), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does not fetch when storeId is undefined', () => {
    const { result } = renderHook(() => useProducts(undefined), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
  })

  it('passes search params correctly', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProductsResponse),
    })

    const params = { search: 'café', categoryId: '3', active: 'true' }
    const { result } = renderHook(() => useProducts(1, params), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string
    expect(calledUrl).toContain('storeId=1')
    expect(calledUrl).toContain('q=caf%C3%A9') // URL-encoded 'café'
    expect(calledUrl).toContain('categoryId=3')
    expect(calledUrl).toContain('active=true')
  })

  it('does not pass "all" categoryId or active params', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProductsResponse),
    })

    const params = { categoryId: 'all', active: 'all' }
    const { result } = renderHook(() => useProducts(1, params), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string
    expect(calledUrl).not.toContain('categoryId')
    expect(calledUrl).not.toContain('active')
  })

  it('handles fetch error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useProducts(1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })

  it('passes limit param when specified', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProductsResponse),
    })

    const params = { limit: 10 }
    const { result } = renderHook(() => useProducts(1, params), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string
    expect(calledUrl).toContain('limit=10')
  })
})

// ─── useCreateProduct ────────────────────────────────────────────────────────

describe('useCreateProduct', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a product via POST', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProduct),
    })

    const { result } = renderHook(() => useCreateProduct(), { wrapper: createWrapper() })

    result.current.mutate({ body: { name: 'Café', salePrice: 15000, storeId: 1 } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockProduct)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('handles creation error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Nombre requerido' }),
    })

    const { result } = renderHook(() => useCreateProduct(), { wrapper: createWrapper() })

    result.current.mutate({ body: {} })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('Nombre requerido')
  })
})

// ─── useUpdateProduct ────────────────────────────────────────────────────────

describe('useUpdateProduct', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates a product via PUT', async () => {
    const updated = { ...mockProduct, name: 'Café Premium' }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(updated),
    })

    const { result } = renderHook(() => useUpdateProduct(), { wrapper: createWrapper() })

    result.current.mutate({ id: 1, body: { name: 'Café Premium' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(updated)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products/1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})

// ─── useDeleteProduct ────────────────────────────────────────────────────────

describe('useDeleteProduct', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes a product via DELETE', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    })

    const { result } = renderHook(() => useDeleteProduct(), { wrapper: createWrapper() })

    result.current.mutate({ id: 1 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('handles delete error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'Producto no encontrado' }),
    })

    const { result } = renderHook(() => useDeleteProduct(), { wrapper: createWrapper() })

    result.current.mutate({ id: 999 })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('Producto no encontrado')
  })
})
