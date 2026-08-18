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
  | 'expirations'
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
  // Which tab Settings should open on next time it mounts — read once at mount
  // (Settings remounts fresh on every navigation into it) then irrelevant
  // until the next goToSettingsTab call.
  settingsTab: string
  setView: (view: AppView) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  goToSettingsTab: (tab: string) => void
}

export const useAppStore = create<AppState>()((set) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  settingsTab: 'business',
  setView: (view) => set({ currentView: view }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  goToSettingsTab: (tab) => set({ currentView: 'settings', settingsTab: tab }),
}))
