'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Store, Plus, Building2, Users, Package, ShoppingCart, ClipboardList,
  CreditCard, User, Lock, Eye, EyeOff, Phone, Mail, MapPin, Hash,
  LogOut, Moon, Sun, Shield, Trash2, KeyRound, CalendarDays,
  ChevronRight, ArrowLeft, ArrowRight, FileText, Receipt, Zap, Truck,
  TrendingUp, TrendingDown, DollarSign, AlertCircle, Pencil, Crown,
  Upload, CheckCircle2, XCircle, ImageDown, Download, Clock,
  Search, Filter, Eye as EyeIcon, FileCheck2, Banknote, Wallet,
  CircleDollarSign, ChevronDown, ChevronUp, BadgeCheck, AlertTriangle,
  Settings, MessageCircle, Info, Link2
} from 'lucide-react'
import { useTheme } from 'next-themes'

// ---- Types ----
interface StoreCount {
  employees: number; products: number; orders: number; customers: number
  categories: number; taxRates: number; roles: number; invoices: number
  quotations: number; expenses: number; services: number; providers: number
}

interface StoreOwner {
  id: number; cedula: string; fullName: string | null; email: string | null
  phone: string | null; role: string; createdAt: string
}

interface StoreListItem {
  id: number; name: string; legalName: string | null; nit: string | null
  address: string | null; phone: string | null; currencyCode: string
  countryCode: string | null; createdAt: string; updatedAt: string
  parentStoreId: number | null; parentStore: { name: string } | null
  user: StoreOwner; _count: StoreCount
}

interface PlanData {
  id: number; name: string; description: string | null; price: number
  maxStores: number; maxEmployees: number; maxProducts: number
  features: Record<string, unknown>; sortOrder: number; isActive: boolean
  subscriptionCount: number
}

interface SubscriptionData {
  id: number; storeId: number; planId: number; status: string
  startDate: string; endDate: string | null; trialEndDate: string | null
  cancelReason: string | null; billingPeriod: string; billingPrice: number
  lastBilledAt: string | null; nextBillingAt: string | null
  plan: { id: number; name: string; price: number; description: string | null; maxEmployees: number; maxProducts: number }
}

interface DianInfo {
  invoicePrefix: string | null; resolutionNumber: string | null
  resolutionStartDate: string | null; resolutionEndDate: string | null
  resolutionStartNumber: number | null; resolutionEndNumber: number | null
  invoiceTestMode: boolean | null
}

interface StoreDetail {
  store: StoreListItem & { _count: StoreCount }
  stats: { totalSales: number; totalExpenses: number; ordersByStatus: Record<string, number> }
  employees: Array<{ id: number; position: string | null; isActive: boolean; createdAt: string; user: StoreOwner; role: { id: number; name: string; description: string | null } | null }>
  roles: Array<{ id: number; name: string; description: string | null; permissions: string; isDefault: boolean; isActive: boolean; _count: { employees: number } }>
  taxRates: Array<{ id: number; name: string; code: string; rateType: string; rate: number; applyTo: string; category: string; isActive: boolean; isDefault: boolean; description: string | null }>
  categories: Array<{ id: number; name: string; icon: string | null; _count: { products: number } }>
  products: Array<{ id: number; name: string; salePrice: number; currentStock: number; isActive: boolean; category: { name: string } | null; taxRate: { name: string; rate: number; code: string } | null }>
  customers: Array<{ id: number; name: string; phone: string | null; email: string | null; nit: string | null; totalDebt: number; createdAt: string }>
  orders: Array<{ id: number; orderNumber: string; total: number; status: string; paymentMethod: string; createdAt: string; customer: { name: string } | null; _count: { orderItems: number } }>
  services: Array<{ id: number; name: string; price: number; unit: string; isActive: boolean }>
  providers: Array<{ id: number; name: string; phone: string | null; email: string | null; nit: string | null; isActive: boolean }>
  expenses: Array<{ id: number; category: string; description: string; amount: number; date: string; createdAt: string }>
  subscription: SubscriptionData | null
  dianInfo: DianInfo
  invoiceStats: Array<{ status: string; _count: number }>
}

interface GracePeriodStore {
  storeId: number; storeName: string; storeNit: string | null
  planName: string; planPrice: number
  graceEndDate: string; daysRemaining: number
  endDate: string; daysSinceExpiry: number
}

interface MoraStore {
  storeId: number; storeName: string; storeNit: string | null
  planName: string; planPrice: number
  status: string; endDate: string | null
  daysInMora: number; revenueAtRisk: number
  contactName: string | null; contactPhone: string | null; contactEmail: string | null
}

interface StatsData {
  overview: { totalStores: number; activeStores: number; trialStores: number; pastDueStores: number; expiredStores: number; cancelledStores: number; branches: number }
  subscription: { planBreakdown: Array<{ planId: number; planName: string; price: number; count: number }>; monthlyRevenue: number; annualRevenueEstimate: number; trialCount: number; convertedCount: number; conversionRate: number; pendingReceipts: number }
  mora: { gracePeriodCount: number; moraCount: number; revenueAtRisk: number; gracePeriodStores: GracePeriodStore[]; moraStores: MoraStore[] }
  globalMetrics: { totalOrders: number; totalEmployees: number; totalProducts: number; totalCustomers: number; totalInvoices: number }
  revenue: { totalCollected: number; totalPending: number; monthlyHistory: Array<{ month: string; revenue: number; billing_count: number; pending_amount: number }> }
  monthlyStores: Array<{ month: string; count: number }>
  monthlyOrders: Array<{ month: string; count: number; total_sales: number }>
  monthlyCustomers: Array<{ month: string; count: number }>
  churnByMonth: Array<{ month: string; cancelled: number; reactivated: number; past_due: number }>
  eventTimeline: Array<{ id: number; eventType: string; storeName: string; isBranch: boolean; newValue: string | null; previousValue: string | null; metadata: string; createdAt: string }>
  recentActivity: { newStores: number; newOrders: number; newInvoices: number }
  topStores: Array<{ storeId: number; storeName: string; orderCount: number; totalSales: number }>
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatLimit(val: number): string {
  return val === -1 ? '∞' : val.toLocaleString('es-CO')
}

function getSubscriptionStatusBadge(status: string) {
  switch (status) {
    case 'TRIAL': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20">{status}</Badge>
    case 'ACTIVE': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20">{status}</Badge>
    case 'PAST_DUE': return <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20">{status}</Badge>
    case 'CANCELLED': return <Badge variant="secondary">{status}</Badge>
    case 'EXPIRED': return <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20">{status}</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

const BILLING_PERIODS = [
  { value: 'TRIAL', label: '7 días (Trial)', discount: 0, months: 0 },
  { value: 'MONTHLY', label: '1 mes', discount: 0, months: 1 },
  { value: 'QUARTERLY', label: '3 meses', discount: 5, months: 3 },
  { value: 'SEMI_ANNUAL', label: '6 meses', discount: 10, months: 6 },
  { value: 'ANNUAL', label: '1 año', discount: 15, months: 12 },
]

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
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [form, setForm] = useState({
    ownerCedula: '', ownerPassword: '', ownerFullName: '',
    ownerEmail: '', ownerPhone: '', storeName: '',
    nit: '', legalName: '', address: '', phone: '',
    selectedPlanId: '',
  })
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState('MONTHLY')
  const [showOwnerPassword, setShowOwnerPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  // Receipt upload state for create dialog
  const [createReceiptFile, setCreateReceiptFile] = useState<File | null>(null)
  const [createReceiptUploading, setCreateReceiptUploading] = useState(false)
  const [createReceiptForm, setCreateReceiptForm] = useState({
    amount: '',
    paymentMethod: 'NEQUI',
    reference: '',
    notes: '',
  })
  const [currentView, setCurrentView] = useState<'stores' | 'plans' | 'config' | 'stats'>('stores')
  // ── Statistics ──
  const [statsLoading, setStatsLoading] = useState(false)
  const [stats, setStats] = useState<StatsData | null>(null)
  // ── System config (MessageBird) ──
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [mbConfig, setMbConfig] = useState({ apiKey: '', phoneNumber: '', enabled: false, testMode: false, template: 'Tu código de verificación para Ventify POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.' })
  const [plans, setPlans] = useState<PlanData[]>([])
  const [showEditPlanDialog, setShowEditPlanDialog] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null)
  const [savingPlan, setSavingPlan] = useState(false)
  const [planForm, setPlanForm] = useState({
    name: '', description: '', price: 0,
    maxEmployees: 5, maxProducts: 100,
    sortOrder: 0, isActive: true,
  })

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

  // ── System Config ──
  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const res = await fetch('/api/super-admin/system-config')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cargar configuración'); return }
      setMbConfig({
        apiKey: data.messagebird?.apiKey || '',
        phoneNumber: data.messagebird?.phoneNumber || '',
        enabled: data.messagebird?.enabled || false,
        testMode: data.messagebird?.testMode || false,
        template: data.messagebird?.template || 'Tu código de verificación para Ventify POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.',
      })
    } catch { toast.error('Error de conexión') }
    finally { setConfigLoading(false) }
  }, [])

  async function handleSaveConfig() {
    setConfigSaving(true)
    try {
      const res = await fetch('/api/super-admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messagebird: mbConfig }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      toast.success(data.message || 'Configuración guardada exitosamente')
    } catch { toast.error('Error de conexión') }
    finally { setConfigSaving(false) }
  }

  function updateForm(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  function openEditPlan(plan: PlanData) {
    setEditingPlan(plan)
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      price: plan.price,
      maxEmployees: plan.maxEmployees,
      maxProducts: plan.maxProducts,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
    })
    setShowEditPlanDialog(true)
  }

  async function handleSavePlan() {
    if (!editingPlan) return
    if (!planForm.name || planForm.name.length < 2) { toast.error('Nombre del plan es obligatorio (mín. 2 caracteres)'); return }
    setSavingPlan(true)
    try {
      const res = await fetch(`/api/super-admin/plans/${editingPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planForm),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar plan'); return }
      toast.success(data.message || 'Plan actualizado exitosamente')
      setShowEditPlanDialog(false)
      loadPlans()
    } catch { toast.error('Error de conexión') }
    finally { setSavingPlan(false) }
  }

  async function buildReceiptPayload() {
    const reader = new FileReader()
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        if (base64) resolve(base64)
        else reject(new Error('No se pudo leer el archivo'))
      }
      reader.onerror = () => reject(new Error('Error leyendo archivo'))
      reader.readAsDataURL(createReceiptFile)
    })
    const fileData = await base64Promise
    return {
      fileData,
      fileName: createReceiptFile.name,
      fileSize: createReceiptFile.size,
      fileType: createReceiptFile.type || 'application/octet-stream',
      amount: parseInt(createReceiptForm.amount),
      paymentMethod: createReceiptForm.paymentMethod,
      reference: createReceiptForm.reference || undefined,
      notes: createReceiptForm.notes || undefined,
    }
  }

  async function handleCreateStore() {
    if (!form.ownerCedula || !form.ownerPassword || !form.ownerFullName || !form.storeName) {
      toast.error('Complete los campos obligatorios (*)')
      return
    }
    const selectedPlan = plans.find(p => p.id.toString() === form.selectedPlanId)
    const isPaidPlan = selectedPlan && selectedPlan.price > 0
    if (isPaidPlan && !createReceiptFile) {
      toast.error('Debe adjuntar el comprobante de pago para planes de pago')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/super-admin/stores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          ...form,
          planId: form.selectedPlanId ? parseInt(form.selectedPlanId) : undefined,
          billingPeriod: isPaidPlan ? selectedBillingPeriod : undefined,
          receipt: isPaidPlan && createReceiptFile ? await buildReceiptPayload() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al crear tienda'); return }
      toast.success(data.message || 'Tienda creada exitosamente')

      setShowCreateDialog(false)
      setForm({ ownerCedula: '', ownerPassword: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', storeName: '', nit: '', legalName: '', address: '', phone: '', selectedPlanId: '' })
      setSelectedBillingPeriod('MONTHLY')
      setCreateReceiptFile(null)
      setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
      loadStores()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
    finally { setCreating(false) }
  }

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

  async function handleResetPassword() {
    if (!selectedUser || !newPassword || newPassword.length < 6) { toast.error('Contraseña mín. 6 caracteres'); return }
    try {
      const res = await fetch('/api/super-admin/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al resetear'); return }
      toast.success(data.message)
      setShowResetDialog(false); setNewPassword(''); setSelectedUser(null)
    } catch { toast.error('Error de conexión') }
  }

  // Stats
  const storeList = Array.isArray(stores) ? stores : []
  const totalStores = storeList.length
  const totalEmployees = storeList.reduce((s, st) => s + (st._count?.employees || 0), 0)
  const totalProducts = storeList.reduce((s, st) => s + (st._count?.products || 0), 0)
  const totalOrders = storeList.reduce((s, st) => s + (st._count?.orders || 0), 0)

  // ---- DETAIL VIEW ----
  if (selectedStore) {
    return <StoreDetailView store={selectedStore} plans={plans} onBack={() => setSelectedStore(null)} onResetPassword={(u) => { setSelectedUser(u); setNewPassword(''); setShowResetDialog(true) }} onRefresh={(id) => handleViewDetail(id)} />
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
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
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
                  onClick={() => { setCurrentView('config'); loadConfig() }}
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

          {/* KPI Cards - only show in stores view */}
          {currentView === 'stores' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 border-l-4 border-l-emerald-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                    <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div><p className="text-2xl font-bold">{totalStores}</p><p className="text-xs text-muted-foreground">Tiendas</p></div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div><p className="text-2xl font-bold">{totalEmployees}</p><p className="text-xs text-muted-foreground">Empleados</p></div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-amber-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                    <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div><p className="text-2xl font-bold">{totalProducts}</p><p className="text-xs text-muted-foreground">Productos</p></div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-purple-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-purple-100 dark:bg-purple-500/15 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div><p className="text-2xl font-bold">{totalOrders}</p><p className="text-xs text-muted-foreground">Órdenes</p></div>
                </div>
              </Card>
            </div>
          )}

          {/* PLANS VIEW */}
          {currentView === 'plans' && (
            <Card className="rounded-xl border-border/50">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Crown className="h-5 w-5 text-amber-500" />
                      Planes de Suscripción
                    </CardTitle>
                    <CardDescription>Administre los planes disponibles para las tiendas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {plans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Crown className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
                    <p className="text-muted-foreground font-medium">No hay planes configurados</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Los planes se crearán automáticamente</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Plan</TableHead>
                          <TableHead className="min-w-[120px] text-right">Precio</TableHead>
                          <TableHead className="min-w-[160px]">Límites</TableHead>
                          <TableHead className="min-w-[200px]">Características</TableHead>
                          <TableHead className="text-center min-w-[80px]">Suscriptores</TableHead>
                          <TableHead className="text-center min-w-[80px]">Estado</TableHead>
                          <TableHead className="text-right min-w-[80px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plans.sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => (
                          <TableRow key={plan.id} className="group hover:bg-muted/30">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="h-9 w-9 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center shrink-0">
                                  <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm">{plan.name}</p>
                                  {plan.description && <p className="text-xs text-muted-foreground truncate">{plan.description}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-mono font-bold">{formatCOP(plan.price)}</span>
                              <span className="text-xs text-muted-foreground"> /mes</span>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5 text-xs">
                                <div className="flex items-center gap-1"><Users className="h-3 w-3 text-muted-foreground" />Empleados: <span className="font-medium">{formatLimit(plan.maxEmployees)}</span></div>
                                <div className="flex items-center gap-1"><Package className="h-3 w-3 text-muted-foreground" />Productos: <span className="font-medium">{formatLimit(plan.maxProducts)}</span></div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(plan.features).map(([key, val]) => (
                                  <Badge
                                    key={key}
                                    variant={val === true ? 'default' : 'outline'}
                                    className={`text-[10px] ${val === true ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : 'opacity-50'}`}
                                  >
                                    {key}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">{plan.subscriptionCount}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={plan.isActive ? 'default' : 'secondary'}
                                className={plan.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}
                              >
                                {plan.isActive ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Editar plan"
                                onClick={() => openEditPlan(plan)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STORES VIEW - Stores Table */}
          {currentView === 'stores' && (
            <Card className="rounded-xl border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Tiendas Registradas</CardTitle>
                <CardDescription>Haga clic en &quot;Detalles&quot; para ver toda la información de cada establecimiento</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : stores.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Store className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
                    <p className="text-muted-foreground font-medium">No hay tiendas registradas</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Cree la primera tienda para comenzar</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[180px]">Tienda</TableHead>
                          <TableHead className="min-w-[140px]">Propietario</TableHead>
                          <TableHead className="min-w-[100px]">NIT</TableHead>
                          <TableHead className="min-w-[100px]">Teléfono</TableHead>
                          <TableHead className="text-center min-w-[60px]">Emp.</TableHead>
                          <TableHead className="text-center min-w-[60px]">Prod.</TableHead>
                          <TableHead className="text-center min-w-[60px]">Ord.</TableHead>
                          <TableHead className="text-center min-w-[60px]">Clien.</TableHead>
                          <TableHead className="min-w-[160px]">Plan / Estado</TableHead>
                          <TableHead className="min-w-[90px]">Creada</TableHead>
                          <TableHead className="text-right min-w-[160px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stores.map((s) => (
                          <TableRow key={s.id} className="group hover:bg-muted/30">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                  <Building2 className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate flex items-center">{s.name}{s.parentStoreId && (<Badge variant="outline" className="text-[10px] ml-1.5 text-violet-500 border-violet-500/30">Sucursal</Badge>)}</p>
                                  {s.address && <p className="text-xs text-muted-foreground truncate">{s.address}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{s.user.fullName || s.user.cedula}</p>
                                <p className="text-xs text-muted-foreground font-mono">{s.user.cedula}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {s.nit ? <Badge variant="outline" className="text-xs font-mono">{s.nit}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">{s.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">{s._count.employees}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">{s._count.products}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">{s._count.orders}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">{s._count.customers}</Badge>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const sub = (s as StoreListItem & { subscription?: (SubscriptionData & { inheritedFrom?: string }) | null }).subscription
                                if (!sub) return <Badge variant="secondary" className="text-xs opacity-60">Sin plan</Badge>
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <Badge variant="outline" className="text-xs">
                                        <Crown className="h-3 w-3 mr-1 text-amber-500" />
                                        {sub.plan.name}
                                      </Badge>
                                      {sub.inheritedFrom && (
                                        <Badge variant="secondary" className="text-[10px] text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400 gap-0.5">
                                          <Link2 className="h-2.5 w-2.5" />
                                          Heredado
                                        </Badge>
                                      )}
                                    </div>
                                    {getSubscriptionStatusBadge(sub.status)}
                                  </div>
                                )
                              })()}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => handleViewDetail(s.id)}>
                                  <Eye className="h-3.5 w-3.5" /><span className="hidden lg:inline">Detalles</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Resetear contraseña" onClick={() => { setSelectedUser(s.user); setNewPassword(''); setShowResetDialog(true) }}>
                                  <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar tienda">
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="rounded-xl backdrop-blur-sm">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Eliminar &quot;{s.name}&quot;?</AlertDialogTitle>
                                      <AlertDialogDescription>Esta acción eliminará permanentemente la tienda, todos sus empleados, productos, órdenes, clientes y datos asociados. No se puede deshacer.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] transition-all" onClick={() => handleDeleteStore(s.id, s.name)}>Eliminar</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STATS VIEW */}
          {currentView === 'stats' && (
            <>
              {statsLoading ? (
                <div className="flex justify-center py-20">
                  <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !stats ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <TrendingUp className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
                  <p className="text-muted-foreground font-medium">Sin datos disponibles</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Las estadísticas aparecerán cuando haya tiendas registradas</p>
                </div>
              ) : (
                <>
                  {/* Row 1: Platform Overview KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-4 border-l-4 border-l-emerald-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                          <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{stats.overview.totalStores}</p>
                          <p className="text-xs text-muted-foreground">Tiendas Totales</p>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
                          <BadgeCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{stats.overview.activeStores}</p>
                          <p className="text-xs text-muted-foreground">Activas</p>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-amber-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{stats.overview.trialStores}</p>
                          <p className="text-xs text-muted-foreground">En Trial</p>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-violet-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-violet-100 dark:bg-violet-500/15 rounded-lg flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{stats.overview.branches}</p>
                          <p className="text-xs text-muted-foreground">Sucursales</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Row 2: Revenue + Subscription */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="p-4 border-l-4 border-l-green-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-green-100 dark:bg-green-500/15 rounded-lg flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{formatCOP(stats.subscription.monthlyRevenue)}</p>
                          <p className="text-xs text-muted-foreground">Ingreso Mensual Recurrente</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Est. Anual</span>
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCOP(stats.subscription.annualRevenueEstimate)}</span>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-cyan-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-cyan-100 dark:bg-cyan-500/15 rounded-lg flex items-center justify-center">
                          <Zap className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{stats.subscription.trialCount > 0 ? `${stats.subscription.conversionRate}%` : 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">Tasa Trial → Pago</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Trial / Convertidos</span>
                          <span className="text-sm font-semibold">{stats.subscription.trialCount} / {stats.subscription.convertedCount}</span>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-orange-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-orange-100 dark:bg-orange-500/15 rounded-lg flex items-center justify-center">
                          <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{stats.subscription.pendingReceipts}</p>
                          <p className="text-xs text-muted-foreground">Comprobantes Pendientes</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">En Gracia / Mora</span>
                          <span className="text-sm font-semibold">
                            {stats.mora.gracePeriodCount > 0 && <span className="text-amber-600 dark:text-amber-400">{stats.mora.gracePeriodCount}</span>}
                            {stats.mora.gracePeriodCount > 0 && stats.mora.moraCount > 0 && <span className="text-muted-foreground mx-1">/</span>}
                            {stats.mora.moraCount > 0 && <span className="text-red-600 dark:text-red-400">{stats.mora.moraCount}</span>}
                            {stats.mora.gracePeriodCount === 0 && stats.mora.moraCount === 0 && <span className="text-emerald-600 dark:text-emerald-400">0</span>}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Row 2.5: Cobros y Mora Detail */}
                  {(stats.mora.gracePeriodCount > 0 || stats.mora.moraCount > 0) && (
                    <Card className="rounded-xl border-border/50 overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-amber-500" />
                              Cobros y Mora
                            </CardTitle>
                            <CardDescription className="mt-1">Tiendas con pagos pendientes o en mora</CardDescription>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {stats.mora.gracePeriodCount > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                <span className="text-amber-600 dark:text-amber-400 font-medium">{stats.mora.gracePeriodCount} en gracia</span>
                              </div>
                            )}
                            {stats.mora.moraCount > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                                <span className="text-red-600 dark:text-red-400 font-medium">{stats.mora.moraCount} en mora</span>
                              </div>
                            )}
                            {stats.mora.revenueAtRisk > 0 && (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 border">
                                {formatCOP(stats.mora.revenueAtRisk)} en riesgo
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="max-h-72 overflow-y-auto space-y-3">
                          {/* Grace Period Stores */}
                          {stats.mora.gracePeriodStores.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                Período de Gracia (3 días)
                              </p>
                              <div className="space-y-2">
                                {stats.mora.gracePeriodStores.map((store) => (
                                  <div key={store.storeId} className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <div className="h-8 w-8 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold">{store.storeName}</p>
                                          <p className="text-[11px] text-muted-foreground">{store.planName} · {formatCOP(store.planPrice)}/mes</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{store.daysRemaining}d restantes</p>
                                        <p className="text-[10px] text-muted-foreground">Venció hace {store.daysSinceExpiry}d</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Mora Stores */}
                          {stats.mora.moraStores.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5" />
                                En Mora
                              </p>
                              <div className="space-y-2">
                                {stats.mora.moraStores.map((store) => (
                                  <div key={store.storeId} className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2.5">
                                        <div className="h-8 w-8 bg-red-100 dark:bg-red-500/15 rounded-lg flex items-center justify-center">
                                          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold">{store.storeName}</p>
                                          <p className="text-[11px] text-muted-foreground">{store.planName} · {formatCOP(store.planPrice)}/mes</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-bold text-red-600 dark:text-red-400">{store.daysInMora}d en mora</p>
                                        <p className="text-[10px] text-muted-foreground">{store.status === 'EXPIRED' ? 'Expirada' : 'Vencida'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground ml-10">
                                      {store.contactName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{store.contactName}</span>}
                                      {store.contactPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{store.contactPhone}</span>}
                                      {store.contactEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{store.contactEmail}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Row 3: Global Metrics + Subscription Distribution */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Global Metrics */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5 text-emerald-500" />
                          Métricas Globales
                        </CardTitle>
                        <CardDescription>Datos consolidados de todas las tiendas</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {[
                            { label: 'Órdenes', value: stats.globalMetrics.totalOrders.toLocaleString(), icon: ShoppingCart, color: 'text-emerald-600 dark:text-emerald-400' },
                            { label: 'Empleados', value: stats.globalMetrics.totalEmployees.toLocaleString(), icon: Users, color: 'text-blue-600 dark:text-blue-400' },
                            { label: 'Productos', value: stats.globalMetrics.totalProducts.toLocaleString(), icon: Package, color: 'text-amber-600 dark:text-amber-400' },
                            { label: 'Clientes', value: stats.globalMetrics.totalCustomers.toLocaleString(), icon: User, color: 'text-violet-600 dark:text-violet-400' },
                            { label: 'Facturas', value: stats.globalMetrics.totalInvoices.toLocaleString(), icon: FileText, color: 'text-cyan-600 dark:text-cyan-400' },
                            { label: 'Canceladas', value: stats.overview.cancelledStores.toString(), icon: XCircle, color: 'text-red-600 dark:text-red-400' },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30">
                              <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                              <div>
                                <p className="text-sm font-bold">{item.value}</p>
                                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Subscription Distribution */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Crown className="h-5 w-5 text-amber-500" />
                          Distribución por Plan
                        </CardTitle>
                        <CardDescription>Tiendas agrupadas por tipo de suscripción</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {stats.subscription.planBreakdown.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Sin datos de suscripciones</p>
                        ) : (
                          <div className="space-y-3">
                            {stats.subscription.planBreakdown
                              .sort((a, b) => b.count - a.count)
                              .map((plan) => {
                                const maxCount = Math.max(...stats.subscription.planBreakdown.map(p => p.count))
                                const pct = maxCount > 0 ? (plan.count / maxCount) * 100 : 0
                                return (
                                  <div key={plan.planId} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">{plan.planName}</span>
                                      <div className="flex items-center gap-2">
                                        {plan.price > 0 && <span className="text-xs text-muted-foreground">{formatCOP(plan.price)}/mes</span>}
                                        <Badge variant="secondary" className="text-xs">{plan.count}</Badge>
                                      </div>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Row 4: Recent Activity + Top Stores */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Recent Activity */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Clock className="h-5 w-5 text-blue-500" />
                          Actividad Reciente
                          <Badge variant="outline" className="text-[10px] ml-auto">Últimos 7 días</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-3 rounded-lg bg-muted/30">
                            <Store className="h-5 w-5 mx-auto mb-1.5 text-emerald-500" />
                            <p className="text-xl font-bold">{stats.recentActivity.newStores}</p>
                            <p className="text-[10px] text-muted-foreground">Nuevas Tiendas</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-muted/30">
                            <ShoppingCart className="h-5 w-5 mx-auto mb-1.5 text-blue-500" />
                            <p className="text-xl font-bold">{stats.recentActivity.newOrders.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">Órdenes</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-muted/30">
                            <FileText className="h-5 w-5 mx-auto mb-1.5 text-violet-500" />
                            <p className="text-xl font-bold">{stats.recentActivity.newInvoices.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">Facturas</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Top Stores */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-emerald-500" />
                          Top Tiendas
                          <Badge variant="outline" className="text-[10px] ml-auto">Últimos 30 días</Badge>
                        </CardTitle>
                        <CardDescription>Las más activas por número de órdenes</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {stats.topStores.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Sin actividad registrada</p>
                        ) : (
                          <div className="space-y-2.5 max-h-[250px] overflow-y-auto">
                            {stats.topStores.map((store, i) => (
                              <div key={store.storeId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400' : i === 1 ? 'bg-gray-100 dark:bg-gray-500/15 text-gray-600 dark:text-gray-400' : i === 2 ? 'bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400' : 'bg-muted text-muted-foreground'}`}>
                                  {i + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">{store.storeName}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold">{store.orderCount}</p>
                                  <p className="text-[10px] text-muted-foreground">{formatCOP(store.totalSales)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Row 5: Revenue + Churn + Timeline */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Revenue History */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-green-500" />
                            Ingresos
                          </CardTitle>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-xs text-green-600 dark:text-green-400 font-semibold">Cobrado: {formatCOP(stats.revenue.totalCollected)}</span>
                            {stats.revenue.totalPending > 0 && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">Pendiente: {formatCOP(stats.revenue.totalPending)}</span>
                            )}
                          </div>
                        </div>
                        <CardDescription>Histórico de facturación por mes</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {stats.revenue.monthlyHistory.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Sin registros de facturación</p>
                        ) : (
                          <div className="flex items-end gap-2 h-32">
                            {stats.revenue.monthlyHistory.map((m) => {
                              const maxVal = Math.max(...stats.revenue.monthlyHistory.map(x => x.revenue))
                              const height = maxVal > 0 ? (m.revenue / maxVal) * 100 : 0
                              return (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                  <span className="text-[10px] font-mono text-muted-foreground">{m.revenue > 0 ? `${(m.revenue / 1000).toFixed(0)}k` : ''}</span>
                                  <div className="w-full bg-gradient-to-t from-green-500 to-green-300 dark:from-green-600 dark:to-green-400 rounded-t-md min-h-[4px] transition-all duration-500" style={{ height: `${height}%` }} />
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{m.month.split('-')[1]}/{m.month.split('-')[0].slice(2)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Churn & Retention */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                          Retención
                        </CardTitle>
                        <CardDescription>Cancelaciones y reactivaciones</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {stats.churnByMonth.length === 0 ? (
                          <div className="text-center py-6">
                            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500/50" />
                            <p className="text-sm text-muted-foreground">Sin cancelaciones en el período</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {stats.churnByMonth.map((m) => (
                              <div key={m.month} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium">{m.month.split('-')[1]}/{m.month.split('-')[0].slice(2)}</span>
                                  <div className="flex items-center gap-2">
                                    {m.cancelled > 0 && <Badge variant="destructive" className="text-[10px] h-5">-{m.cancelled}</Badge>}
                                    {m.reactivated > 0 && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 text-[10px] h-5">+{m.reactivated}</Badge>}
                                    {m.past_due > 0 && <Badge variant="secondary" className="text-[10px] h-5">⚠{m.past_due}</Badge>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Event Timeline */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Clock className="h-5 w-5 text-blue-500" />
                          Actividad Reciente
                        </CardTitle>
                        <CardDescription>Eventos del sistema (últimos 90 días)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {stats.eventTimeline.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Sin eventos registrados</p>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto">
                            {stats.eventTimeline.slice(0, 12).map((ev) => (
                              <div key={ev.id} className="flex items-start gap-2 text-xs">
                                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                                  ev.eventType.includes('CANCELLED') ? 'bg-red-500' :
                                  ev.eventType.includes('ACTIVE') || ev.eventType.includes('REACTIVATED') || ev.eventType === 'PLAN_UPGRADED' ? 'bg-emerald-500' :
                                  ev.eventType.includes('PAST_DUE') ? 'bg-amber-500' :
                                  ev.eventType.includes('TRIAL') ? 'bg-blue-500' :
                                  'bg-muted-foreground'
                                }`} />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">
                                    {ev.isBranch && <span className="text-violet-500">Sucursal: </span>}
                                    {ev.storeName}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {ev.eventType.replace(/_/g, ' ')}
                                    {ev.newValue && ev.eventType !== ev.newValue && ` → ${ev.newValue.replace(/_/g, ' ')}`}
                                  </p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {formatDate(ev.createdAt)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Row 6: Growth Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Orders + Sales by month */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5 text-blue-500" />
                          Órdenes y Ventas
                          <Badge variant="outline" className="text-[10px] ml-auto">12 meses</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {stats.monthlyOrders.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Sin datos de órdenes</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-end gap-2 h-28">
                              {stats.monthlyOrders.map((m) => {
                                const maxOrders = Math.max(...stats.monthlyOrders.map(x => x.count))
                                const height = maxOrders > 0 ? (m.count / maxOrders) * 100 : 0
                                return (
                                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[10px] font-bold">{m.count}</span>
                                    <div className="w-full bg-gradient-to-t from-blue-500 to-blue-300 dark:from-blue-600 dark:to-blue-400 rounded-t-md min-h-[4px] transition-all duration-500" style={{ height: `${height}%` }} />
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{m.month.split('-')[1]}/{m.month.split('-')[0].slice(2)}</span>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                              <span className="text-xs text-muted-foreground">Ventas totales:</span>
                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {formatCOP(stats.monthlyOrders.reduce((s, m) => s + (m.total_sales || 0), 0))}
                              </span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Customer Growth */}
                    <Card className="rounded-xl border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <User className="h-5 w-5 text-violet-500" />
                          Crecimiento de Clientes
                          <Badge variant="outline" className="text-[10px] ml-auto">12 meses</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {stats.monthlyCustomers.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Sin datos de clientes</p>
                        ) : (
                          <div className="flex items-end gap-2 h-28">
                            {stats.monthlyCustomers.map((m) => {
                              const maxVal = Math.max(...stats.monthlyCustomers.map(x => x.count))
                              const height = maxVal > 0 ? (m.count / maxVal) * 100 : 0
                              return (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                  <span className="text-[10px] font-bold">{m.count}</span>
                                  <div className="w-full bg-gradient-to-t from-violet-500 to-violet-300 dark:from-violet-600 dark:to-violet-400 rounded-t-md min-h-[4px] transition-all duration-500" style={{ height: `${height}%` }} />
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{m.month.split('-')[1]}/{m.month.split('-')[0].slice(2)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* Config View — System Configuration */}
          {currentView === 'config' && (
            <Card className="rounded-xl border-border/50 max-w-2xl mx-auto w-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      MessageBird — WhatsApp OTP
                    </CardTitle>
                    <CardDescription>Envío de códigos de verificación por WhatsApp para recuperación de contraseña</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {configLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Enable/disable */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">Habilitar WhatsApp OTP</p>
                        <p className="text-xs text-muted-foreground">Permitir a los usuarios recibir códigos por WhatsApp</p>
                      </div>
                      <Switch checked={mbConfig.enabled} onCheckedChange={(checked) => setMbConfig(prev => ({ ...prev, enabled: checked }))} />
                    </div>

                    {/* Test Mode toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.04]">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                          <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Modo Pruebas (Test)</p>
                          <p className="text-xs text-muted-foreground">Genera códigos sin enviar WhatsApp. El código se muestra en pantalla.</p>
                        </div>
                      </div>
                      <Switch
                        checked={mbConfig.testMode}
                        onCheckedChange={(checked) => setMbConfig(prev => ({ ...prev, testMode: checked }))}
                        className="data-[state=checked]:bg-amber-500"
                      />
                    </div>

                    {/* Show test mode notice */}
                    {mbConfig.testMode && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Modo pruebas activo — No se requiere API Key ni número de WhatsApp. Los códigos se mostrarán directamente en la pantalla de recuperación.
                        </p>
                      </div>
                    )}

                    <Separator className="my-2" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credenciales de Mensajería</p>

                    {/* API Key — hidden in test mode */}
                    {!mbConfig.testMode && (
                      <>
                        <div className="space-y-2">
                          <Label>API Key (Access Key)</Label>
                          <div className="relative">
                            <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              type={showApiKey ? 'text' : 'password'}
                              placeholder="MensajeBird Access Key"
                              className="pl-10 pr-10"
                              value={mbConfig.apiKey}
                              onChange={(e) => setMbConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                            />
                            <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                          <Label>Número de WhatsApp Business</Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input type="tel" placeholder="573001234567" className="pl-10" value={mbConfig.phoneNumber} onChange={(e) => setMbConfig(prev => ({ ...prev, phoneNumber: e.target.value }))} />
                          </div>
                          <p className="text-xs text-muted-foreground">Incluir código de país sin + (ej: 573001234567)</p>
                        </div>

                        {/* Template */}
                        <div className="space-y-2">
                          <Label>Plantilla del mensaje</Label>
                          <Textarea rows={3} placeholder="Tu código de verificación..." value={mbConfig.template} onChange={(e) => setMbConfig(prev => ({ ...prev, template: e.target.value }))} />
                          <p className="text-xs text-muted-foreground">Usa {'{'}{'{'}code{'}'}{'}'} como placeholder para el código OTP de 6 dígitos</p>
                        </div>

                        {/* Info */}
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4">
                          <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                            <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                              <p className="font-medium">Requisitos para WhatsApp OTP:</p>
                              <ol className="list-decimal list-inside space-y-0.5 text-amber-500/80">
                                <li>Cuenta activa en <a href="https://messagebird.com" target="_blank" rel="noopener noreferrer" className="underline">messagebird.com</a></li>
                                <li>WhatsApp Business aprobado por Meta</li>
                                <li>API Access Key con permisos de Conversations API</li>
                                <li>Plantilla de mensaje aprobada (si se requiere)</li>
                              </ol>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <Separator className="my-2" />

                    {/* Save */}
                    <Button onClick={handleSaveConfig} disabled={configSaving} className="gap-2">
                      {configSaving ? (
                        <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Guardando...</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4" />Guardar Cambios</>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          </div>{/* end view content transition wrapper */}
        </div>
      </main>

      {/* Create Store Dialog (standalone, controlled) */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setForm(prev => ({ ...prev, selectedPlanId: '' })); setSelectedBillingPeriod('MONTHLY'); setCreateReceiptFile(null); setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) } setShowCreateDialog(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Crear Nueva Tienda</DialogTitle>
            <DialogDescription>Complete los datos del propietario y de la tienda. Se crearán automáticamente categorías, IVA y roles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Datos del Propietario</h3></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="oc">Cédula *</Label>
                  <div className="relative"><CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="oc" placeholder="1098765432" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerCedula} onChange={(e) => updateForm('ownerCedula', e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="op">Contraseña *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="op" type={showOwnerPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerPassword} onChange={(e) => updateForm('ownerPassword', e.target.value)} />
                    <button type="button" onClick={() => setShowOwnerPassword(!showOwnerPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">{showOwnerPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="on">Nombre Completo *</Label>
                  <Input id="on" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Juan Pérez" value={form.ownerFullName} onChange={(e) => updateForm('ownerFullName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oe">Email</Label>
                  <div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="oe" type="email" placeholder="correo@ejemplo.com" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerEmail} onChange={(e) => updateForm('ownerEmail', e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oph">Teléfono</Label>
                  <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="oph" placeholder="3001234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerPhone} onChange={(e) => updateForm('ownerPhone', e.target.value)} /></div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Datos de la Tienda</h3></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sn">Nombre de la Tienda *</Label>
                  <div className="relative"><Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="sn" placeholder="Mi Negocio" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.storeName} onChange={(e) => updateForm('storeName', e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sl">Razón Social</Label>
                  <Input id="sl" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Mi Negocio S.A.S" value={form.legalName} onChange={(e) => updateForm('legalName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="snit">NIT</Label>
                  <div className="relative"><Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="snit" placeholder="901234567-8" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.nit} onChange={(e) => updateForm('nit', e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stp">Teléfono Tienda</Label>
                  <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="stp" placeholder="6011234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sa">Dirección</Label>
                  <div className="relative"><MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="sa" placeholder="Calle 10 #5-30" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.address} onChange={(e) => updateForm('address', e.target.value)} /></div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                <h3 className="font-semibold text-sm">Plan de Suscripción</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {plans.filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => {
                  const isSelected = form.selectedPlanId === plan.id.toString()
                  return (
                    <div
                      key={plan.id}
                      onClick={() => {
                        updateForm('selectedPlanId', plan.id.toString())
                        setSelectedBillingPeriod(plan.price === 0 ? 'TRIAL' : 'MONTHLY')
                        if (plan.price === 0) {
                          setCreateReceiptFile(null)
                          setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
                        }
                      }}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">{plan.name}</span>
                        {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {plan.price === 0 ? 'Gratis' : formatCOP(plan.price) + '/mes'}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(plan.features).slice(0, 3).map(([key, val]) => (
                          <Badge key={key} variant={val === true ? 'default' : 'outline'} className="text-[9px]">
                            {key}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {form.selectedPlanId && (() => {
                const selectedPlan = plans.find(p => p.id.toString() === form.selectedPlanId)
                if (!selectedPlan || selectedPlan.price === 0) return null
                return (
                  <div className="space-y-2">
                    <Label className="text-sm">Período de facturación</Label>
                    <Select value={selectedBillingPeriod} onValueChange={setSelectedBillingPeriod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BILLING_PERIODS.filter(bp => bp.value !== 'TRIAL').map((bp) => {
                          const price = Math.round(selectedPlan.price * bp.months * (1 - bp.discount / 100))
                          return (
                            <SelectItem key={bp.value} value={bp.value}>
                              {bp.label} — {formatCOP(price)} {bp.discount > 0 ? `(ahorras ${bp.discount}%)` : ''}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })()}
            </div>
            {form.selectedPlanId && (() => { const plan = plans.find(p => p.id.toString() === form.selectedPlanId); return plan && plan.price > 0 })() && (
            <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Comprobante de Pago (Requerido)</h3>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Debe adjuntar el comprobante del pago para activar el plan seleccionado
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Archivo del comprobante</Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-3 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => document.getElementById('create-receipt-file')?.click()}
                  >
                    {createReceiptFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium truncate">{createReceiptFile.name}</span>
                        <span className="text-xs text-muted-foreground">({(createReceiptFile.size / 1024).toFixed(0)}KB)</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCreateReceiptFile(null) }}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground"><Upload className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1" />Haz clic para seleccionar archivo</p>
                    )}
                    <input
                      id="create-receipt-file"
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                      onChange={(e) => { if (e.target.files?.[0]) setCreateReceiptFile(e.target.files[0]) }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Monto (COP)</Label>
                  <Input type="number" placeholder="50000" value={createReceiptForm.amount}
                    onChange={(e) => setCreateReceiptForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <Select value={createReceiptForm.paymentMethod} onValueChange={(v) => setCreateReceiptForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEQUI">Nequi</SelectItem>
                      <SelectItem value="DAVIPLATA">Davivienda (Daviplata)</SelectItem>
                      <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                      <SelectItem value="BANCARY">Bancario (Consignación)</SelectItem>
                      <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Referencia / Transacción</Label>
                  <Input placeholder="Ej: 000123456789" value={createReceiptForm.reference}
                    onChange={(e) => setCreateReceiptForm(f => ({ ...f, reference: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Notas</Label>
                  <Textarea placeholder="Observaciones..." rows={2} value={createReceiptForm.notes}
                    onChange={(e) => setCreateReceiptForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setForm(prev => ({ ...prev, selectedPlanId: '' })); setSelectedBillingPeriod('MONTHLY'); setCreateReceiptFile(null); setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) }}>Cancelar</Button>
            <Button onClick={handleCreateStore} disabled={creating} className="gap-2 active:scale-[0.98] transition-all">
              {creating ? (<><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Creando...</>) : (<><Plus className="h-4 w-4" />Crear Tienda</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-sm rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Resetear Contraseña</DialogTitle>
            <DialogDescription>
              {selectedUser && <>Usuario: <strong>{selectedUser.fullName || selectedUser.cedula}</strong> ({selectedUser.cedula})</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nueva Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input type={showNewPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">{showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={!newPassword || newPassword.length < 6} className="gap-2 active:scale-[0.98] transition-all"><KeyRound className="h-4 w-4" />Actualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={showEditPlanDialog} onOpenChange={setShowEditPlanDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Editar Plan: {editingPlan?.name}</DialogTitle>
            <DialogDescription>Modifique los campos deseados y guarde los cambios</DialogDescription>
          </DialogHeader>
          {editingPlan && (
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pf-name">Nombre *</Label>
                  <Input id="pf-name" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" value={planForm.name} onChange={(e) => setPlanForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pf-desc">Descripción</Label>
                  <Input id="pf-desc" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" value={planForm.description} onChange={(e) => setPlanForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-price">Precio (COP/mes)</Label>
                  <Input id="pf-price" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={0} value={planForm.price} onChange={(e) => setPlanForm(p => ({ ...p, price: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-sort">Orden</Label>
                  <Input id="pf-sort" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={0} value={planForm.sortOrder} onChange={(e) => setPlanForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Límites por Tienda (-1 = ilimitado)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pf-emp" className="text-xs text-muted-foreground">Max Empleados</Label>
                    <Input id="pf-emp" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={-1} value={planForm.maxEmployees} onChange={(e) => setPlanForm(p => ({ ...p, maxEmployees: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pf-prod" className="text-xs text-muted-foreground">Max Productos</Label>
                    <Input id="pf-prod" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={-1} value={planForm.maxProducts} onChange={(e) => setPlanForm(p => ({ ...p, maxProducts: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Estado</Label>
                  <p className="text-xs text-muted-foreground">Plan activo para nuevas suscripciones</p>
                </div>
                <Switch checked={planForm.isActive} onCheckedChange={(checked) => setPlanForm(p => ({ ...p, isActive: checked }))} />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Suscriptores actuales: </span>
                <Badge variant="secondary" className="ml-1">{editingPlan.subscriptionCount}</Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPlanDialog(false)}>Cancelar</Button>
            <Button onClick={handleSavePlan} disabled={savingPlan} className="gap-2 active:scale-[0.98] transition-all">
              {savingPlan ? (<><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Guardando...</>) : (<><Pencil className="h-4 w-4" />Guardar</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        Ventify POS · Sistema Multi-Tienda · Super Administrador
      </footer>
    </div>
  )
}

// ---- USAGE BAR COMPONENT ----
function UsageBar({ label, current, max, icon }: { label: string; current: number; max: number; icon: React.ReactNode }) {
  const isUnlimited = max === -1
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100))
  const isNearLimit = !isUnlimited && percentage >= 80
  const isAtLimit = !isUnlimited && current >= max

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          {icon}{label}
        </div>
        <span className={`font-mono font-medium ${isAtLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : ''}`}>
          {current}/{isUnlimited ? '∞' : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ---- STORE DETAIL VIEW ----
interface PaymentReceiptData {
  id: number; storeId: number; subscriptionId: number
  fileName: string; fileSize: number; fileType: string; fileData?: string
  amount: number; reference: string | null; paymentMethod: string; notes: string | null
  status: string; reviewedBy: string | null; reviewNotes: string | null; reviewedAt: string | null
  createdAt: string; updatedAt: string
  store?: { id: number; name: string; nit: string | null; phone: string | null; user: { fullName: string | null; phone: string | null } }
  subscription?: { id: number; status: string; plan: { name: string; price: number }; endDate: string | null }
}

function StoreDetailView({ store: detail, plans, onBack, onResetPassword, onRefresh }: { store: StoreDetail; plans: PlanData[]; onBack: () => void; onResetPassword: (u: StoreOwner) => void; onRefresh: (storeId: number) => void }) {
  const { store, stats, employees, roles, taxRates, categories, products, customers, orders, services, providers, expenses, subscription, dianInfo, invoiceStats } = detail
  const profit = stats.totalSales - stats.totalExpenses
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showResetProductsDialog, setShowResetProductsDialog] = useState(false)
  const [resettingProducts, setResettingProducts] = useState(false)
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscription?.planId?.toString() || '')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('MONTHLY')
  const [editForm, setEditForm] = useState({
    name: store.name || '',
    legalName: store.legalName || '',
    nit: store.nit || '',
    address: store.address || '',
    phone: store.phone || '',
    ownerFullName: store.user.fullName || '',
    ownerEmail: store.user.email || '',
    ownerPhone: store.user.phone || '',
  })

  // Edit dialog receipt state
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null)
  const [editReceiptForm, setEditReceiptForm] = useState({
    amount: '', paymentMethod: 'NEQUI', reference: '', notes: '',
  })
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  // Payment receipts state
  const [receipts, setReceipts] = useState<PaymentReceiptData[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceiptData | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // Upload receipt state (super admin)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null)
  const [uploadForm, setUploadForm] = useState({
    amount: '',
    paymentMethod: 'NEQUI',
    reference: '',
    notes: '',
    autoApprove: true,
  })
  // Receipt preview dialog
  const [showReceiptPreviewDialog, setShowReceiptPreviewDialog] = useState(false)
  const [receiptPreviewData, setReceiptPreviewData] = useState<PaymentReceiptData | null>(null)
  const [receiptPreviewImage, setReceiptPreviewImage] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  // Receipt filter
  const [receiptFilter, setReceiptFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')

  // Branches (sucursales) state
  const [branches, setBranches] = useState<Array<{
    id: number; name: string; legalName: string | null; nit: string | null;
    address: string | null; phone: string | null; createdAt: string;
    user: { cedula: string; fullName: string | null };
    _count: { employees: number; products: number; orders: number };
  }>>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [showBranchDialog, setShowBranchDialog] = useState(false)
  const [branchCreating, setBranchCreating] = useState(false)
  const [parentSubInfo, setParentSubInfo] = useState<{ planName: string | null; status: string | null; maxStores: number; multiStoreEnabled: boolean } | null>(null)
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', legalName: '', nit: '' })

  const loadReceipts = useCallback(async () => {
    try {
      setReceiptsLoading(true)
      const res = await fetch('/api/super-admin/payment-receipts')
      if (!res.ok) { return }
      const data = await res.json()
      setReceipts((data || []).filter((r: PaymentReceiptData) => r.storeId === store.id))
    } catch { /* non-critical */ }
    finally { setReceiptsLoading(false) }
  }, [store.id])

  useEffect(() => { loadReceipts() }, [loadReceipts])

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/branches`)
      if (res.ok) {
        const data = await res.json()
        setBranches(Array.isArray(data.branches) ? data.branches : [])
      setParentSubInfo(data.parentSubscription || null)
      }
    } catch { /* non-critical */ }
    finally { setBranchesLoading(false) }
  }, [store.id])

  useEffect(() => { loadBranches() }, [loadBranches])

  async function handleCreateBranch() {
    if (!branchForm.name || branchForm.name.length < 2) { toast.error('Nombre de sucursal obligatorio (mín. 2 caracteres)'); return }
    setBranchCreating(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branchForm),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'MULTI_STORE_REQUIRED') {
          toast.error('Plan requerido: Empresarial', { description: data.error, duration: 6000 })
        } else if (data.code === 'MAX_STORES_REACHED') {
          toast.error('Límite alcanzado', { description: data.error, duration: 6000 })
        } else {
          toast.error(data.error || 'Error al crear sucursal')
        }
        return
      }
      toast.success(data.message || `Sucursal "${branchForm.name}" creada exitosamente`)
      setBranchForm({ name: '', address: '', phone: '', legalName: '', nit: '' })
      setShowBranchDialog(false)
      loadBranches()
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setBranchCreating(false) }
  }

  async function handleReviewReceipt(receiptId: number, action: 'APPROVE' | 'REJECT') {
    setReviewing(true)
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receiptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNotes }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al procesar comprobante'); return }
      toast.success(data.message)
      setPreviewReceipt(null)
      setReviewNotes('')
      loadReceipts()
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setReviewing(false) }
  }

  async function handleDeleteReceipt(receiptId: number) {
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receiptId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al eliminar'); return }
      toast.success(data.message)
      loadReceipts()
    } catch { toast.error('Error de conexión') }
  }

  async function handleUploadReceipt() {
    if (!selectedFile || !uploadForm.amount || !store.id) {
      toast.error('Selecciona un archivo e indica el monto del pago')
      return
    }
    // Validate file size (5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error('El archivo excede 5MB. Selecciona uno más pequeño.')
      return
    }
    setUploading(true)
    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          if (base64) resolve(base64)
          else reject(new Error('No se pudo leer el archivo'))
        }
        reader.onerror = () => reject(new Error('Error leyendo archivo'))
        reader.readAsDataURL(selectedFile)
      })

      const fileData = await base64Promise

      const res = await fetch('/api/super-admin/payment-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          amount: parseInt(uploadForm.amount),
          paymentMethod: uploadForm.paymentMethod,
          reference: uploadForm.reference || undefined,
          notes: uploadForm.notes || undefined,
          fileData,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type || 'application/octet-stream',
          autoApprove: uploadForm.autoApprove,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al registrar comprobante')
        return
      }
      if (data.subscriptionExtended) {
        toast.success(data.message)
      } else {
        toast.success(data.message)
      }
      setShowUploadDialog(false)
      setSelectedFile(null)
      setSelectedFilePreview(null)
      setUploadForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '', autoApprove: true })
      loadReceipts()
      onRefresh(store.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al registrar')
    }
    finally { setUploading(false) }
  }

  async function handleViewReceipt(receipt: PaymentReceiptData) {
    setLoadingPreview(true)
    setShowReceiptPreviewDialog(true)
    setReceiptPreviewData(receipt)
    setReceiptPreviewImage(null)
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receipt.id}`)
      const data = await res.json()
      if (res.ok && data.fileData) {
        const mime = data.fileType || 'application/octet-stream'
        if (mime.startsWith('image/')) {
          setReceiptPreviewImage(`data:${mime};base64,${data.fileData}`)
        } else {
          setReceiptPreviewImage(null)
        }
      }
    } catch { /* preview unavailable */ }
    finally { setLoadingPreview(false) }
  }

  function handleDownloadReceipt(receipt: PaymentReceiptData) {
    // Use already loaded preview or fetch fresh
    const download = async () => {
      try {
        const res = await fetch(`/api/super-admin/payment-receipts/${receipt.id}`)
        const data = await res.json()
        if (res.ok && data.fileData) {
          const mime = data.fileType || 'application/octet-stream'
          const href = `data:${mime};base64,${data.fileData}`
          const a = document.createElement('a')
          a.href = href
          a.download = data.fileName || 'comprobante'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          toast.success('Descarga iniciada')
        } else {
          toast.error('No se pudo obtener el archivo')
        }
      } catch { toast.error('Error al descargar comprobante') }
    }
    download()
  }

  // Subscription helpers
  const selectedPlan = plans.find(p => p.id.toString() === selectedPlanId)
  const selectedBillingPeriod = BILLING_PERIODS.find(bp => bp.value === selectedPeriod) || BILLING_PERIODS[0]
  const calculatedPrice = selectedPlan
    ? Math.round(selectedPlan.price * selectedBillingPeriod.months * (1 - selectedBillingPeriod.discount / 100))
    : 0

  const daysRemaining = subscription?.endDate
    ? (() => {
        const now = new Date()
        const end = new Date(subscription.endDate)
        // Normalize to midnight local time for calendar-day comparison
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
        return Math.ceil((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      })()
    : null

  function openEdit() {
    setEditForm({
      name: store.name || '',
      legalName: store.legalName || '',
      nit: store.nit || '',
      address: store.address || '',
      phone: store.phone || '',
      ownerFullName: store.user.fullName || '',
      ownerEmail: store.user.email || '',
      ownerPhone: store.user.phone || '',
    })
    setEditReceiptFile(null)
    setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
    setShowEditDialog(true)
  }

  function openUploadDialog() {
    setSelectedFile(null)
    setSelectedFilePreview(null)
    setUploadForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '', autoApprove: true })
    setShowUploadDialog(true)
  }

  function openChangePlan() {
    const initialPlanId = subscription?.planId?.toString() || (plans.find(p => p.isActive)?.id?.toString() || '')
    const initialPlan = plans.find(p => p.id.toString() === initialPlanId)
    setSelectedPlanId(initialPlanId)
    // Auto-select billing period: Trial plan → TRIAL, others → current or MONTHLY
    if (initialPlan?.price === 0) {
      setSelectedPeriod('TRIAL')
    } else {
      setSelectedPeriod(subscription?.billingPeriod || 'MONTHLY')
    }
    setShowChangePlanDialog(true)
  }

  function updateEdit(field: string, value: string) { setEditForm((p) => ({ ...p, [field]: value })) }

  async function handleSave() {
    if (!editForm.name || editForm.name.length < 2) { toast.error('Nombre de tienda es obligatorio (mín. 2 caracteres)'); return }
    if (!editForm.ownerFullName || editForm.ownerFullName.length < 2) { toast.error('Nombre del propietario es obligatorio (mín. 2 caracteres)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          legalName: editForm.legalName || null,
          nit: editForm.nit || null,
          address: editForm.address || null,
          phone: editForm.phone || null,
          ownerFullName: editForm.ownerFullName,
          ownerEmail: editForm.ownerEmail || null,
          ownerPhone: editForm.ownerPhone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      toast.success(data.message || 'Datos actualizados')

      // Upload receipt if file was selected
      if (editReceiptFile && editReceiptForm.amount) {
        setUploadingReceipt(true)
        try {
          const reader = new FileReader()
          const fileData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string
              const base64 = result.split(',')[1]
              if (base64) resolve(base64)
              else reject(new Error('No se pudo leer el archivo'))
            }
            reader.onerror = () => reject(new Error('Error leyendo archivo'))
            reader.readAsDataURL(editReceiptFile)
          })
          const receiptRes = await fetch('/api/super-admin/payment-receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId: store.id,
              amount: parseInt(editReceiptForm.amount),
              paymentMethod: editReceiptForm.paymentMethod,
              reference: editReceiptForm.reference || undefined,
              notes: editReceiptForm.notes || undefined,
              fileData,
              fileName: editReceiptFile.name,
              fileSize: editReceiptFile.size,
              fileType: editReceiptFile.type || 'application/octet-stream',
            }),
          })
          const receiptData = await receiptRes.json()
          if (!receiptRes.ok) { toast.error(receiptData.error || 'Error al subir comprobante') }
          else { toast.success('Comprobante de pago registrado') }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Error al subir comprobante')
        }
        finally { setUploadingReceipt(false) }
      }

      setShowEditDialog(false)
      setEditReceiptFile(null)
      setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  async function handleResetProducts() {
    setResettingProducts(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/reset-products`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al reiniciar maestra'); return }
      toast.success(data.message)
      setShowResetProductsDialog(false)
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setResettingProducts(false) }
  }

  async function handleChangePlan() {
    if (!selectedPlanId) { toast.error('Seleccione un plan'); return }
    setChangingPlan(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: parseInt(selectedPlanId),
          billingPeriod: selectedPeriod,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cambiar plan'); return }
      toast.success(data.message || 'Plan actualizado')
      setShowChangePlanDialog(false)
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setChangingPlan(false) }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}><ArrowLeft className="h-4 w-4" />Volver</Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{store.name}</h2>
            <p className="text-xs text-muted-foreground">{store.user.fullName} · {store.nit || 'Sin NIT'}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Store Info Header */}
          <Card className="rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-xl">{store.name}</CardTitle>
                  {store.legalName && <p className="text-sm text-muted-foreground">{store.legalName}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="default" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={openEdit}>
                    <Pencil className="h-3.5 w-3.5" />Editar Datos
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => onResetPassword(store.user)}>
                    <KeyRound className="h-3.5 w-3.5" />Reset Contraseña
                  </Button>
                  <AlertDialog open={showResetProductsDialog} onOpenChange={setShowResetProductsDialog}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" disabled={store._count.products === 0}>
                        <Trash2 className="h-3.5 w-3.5" />Reset Maestra
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Reiniciar Maestra de Productos
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              ¿Estás seguro de que deseas eliminar <strong>todos los productos</strong> de la tienda <strong>{store.name}</strong>?
                            </p>
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm space-y-1">
                              <p className="font-medium text-destructive">Esta acción eliminará:</p>
                              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                <li><strong>{store._count.products}</strong> productos</li>
                                <li>Todos los movimientos de inventario asociados</li>
                                <li>Los items de compra vinculados a estos productos</li>
                              </ul>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Los items en órdenes, comandas y cotizaciones se conservarán (sin referencia al producto).
                              Esta acción <strong>no se puede deshacer</strong>.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel disabled={resettingProducts}>Cancelar</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleResetProducts} disabled={resettingProducts} className="gap-1.5">
                          {resettingProducts ? (
                            <>
                              <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              Eliminando...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5" />
                              Sí, eliminar todo
                            </>
                          )}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Propietario:</span><br /><span className="font-medium">{store.user.fullName || store.user.cedula}</span></div>
                <div><span className="text-muted-foreground">Cédula:</span><br /><span className="font-mono">{store.user.cedula}</span></div>
                <div><span className="text-muted-foreground">Email:</span><br /><span className="font-medium">{store.user.email || '—'}</span></div>
                <div><span className="text-muted-foreground">Teléfono:</span><br /><span className="font-medium">{store.user.phone || '—'}</span></div>
                <div><span className="text-muted-foreground">Dirección:</span><br /><span className="font-medium">{store.address || '—'}</span></div>
                <div><span className="text-muted-foreground">Tel. Tienda:</span><br /><span className="font-medium">{store.phone || '—'}</span></div>
                <div><span className="text-muted-foreground">Moneda:</span><br /><span className="font-medium">{store.currencyCode}</span></div>
                <div><span className="text-muted-foreground">Creada:</span><br /><span className="font-medium">{formatDate(store.createdAt)}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Card */}
          <Card className="border-l-4 border-l-amber-500 rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                    <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Suscripción</CardTitle>
                    <CardDescription>Plan y estado de la suscripción</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={openChangePlan}>
                  <CreditCard className="h-3.5 w-3.5" />Cambiar Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {subscription ? (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Plan Actual</p>
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold">{subscription.plan.name}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Estado</p>
                    {getSubscriptionStatusBadge(subscription.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Facturación</p>
                    <p className="text-sm font-medium">
                      {subscription.billingPrice > 0 ? formatCOP(subscription.billingPrice) : '—'}
                      <span className="text-muted-foreground"> / {subscription.billingPeriod || '—'}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Fechas</p>
                    <p className="text-sm">
                      <span className="font-medium">{formatDate(subscription.startDate)}</span>
                      {subscription.endDate && (
                        <>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span className="font-medium">{formatDate(subscription.endDate)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {subscription.trialEndDate && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Fin del Trial</p>
                      <p className="text-sm font-medium">{formatDate(subscription.trialEndDate)}</p>
                    </div>
                  )}
                  {subscription.nextBillingAt && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Próxima Facturación</p>
                      <p className="text-sm font-medium">{formatDate(subscription.nextBillingAt)}</p>
                    </div>
                  )}
                  {subscription.lastBilledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Última Facturación</p>
                      <p className="text-sm font-medium">{formatDate(subscription.lastBilledAt)}</p>
                    </div>
                  )}
                  {daysRemaining !== null && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Días Restantes</p>
                      <p className={`text-sm font-bold ${daysRemaining <= 7 ? 'text-red-600' : daysRemaining <= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {daysRemaining > 0 ? daysRemaining : 0} días
                      </p>
                    </div>
                  )}
                </div>
                {/* Usage vs Plan Limits */}
                {subscription && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Uso del Plan</p>
                    <div className="grid grid-cols-2 gap-3">
                      <UsageBar
                        label="Empleados"
                        current={store._count.employees}
                        max={subscription.plan.maxEmployees}
                        icon={<Users className="h-3 w-3" />}
                      />
                      <UsageBar
                        label="Productos"
                        current={store._count.products}
                        max={subscription.plan.maxProducts}
                        icon={<Package className="h-3 w-3" />}
                      />
                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="flex items-center justify-center py-6 text-center">
                  <div>
                    <Crown className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm text-muted-foreground">Sin suscripción activa</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Asigne un plan a esta tienda</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DIAN Info Card */}
          <Card className="border-l-4 border-l-emerald-500 rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Facturación Electrónica (DIAN)</CardTitle>
                  <CardDescription>Resolución y datos de facturación electrónica</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Resolución</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Número de Resolución:</span>
                      <p className="font-mono font-medium">{dianInfo.resolutionNumber || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Prefijo:</span>
                      <p className="font-mono font-medium">{dianInfo.invoicePrefix || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Consecutivo:</span>
                      <p className="font-mono font-medium">
                        {dianInfo.resolutionStartNumber ?? '—'} — {dianInfo.resolutionEndNumber ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Vigencia</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Fecha Inicio:</span>
                      <p className="font-medium">{dianInfo.resolutionStartDate ? formatDate(dianInfo.resolutionStartDate) : '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Fecha Fin:</span>
                      <p className="font-medium">{dianInfo.resolutionEndDate ? formatDate(dianInfo.resolutionEndDate) : '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Modo:</span>
                      <p>
                        {dianInfo.invoiceTestMode === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : dianInfo.invoiceTestMode ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20">Habilitación</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20">Producción</Badge>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Estadísticas de Facturas</h4>
                  {invoiceStats && invoiceStats.length > 0 ? (
                    <div className="space-y-1.5">
                      {invoiceStats.map((stat) => (
                        <div key={stat.status} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{stat.status}</span>
                          <Badge variant="secondary" className="text-xs font-mono">{stat._count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos de facturación</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 border-l-4 border-l-emerald-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                <div><p className="text-xs text-muted-foreground">Ventas Totales</p><p className="text-lg font-bold text-emerald-600">{formatCOP(stats.totalSales)}</p></div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-red-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-5 w-5 text-red-500" />
                <div><p className="text-xs text-muted-foreground">Gastos Totales</p><p className="text-lg font-bold text-red-600">{formatCOP(stats.totalExpenses)}</p></div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-blue-500" />
                <div><p className="text-xs text-muted-foreground">Balance</p><p className={`text-lg font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCOP(profit)}</p></div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-purple-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Órdenes</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{store._count.orders}</p>
                    {Object.entries(stats.ordersByStatus).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Sucursales (Branches) — Empresarial only */}
          <Card className="rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${parentSubInfo?.multiStoreEnabled ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-muted'}`}>
                    <Building2 className={`h-5 w-5 ${parentSubInfo?.multiStoreEnabled ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/40'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Sucursales
                      {branches.length > 0 && <Badge variant="secondary" className="text-xs">{branches.length}/{parentSubInfo?.maxStores ?? 1}</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {parentSubInfo?.multiStoreEnabled
                        ? <>Suscripción centralizada · Plan {parentSubInfo.planName} · Máx. {parentSubInfo.maxStores} sucursales</>
                        : 'Disponible únicamente con el plan Empresarial'
                      }
                    </CardDescription>
                  </div>
                </div>
                {parentSubInfo?.multiStoreEnabled ? (
                  branches.length < (parentSubInfo?.maxStores ?? 0) ? (
                    <Button size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => setShowBranchDialog(true)}>
                      <Plus className="h-3.5 w-3.5" />Nueva Sucursal
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">Límite alcanzado</Badge>
                  )
                ) : (
                  <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground gap-1">
                    <Crown className="h-3 w-3" />Requiere Empresarial
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!parentSubInfo?.multiStoreEnabled && (
                <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-6 mb-4 text-center">
                  <Crown className="h-8 w-8 text-amber-500/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Multi-Tienda no disponible en este plan</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Actualmente en plan <span className="font-semibold">{parentSubInfo?.planName || '—'}</span>. Actualiza a Empresarial para crear y gestionar sucursales.</p>
                </div>
              )}
              {branchesLoading ? (
                <div className="flex justify-center py-8"><div className="h-6 w-6 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : branches.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Sin sucursales creadas</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{parentSubInfo?.multiStoreEnabled ? 'Crea sucursales para gestionar múltiples puntos de venta del mismo dueño' : 'Actualiza a Empresarial para habilitar esta funcionalidad'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="p-4 rounded-xl border hover:shadow-md transition-all duration-200 group cursor-pointer" onClick={() => onRefresh(branch.id)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 bg-violet-100 dark:bg-violet-500/15 rounded-lg flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{branch.name}</p>
                            {branch.address && <p className="text-xs text-muted-foreground">{branch.address}</p>}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Link2 className="h-2.5 w-2.5" />Vinculada
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{branch._count.employees}</span>
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" />{branch._count.products}</span>
                        <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{branch._count.orders}</span>
                        <span className="ml-auto">{formatDate(branch.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Create Branch Dialog */}
          <Dialog open={showBranchDialog} onOpenChange={(open) => { if (!open) setBranchForm({ name: '', address: '', phone: '', legalName: '', nit: '' }); setShowBranchDialog(open) }}>
            <DialogContent className="max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle>Nueva Sucursal</DialogTitle>
                <DialogDescription>Sucursal vinculada a {store.name}. Hereda la suscripción {parentSubInfo?.planName || '—'} ({branches.length + 1}/{parentSubInfo?.maxStores ?? '—'}). El dueño accede con las mismas credenciales.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nombre de la Sucursal *</Label>
                  <Input placeholder="Ej: Sucursal Norte" value={branchForm.name} onChange={(e) => setBranchForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Razón Social</Label>
                  <Input placeholder={store.legalName || 'Opcional'} value={branchForm.legalName} onChange={(e) => setBranchForm(p => ({ ...p, legalName: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>NIT</Label>
                    <Input placeholder={store.nit || 'Opcional'} value={branchForm.nit} onChange={(e) => setBranchForm(p => ({ ...p, nit: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input placeholder="3001234567" value={branchForm.phone} onChange={(e) => setBranchForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <Input placeholder="Calle 10 #5-30" value={branchForm.address} onChange={(e) => setBranchForm(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    La sucursal hereda la suscripción del plan {parentSubInfo?.planName || '—'}. No se generan credenciales separadas.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBranchDialog(false)}>Cancelar</Button>
                <Button onClick={handleCreateBranch} disabled={branchCreating} className="gap-1.5">
                  {branchCreating ? <><div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Creando...</> : <><Plus className="h-3.5 w-3.5" />Crear Sucursal</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Tabs con toda la información */}
          <Tabs defaultValue="employees" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="employees" className="gap-1.5"><Users className="h-3.5 w-3.5" />Empleados ({employees.length})</TabsTrigger>
              <TabsTrigger value="products" className="gap-1.5"><Package className="h-3.5 w-3.5" />Productos ({store._count.products})</TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Clientes ({store._count.customers})</TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Órdenes ({store._count.orders})</TabsTrigger>
              <TabsTrigger value="services" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Servicios ({services.length})</TabsTrigger>
              <TabsTrigger value="taxes" className="gap-1.5"><Receipt className="h-3.5 w-3.5" />IVA ({taxRates.length})</TabsTrigger>
              <TabsTrigger value="categories" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Categorías ({categories.length})</TabsTrigger>
              <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Roles ({roles.length})</TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" />Gastos ({store._count.expenses})</TabsTrigger>
              <TabsTrigger value="providers" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Proveedores ({providers.length})</TabsTrigger>
              <TabsTrigger value="receipts" className="gap-1.5"><Upload className="h-3.5 w-3.5" />Pagos ({receipts.length})</TabsTrigger>
            </TabsList>

            {/* EMPLEADOS */}
            <TabsContent value="employees">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {employees.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin empleados registrados</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Nombre</TableHead><TableHead>Cédula</TableHead><TableHead>Cargo</TableHead><TableHead>Rol</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead><TableHead>Estado</TableHead><TableHead>Ingreso</TableHead><TableHead className="text-right">Acciones</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {employees.map((emp) => (
                          <TableRow key={emp.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{emp.user.fullName || '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{emp.user.cedula}</TableCell>
                            <TableCell>{emp.position || '—'}</TableCell>
                            <TableCell>{emp.role ? <Badge variant="outline">{emp.role.name}</Badge> : '—'}</TableCell>
                            <TableCell className="text-sm">{emp.user.email || '—'}</TableCell>
                            <TableCell className="text-sm">{emp.user.phone || '—'}</TableCell>
                            <TableCell><Badge variant={emp.isActive ? 'default' : 'secondary'} className={emp.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{emp.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                            <TableCell className="text-xs">{formatDate(emp.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset contraseña" onClick={() => onResetPassword(emp.user)}>
                                <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* PRODUCTOS */}
            <TabsContent value="products">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin productos registrados</p></div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Producto</TableHead><TableHead>Categoría</TableHead><TableHead>IVA</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Estado</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {products.map((p) => (
                          <TableRow key={p.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>{p.category?.name || '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{p.taxRate ? `${p.taxRate.name} (${p.taxRate.rate}%)` : 'Sin IVA'}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{formatCOP(p.salePrice)}</TableCell>
                            <TableCell className="text-right"><span className={p.currentStock <= 5 ? 'text-red-600 font-medium' : ''}>{p.currentStock}</span></TableCell>
                            <TableCell><Badge variant={p.isActive ? 'default' : 'secondary'} className={p.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{p.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* CLIENTES */}
            <TabsContent value="customers">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {customers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><CreditCard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin clientes registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nombre</TableHead><TableHead>Teléfono</TableHead><TableHead>Email</TableHead><TableHead>NIT</TableHead><TableHead className="text-right">Deuda</TableHead><TableHead>Registro</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {customers.map((c) => (
                        <TableRow key={c.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                          <TableCell className="text-sm">{c.email || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{c.nit || '—'}</TableCell>
                          <TableCell className="text-right"><span className={c.totalDebt > 0 ? 'text-red-600 font-medium' : ''}>{formatCOP(c.totalDebt)}</span></TableCell>
                          <TableCell className="text-xs">{formatDate(c.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* ÓRDENES */}
            <TabsContent value="orders">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin órdenes registradas</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Pago</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm font-medium">{o.orderNumber}</TableCell>
                          <TableCell>{o.customer?.name || 'Consumidor'}</TableCell>
                          <TableCell className="text-right font-mono">{formatCOP(o.total)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{o.paymentMethod}</Badge></TableCell>
                          <TableCell><Badge variant={o.status === 'COMPLETED' ? 'default' : o.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{o.status}</Badge></TableCell>
                          <TableCell className="text-xs">{formatDateTime(o.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* SERVICIOS */}
            <TabsContent value="services">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {services.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin servicios registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Servicio</TableHead><TableHead className="text-right">Precio</TableHead><TableHead>Unidad</TableHead><TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {services.map((sv) => (
                        <TableRow key={sv.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{sv.name}</TableCell>
                          <TableCell className="text-right font-mono">{formatCOP(sv.price)}</TableCell>
                          <TableCell className="text-sm">{sv.unit}</TableCell>
                          <TableCell><Badge variant={sv.isActive ? 'default' : 'secondary'} className={sv.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{sv.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* IVA / TASAS */}
            <TabsContent value="taxes">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {taxRates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin tarifas de impuesto</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nombre</TableHead><TableHead>Código DIAN</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Tasa</TableHead><TableHead>Aplica a</TableHead><TableHead>Categoría</TableHead><TableHead>Defecto</TableHead><TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {taxRates.map((t) => (
                        <TableRow key={t.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell><Badge variant="outline" className="font-mono text-xs">{t.code}</Badge></TableCell>
                          <TableCell className="text-sm">{t.rateType === 'PERCENTAGE' ? 'Porcentaje' : 'Fijo'}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{t.rate}%</TableCell>
                          <TableCell className="text-sm">{t.applyTo === 'BOTH' ? 'Prod. y Serv.' : t.applyTo === 'PRODUCT' ? 'Productos' : 'Servicios'}</TableCell>
                          <TableCell className="text-sm">{t.category === 'SALES_TAX' ? 'Impuesto Venta' : t.category === 'CONSUMPTION_TAX' ? 'Consumo' : t.category}</TableCell>
                          <TableCell>{t.isDefault ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20">Sí</Badge> : '—'}</TableCell>
                          <TableCell><Badge variant={t.isActive ? 'default' : 'secondary'} className={t.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{t.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* CATEGORÍAS */}
            <TabsContent value="categories">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {categories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin categorías</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Categoría</TableHead><TableHead className="text-right">Productos</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {categories.map((c) => (
                        <TableRow key={c.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right"><Badge variant="secondary">{c._count.products}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* ROLES */}
            <TabsContent value="roles">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {roles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin roles definidos</p></div>
                ) : (
                  <div className="divide-y">
                    {roles.map((r) => {
                      const perms = JSON.parse(r.permissions || '{}') as Record<string, boolean>
                      const activeCount = Object.values(perms).filter(Boolean).length
                      return (
                        <div key={r.id} className="p-4 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{r.name}</span>
                              {r.isDefault && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 text-xs">Por defecto</Badge>}
                              <Badge variant="outline" className="text-xs">{r._count.employees} empleados</Badge>
                              <Badge variant="secondary" className="text-xs">{activeCount} módulos activos</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{r.description || ''}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(perms).map(([key, val]) => (
                              <Badge key={key} variant={val ? 'default' : 'outline'} className={`text-[10px] ${val ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : 'opacity-50'}`}>
                                {key}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* GASTOS */}
            <TabsContent value="expenses">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><AlertCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin gastos registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Categoría</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Fecha</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id} className="hover:bg-muted/30">
                          <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                          <TableCell className="font-medium">{e.description}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">{formatCOP(e.amount)}</TableCell>
                          <TableCell className="text-xs">{formatDate(e.date)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* PROVEEDORES */}
            <TabsContent value="providers">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {providers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin proveedores registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nombre</TableHead><TableHead>Contacto</TableHead><TableHead>Teléfono</TableHead><TableHead>Email</TableHead><TableHead>NIT</TableHead><TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {providers.map((pv) => (
                        <TableRow key={pv.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{pv.name}</TableCell>
                          <TableCell className="text-sm">{pv.name}</TableCell>
                          <TableCell className="text-sm">{pv.phone || '—'}</TableCell>
                          <TableCell className="text-sm">{pv.email || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{pv.nit || '—'}</TableCell>
                          <TableCell><Badge variant={pv.isActive ? 'default' : 'secondary'} className={pv.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{pv.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* COMPROBANTES DE PAGO — Rediseño profesional */}
            <TabsContent value="receipts">
              <div className="space-y-4">
                {/* Header con stats rápidos */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Comprobantes de Pago</h3>
                      <p className="text-xs text-muted-foreground">Historial y gestión de pagos de {store.name}</p>
                    </div>
                  </div>
                  <Button onClick={openUploadDialog} className="gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20" size="sm">
                    <Plus className="h-4 w-4" />Registrar Comprobante
                  </Button>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Banknote className="h-3 w-3" />Total</div>
                    <p className="text-lg font-bold">{receipts.length}</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-1"><Clock className="h-3 w-3" />Pendientes</div>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{receipts.filter(r => r.status === 'PENDING').length}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1"><BadgeCheck className="h-3 w-3" />Aprobados</div>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{receipts.filter(r => r.status === 'APPROVED').length}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CircleDollarSign className="h-3 w-3" />Total aprobado</div>
                    <p className="text-lg font-bold font-mono">{formatCOP(receipts.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0))}</p>
                  </div>
                </div>

                {/* Filtros */}
                {receipts.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
                      <Button key={f} variant={receiptFilter === f ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setReceiptFilter(f)}>
                        {f === 'ALL' ? 'Todos' : f === 'PENDING' ? 'Pendientes' : f === 'APPROVED' ? 'Aprobados' : 'Rechazados'}
                        <span className="text-[10px] opacity-70">({f === 'ALL' ? receipts.length : receipts.filter(r => r.status === f).length})</span>
                      </Button>
                    ))}
                  </div>
                )}

                {/* Lista de comprobantes */}
                {receiptsLoading ? (
                  <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : (() => {
                  const filtered = receiptFilter === 'ALL' ? receipts : receipts.filter(r => r.status === receiptFilter)
                  return filtered.length === 0 ? (
                    <Card className="rounded-xl border-border/50 border-dashed">
                      <CardContent className="py-12 text-center">
                        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4"><FileCheck2 className="h-8 w-8 text-muted-foreground/30" /></div>
                        <p className="text-sm font-medium text-muted-foreground">{receipts.length === 0 ? 'Sin comprobantes de pago' : 'Sin comprobantes en esta categoría'}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">{receipts.length === 0 ? 'Registra el primer comprobante cuando el cliente realice el pago por Nequi, Daviplata o consignación.' : 'Cambia el filtro para ver otros comprobantes.'}</p>
                        {receipts.length === 0 && (
                          <Button onClick={openUploadDialog} size="sm" className="gap-2 mt-4 active:scale-[0.98] transition-all"><Upload className="h-3.5 w-3.5" />Registrar Primer Comprobante</Button>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((r) => (
                        <Card key={r.id} className={`rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${r.status === 'PENDING' ? 'border-amber-500/30 bg-amber-500/[0.02]' : r.status === 'APPROVED' ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                          <CardContent className="p-0">
                            <div className="flex flex-col sm:flex-row">
                              <div className={`w-1.5 shrink-0 ${r.status === 'PENDING' ? 'bg-amber-500' : r.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              <div className="flex-1 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                  <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold font-mono text-lg">{formatCOP(r.amount)}</span>
                                      <Badge variant="outline" className="text-[10px] gap-1"><Wallet className="h-2.5 w-2.5" />{r.paymentMethod}</Badge>
                                      {r.status === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Pendiente</Badge>}
                                      {r.status === 'APPROVED' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px] gap-1"><BadgeCheck className="h-2.5 w-2.5" />Aprobado</Badge>}
                                      {r.status === 'REJECTED' && <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 text-[10px] gap-1"><XCircle className="h-2.5 w-2.5" />Rechazado</Badge>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDateTime(r.createdAt)}</span>
                                      {r.reference && <span className="font-mono flex items-center gap-1"><Hash className="h-3 w-3" />Ref: {r.reference}</span>}
                                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{r.fileName}</span>
                                      <span className="flex items-center gap-1">{(r.fileSize / 1024).toFixed(0)} KB</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      {/* Plan Change Request Detection */}
                                      {(() => {
                                        let planChange: { planChangeRequest: boolean; requestedPlanId: number; requestedPlanName: string; requestedBillingPeriod: string; userNotes: string | null } | null = null
                                        if (r.notes) {
                                          try {
                                            const parsed = JSON.parse(r.notes)
                                            if (parsed.planChangeRequest && parsed.requestedPlanName) planChange = parsed
                                          } catch { /* not JSON */ }
                                        }
                                        if (!planChange) {
                                          return r.notes ? <p className="text-xs text-muted-foreground italic">&#128221; {r.notes}</p> : null
                                        }
                                        return (
                                          <div className={`mt-1 p-2 rounded-lg border ${
                                            r.status === 'APPROVED' ? 'bg-violet-50 dark:bg-violet-500/5 border-violet-200/60 dark:border-violet-800/30'
                                            : r.status === 'REJECTED' ? 'bg-red-50 dark:bg-red-500/5 border-red-200/60 dark:border-red-800/30'
                                            : 'bg-sky-50 dark:bg-sky-500/5 border-sky-200/60 dark:border-sky-800/30'
                                          }`}>
                                            <div className="flex items-center gap-1.5">
                                              <ArrowRight className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                                              <p className={`text-xs font-semibold ${
                                                r.status === 'APPROVED' ? 'text-violet-700 dark:text-violet-300'
                                                : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                                                : 'text-sky-700 dark:text-sky-300'
                                              }`}>
                                                🔄 Solicitud de cambio a <span className="font-bold">{planChange.requestedPlanName}</span>
                                              </p>
                                            </div>
                                            {planChange.userNotes && (
                                              <p className="text-[11px] text-muted-foreground mt-0.5 italic">"{planChange.userNotes}"</p>
                                            )}
                                            {r.status === 'PENDING' && (
                                              <p className="text-[11px] text-sky-600/70 dark:text-sky-400/60 mt-0.5">
                                                ⚠️ Al aprobar, el plan se cambiará automáticamente.
                                              </p>
                                            )}
                                          </div>
                                        )
                                      })()}
                                      {r.reviewNotes && <p className="text-xs text-muted-foreground"><span className="font-medium">Revisión:</span> {r.reviewNotes}{r.reviewedAt && <span className="ml-1">· {formatDateTime(r.reviewedAt)}</span>}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleViewReceipt(r)}><EyeIcon className="h-3.5 w-3.5" />Ver</Button>
                                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleDownloadReceipt(r)}><Download className="h-3.5 w-3.5" />Descargar</Button>
                                    {r.status === 'PENDING' && (<>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Aprobar" onClick={() => { setPreviewReceipt(r); setReviewNotes('') }}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Rechazar" onClick={() => { setPreviewReceipt(r); setReviewNotes('') }}><XCircle className="h-4 w-4 text-red-500" /></Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar" onClick={() => handleDeleteReceipt(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </>)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setEditReceiptFile(null); setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) } setShowEditDialog(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Editar Datos del Establecimiento</DialogTitle>
            <DialogDescription>Modifique la información del local y del propietario</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Sección: Datos del Establecimiento */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Datos del Establecimiento</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre de la Tienda *</Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Nombre del negocio" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.name} onChange={(e) => updateEdit('name', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Razón Social</Label>
                  <Input className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Razón social" value={editForm.legalName} onChange={(e) => updateEdit('legalName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>NIT</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="901234567-8" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.nit} onChange={(e) => updateEdit('nit', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono del Local</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="6011234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.phone} onChange={(e) => updateEdit('phone', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Calle 10 #5-30" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.address} onChange={(e) => updateEdit('address', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Sección: Datos del Propietario */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Datos del Propietario</h3>
                <Badge variant="outline" className="text-xs font-mono">{store.user.cedula}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre Completo *</Label>
                  <Input className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Nombre del propietario" value={editForm.ownerFullName} onChange={(e) => updateEdit('ownerFullName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="correo@ejemplo.com" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.ownerEmail} onChange={(e) => updateEdit('ownerEmail', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="3001234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.ownerPhone} onChange={(e) => updateEdit('ownerPhone', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Sección: Comprobante de Pago */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Comprobante de Pago (Opcional)</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Archivo del comprobante</Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-3 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => document.getElementById('edit-receipt-file')?.click()}
                  >
                    {editReceiptFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium truncate">{editReceiptFile.name}</span>
                        <span className="text-xs text-muted-foreground">({(editReceiptFile.size / 1024).toFixed(0)}KB)</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditReceiptFile(null) }}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground"><Upload className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1" />Haz clic para seleccionar archivo</p>
                    )}
                    <input
                      id="edit-receipt-file"
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                      onChange={(e) => { if (e.target.files?.[0]) setEditReceiptFile(e.target.files[0]) }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Monto (COP)</Label>
                  <Input type="number" placeholder="50000" value={editReceiptForm.amount}
                    onChange={(e) => setEditReceiptForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <Select value={editReceiptForm.paymentMethod} onValueChange={(v) => setEditReceiptForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEQUI">Nequi</SelectItem>
                      <SelectItem value="DAVIPLATA">Davivienda (Daviplata)</SelectItem>
                      <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                      <SelectItem value="BANCARY">Bancario (Consignación)</SelectItem>
                      <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Referencia / Transacción</Label>
                  <Input placeholder="Ej: 000123456789" value={editReceiptForm.reference}
                    onChange={(e) => setEditReceiptForm(f => ({ ...f, reference: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Notas</Label>
                  <Textarea placeholder="Observaciones..." rows={2} value={editReceiptForm.notes}
                    onChange={(e) => setEditReceiptForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditReceiptFile(null); setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploadingReceipt} className="gap-2 active:scale-[0.98] transition-all">
              {saving || uploadingReceipt ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{uploadingReceipt ? 'Subiendo comprobante...' : 'Guardando...'}</>
              ) : (
                <><Pencil className="h-4 w-4" />Guardar Cambios</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={showChangePlanDialog} onOpenChange={setShowChangePlanDialog}>
        <DialogContent className="max-w-lg rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Cambiar Plan de Suscripción
            </DialogTitle>
            <DialogDescription>Seleccione un nuevo plan y período de facturación para {store.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Current plan info */}
            {subscription && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Plan Actual</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-semibold">{subscription.plan.name}</span>
                  {getSubscriptionStatusBadge(subscription.status)}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{subscription.billingPeriod}</span>
                </div>
              </div>
            )}

            {/* Plan selection */}
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={selectedPlanId} onValueChange={(val) => {
                setSelectedPlanId(val)
                // Auto-switch period: Trial plan → TRIAL, paid plan → MONTHLY
                const plan = plans.find(p => p.id.toString() === val)
                if (plan && plan.price === 0) {
                  setSelectedPeriod('TRIAL')
                } else if (selectedPeriod === 'TRIAL') {
                  setSelectedPeriod('MONTHLY')
                }
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccione un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id.toString()}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-medium">{plan.name}</span>
                        <span className="text-muted-foreground text-xs">{formatCOP(plan.price)}/mes</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Billing period */}
            <div className="space-y-3">
              <Label>Período de Facturación</Label>
              <RadioGroup value={selectedPeriod} onValueChange={setSelectedPeriod} className="grid grid-cols-2 gap-3">
                {BILLING_PERIODS.map((period) => (
                  <Label
                    key={period.value}
                    htmlFor={`period-${period.value}`}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${selectedPeriod === period.value ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <RadioGroupItem value={period.value} id={`period-${period.value}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{period.label}</p>
                      {period.discount > 0 && (
                        <p className="text-xs text-emerald-600 font-medium">-{period.discount}% descuento</p>
                      )}
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Price summary */}
            {selectedPlan && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                {selectedBillingPeriod.value === 'TRIAL' ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Plan Trial</span>
                      <span className="font-bold text-emerald-600">GRATIS — 7 días</span>
                    </div>
                    <p className="text-xs text-muted-foreground">El plan Trial permite evaluar el sistema con funcionalidad completa por 7 días. Luego puede actualizar a un plan de pago.</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Precio base</span>
                      <span>{formatCOP(selectedPlan.price)} × {selectedBillingPeriod.months} mes(es)</span>
                    </div>
                    {selectedBillingPeriod.discount > 0 && (
                      <div className="flex items-center justify-between text-sm text-emerald-600">
                        <span>Descuento ({selectedBillingPeriod.discount}%)</span>
                        <span>-{formatCOP(selectedPlan.price * selectedBillingPeriod.months * selectedBillingPeriod.discount / 100)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between font-bold">
                      <span>Total</span>
                      <span className="text-lg">{formatCOP(calculatedPrice)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Equivale a {formatCOP(Math.round(calculatedPrice / selectedBillingPeriod.months))}/mes
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePlanDialog(false)}>Cancelar</Button>
            <Button onClick={handleChangePlan} disabled={!selectedPlanId || changingPlan} className="gap-2 active:scale-[0.98] transition-all">
              {changingPlan ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Actualizando...</>
              ) : (
                <><Crown className="h-4 w-4" />Cambiar Plan</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Receipt Dialog — con preview de imagen */}
      <Dialog open={!!previewReceipt} onOpenChange={(open) => { if (!open) { setPreviewReceipt(null); setReviewNotes('') } }}>
        <DialogContent className="max-w-xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              Revisar Comprobante de Pago
            </DialogTitle>
            <DialogDescription>Verifica el comprobante y decide aprobar o rechazar el pago</DialogDescription>
          </DialogHeader>
          {previewReceipt && (
            <div className="space-y-4 py-2">
              {/* Info del pago */}
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Monto</p>
                    <p className="font-bold font-mono text-xl text-emerald-600 dark:text-emerald-400">{formatCOP(previewReceipt.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Método</p>
                    <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{previewReceipt.paymentMethod}</Badge>
                  </div>
                  {previewReceipt.reference && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Referencia</p>
                      <p className="font-mono text-sm">{previewReceipt.reference}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fecha registro</p>
                    <p className="text-sm">{formatDateTime(previewReceipt.createdAt)}</p>
                  </div>
                  {previewReceipt.notes && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Notas del cliente</p>
                      <p className="text-sm bg-muted/50 rounded px-2 py-1">{previewReceipt.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones rápidas de vista y descarga */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { handleViewReceipt(previewReceipt) }}>
                  <EyeIcon className="h-3.5 w-3.5" />Ver imagen del comprobante
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownloadReceipt(previewReceipt)}>
                  <Download className="h-3.5 w-3.5" />Descargar archivo
                </Button>
              </div>

              <Separator />

              {/* Notas de revisión */}
              <div className="space-y-2">
                <Label className="text-xs">Notas de revisión (opcional)</Label>
                <Textarea
                  placeholder="Ej: Pago verificado en cuenta bancaria..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="flex-1" />
            <Button variant="destructive" onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'REJECT')} disabled={reviewing} className="gap-2 active:scale-[0.98] transition-all">
              {reviewing ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
              Rechazar
            </Button>
            <Button onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'APPROVE')} disabled={reviewing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all">
              {reviewing ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Receipt Dialog — mejorado con preview */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => { if (!open) { setShowUploadDialog(false); setSelectedFile(null); setSelectedFilePreview(null) }}}>
        <DialogContent className="max-w-md rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                <Upload className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Registrar Comprobante de Pago
            </DialogTitle>
            <DialogDescription>Sube el comprobante del pago realizado por el cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Zona de subida con preview */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Archivo del comprobante <span className="text-destructive">*</span></Label>
              {!selectedFile ? (
                <div
                  className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 hover:bg-muted/20 transition-all cursor-pointer group"
                  onClick={() => document.getElementById('sa-receipt-file')?.click()}
                >
                  <div className="h-12 w-12 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/10 transition-colors">
                    <Upload className="h-6 w-6 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Haz clic o arrastra para subir</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">PNG, JPG, WebP, HEIC, PDF · Máximo 5MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedFilePreview && (
                    <div className="relative rounded-lg overflow-hidden border bg-muted/20">
                      <img src={selectedFilePreview} alt="Preview" className="max-h-40 mx-auto object-contain" />
                      <button
                        type="button" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}
                        className="absolute top-2 right-2 h-6 w-6 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-destructive/80 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}>
                      Cambiar
                    </Button>
                  </div>
                </div>
              )}
              <input id="sa-receipt-file" type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { toast.error('El archivo excede 5MB'); return }
                  setSelectedFile(file)
                  if (file.type.startsWith('image/')) {
                    const reader = new FileReader()
                    reader.onload = () => setSelectedFilePreview(reader.result as string)
                    reader.readAsDataURL(file)
                  } else {
                    setSelectedFilePreview(null)
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Monto del pago (COP) <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground font-medium">$</span>
                <Input type="number" placeholder="69.000" className="pl-7 font-mono" value={uploadForm.amount} onChange={(e) => setUploadForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Método de pago</Label>
              <Select value={uploadForm.paymentMethod} onValueChange={(v) => setUploadForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEQUI">🟣 Nequi</SelectItem>
                  <SelectItem value="DAVIPLATA">🟢 Daviplata</SelectItem>
                  <SelectItem value="BANCOLOMBIA">🟡 Bancolombia</SelectItem>
                  <SelectItem value="BANCARY">🏦 Consignación Bancaria</SelectItem>
                  <SelectItem value="EFFECTIVE">💵 Efectivo</SelectItem>
                  <SelectItem value="OTHER">📦 Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Referencia / N. transacción</Label>
              <Input placeholder="Ej: 000123456789" className="font-mono text-sm" value={uploadForm.reference} onChange={(e) => setUploadForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Notas adicionales</Label>
              <Textarea placeholder="Observaciones sobre el pago..." rows={2} value={uploadForm.notes} onChange={(e) => setUploadForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {/* Auto-approve toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${uploadForm.autoApprove ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'}`}>
                  {uploadForm.autoApprove ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                </div>
                <div>
                  <p className="text-xs font-medium">Aprobar automáticamente</p>
                  <p className="text-[10px] text-muted-foreground">
                    {uploadForm.autoApprove
                      ? 'Se extenderá la suscripción del cliente inmediatamente'
                      : 'Quedará pendiente para revisión manual posterior'}
                  </p>
                </div>
              </div>
              <Switch
                checked={uploadForm.autoApprove}
                onCheckedChange={(checked) => setUploadForm(f => ({ ...f, autoApprove: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); setSelectedFile(null); setSelectedFilePreview(null) }}>Cancelar</Button>
            <Button onClick={handleUploadReceipt} disabled={uploading || !selectedFile || !uploadForm.amount} className={`gap-2 active:scale-[0.98] transition-all ${uploadForm.autoApprove ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20' : ''}`}>
              {uploading ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{uploadForm.autoApprove ? 'Aprobando...' : 'Registrando...'}</>
              ) : uploadForm.autoApprove ? (
                <><CheckCircle2 className="h-4 w-4" />Registrar y Aprobar</>
              ) : (
                <><Upload className="h-4 w-4" />Registrar como Pendiente</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Image Preview Dialog */}
      <Dialog open={showReceiptPreviewDialog} onOpenChange={(open) => { if (!open) { setShowReceiptPreviewDialog(false); setReceiptPreviewData(null); setReceiptPreviewImage(null) } }}>
        <DialogContent className="max-w-2xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
                <EyeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Vista Previa del Comprobante
            </DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : receiptPreviewData ? (
            <div className="space-y-4">
              {/* Info rápida */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold font-mono text-lg text-emerald-600 dark:text-emerald-400">{formatCOP(receiptPreviewData.amount)}</span>
                <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{receiptPreviewData.paymentMethod}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(receiptPreviewData.createdAt)}</span>
              </div>
              {/* Imagen */}
              {receiptPreviewImage ? (
                <div className="rounded-lg border bg-muted/20 overflow-hidden">
                  <img src={receiptPreviewImage} alt="Comprobante" className="max-h-[60vh] mx-auto object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Vista previa no disponible para este tipo de archivo</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{receiptPreviewData.fileName} ({(receiptPreviewData.fileSize / 1024).toFixed(0)} KB)</p>
                </div>
              )}
              {/* Descargar */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => receiptPreviewData && handleDownloadReceipt(receiptPreviewData)}>
                  <Download className="h-3.5 w-3.5" />Descargar original
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <footer className="border-t py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        Ventify POS · Detalle de Tienda · {store.name}
      </footer>
    </div>
  )
}
