'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { AuthPage } from '@/components/auth/auth-page'
import { AppShell } from '@/components/layout/app-shell'

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
  const { isAuthenticated, isLoading } = useAuthStore()
  const initialized = useRef(false)

  // Allow Zustand to hydrate from localStorage on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      const timer = setTimeout(() => {
        useAuthStore.getState().setLoading(false)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <AuthPage />
  }

  return <AppShell />
}
