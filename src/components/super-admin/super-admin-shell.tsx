'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Store, Plus, Crown, Settings, TrendingUp, Shield,
  LogOut, Moon, Sun, Wallet, Users, CircleDollarSign,
  Kanban, List, AlertTriangle,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'
const AiAssistant = dynamic(() => import('@/components/ai-assistant/ai-assistant').then(m => ({ default: m.AiAssistant })), { ssr: false })
import type { StoreOwner } from './types'
import { StatsView } from './stats-view'
import { ConfigView } from './config-view'
import { PlansView } from './plans-view'
import { StoresKPICards, StoresTable, CreateStoreDialog, ResetPasswordDialog } from './stores-view'
import { StoreDetailView } from './store-detail-view'
import { PendingPaymentsView } from './pending-payments-view'
import { LeadsView } from './leads-view'
import { CrmPipelineView } from './crm-pipeline-view'
import { CrmClientDetailView } from './crm-client-detail-view'
import { CrmAlertsView } from './crm-alerts-view'
import { CustomersDebtView } from './customers-debt-view'
import {
  useSuperAdminStores,
  useSuperAdminStatistics,
  useSuperAdminPlans,
  useSuperAdminStoreDetail,
  useSeedPlans,
  useDeleteStoreAdmin,
} from '@/hooks/api/use-super-admin'

// ---- MAIN COMPONENT ----
export function SuperAdminShell() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()

  // ── UI-only state ──
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<StoreOwner | null>(null)
  const [currentView, setCurrentView] = useState<'stores' | 'leads' | 'plans' | 'payments' | 'customers' | 'config' | 'stats'>('stores')
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [crmSubView, setCrmSubView] = useState<'pipeline' | 'lista' | 'alertas'>('pipeline')
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)

  // ── Query hooks ──
  const storesQuery = useSuperAdminStores()
  const statsQuery = useSuperAdminStatistics(currentView === 'stats')
  const plansQuery = useSuperAdminPlans()
  const storeDetailQuery = useSuperAdminStoreDetail(selectedStoreId)

  // ── Mutation hooks ──
  const seedPlans = useSeedPlans()
  const deleteStore = useDeleteStoreAdmin()

  // Seed default plans on mount (fire-and-forget, silent)
  // Only run once — use mutate() directly to avoid re-trigger from seedPlans reference changes
  const hasSeededRef = useState(false)
  useEffect(() => {
    if (!hasSeededRef[0]) {
      hasSeededRef[1](true)
      seedPlans.mutate()
    }
  }, [])

  // ── Derived data from queries ──
  const stores = storesQuery.data ?? []
  const loading = storesQuery.isLoading
  const plans = plansQuery.data ?? []
  const stats = statsQuery.data ?? null
  const statsLoading = statsQuery.isLoading
  const selectedStore = storeDetailQuery.data ?? null
  const detailLoading = storeDetailQuery.isLoading

  // ── Handlers ──
  function handleViewDetail(storeId: number) {
    setSelectedStoreId(storeId)
  }

  function handleDeleteStore(storeId: number, storeName: string) {
    deleteStore.mutate({ id: storeId }, {
      onSuccess: () => toast.success('Tienda eliminada'),
      onError: (err) => toast.error(err.message || 'Error al eliminar'),
    })
  }

  // Computed values for KPIs
  const totalStores = stores.length
  const totalEmployees = stores.reduce((s, st) => s + (st._count?.employees || 0), 0)
  const totalProducts = stores.reduce((s, st) => s + (st._count?.products || 0), 0)
  const totalOrders = stores.reduce((s, st) => s + (st._count?.orders || 0), 0)

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
        onBack={() => setSelectedStoreId(null)}
        onResetPassword={(u) => { setSelectedUser(u); setShowResetDialog(true) }}
        onRefresh={(id) => qc.invalidateQueries({ queryKey: ['super-admin-store-detail', id] })}
      />
    )
  }

  // ---- CRM LEAD DETAIL (Expediente Legal) ----
  if (selectedLeadId) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Expediente Legal</h2>
              <p className="text-xs text-muted-foreground">Sebwen POS · CRM</p>
            </div>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-2" onClick={() => { logout(); toast.success('Sesión cerrada') }}>
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Salir</span>
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            <CrmClientDetailView leadId={selectedLeadId} onBack={() => setSelectedLeadId(null)} />
          </div>
        </main>
      </div>
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
            <p className="text-xs text-muted-foreground">Sebwen POS · Panel Central</p>
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
                  {currentView === 'stores' ? 'Panel de Tiendas' : currentView === 'leads' ? 'CRM · Expediente Legal DIAN' : currentView === 'config' ? 'Configuración del Sistema' : currentView === 'stats' ? 'Estadísticas del SaaS' : currentView === 'payments' ? 'Pagos y Comprobantes' : currentView === 'customers' ? 'Clientes y Cartera' : 'Planes de Suscripción'}
                </h1>
              </div>
              <p className="text-muted-foreground">
                {currentView === 'stores'
                  ? 'Administración centralizada de todos los establecimientos'
                  : currentView === 'leads'
                  ? 'Embudo de ventas y recolección del expediente legal DIAN antes de activar cada cuenta'
                  : currentView === 'config'
                  ? 'Integraciones y configuración global del sistema'
                  : currentView === 'stats'
                  ? 'Métricas globales de la plataforma y rendimiento del negocio'
                  : currentView === 'payments'
                  ? 'Revisa, aprueba o rechaza comprobantes de pago de todos los clientes'
                  : currentView === 'customers'
                  ? 'Clientes y cartera (deuda) de todas las tiendas'
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
                  variant={currentView === 'leads' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => setCurrentView('leads')}
                >
                  <Users className="h-3.5 w-3.5" />CRM
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
                  variant={currentView === 'payments' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => setCurrentView('payments')}
                >
                  <Wallet className="h-3.5 w-3.5" />Pagos
                </Button>
                <Button
                  variant={currentView === 'customers' ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-1.5 h-8 transition-all duration-200"
                  onClick={() => setCurrentView('customers')}
                >
                  <CircleDollarSign className="h-3.5 w-3.5" />Clientes
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
                  onClick={() => setCurrentView('stats')}
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
                  plans={plans}
                  onViewDetail={handleViewDetail}
                  onResetPassword={(u) => { setSelectedUser(u); setShowResetDialog(true) }}
                  onDeleteStore={handleDeleteStore}
                  onOpenLead={setSelectedLeadId}
                />
              </>
            )}

            {/* LEADS / CRM VIEW */}
            {currentView === 'leads' && (
              <div className="space-y-4">
                <div className="flex items-center rounded-lg border p-1 bg-muted/50 w-fit">
                  <Button variant={crmSubView === 'pipeline' ? 'default' : 'ghost'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setCrmSubView('pipeline')}>
                    <Kanban className="h-3.5 w-3.5" />Pipeline
                  </Button>
                  <Button variant={crmSubView === 'lista' ? 'default' : 'ghost'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setCrmSubView('lista')}>
                    <List className="h-3.5 w-3.5" />Lista
                  </Button>
                  <Button variant={crmSubView === 'alertas' ? 'default' : 'ghost'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setCrmSubView('alertas')}>
                    <AlertTriangle className="h-3.5 w-3.5" />Alertas DIAN
                  </Button>
                </div>
                {crmSubView === 'pipeline' && <CrmPipelineView onOpenLead={setSelectedLeadId} />}
                {crmSubView === 'lista' && <LeadsView />}
                {crmSubView === 'alertas' && <CrmAlertsView onOpenLead={setSelectedLeadId} />}
              </div>
            )}

            {/* PLANS VIEW */}
            {currentView === 'plans' && (
              <PlansView plans={plans} onPlansChange={() => qc.invalidateQueries({ queryKey: ['super-admin-plans'] })} />
            )}

            {/* PAYMENTS VIEW */}
            {currentView === 'payments' && (
              <PendingPaymentsView />
            )}

            {/* CUSTOMERS/DEBT VIEW */}
            {currentView === 'customers' && (
              <CustomersDebtView />
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
        onSuccess={() => qc.invalidateQueries({ queryKey: ['super-admin-stores'] })}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        selectedUser={selectedUser}
        onSuccess={() => setShowResetDialog(false)}
      />

      <footer className="border-t py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        Sebwen POS · Sistema Multi-Tienda · Super Administrador
      </footer>

      {/* AI Assistant */}
      <AiAssistant />
    </div>
  )
}
