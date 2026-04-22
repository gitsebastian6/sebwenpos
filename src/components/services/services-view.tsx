'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { KPIBar } from '@/components/shared/kpi-bar'
import { es } from 'date-fns/locale'
import { CategoryIconPicker, getCategoryIconByName } from '@/components/ui/category-icon-picker'
import {
  Package,
  History,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Star,
  ScrollText,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────

interface Service {
  id: number
  name: string
  description: string | null
  price: number
  icon: string
  unit: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count?: { serviceTransactions: number }
}

interface ServiceTransaction {
  id: number
  serviceId: number
  quantity: number
  unitPrice: number
  totalAmount: number
  notes: string | null
  status: string
  createdAt: string
  updatedAt: string
  service: {
    id: number
    name: string
    icon: string
    unit: string
  }
}

// ─── Icon Rendering ─────────────────────────────────────────

const SERVICE_COLORS = [
  { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50' },
  { color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50' },
  { color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50' },
  { color: 'text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/50' },
  { color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/50' },
  { color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50' },
  { color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50' },
  { color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/50' },
  { color: 'text-lime-600 dark:text-lime-400', bgColor: 'bg-lime-50 dark:bg-lime-950/30 border-lime-200 dark:border-lime-800/50' },
  { color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800/50' },
]

// Deterministic color from icon name (same icon always = same color)
function getServiceColors(iconName: string) {
  let hash = 0
  for (let i = 0; i < iconName.length; i++) {
    hash = ((hash << 5) - hash + iconName.charCodeAt(i)) | 0
  }
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length]
}

function renderServiceIcon(iconName: string, size: 'sm' | 'md' = 'md') {
  const cls = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'
  const IconComponent = getCategoryIconByName(iconName)
  if (IconComponent) {
    return <IconComponent className={cls} />
  }
  // Fallback
  return <Star className={cls} />
}

const UNIT_OPTIONS = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'hora', label: 'Hora' },
  { value: 'rollo', label: 'Rollo' },
  { value: 'unidad', label: 'Unidad' },
  { value: 'vez', label: 'Vez' },
]

// ─── Component ───────────────────────────────────────────────

export function ServicesView() {
  const { store } = useAuthStore()
  const storeId = store?.id
  const currencyCode = store?.currencyCode || 'COP'

  // Data state
  const [services, setServices] = useState<Service[]>([])
  const [transactions, setTransactions] = useState<ServiceTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('servicios')

  // Service form state
  const [showCreateService, setShowCreateService] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formIcon, setFormIcon] = useState('Star')
  const [formUnit, setFormUnit] = useState('servicio')
  const [isSubmittingService, setIsSubmittingService] = useState(false)

  // Transaction form state
  const [showCreateTransaction, setShowCreateTransaction] = useState(false)
  const [txServiceId, setTxServiceId] = useState<number | ''>('')
  const [txQuantity, setTxQuantity] = useState('1')
  const [txUnitPrice, setTxUnitPrice] = useState('')
  const [txNotes, setTxNotes] = useState('')
  const [isSubmittingTx, setIsSubmittingTx] = useState(false)

  // Edit service dialog
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editIcon, setEditIcon] = useState('Star')
  const [editUnit, setEditUnit] = useState('servicio')
  const [isSavingService, setIsSavingService] = useState(false)

  // Edit transaction dialog
  const [editingTx, setEditingTx] = useState<ServiceTransaction | null>(null)
  const [editTxQuantity, setEditTxQuantity] = useState('')
  const [editTxUnitPrice, setEditTxUnitPrice] = useState('')
  const [editTxNotes, setEditTxNotes] = useState('')
  const [editTxStatus, setEditTxStatus] = useState('')
  const [isSavingTx, setIsSavingTx] = useState(false)

  // Delete confirmations
  const [deleteService, setDeleteService] = useState<Service | null>(null)
  const [deleteTx, setDeleteTx] = useState<ServiceTransaction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ─── Fetch ────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!storeId) return
    setIsLoading(true)
    try {
      const [servicesRes, transactionsRes] = await Promise.all([
        fetch(`/api/services?storeId=${storeId}`),
        fetch(`/api/services?storeId=${storeId}&include=transactions`),
      ])
      if (!servicesRes.ok || !transactionsRes.ok) throw new Error('Error al cargar datos')
      const servicesData = await servicesRes.json()
      const transactionsData = await transactionsRes.json()

      setServices(servicesData)

      // Flatten all transactions from all services
      const allTx: ServiceTransaction[] = []
      for (const s of transactionsData) {
        if (s.serviceTransactions) {
          for (const tx of s.serviceTransactions) {
            allTx.push({
              ...tx,
              unitPrice: Number(tx.unitPrice),
              totalAmount: Number(tx.totalAmount),
            })
          }
        }
      }
      allTx.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setTransactions(allTx)
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Service Handlers ───────────────────────────────────

  function openCreateService() {
    setFormName('')
    setFormDescription('')
    setFormPrice('')
    setFormIcon('Star')
    setFormUnit('servicio')
    setShowCreateService(true)
  }

  async function handleCreateService() {
    if (!storeId || !formName.trim() || !formPrice) {
      toast.error('Completa el nombre y precio')
      return
    }
    setIsSubmittingService(true)
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: formName.trim(),
          description: formDescription.trim() || null,
          price: Math.round(parseFloat(formPrice)),
          icon: formIcon,
          unit: formUnit,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al crear servicio')
      }
      toast.success('Servicio creado')
      setShowCreateService(false)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear servicio')
    } finally {
      setIsSubmittingService(false)
    }
  }

  function openEditService(s: Service) {
    setEditingService(s)
    setEditName(s.name)
    setEditDescription(s.description || '')
    setEditPrice(String(s.price))
    setEditIcon(s.icon)
    setEditUnit(s.unit)
  }

  async function handleSaveService() {
    if (!editingService) return
    setIsSavingService(true)
    try {
      const res = await fetch(`/api/services/${editingService.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          price: Math.round(parseFloat(editPrice)),
          icon: editIcon,
          unit: editUnit,
        }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      toast.success('Servicio actualizado')
      setEditingService(null)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setIsSavingService(false)
    }
  }

  async function handleDeleteService() {
    if (!deleteService) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/services/${deleteService.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Servicio eliminado')
      setDeleteService(null)
      fetchData()
    } catch {
      toast.error('Error al eliminar servicio')
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Transaction Handlers ──────────────────────────────

  function openCreateTransaction() {
    if (services.length === 0) {
      toast.error('Primero crea un servicio')
      return
    }
    setTxServiceId(services[0].id)
    setTxQuantity('1')
    setTxUnitPrice(String(services[0].price))
    setTxNotes('')
    setShowCreateTransaction(true)
  }

  // Auto-set unit price when service changes
  useEffect(() => {
    if (txServiceId) {
      const svc = services.find(s => s.id === txServiceId)
      if (svc) {
        setTxUnitPrice(String(svc.price))
      }
    }
  }, [txServiceId, services])

  async function handleCreateTransaction() {
    if (!storeId || !txServiceId || !txQuantity || !txUnitPrice) {
      toast.error('Completa todos los campos')
      return
    }
    const qty = parseInt(txQuantity)
    const price = Math.round(parseFloat(txUnitPrice))
    if (isNaN(qty) || qty < 1 || isNaN(price) || price < 0) {
      toast.error('Valores inválidos')
      return
    }
    setIsSubmittingTx(true)
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'transaction',
          storeId,
          serviceId: txServiceId,
          quantity: qty,
          unitPrice: price,
          totalAmount: qty * price,
          notes: txNotes.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al registrar')
      }
      toast.success('Servicio registrado')
      setShowCreateTransaction(false)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setIsSubmittingTx(false)
    }
  }

  function openEditTx(tx: ServiceTransaction) {
    setEditingTx(tx)
    setEditTxQuantity(String(tx.quantity))
    setEditTxUnitPrice(String(tx.unitPrice))
    setEditTxNotes(tx.notes || '')
    setEditTxStatus(tx.status)
  }

  async function handleSaveTx() {
    if (!editingTx) return
    const qty = parseInt(editTxQuantity)
    const price = Math.round(parseFloat(editTxUnitPrice))
    if (isNaN(qty) || isNaN(price)) return
    setIsSavingTx(true)
    try {
      const res = await fetch(`/api/services/transactions/${editingTx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qty,
          unitPrice: price,
          totalAmount: qty * price,
          notes: editTxNotes.trim() || null,
          status: editTxStatus,
        }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      toast.success('Transacción actualizada')
      setEditingTx(null)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setIsSavingTx(false)
    }
  }

  async function handleDeleteTx() {
    if (!deleteTx) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/services/transactions/${deleteTx.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Transacción eliminada')
      setDeleteTx(null)
      fetchData()
    } catch {
      toast.error('Error al eliminar transacción')
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  function formatDate(dateStr: string) {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return format(d, "d MMM yyyy, HH:mm", { locale: es })
  }

  function formatDateShort(dateStr: string) {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return format(d, "dd/MM/yy", { locale: es })
  }

  // Calculate daily stats for papel higiénico
  function getTodayPapelStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const papelService = services.find(s => s.name.toLowerCase().includes('papel'))
    if (!papelService) return null
    const todayTx = transactions.filter(
      t => t.serviceId === papelService.id && t.status === 'COMPLETED' && new Date(t.createdAt) >= today
    )
    const totalRollos = todayTx.reduce((sum, t) => sum + t.quantity, 0)
    const totalCosto = todayTx.reduce((sum, t) => sum + t.totalAmount, 0)
    return { totalRollos, totalCosto, txCount: todayTx.length }
  }

  // ─── Render ───────────────────────────────────────────────

  const papelStats = getTodayPapelStats()

  return (
    <div className="space-y-6">
      <KPIBar context="services" />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center pt-4 pb-4">
            <Package className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-2xl font-bold">{services.length}</span>
            <span className="text-xs text-muted-foreground">Servicios</span>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center pt-4 pb-4">
            <History className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-2xl font-bold">{transactions.length}</span>
            <span className="text-xs text-muted-foreground">Registros</span>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center pt-4 pb-4">
            <TrendingUp className="h-5 w-5 text-emerald-600 mb-1" />
            <span className="text-2xl font-bold">
              {formatCurrency(
                transactions.filter(t => t.status === 'COMPLETED').reduce((s, t) => s + t.totalAmount, 0),
                currencyCode
              )}
            </span>
            <span className="text-xs text-muted-foreground">Total Ingresado</span>
          </CardContent>
        </Card>
        {papelStats && (
          <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
            <CardContent className="flex flex-col items-center justify-center pt-4 pb-4">
              <ScrollText className="h-5 w-5 text-sky-600 mb-1" />
              <span className="text-2xl font-bold">{papelStats.totalRollos}</span>
              <span className="text-xs text-muted-foreground">Rollos Hoy</span>
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        {/* ═══ SERVICIOS TAB ═══ */}
        <TabsContent value="servicios" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Servicios del Bar</h2>
              <p className="text-sm text-muted-foreground">Administra los servicios que ofreces</p>
            </div>
            <Button className="active:scale-[0.98] transition-all" onClick={openCreateService} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Servicio
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-14 w-14 mb-3 opacity-40 animate-pulse" />
                <p className="text-sm">No hay servicios creados</p>
                <p className="text-xs">Crea tu primer servicio</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((s) => {
                const colors = getServiceColors(s.icon)
                return (
                  <Card key={s.id} className={`relative border ${colors.bgColor} ${!s.isActive ? 'opacity-60' : ''}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={colors.color}>
                            {renderServiceIcon(s.icon)}
                          </div>
                          <div>
                            <CardTitle className="text-sm font-semibold">{s.name}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              {s.description || 'Sin descripción'}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost"
                            size="icon"
                            className="h-7 w-7 active:scale-[0.98] transition-all"
                            onClick={() => openEditService(s)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive active:scale-[0.98] transition-all"
                            onClick={() => setDeleteService(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xl font-bold">{formatCurrency(s.price, currencyCode)}</span>
                          <span className="text-xs text-muted-foreground ml-1">/ {s.unit}</span>
                        </div>
                        <Badge variant={s.isActive ? 'outline' : 'secondary'} className="text-xs">
                          {s.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      {s._count && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {s._count.serviceTransactions} registro(s)
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ HISTORIAL TAB ═══ */}
        <TabsContent value="historial" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Historial de Servicios</h2>
              <p className="text-sm text-muted-foreground">Registro de servicios prestados</p>
            </div>
            <Button className="active:scale-[0.98] transition-all" onClick={openCreateTransaction} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Registrar Servicio
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <History className="h-14 w-14 mb-3 opacity-40 animate-pulse" />
                <p className="text-sm">No hay registros</p>
                <p className="text-xs">Los servicios registrados aparecerán aquí</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  {/* Desktop Table */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead className="w-[130px]">Fecha</TableHead>
                        <TableHead>Servicio</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Notas</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="w-[80px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow className="hover:bg-muted/30 transition-colors" key={tx.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(tx.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={getServiceColors(tx.service?.icon || 'Star').color}>
                                {renderServiceIcon(tx.service?.icon || 'Star', 'sm')}
                              </div>
                              <span className="text-sm font-medium">{tx.service?.name || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {tx.quantity} {tx.service?.unit || ''}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(tx.unitPrice, currencyCode)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatCurrency(tx.totalAmount, currencyCode)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {tx.notes || '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            {tx.status === 'COMPLETED' ? (
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Completado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400 gap-1">
                                <XCircle className="h-3 w-3" />
                                Cancelado
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-7 w-7 active:scale-[0.98] transition-all" onClick={() => openEditTx(tx)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive active:scale-[0.98] transition-all" onClick={() => setDeleteTx(tx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={getServiceColors(tx.service?.icon || 'Star').color}>
                              {renderServiceIcon(tx.service?.icon || 'Star', 'sm')}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{tx.service?.name || 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">{formatCurrency(tx.totalAmount, currencyCode)}</p>
                            {tx.status === 'COMPLETED' ? (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                Completado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400">
                                Cancelado
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{tx.quantity} {tx.service?.unit || 'servicio'} × {formatCurrency(tx.unitPrice, currencyCode)}</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6 active:scale-[0.98] transition-all" onClick={() => openEditTx(tx)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive active:scale-[0.98] transition-all" onClick={() => setDeleteTx(tx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {tx.notes && (
                          <p className="text-xs text-muted-foreground italic">{tx.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ CREATE SERVICE DIALOG ═══ */}
      <Dialog open={showCreateService} onOpenChange={(open) => !open && setShowCreateService(false)}>
        <DialogContent className="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Nuevo Servicio</DialogTitle>
            <DialogDescription>Crea un nuevo servicio para el bar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Servicio de Billar" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Descripción opcional" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio (COP) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input type="number" min="0" className="pl-7 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ícono</Label>
              <CategoryIconPicker value={formIcon} onChange={setFormIcon} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateService(false)}>Cancelar</Button>
            <Button className="active:scale-[0.98] transition-all" onClick={handleCreateService} disabled={isSubmittingService}>
              {isSubmittingService && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Servicio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CREATE TRANSACTION DIALOG ═══ */}
      <Dialog open={showCreateTransaction} onOpenChange={(open) => !open && setShowCreateTransaction(false)}>
        <DialogContent className="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Registrar Servicio</DialogTitle>
            <DialogDescription>Registra la prestación de un servicio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Servicio *</Label>
              <Select value={String(txServiceId)} onValueChange={(v) => setTxServiceId(Number(v))}>
                <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue placeholder="Selecciona servicio" /></SelectTrigger>
                <SelectContent>
                  {services.filter(s => s.isActive).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad *</Label>
                <Input type="number" min="1" value={txQuantity} onChange={(e) => setTxQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Precio Unit. (COP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input type="number" min="0" className="pl-7 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={txUnitPrice} onChange={(e) => setTxUnitPrice(e.target.value)} />
                </div>
              </div>
            </div>
            {txQuantity && txUnitPrice && !isNaN(parseFloat(txQuantity)) && !isNaN(parseFloat(txUnitPrice)) && (
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <span className="text-sm text-muted-foreground">Total: </span>
                <span className="text-lg font-bold">
                  {formatCurrency(Math.round(parseFloat(txQuantity) * parseFloat(txUnitPrice)), currencyCode)}
                </span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input value={txNotes} onChange={(e) => setTxNotes(e.target.value)} placeholder="Descripción opcional del registro" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTransaction(false)}>Cancelar</Button>
            <Button className="active:scale-[0.98] transition-all" onClick={handleCreateTransaction} disabled={isSubmittingTx}>
              {isSubmittingTx && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ EDIT SERVICE DIALOG ═══ */}
      <Dialog open={!!editingService} onOpenChange={(open) => !open && setEditingService(null)}>
        <DialogContent className="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Editar Servicio</DialogTitle>
            <DialogDescription>Modifica los datos del servicio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio (COP) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input type="number" min="0" className="pl-7 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Select value={editUnit} onValueChange={setEditUnit}>
                  <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ícono</Label>
              <CategoryIconPicker value={editIcon} onChange={setEditIcon} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingService(null)}>Cancelar</Button>
            <Button className="active:scale-[0.98] transition-all" onClick={handleSaveService} disabled={isSavingService}>
              {isSavingService && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ EDIT TRANSACTION DIALOG ═══ */}
      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Editar Registro #{editingTx?.id}</DialogTitle>
            <DialogDescription>Modifica los datos del registro</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium">{editingTx?.service?.name}</p>
              <p className="text-xs text-muted-foreground">{editingTx ? formatDate(editingTx.createdAt) : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad *</Label>
                <Input type="number" min="1" value={editTxQuantity} onChange={(e) => setEditTxQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Precio Unit. (COP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input type="number" min="0" className="pl-7 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editTxUnitPrice} onChange={(e) => setEditTxUnitPrice(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input value={editTxNotes} onChange={(e) => setEditTxNotes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={editTxStatus} onValueChange={setEditTxStatus}>
                <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Completado</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTx(null)}>Cancelar</Button>
            <Button className="active:scale-[0.98] transition-all" onClick={handleSaveTx} disabled={isSavingTx}>
              {isSavingTx && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE SERVICE CONFIRMATION ═══ */}
      <AlertDialog open={!!deleteService} onOpenChange={(open) => !open && setDeleteService(null)}>
        <AlertDialogContent className="backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Servicio</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar &quot;{deleteService?.name}&quot;? Se eliminarán todos sus registros asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteService}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ DELETE TRANSACTION CONFIRMATION ═══ */}
      <AlertDialog open={!!deleteTx} onOpenChange={(open) => !open && setDeleteTx(null)}>
        <AlertDialogContent className="backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Registro</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar este registro de servicio? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTx}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
