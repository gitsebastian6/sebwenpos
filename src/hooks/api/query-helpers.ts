'use client'

// ---------------------------------------------------------------------------
// Shared helpers for TanStack Query hooks
// ---------------------------------------------------------------------------

/**
 * Normalize API responses that may be a plain array or wrapped in `{ data }`.
 */
export async function unwrapArray<T>(res: Response): Promise<T[]> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message =
      body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
    throw new Error(message)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data ?? [])
}

/**
 * Standard error-throwing helper for mutation responses.
 */
export async function throwIfNotOk(res: Response): Promise<any> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message =
      body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
    throw new Error(message)
  }
  return res.json()
}

/**
 * Generic fetch helper that returns typed JSON for queries.
 */
export async function queryFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message =
      body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
    throw new Error(message)
  }
  return res.json()
}

/**
 * Mutation fetch helper with method, body and optional storeId query param.
 */
export async function mutationFetch<T = any>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
  storeId?: number
): Promise<T> {
  let fullUrl = url
  if (storeId) {
    const sep = url.includes('?') ? '&' : '?'
    fullUrl = `${url}${sep}storeId=${storeId}`
  }
  const res = await fetch(fullUrl, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `Error ${res.status}: ${res.statusText}`
    try {
      const parsed = JSON.parse(text)
      message = parsed?.error ?? parsed?.message ?? message
    } catch {
      /* use default message */
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
