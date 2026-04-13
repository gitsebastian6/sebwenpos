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
      name: 'pos-auth',
      partialize: (state) => ({
        user: state.user,
        store: state.store,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
