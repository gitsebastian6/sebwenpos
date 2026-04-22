'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect, type ReactNode } from 'react'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  )

  // Listen for custom events that invalidate all queries (e.g., after store switch)
  useEffect(() => {
    function handleInvalidate() {
      queryClient.invalidateQueries()
    }
    window.addEventListener('ventify:invalidate-queries', handleInvalidate)
    return () => window.removeEventListener('ventify:invalidate-queries', handleInvalidate)
  }, [queryClient])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
