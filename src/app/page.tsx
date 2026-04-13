'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { AuthPage } from '@/components/auth/auth-page'
import { AppShell } from '@/components/layout/app-shell'
import { QueryProvider } from '@/providers/query-provider'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Cargando...</p>
      </div>
    </div>
  )
}

// Detect client-side hydration using React's recommended API.
// Returns `false` during SSR and initial hydration (matching server HTML),
// then `true` on all subsequent client renders.
const emptySubscribe = () => () => {}
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const store = useAuthStore((s) => s.store)
  const isClient = useIsClient()

  // If authenticated but no store after client mount, the session data is
  // corrupted. Logout in an effect (NOT during render) to avoid the React
  // anti-pattern that was causing the hydration race bug.
  useEffect(() => {
    if (isClient && isAuthenticated && !store) {
      useAuthStore.getState().logout()
    }
  }, [isClient, isAuthenticated, store])

  // Before client mount (SSR / first hydration tick), always show loading.
  // This prevents hydration mismatches and the store hydration race condition.
  if (!isClient) return <LoadingScreen />

  // After mount, if not authenticated, show login.
  if (!isAuthenticated) return <AuthPage />

  // If authenticated but store is null, show loading briefly.
  // This covers the window between mount and persist rehydration.
  // If persist never delivers a store, the useEffect above will logout.
  if (!store) return <LoadingScreen />

  // store is guaranteed non-null here
  return (
    <QueryProvider>
      <AppShell />
    </QueryProvider>
  )
}
