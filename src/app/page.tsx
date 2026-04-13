'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useAuthStore, checkAndRepairAuth } from '@/stores/auth-store'
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
const emptySubscribe = () => () => {}
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const store = useAuthStore((s) => s.store)
  const logout = useAuthStore((s) => s.logout)
  const isClient = useIsClient()
  const repaired = useRef(false)

  // On first client mount, check for corrupted auth data and repair it
  useEffect(() => {
    if (isClient && !repaired.current) {
      repaired.current = true
      const { isAuthenticated: valid, wasCorrupted } = checkAndRepairAuth()
      if (wasCorrupted) {
        // If corrupted data was found and cleared, force logout in the store
        logout()
      }
      // If localStorage says authenticated but Zustand hasn't hydrated yet,
      // we wait for Zustand to rehydrate naturally
    }
  }, [isClient, logout])

  // If authenticated but no store after client mount, the session data is
  // corrupted. Logout in an effect (NOT during render) to avoid hydration issues.
  useEffect(() => {
    if (isClient && isAuthenticated && !store) {
      // Give Zustand persist a brief moment to rehydrate
      const timer = setTimeout(() => {
        const currentStore = useAuthStore.getState().store
        if (!currentStore) {
          useAuthStore.getState().logout()
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isClient, isAuthenticated, store])

  // Before client mount (SSR / first hydration tick), always show loading.
  if (!isClient) return <LoadingScreen />

  // After mount, if not authenticated, show login.
  if (!isAuthenticated) return <AuthPage />

  // If authenticated but store is null, show loading briefly.
  if (!store) return <LoadingScreen />

  // store is guaranteed non-null here
  return (
    <QueryProvider>
      <AppShell />
    </QueryProvider>
  )
}
