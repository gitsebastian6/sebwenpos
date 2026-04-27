// ---------------------------------------------------------------------------
// Ventify POS — Authenticated fetch wrapper
// ---------------------------------------------------------------------------
// Reads the auth token from localStorage and attaches it to every API request
// as an Authorization: Bearer header.
// ---------------------------------------------------------------------------

import { checkAndRepairAuth } from '@/stores/auth-store'

const STORAGE_KEY = 'pos-auth'

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const state = parsed?.state
    if (!state?.isAuthenticated || !state.token) return null
    return state.token
  } catch {
    return null
  }
}

export type FetchMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface AuthFetchOptions extends RequestInit {
  /** Skip auth header (for public endpoints like login/register) */
  noAuth?: boolean
}

/**
 * Authenticated fetch — wraps the global fetch with Authorization header.
 * Falls back gracefully if no token is available.
 */
export async function authFetch<T = unknown>(
  url: string,
  options: AuthFetchOptions = {}
): Promise<{ data: T | null; ok: boolean; status: number; error?: string }> {
  const { noAuth, headers: customHeaders, ...restOptions } = options

  const headers = new Headers(customHeaders)

  if (!noAuth) {
    const token = getStoredToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  try {
    const res = await fetch(url, {
      ...restOptions,
      headers,
    })

    let data: T | null = null
    const contentType = res.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      data = await res.json()
    }

    // Handle 401 — token expired or invalid
    if (res.status === 401 && !noAuth) {
      // Clear invalid auth state
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
        window.location.reload()
      }
    }

    return {
      data,
      ok: res.ok,
      status: res.status,
      error: data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)
        ? (data as unknown as { error: string }).error
        : undefined,
    }
  } catch (err) {
    return {
      data: null,
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Error de conexión',
    }
  }
}

/**
 * Convenience: GET with auth
 */
export function authGet<T = unknown>(url: string) {
  return authFetch<T>(url, { method: 'GET' })
}

/**
 * Convenience: POST with auth
 */
export function authPost<T = unknown>(url: string, body?: unknown) {
  return authFetch<T>(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Convenience: PUT with auth
 */
export function authPut<T = unknown>(url: string, body?: unknown) {
  return authFetch<T>(url, {
    method: 'PUT',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Convenience: PATCH with auth
 */
export function authPatch<T = unknown>(url: string, body?: unknown) {
  return authFetch<T>(url, {
    method: 'PATCH',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Convenience: DELETE with auth
 */
export function authDelete<T = unknown>(url: string) {
  return authFetch<T>(url, { method: 'DELETE' })
}
