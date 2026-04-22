'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useAuthStore, checkAndRepairAuth } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { AuthPage } from '@/components/auth/auth-page'
import { AppShell } from '@/components/layout/app-shell'
import { SuperAdminShell } from '@/components/super-admin/super-admin-shell'
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
  const userId = useAuthStore((s) => s.user?.id)
  const store = useAuthStore((s) => s.store)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)
  const logout = useAuthStore((s) => s.logout)
  const isClient = useIsClient()
  const repaired = useRef(false)

  // ── Reset view to Dashboard on every new login (different user) ──
  useEffect(() => {
    if (isClient && isAuthenticated && userId) {
      useAppStore.getState().setView('dashboard')
    }
  }, [isClient, userId]) // triggers when userId changes (new login)

  // On first client mount, check for corrupted auth data and repair it
  useEffect(() => {
    if (isClient && !repaired.current) {
      repaired.current = true
      const { wasCorrupted } = checkAndRepairAuth()
      if (wasCorrupted) {
        logout()
      }
    }
  }, [isClient, logout])

  // If authenticated but no store (and not Super Admin), the session data is corrupted
  useEffect(() => {
    if (isClient && isAuthenticated && !store && !isSuperAdmin) {
      const timer = setTimeout(() => {
        const state = useAuthStore.getState()
        if (!state.store && !state.isSuperAdmin) {
          useAuthStore.getState().logout()
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isClient, isAuthenticated, store, isSuperAdmin])

  // Before client mount (SSR / first hydration tick), always show loading.
  if (!isClient) return <LoadingScreen />

  // After mount, if not authenticated, show login.
  if (!isAuthenticated) return <AuthPage />

  // Super Admin → Super Admin Dashboard
  if (isSuperAdmin) return <SuperAdminShell />

  // If authenticated but store is null (shouldn't happen for non-admin), show loading briefly.
  if (!store) return <LoadingScreen />

  // Store Owner or Employee → App Shell
  return (
    <QueryProvider>
      <AppShell />
    </QueryProvider>
  )
}
