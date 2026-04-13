import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: number
  phone: string
  email: string | null
  fullName: string | null
  cedula: string | null
  role: string
}

interface StoreInfo {
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
}

interface AuthState {
  user: AuthUser | null
  store: StoreInfo | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (user: AuthUser, store: StoreInfo, token: string) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  updateStore: (store: StoreInfo) => void
  updateUser: (user: Partial<AuthUser>) => void
}

const STORAGE_KEY = 'pos-auth'

// Validate that stored auth data is structurally valid
function isValidAuthState(data: Record<string, unknown>): boolean {
  if (data.isAuthenticated !== true) return false
  if (!data.user || typeof data.user !== 'object') return false
  if (!data.store || typeof data.store !== 'object') return false
  const store = data.store as Record<string, unknown>
  if (typeof store.id !== 'number' || store.id <= 0) return false
  if (typeof store.name !== 'string' || store.name.length === 0) return false
  return true
}

// Utility: check and clear corrupted auth data from localStorage
// Safe to call before store initialization
export function checkAndRepairAuth(): { isAuthenticated: boolean; storeId: number | null; wasCorrupted: boolean } {
  if (typeof window === 'undefined') return { isAuthenticated: false, storeId: null, wasCorrupted: false }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { isAuthenticated: false, storeId: null, wasCorrupted: false }
    const parsed = JSON.parse(raw)
    const state = parsed?.state
    if (!state || !isValidAuthState(state)) {
      localStorage.removeItem(STORAGE_KEY)
      console.warn('[Auth] Corrupted auth data cleared from localStorage')
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      store: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: (user, store, token) =>
        set({ user, store, token, isAuthenticated: true, isLoading: false }),

      logout: () =>
        set({ user: null, store: null, token: null, isAuthenticated: false, isLoading: false }),

      setLoading: (loading) => set({ isLoading: loading }),

      updateStore: (store) => set({ store }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        store: state.store,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
