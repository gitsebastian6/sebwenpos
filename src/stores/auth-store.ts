import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAppStore } from './app-store'

export interface AuthUser {
  id: number
  cedula: string
  phone: string | null
  email: string | null
  fullName: string | null
  role: string
}

export interface StoreInfo {
  id: number
  name: string
  legalName: string | null
  nit: string | null
  address: string | null
  phone: string | null
  currencyCode: string
  countryCode: string | null
  invoicePrefix?: string | null
  resolutionNumber?: string | null
  resolutionStartDate?: string | null
  resolutionEndDate?: string | null
  resolutionStartNumber?: number | null
  resolutionEndNumber?: number | null
  invoiceTestMode?: boolean
  // Facturación Electrónica Híbrida
  invoiceEnabled?: boolean
  invoiceProvider?: string
  certificateUploaded?: boolean
  softwareId?: string | null
  softwarePin?: string | null
  providerConfig?: string
  // DIVIPOLA location
  divipolaCode?: string | null
  cityName?: string | null
}

export interface SubscriptionInfo {
  hasSubscription: boolean
  subscriptionStatus: string | null
  subscriptionId: number | null
  planId: number | null
  planName: string | null
  planPrice: number | null
  startDate: string | null
  endDate: string | null
  trialEndDate: string | null
  graceEndDate: string | null
  graceDaysRemaining: number | null
  billingPeriod: string | null
  daysRemaining: number | null
  planLimits: {
    maxEmployees: number | null
    maxProducts: number | null
    features: Record<string, boolean>
  } | null
}

export interface AvailableStore {
  id: number
  name: string
  isMain: boolean
}

interface AuthState {
  user: AuthUser | null
  store: StoreInfo | null
  token: string | null
  permissions: Record<string, boolean>
  isSuperAdmin: boolean
  isAuthenticated: boolean
  isLoading: boolean
  subscription: SubscriptionInfo | null
  availableStores: AvailableStore[]
  login: (user: AuthUser, store: StoreInfo | null, token: string, permissions?: Record<string, boolean>, isSuperAdmin?: boolean, subscription?: SubscriptionInfo | null, availableStores?: AvailableStore[] | null) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  updateStore: (store: StoreInfo) => void
  updateUser: (user: Partial<AuthUser>) => void
  updateSubscription: (subscription: SubscriptionInfo) => void
  hasPermission: (module: string) => boolean
  switchStore: (storeId: number) => Promise<boolean>
  loadAvailableStores: () => Promise<void>
}

const STORAGE_KEY = 'pos-auth'

// Validar que los datos almacenados sean válidos
function isValidAuthState(data: Record<string, unknown>): boolean {
  if (data.isAuthenticated !== true) return false
  if (!data.user || typeof data.user !== 'object') return false
  const user = data.user as Record<string, unknown>
  if (typeof user.role !== 'string' || user.role.length === 0) return false
  // Super Admin no necesita tienda
  if (user.role === 'SUPER_ADMIN') return true
  if (!data.store || typeof data.store !== 'object') return false
  const store = data.store as Record<string, unknown>
  if (typeof store.id !== 'number' || store.id <= 0) return false
  if (typeof store.name !== 'string' || store.name.length === 0) return false
  return true
}

// Utilidad: verificar y reparar datos corruptos
export function checkAndRepairAuth(): { isAuthenticated: boolean; storeId: number | null; wasCorrupted: boolean } {
  if (typeof window === 'undefined') return { isAuthenticated: false, storeId: null, wasCorrupted: false }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { isAuthenticated: false, storeId: null, wasCorrupted: false }
    const parsed = JSON.parse(raw)
    const state = parsed?.state
    if (!state || !isValidAuthState(state)) {
      localStorage.removeItem(STORAGE_KEY)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Auth] Datos corruptos eliminados de localStorage')
      }
      return { isAuthenticated: false, storeId: null, wasCorrupted: true }
    }
    return {
      isAuthenticated: true,
      storeId: (state.store as Record<string, unknown>)?.id as number ?? null,
      wasCorrupted: false,
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return { isAuthenticated: false, storeId: null, wasCorrupted: true }
  }
}

// Permisos por defecto (owner tiene todo)
const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  dashboard: true, pos: true, tables: true, products: true,
  customers: true, providers: true, orders: true, invoices: true,
  inventory: true, accounting: true, services: true, reports: true,
  settings: true, quotations: true, manageEmployees: true, manageRoles: true,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      store: null,
      token: null,
      permissions: {},
      isSuperAdmin: false,
      isAuthenticated: false,
      isLoading: false,
      subscription: null,
      availableStores: [],

      login: (user, store, token, permissions, isSuperAdmin = false, subscription = null, availableStores = null) =>
        set({
          user, store, token,
          permissions: permissions || DEFAULT_PERMISSIONS,
          isSuperAdmin,
          isAuthenticated: true, isLoading: false,
          subscription,
          availableStores: availableStores || [],
        }),

      logout: () => {
        // Reset app view to dashboard on logout
        try { useAppStore.getState().setView('dashboard') } catch { /* ignore circular dependency during SSR */ }
        set({
          user: null, store: null, token: null,
          permissions: {}, isSuperAdmin: false,
          isAuthenticated: false, isLoading: false,
          subscription: null,
          availableStores: [],
        })
      },

      setLoading: (loading) => set({ isLoading: loading }),

      updateStore: (store) => set({ store }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),

      updateSubscription: (subscription) => set({ subscription }),

      switchStore: async (storeId: number) => {
        try {
          const res = await fetch('/api/auth/switch-store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId }),
          })
          if (!res.ok) {
            // Handle subscription-gated responses
            const errData = await res.json().catch(() => null)
            if (errData?.subscriptionStatus === 'EXPIRED' || errData?.subscriptionStatus === 'CANCELLED') {
              throw new Error(errData.error || 'Suscripción expirada de esta sucursal')
            }
            return false
          }
          const data = await res.json()
          if (data.store && data.token) {
            set({
              store: data.store,
              token: data.token,
              permissions: data.permissions || DEFAULT_PERMISSIONS,
              subscription: data.subscription || null,
              availableStores: data.availableStores || get().availableStores,
            })
            // M2 FIX: Reset to Dashboard after store switch
            try { useAppStore.getState().setView('dashboard') } catch { /* ignore */ }
            // C2 FIX: Invalidate TanStack Query cache to prevent stale data from previous store
            try {
              const { QueryClient } = await import('@tanstack/react-query')
              // The QueryClient is managed by the provider — we trigger refetch via a custom event
              window.dispatchEvent(new CustomEvent('ventify:invalidate-queries'))
            } catch { /* TanStack Query may not be loaded yet */ }
            return true
          }
          return false
        } catch (error) {
          // Re-throw subscription errors so the UI can show them as toasts
          if (error instanceof Error && (error.message.includes('expirada') || error.message.includes('cancelada'))) {
            throw error
          }
          return false
        }
      },

      loadAvailableStores: async () => {
        try {
          const res = await fetch('/api/stores/available')
          if (!res.ok) return
          const data = await res.json()
          if (Array.isArray(data.stores)) {
            set({ availableStores: data.stores })
          }
        } catch {
          // silent
        }
      },

      hasPermission: (module: string) => {
        // Super Admin tiene permisos completos
        if (get().isSuperAdmin) return true
        // El owner siempre tiene permisos completos
        if (get().user?.role === 'OWNER') return true
        // Empleados revisan sus permisos
        return !!get().permissions[module]
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        store: state.store,
        token: state.token,
        permissions: state.permissions,
        isSuperAdmin: state.isSuperAdmin,
        isAuthenticated: state.isAuthenticated,
        subscription: state.subscription,
        availableStores: state.availableStores,
      }),
    }
  )
)
