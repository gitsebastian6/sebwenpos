// ---------------------------------------------------------------------------
// Test utilities for TanStack Query hooks
// ---------------------------------------------------------------------------
// @vitest-environment jsdom

import React from 'react'
import { renderHook, type RenderHookResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Create a fresh QueryClient for each test (no cache sharing between tests).
 * Disables retries and sets staleTime to 0 for deterministic test results.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Wrapper component that provides QueryClientProvider to hooks under test.
 */
function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

/**
 * Render a TanStack Query hook with the QueryClientProvider wrapper.
 *
 * Usage:
 *   const { result } = renderQueryHook(() => useProducts(1))
 */
export function renderQueryHook<T>(hook: () => T): RenderHookResult<T, unknown> {
  const wrapper = createWrapper()
  return renderHook(hook, { wrapper })
}

/**
 * Wait for a TanStack Query hook to settle (loading → success/error).
 * Useful for verifying that the hook's fetch was called correctly.
 *
 * Usage:
 *   await waitForQuery(result)
 *   expect(result.current.data).toBeDefined()
 */
export async function waitForQuery<T>(
  result: { current: T },
  timeout = 3000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 50))
    const current = result.current as any
    if (current?.isSuccess || current?.isError || current?.data !== undefined) {
      return
    }
  }
  throw new Error('waitForQuery timed out')
}

/**
 * Create a mock fetch that returns a JSON response.
 * Automatically replaces globalThis.fetch for the duration of a test.
 */
export function mockFetchResponse(data: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/**
 * Create a mock fetch that returns an error response.
 */
export function mockFetchError(message: string, status = 500) {
  return mockFetchResponse({ error: message }, status)
}
