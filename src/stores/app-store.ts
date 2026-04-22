import { create } from 'zustand'

export type AppView =
  | 'dashboard'
  | 'pos'
  | 'tables'
  | 'products'
  | 'customers'
  | 'providers'
  | 'purchases'
  | 'orders'
  | 'invoices'
  | 'inventory'
  | 'accounting'
  | 'services'
  | 'reports'
  | 'settings'
  | 'quotations'
  | 'employees'
  | 'roles'

interface AppState {
  currentView: AppView
  sidebarOpen: boolean
  setView: (view: AppView) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>()((set) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  setView: (view) => set({ currentView: view }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))
