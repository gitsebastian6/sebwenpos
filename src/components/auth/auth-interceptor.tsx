'use client'

import { useEffect } from 'react'

/**
 * AuthInterceptor — initializes the global fetch interceptor
 * that injects the Authorization: Bearer token on all /api/ requests.
 *
 * The interceptor module is safe for synchronous import (SSR-safe).
 * It auto-initializes when imported in the browser.
 */
export function AuthInterceptor() {
  useEffect(() => {
    // Dynamic import as a safety net — ensures the interceptor
    // is loaded even if the direct import in layout didn't run yet.
    // The module has an idempotency guard so double-init is safe.
    import('@/lib/auth-interceptor').catch(() => {
      // Interceptor failed to load — auth won't work, but app still loads
    })
  }, [])

  return null
}
