'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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

function StoreRecoveryScreen({ onLogout }: { onLogout: () => void }) {
  const [recovering, setRecovering] = useState(false)

  const tryRecover = useCallback(async () => {
    setRecovering(true)
    try {
      const state = useAuthStore.getState()
      if (!state.user?.id) {
        onLogout()
        return
      }
      const res = await fetch(`/api/stores?userId=${state.user.id}`)
      if (res.ok) {
        const stores = await res.json()
        if (Array.isArray(stores) && stores.length > 0) {
          const store = stores[0]
          // Restore session with store info
          useAuthStore.getState().login(state.user!, store, state.token!)
          return
        }
      }
      // Recovery failed
      onLogout()
    } catch {
      onLogout()
    } finally {
      setRecovering(false)
    }
  }, [onLogout])

  // Auto-recover on mount
  useEffect(() => {
    tryRecover()
  }, [tryRecover])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
        <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <div className="h-8 w-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-lg font-semibold">Recuperando sesión...</h2>
        <p className="text-sm text-muted-foreground">
          {recovering
            ? 'Restaurando la información de tu tienda.'
            : 'No se pudo recuperar la sesión. Intenta iniciar sesión nuevamente.'}
        </p>
        {!recovering && (
          <button
            onClick={onLogout}
            className="mt-2 px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors"
          >
            Iniciar Sesión
          </button>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const { isAuthenticated, isLoading, store, _hasHydrated } = useAuthStore()
  const initialized = useRef(false)

  // Fallback: ensure loading is cleared after hydration timeout
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      const timer = setTimeout(() => {
        const state = useAuthStore.getState()
        if (state.isLoading) {
          state.setLoading(false)
        }
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [])

  // Still loading or waiting for hydration
  if (isLoading || (!_hasHydrated && isAuthenticated)) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <AuthPage />
  }

  // Authenticated but no store info — auto-recover
  if (!store) {
    return (
      <StoreRecoveryScreen
        onLogout={() => useAuthStore.getState().logout()}
      />
    )
  }

  return (
    <QueryProvider>
      <AppShell />
    </QueryProvider>
  )
}
