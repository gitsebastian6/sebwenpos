'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useAppStore, type AppView } from '@/stores/app-store'
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, SidebarInset, SidebarSeparator } from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import Image from 'next/image'
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
  LogOut,
  Moon,
  Sun,
  Armchair,
  Truck,
  FileBarChart,
  FileText,
  UsersRound,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  PackageSearch,
  AlertTriangle,
  Clock,
  Crown,
  X,
  Store,
  Loader2,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useMemo, useState, useRef, useEffect } from 'react'
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
const PurchasesView = dynamic(() => import('@/components/purchases/purchases-view').then(m => ({ default: m.PurchasesView })), { ssr: false })
const SettingsView = dynamic(() => import('@/components/settings/settings-view').then(m => ({ default: m.SettingsView })), { ssr: false })
const ReportsView = dynamic(() => import('@/components/reports/reports-view').then(m => ({ default: m.ReportsView })), { ssr: false })
const InvoicesView = dynamic(() => import('@/components/invoices/invoices-view').then(m => ({ default: m.InvoicesView })), { ssr: false })
const QuotationsView = dynamic(() => import('@/components/quotations/quotations-view').then(m => ({ default: m.QuotationsView })), { ssr: false })
const EmployeesView = dynamic(() => import('@/components/employees/employees-view').then(m => ({ default: m.EmployeesView })), { ssr: false })
const RolesView = dynamic(() => import('@/components/roles/roles-view').then(m => ({ default: m.RolesView })), { ssr: false })

// ── Menu structure with groups ─────────────────────────

interface MenuItem {
  view: AppView
  label: string
  icon: React.ReactNode
  permission: string
}

const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, permission: 'dashboard' },
      { view: 'pos', label: 'Punto de Venta', icon: <ShoppingCart className="h-4 w-4" />, permission: 'pos' },
      { view: 'tables', label: 'Mesas', icon: <Armchair className="h-4 w-4" />, permission: 'tables' },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { view: 'products', label: 'Productos', icon: <Package className="h-4 w-4" />, permission: 'products' },
      { view: 'customers', label: 'Clientes', icon: <Users className="h-4 w-4" />, permission: 'customers' },
      { view: 'providers', label: 'Proveedores', icon: <Truck className="h-4 w-4" />, permission: 'providers' },
      { view: 'purchases', label: 'Compras', icon: <PackageSearch className="h-4 w-4" />, permission: 'purchases' },
      { view: 'services', label: 'Servicios', icon: <Zap className="h-4 w-4" />, permission: 'services' },
    ],
  },
  {
    title: 'Ventas',
    items: [
      { view: 'orders', label: 'Órdenes', icon: <ClipboardList className="h-4 w-4" />, permission: 'orders' },
      { view: 'invoices', label: 'Facturación', icon: <FileText className="h-4 w-4" />, permission: 'invoices' },
      { view: 'quotations', label: 'Cotizaciones', icon: <FileBarChart className="h-4 w-4" />, permission: 'quotations' },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { view: 'inventory', label: 'Inventario', icon: <Warehouse className="h-4 w-4" />, permission: 'inventory' },
      { view: 'accounting', label: 'Contabilidad', icon: <Calculator className="h-4 w-4" />, permission: 'accounting' },
      { view: 'reports', label: 'Informes', icon: <FileBarChart className="h-4 w-4" />, permission: 'reports' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { view: 'employees', label: 'Empleados', icon: <UsersRound className="h-4 w-4" />, permission: 'manageEmployees' },
      { view: 'roles', label: 'Roles', icon: <ShieldCheck className="h-4 w-4" />, permission: 'manageRoles' },
      { view: 'settings', label: 'Configuración', icon: <Settings className="h-4 w-4" />, permission: 'settings' },
    ],
  },
]

const viewLabels: Record<string, string> = {
  pos: 'Punto de Venta',
  tables: 'Mesas y Comandas',
  services: 'Servicios',
  providers: 'Proveedores',
  purchases: 'Compras',
  reports: 'Informes',
  invoices: 'Facturación Electrónica',
  settings: 'Configuración',
  quotations: 'Cotizaciones',
  employees: 'Empleados',
  roles: 'Roles y Permisos',
}

export function AppShell() {
  const { user, store, logout, hasPermission, subscription, availableStores, switchStore, loadAvailableStores } = useAuthStore()
  const { currentView, setView } = useAppStore()
  const { theme, setTheme } = useTheme()

  // ── Load available stores on mount (for multi-store/sucursal support) ──
  useEffect(() => {
    if (user?.role === 'OWNER') {
      loadAvailableStores()
    }
  }, [user?.role, user?.id])

  // ── Store Switcher ──
  const [showStoreSwitcher, setShowStoreSwitcher] = useState(false)
  const [switchingStore, setSwitchingStore] = useState(false)
  const storeSwitcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (storeSwitcherRef.current && !storeSwitcherRef.current.contains(e.target as Node)) {
        setShowStoreSwitcher(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowStoreSwitcher(false)
    }
    function handleScroll() {
      setShowStoreSwitcher(false)
    }
    if (showStoreSwitcher) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      window.addEventListener('scroll', handleScroll, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
        window.removeEventListener('scroll', handleScroll, true)
      }
    }
  }, [showStoreSwitcher])

  async function handleSwitchStore(storeId: number, storeName: string) {
    if (storeId === store?.id) { setShowStoreSwitcher(false); return }
    setSwitchingStore(true)
    let success = false
    try {
      success = await switchStore(storeId)
    } catch (error) {
      // Handle subscription-gated errors (EXPIRED/CANCELLED)
      if (error instanceof Error) {
        toast.error(error.message, { duration: 5000 })
      } else {
        toast.error('Error al cambiar de sucursal')
      }
    }
    setSwitchingStore(false)
    setShowStoreSwitcher(false)
    if (success) {
      toast.success(`Cambiado a "${storeName}"`)
    } else {
      toast.error('Error al cambiar de sucursal')
    }
  }

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

  const isOwner = user?.role === 'OWNER'
  const headerTitle = viewLabels[currentView] || currentView.charAt(0).toUpperCase() + currentView.slice(1)

  // ── Subscription banner logic ──
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const subStatus = subscription?.subscriptionStatus
  const daysLeft = subscription?.daysRemaining
  const graceDaysLeft = subscription?.graceDaysRemaining
  const planName = subscription?.planName

  // Determine banner config
  const banner = useMemo(() => {
    if (!subStatus || !subscription?.hasSubscription) return null
    // PAST_DUE: red, urgent, always show
    if (subStatus === 'PAST_DUE') return {
      type: 'past_due' as const,
      variant: 'destructive' as const,
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      title: 'Suscripción vencida',
      desc: graceDaysLeft != null
        ? `Tienes ${graceDaysLeft} día${graceDaysLeft !== 1 ? 's' : ''} de gracia. Renueva para evitar la pérdida de acceso.`
        : 'Tu período de gracia está activo. Renueva tu plan para continuar usando Ventify.',
      dismissible: false,
    }
    // Trial with few days: amber/red
    if (subStatus === 'TRIAL' && daysLeft != null && daysLeft <= 3) return {
      type: 'trial_urgent' as const,
      variant: 'destructive' as const,
      icon: <Clock className="h-4 w-4 shrink-0" />,
      title: `Trial: ${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`,
      desc: 'Tu prueba gratuita está por terminar. Suscríbete a un plan para no perder tus datos.',
      dismissible: true,
    }
    // Trial with 5 or fewer days: amber
    if (subStatus === 'TRIAL' && daysLeft != null && daysLeft <= 5) return {
      type: 'trial_warning' as const,
      variant: 'outline' as const,
      icon: <Clock className="h-4 w-4 shrink-0 text-amber-500" />,
      title: `Trial: ${daysLeft} días restantes`,
      desc: `Estás en modo prueba del plan ${planName || 'Trial'}.`,
      dismissible: true,
    }
    // Active with few days remaining: gentle reminder
    if (subStatus === 'ACTIVE' && daysLeft != null && daysLeft <= 3) return {
      type: 'expiring_soon' as const,
      variant: 'outline' as const,
      icon: <Clock className="h-4 w-4 shrink-0 text-amber-500" />,
      title: `${planName}: ${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`,
      desc: 'Tu suscripción está por vencer. Renueva para evitar interrupciones.',
      dismissible: true,
    }
    return null
  }, [subStatus, daysLeft, graceDaysLeft, planName, subscription?.hasSubscription])

  const showBanner = banner && !bannerDismissed

  return (
    <SidebarProvider>
      <Sidebar>
        {/* ── Sidebar Header ── */}
        <SidebarHeader className="p-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-background animate-[logo-pulse_3s_ease-in-out_infinite]">
              <Image src="/logo.png" alt="Ventify" width={44} height={44} className="object-contain animate-[logo-float_4s_ease-in-out_infinite,logo-glow_3s_ease-in-out_infinite]" />
            </div>
            <div className="min-w-0 flex-1">
              {isOwner ? (
                <div className="relative" ref={storeSwitcherRef}>
                  <button
                    onClick={() => setShowStoreSwitcher(!showStoreSwitcher)}
                    className="flex items-center gap-1 w-full text-left group focus:outline-none"
                  >
                    <h2 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{store?.name}</h2>
                    {switchingStore ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-200 ${showStoreSwitcher ? 'rotate-180' : ''}`} />}
                  </button>
                  {showStoreSwitcher && (
                    <div className="absolute top-full left-0 mt-1 z-[9999] w-60 rounded-lg border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-top-1 duration-150">
                      {availableStores.length > 1 ? (
                        <>
                          <div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                            Sucursales ({availableStores.length})
                          </div>
                          {availableStores.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleSwitchStore(s.id, s.name)}
                              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors ${
                                s.id === store?.id
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'hover:bg-accent'
                              } ${switchingStore ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              <Store className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate flex-1">{s.name}</span>
                              {s.isMain && <Badge variant="secondary" className="text-[9px] px-1 h-4 shrink-0">Principal</Badge>}
                              {s.id === store?.id && <span className="text-[10px] text-primary shrink-0">●</span>}
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-4 text-center">
                          <Store className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1.5" />
                          <p className="text-xs text-muted-foreground font-medium">No tienes sucursales</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Solo tienes la tienda principal</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <h2 className="font-semibold text-sm truncate">{store?.name}</h2>
              )}
              <p className="text-[11px] text-muted-foreground truncate">{user?.fullName}</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarSeparator className="mx-3 w-auto" />

        {/* ── Subscription Status Badge ── */}
        {subscription?.hasSubscription && subStatus && (
          <div className="mx-3 mt-1">
            {subStatus === 'PAST_DUE' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-[10px] font-semibold text-red-500">Vencida</span>
              </div>
            ) : subStatus === 'TRIAL' ? (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
                daysLeft != null && daysLeft <= 3
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-amber-500/10 border border-amber-500/20'
              }`}>
                <Crown className={`h-3 w-3 ${daysLeft != null && daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`} />
                <span className={`text-[10px] font-semibold ${daysLeft != null && daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`}>
                  Trial{daysLeft != null ? ` · ${daysLeft}d` : ''}
                </span>
              </div>
            ) : subStatus === 'ACTIVE' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <Crown className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-500">
                  {planName || 'Activo'}{daysLeft != null ? ` · ${daysLeft}d` : ''}
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Sidebar Menu ── */}
        <SidebarContent className="px-2 py-1">
          {menuGroups.map((group) => {
            const visibleItems = group.items.filter((item) => hasPermission(item.permission))
            if (visibleItems.length === 0) return null
            return (
              <SidebarGroup key={group.title} className="py-1">
                <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={currentView === item.view}
                        onClick={() => setView(item.view)}
                        className="rounded-lg h-9 gap-3 px-3 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium data-[active=true]:shadow-sm"
                      >
                        <span className="data-[active=true]:text-primary">{item.icon}</span>
                        <span>{item.label}</span>
                        {currentView === item.view && (
                          <ChevronRight className="h-3.5 w-3.5 ml-auto text-primary/60" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )
          })}
        </SidebarContent>

        {/* ── Sidebar Footer ── */}
        <SidebarFooter className="p-3 pt-2">
          <SidebarSeparator className="mb-3 mx-0 w-auto" />
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border">
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate">{user?.fullName || 'Usuario'}</p>
                <Badge
                  variant="secondary"
                  className={`shrink-0 text-[9px] px-1.5 py-0 h-4 font-semibold ${
                    isOwner
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
                  }`}
                >
                  {isOwner ? 'Propietario' : 'Empleado'}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate font-mono">{user?.cedula || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2.5">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 flex-1 justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Cambiar tema visual</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 flex-1 justify-start gap-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Cerrar sesión
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Salir del sistema</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* ── Subscription Banner (top of content area) ── */}
        {showBanner && banner && (
          <div className={`border-b px-4 sm:px-6 py-2.5 ${
            banner.variant === 'destructive'
              ? 'bg-red-500/5 border-red-500/20'
              : 'bg-amber-500/5 border-amber-500/20'
          }`}
          >
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              {banner.icon}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${
                  banner.variant === 'destructive' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {banner.title}
                </p>
                <p className={`text-[11px] mt-0.5 ${
                  banner.variant === 'destructive' ? 'text-red-500/80 dark:text-red-300/70' : 'text-amber-600/70 dark:text-amber-300/60'
                }`}>
                  {banner.desc}
                </p>
              </div>
              {banner.dismissible && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 hover:bg-transparent"
                  onClick={() => setBannerDismissed(true)}
                  aria-label="Cerrar aviso"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                className={`shrink-0 h-7 text-[11px] ${
                  banner.variant === 'destructive'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
                onClick={() => setView('settings')}
              >
                Renovar Plan
              </Button>
            </div>
          </div>
        )}

        {/* ── Top Header ── */}
        <header className="flex h-14 items-center gap-3 sm:gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6 sticky top-0 z-10">
          <SidebarTrigger className="hover:bg-accent" />
          <div className="h-5 w-px bg-border" />
          <h1 className="text-sm sm:text-base font-semibold tracking-tight">
            {headerTitle}
          </h1>
        </header>

        {/* ── Main Content ── */}
        <main className={`flex-1 min-w-0 ${currentView === 'pos' ? 'overflow-hidden' : 'overflow-auto'} p-4 sm:p-6`}>
          <ViewRouter key={store?.id} currentView={currentView} />
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
    case 'purchases': return <PurchasesView />
    case 'orders': return <OrdersView />
    case 'invoices': return <InvoicesView />
    case 'quotations': return <QuotationsView />
    case 'inventory': return <InventoryView />
    case 'accounting': return <AccountingView />
    case 'services': return <ServicesView />
    case 'reports': return <ReportsView />
    case 'employees': return <EmployeesView />
    case 'roles': return <RolesView />
    case 'settings': return <SettingsView />
    default: return <DashboardView />
  }
}
