import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { throwIfNotOk, queryFetch, mutationFetch, unwrapArray } from '../api/query-helpers'

// ─── throwIfNotOk ────────────────────────────────────────────────────────────

describe('throwIfNotOk', () => {
  it('returns parsed JSON for 200 response', async () => {
    const response = new Response(JSON.stringify({ id: 1, name: 'Test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await throwIfNotOk(response)
    expect(result).toEqual({ id: 1, name: 'Test' })
  })

  it('returns parsed JSON for 201 response', async () => {
    const response = new Response(JSON.stringify({ created: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await throwIfNotOk(response)
    expect(result).toEqual({ created: true })
  })

  it('throws with error message from response body for 400', async () => {
    const response = new Response(JSON.stringify({ error: 'Bad request data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(throwIfNotOk(response)).rejects.toThrow('Bad request data')
  })

  it('throws with message field when error is absent', async () => {
    const response = new Response(JSON.stringify({ message: 'Validation failed' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(throwIfNotOk(response)).rejects.toThrow('Validation failed')
  })

  it('throws with status text when body has no error or message', async () => {
    const response = new Response(JSON.stringify({}), {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(throwIfNotOk(response)).rejects.toThrow('Error 403: Forbidden')
  })

  it('throws with status text when body is not valid JSON', async () => {
    const response = new Response('not json', {
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(throwIfNotOk(response)).rejects.toThrow('Error 500: Internal Server Error')
  })

  it('handles 401 unauthorized response', async () => {
    const response = new Response(JSON.stringify({ error: 'Token expirado' }), {
      status: 401,
    })

    await expect(throwIfNotOk(response)).rejects.toThrow('Token expirado')
  })

  it('handles 404 not found response', async () => {
    const response = new Response(JSON.stringify({ error: 'No encontrado' }), {
      status: 404,
    })

    await expect(throwIfNotOk(response)).rejects.toThrow('No encontrado')
  })
})

// ─── queryFetch ──────────────────────────────────────────────────────────────

describe('queryFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches URL and returns typed JSON', async () => {
    const mockData = { products: [{ id: 1 }], total: 1 }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await queryFetch<{ products: unknown[] }>('/api/products?storeId=1')
    expect(result).toEqual(mockData)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/products?storeId=1')
  })

  it('throws on non-ok response', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.resolve({ error: 'Algo falló' }),
    })

    await expect(queryFetch('/api/broken')).rejects.toThrow('Algo falló')
  })

  it('throws with status text when error body is missing', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.resolve({}),
    })

    await expect(queryFetch('/api/down')).rejects.toThrow('Error 503: Service Unavailable')
  })
})

// ─── mutationFetch ───────────────────────────────────────────────────────────

describe('mutationFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends POST with JSON body', async () => {
    const mockResponse = { id: 1, name: 'Created' }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await mutationFetch('/api/products', 'POST', { name: 'Test Product' })
    expect(result).toEqual(mockResponse)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test Product' }),
      }),
    )
  })

  it('sends PUT request', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ updated: true }),
    })

    await mutationFetch('/api/products/1', 'PUT', { name: 'Updated' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products/1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('sends DELETE without body', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ deleted: true }),
    })

    await mutationFetch('/api/products/1', 'DELETE')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products/1',
      expect.objectContaining({
        method: 'DELETE',
        body: undefined,
      }),
    )
  })

  it('appends storeId as query parameter', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })

    await mutationFetch('/api/products', 'POST', { name: 'Test' }, 5)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products?storeId=5',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('appends storeId with & when URL already has query params', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })

    await mutationFetch('/api/products?active=true', 'POST', {}, 3)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/products?active=true&storeId=3',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns undefined for 204 No Content', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 204,
    })

    const result = await mutationFetch('/api/products/1', 'DELETE')
    expect(result).toBeUndefined()
  })

  it('throws on non-ok response with error message from JSON', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve(JSON.stringify({ error: 'Stock insuficiente' })),
    })

    await expect(mutationFetch('/api/orders', 'POST', {})).rejects.toThrow('Stock insuficiente')
  })

  it('throws with status text when response body is not JSON', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('plain error text'),
    })

    await expect(mutationFetch('/api/orders', 'POST', {})).rejects.toThrow(
      'Error 500: Internal Server Error',
    )
  })

  it('sends Content-Type application/json header', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })

    await mutationFetch('/api/test', 'POST', { foo: 'bar' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
})

// ─── unwrapArray ─────────────────────────────────────────────────────────────

describe('unwrapArray', () => {
  it('returns array when response is a plain array', async () => {
    const data = [{ id: 1 }, { id: 2 }]
    const response = new Response(JSON.stringify(data), {
      ok: true,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await unwrapArray(response)
    expect(result).toEqual(data)
  })

  it('returns data property when response is wrapped in { data }', async () => {
    const items = [{ id: 1 }]
    const response = new Response(JSON.stringify({ data: items, total: 1 }), {
      ok: true,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await unwrapArray(response)
    expect(result).toEqual(items)
  })

  it('returns empty array when data is undefined', async () => {
    const response = new Response(JSON.stringify({ data: undefined }), {
      ok: true,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await unwrapArray(response)
    expect(result).toEqual([])
  })

  it('throws with error message from body on non-ok response', async () => {
    const response = new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(unwrapArray(response)).rejects.toThrow('No autorizado')
  })

  it('throws with message field when error is absent', async () => {
    const response = new Response(JSON.stringify({ message: 'Token inválido' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(unwrapArray(response)).rejects.toThrow('Token inválido')
  })

  it('throws with status text when body is not parseable', async () => {
    const response = new Response('not json', {
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(unwrapArray(response)).rejects.toThrow('Error 500: Internal Server Error')
  })
})
