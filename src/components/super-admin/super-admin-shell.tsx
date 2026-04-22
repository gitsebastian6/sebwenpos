'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Store, Plus, Crown, Settings, TrendingUp, Shield,
  LogOut, Moon, Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import type { StoreListItem, StoreOwner, PlanData, StoreDetail, StatsData } from './types'
import { StatsView } from './stats-view'
import { ConfigView } from './config-view'
import { PlansView } from './plans-view'
import { StoresKPICards, StoresTable, CreateStoreDialog, ResetPasswordDialog } from './stores-view'
import { StoreDetailView } from './store-detail-view'

// ---- MAIN COMPONENT ----
export function SuperAdminShell() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useTheme()
  const [stores, setStores] = useState<StoreListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<StoreDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<StoreOwner | null>(null)
  const [currentView, setCurrentView] = useState<'stores' | 'plans' | 'config' | 'stats'>('stores')

  // ── Statistics ──
  const [statsLoading, setStatsLoading] = useState(false)
  const [stats, setStats] = useState<StatsData | null>(null)

  // ── Plans ──
  const [plans, setPlans] = useState<PlanData[]>([])

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/stores')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cargar tiendas'); return }
      setStores(Array.isArray(data) ? data : [])
    } catch { toast.error('Error al cargar tiendas') }
    finally { setLoading(false) }
  }, [])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/super-admin/statistics')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cargar estadísticas'); return }
      setStats(data)
    } catch { toast.error('Error al cargar estadísticas') }
    finally { setStatsLoading(false) }
  }, [])

  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/plans')
      const data = await res.json()
      setPlans(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    loadStores()
    loadPlans()
    fetch('/api/super-admin/plans/seed', { method: 'POST' }).catch(() => {})
  }, [loadStores, loadPlans])

  async function handleViewDetail(storeId: number) {
    setDetailLoading(true)
    setSelectedStore(null)
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}/detail`)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cargar detalle'); return }
      setSelectedStore(data)
    } catch { toast.error('Error de conexión') }
    finally { setDetailLoading(false) }
  }

  async function handleDeleteStore(storeId: number, storeName: string) {
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al eliminar'); return }
      toast.success(data.message || 'Tienda eliminada')
      loadStores()
    } catch { toast.error('Error de conexión') }
  }

  // Computed values for KPIs
  const storeList = Array.isArray(stores) ? stores : []
  const totalStores = storeList.length
  const totalEmployees = storeList.reduce((s, st) => s + (st._count?.employees || 0), 0)
  const totalProducts = storeList.reduce((s, st) => s + (st._count?.products || 0), 0)
  const totalOrders = storeList.reduce((s, st) => s + (st._count?.orders || 0), 0)

  // ---- DETAIL VIEW ----
  if (detailLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-sm text-muted-foreground">Cargando detalle...</p>
      </div>
    )
  }

  if (selectedStore) {
    return (
      <StoreDetailView
        store={selectedStore}
        plans={plans}
        onBack={() => setSelectedStore(null)}
        onResetPassword={(u) => { setSelectedUser(u); setShowResetDialog(true) }}
        onRefresh={(id) => handleViewDetail(id)}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Super Administrador</h2>
            <p className="text-xs text-muted-foreground">Ventify POS · Panel Central</p>
          </div>
        </div>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs font-mono">{user?.cedula || 'SA'}</Badge>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Cambiar tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-2" onClick={() => { logout(); toast.success('Sesión cerrada') }}>
          <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Salir</span>
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {currentView === 'stores' ? 'Panel de Tiendas' : currentView === 'config' ? 'Configuración del Sistema' : currentView === 'stats' ? 'Estadísticas del SaaS' : 'Planes de Suscripción'}
                </h1>
              </div>
              <p className="text-muted-foreground">
                {currentView === 'stores'
                  ? 'Administración centralizada de todos los establecimientos'
                  : currentView === 'config'
                  ? 'Integraciones y configuración global del sistema'
                  : currentView === 'stats'
                  ? 'Métricas globales de la plataforma y rendimiento del negocio'
                  : 'Gestión de planes y precios de suscripción'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center rounded-lg border p-1 bg-muted/50">
                <Button
                  variant={currentView === 'stores' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => setCurrentView('stores')}
                >
                  <Store className="h-3.5 w-3.5" />Tiendas
                </Button>
                <Button
                  variant={currentView === 'plans' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => setCurrentView('plans')}
                >
                  <Crown className="h-3.5 w-3.5" />Planes
                </Button>
                <Button
                  variant={currentView === 'config' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => setCurrentView('config')}
                >
                  <Settings className="h-3.5 w-3.5" />Config
                </Button>
                <Button
                  variant={currentView === 'stats' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => { setCurrentView('stats'); loadStats() }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />Estadísticas
                </Button>
              </div>
              {currentView === 'stores' && (
                <Button className="gap-2 shrink-0 active:scale-[0.98] transition-all" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4" />Nueva Tienda
                </Button>
              )}
            </div>
          </div>

          {/* ---- View Content (with fade transition) ---- */}
          <div key={currentView} className="animate-in fade-in-0 duration-200">

            {/* STORES VIEW */}
            {currentView === 'stores' && (
              <>
                <StoresKPICards
                  totalStores={totalStores}
                  totalEmployees={totalEmployees}
                  totalProducts={totalProducts}
                  totalOrders={totalOrders}
                />
                <StoresTable
                  stores={stores}
                  loading={loading}
                  onViewDetail={handleViewDetail}
                  onResetPassword={(u) => { setSelectedUser(u); setShowResetDialog(true) }}
                  onDeleteStore={handleDeleteStore}
                />
              </>
            )}

            {/* PLANS VIEW */}
            {currentView === 'plans' && (
              <PlansView plans={plans} onPlansChange={loadPlans} />
            )}

            {/* CONFIG VIEW */}
            {currentView === 'config' && (
              <ConfigView />
            )}

            {/* STATS VIEW */}
            {currentView === 'stats' && (
              <StatsView stats={stats} loading={statsLoading} />
            )}
          </div>
        </div>
      </main>

      {/* Create Store Dialog */}
      <CreateStoreDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        plans={plans}
        onSuccess={loadStores}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        selectedUser={selectedUser}
        onSuccess={() => setShowResetDialog(false)}
      />

      <footer className="border-t py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        Ventify POS · Sistema Multi-Tienda · Super Administrador
      </footer>
    </div>
  )
}
