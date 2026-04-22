// ---------------------------------------------------------------------------
// Ventify POS — Global fetch interceptor
// ---------------------------------------------------------------------------
// Patches window.fetch to automatically inject Authorization: Bearer header
// on every /api/ request. Must be imported early in the app.
// Includes silent token refresh on 401 responses.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Silent token refresh — retries failed requests with a fresh token
// ---------------------------------------------------------------------------
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function attemptTokenRefresh(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    const state = parsed?.state
    if (!state?.token) return false

    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
    })

    if (res.ok) {
      const data = await res.json()
      if (data.token) {
        // Update the stored token in localStorage
        parsed.state.token = data.token
        // Update subscription status from refresh response
        if (data.subscriptionStatus) {
          parsed.state.subscription = {
            ...parsed.state.subscription,
            subscriptionStatus: data.subscriptionStatus,
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        return true
      }
    }

    // If refresh returns 403 with forceLogout, clear auth
    if (res.status === 403) {
      const data = await res.json().catch(() => null)
      if (data?.forceLogout) {
        localStorage.removeItem(STORAGE_KEY)
        window.location.reload()
        return false
      }
    }
  } catch {
    // Refresh failed — fall through to logout
  }
  return false
}

function getOrStartRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  isRefreshing = true
  refreshPromise = attemptTokenRefresh().finally(() => {
    isRefreshing = false
    refreshPromise = null
  })
  return refreshPromise
}

// ---------------------------------------------------------------------------
// Fetch patching — only runs in the browser (not during SSR)
// ---------------------------------------------------------------------------
function initInterceptor() {
  if (typeof window === 'undefined') return
  if ((window as unknown as Record<string, unknown>).__fetchInterceptorPatched) return

  // Store the original fetch
  const originalFetch = window.fetch

  // Patch fetch to inject auth header
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

    // Only intercept /api/ requests
    if (url.includes('/api/')) {
      const token = getStoredToken()
      if (token) {
        const headers = new Headers(init?.headers)

        // Don't override if already set (public endpoints called with noAuth)
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`)
        }

        const newInit = { ...init, headers }

        const response = await originalFetch.call(window, input, newInit)

        // Handle 401 — token expired or invalid (skip auth endpoints)
        if (response.status === 401) {
          // Skip refresh for auth endpoints that are expected to return 401
          if (
            url.includes('/api/auth/login') ||
            url.includes('/api/auth/register') ||
            url.includes('/api/auth/init') ||
            url.includes('/api/auth/refresh')
          ) {
            return response
          }

          // Attempt silent token refresh (deduplicated across concurrent 401s)
          const refreshed = await getOrStartRefresh()

          if (refreshed) {
            // Retry the original request with the new token
            const retryHeaders = new Headers(newInit.headers)
            retryHeaders.set('Authorization', `Bearer ${getStoredToken()}`)
            const retryInit = { ...newInit, headers: retryHeaders }
            return originalFetch.call(window, input, retryInit)
          }

          // Refresh failed — clear auth and reload
          localStorage.removeItem(STORAGE_KEY)
          window.location.reload()
        }

        return response
      }
    }

    return originalFetch.call(window, input, init)
  }

  ;(window as unknown as Record<string, unknown>).__fetchInterceptorPatched = true

  if (process.env.NODE_ENV === 'development') {
    console.log('[Auth] Global fetch interceptor active — Bearer token injected on /api/ requests (with silent refresh)')
  }
}

// Auto-initialize on import (safe for SSR — only patches in browser)
initInterceptor()
