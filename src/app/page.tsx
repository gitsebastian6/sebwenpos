'use client'

import { useEffect, useRef } from 'react'
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

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const store = useAuthStore((s) => s.store)
  const initialized = useRef(false)

  // Clear loading on mount — Zustand persist handles rehydration synchronously in v5
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      // Small delay ensures persist has rehydrated from localStorage
      const timer = setTimeout(() => {
        const state = useAuthStore.getState()
        if (state.isLoading) {
          state.setLoading(false)
        }
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [])

  if (!isAuthenticated) {
    return <AuthPage />
  }

  if (!store) {
    // Session exists but no store — force logout to show login
    useAuthStore.getState().logout()
    return <AuthPage />
  }

  return (
    <QueryProvider>
      <AppShell />
    </QueryProvider>
  )
}
