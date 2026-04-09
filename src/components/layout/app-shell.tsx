'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useAppStore, type AppView } from '@/stores/app-store'
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  ClipboardList,
  Warehouse,
  Calculator,
  Zap,
  Settings,
  Store,
  LogOut,
  Moon,
  Sun,
  Armchair,
  Truck,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

const DashboardView = dynamic(() => import('@/components/dashboard/dashboard-view').then(m => ({ default: m.DashboardView })), { ssr: false })
const POSView = dynamic(() => import('@/components/pos/pos-view').then(m => ({ default: m.POSView })), { ssr: false })
const ProductsView = dynamic(() => import('@/components/products/products-view').then(m => ({ default: m.ProductsView })), { ssr: false })
const CustomersView = dynamic(() => import('@/components/customers/customers-view').then(m => ({ default: m.CustomersView })), { ssr: false })
const OrdersView = dynamic(() => import('@/components/orders/orders-view').then(m => ({ default: m.OrdersView })), { ssr: false })
const InventoryView = dynamic(() => import('@/components/inventory/inventory-view').then(m => ({ default: m.InventoryView })), { ssr: false })
const AccountingView = dynamic(() => import('@/components/accounting/accounting-view').then(m => ({ default: m.AccountingView })), { ssr: false })
const ServicesView = dynamic(() => import('@/components/services/services-view').then(m => ({ default: m.ServicesView })), { ssr: false })
const TablesView = dynamic(() => import('@/components/tables/tables-view').then(m => ({ default: m.TablesView })), { ssr: false })
const ProvidersView = dynamic(() => import('@/components/providers/providers-view').then(m => ({ default: m.ProvidersView })), { ssr: false })
const SettingsView = dynamic(() => import('@/components/settings/settings-view').then(m => ({ default: m.SettingsView })), { ssr: false })

const menuItems: { view: AppView; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { view: 'pos', label: 'Punto de Venta', icon: <ShoppingCart className="h-4 w-4" /> },
  { view: 'tables', label: 'Mesas', icon: <Armchair className="h-4 w-4" /> },
  { view: 'products', label: 'Productos', icon: <Package className="h-4 w-4" /> },
  { view: 'customers', label: 'Clientes', icon: <Users className="h-4 w-4" /> },
  { view: 'providers', label: 'Proveedores', icon: <Truck className="h-4 w-4" /> },
  { view: 'orders', label: 'Órdenes', icon: <ClipboardList className="h-4 w-4" /> },
  { view: 'inventory', label: 'Inventario', icon: <Warehouse className="h-4 w-4" /> },
  { view: 'accounting', label: 'Contabilidad', icon: <Calculator className="h-4 w-4" /> },
  { view: 'services', label: 'Servicios', icon: <Zap className="h-4 w-4" /> },
  { view: 'settings', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
]

export function AppShell() {
  const { user, store, logout } = useAuthStore()
  const { currentView, setView } = useAppStore()
  const { theme, setTheme } = useTheme()

  function handleLogout() {
    logout()
    toast.success('Sesión cerrada')
  }

  const initials = (user?.fullName || user?.phone || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="overflow-hidden">
              <h2 className="font-semibold text-sm truncate">{store?.name}</h2>
              <p className="text-xs text-muted-foreground truncate">{user?.fullName}</p>
            </div>
          </div>
        </SidebarHeader>
        <Separator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menú Principal</SidebarGroupLabel>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    isActive={currentView === item.view}
                    onClick={() => setView(item.view)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="overflow-hidden">
                <p className="text-xs font-medium truncate">{user?.fullName || 'Usuario'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-semibold capitalize">
            {currentView === 'pos' ? 'Punto de Venta' :
             currentView === 'tables' ? 'Mesas y Comandas' :
             currentView === 'services' ? 'Servicios' :
             currentView === 'providers' ? 'Proveedores' :
             currentView === 'settings' ? 'Configuración' :
             menuItems.find(m => m.view === currentView)?.label || 'Dashboard'}
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <ViewRouter currentView={currentView} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ViewRouter({ currentView }: { currentView: AppView }) {
  switch (currentView) {
    case 'dashboard': return <DashboardView />
    case 'pos': return <POSView />
    case 'tables': return <TablesView />
    case 'products': return <ProductsView />
    case 'customers': return <CustomersView />
    case 'providers': return <ProvidersView />
    case 'orders': return <OrdersView />
    case 'inventory': return <InventoryView />
    case 'accounting': return <AccountingView />
    case 'services': return <ServicesView />
    case 'settings': return <SettingsView />
    default: return <DashboardView />
  }
}
