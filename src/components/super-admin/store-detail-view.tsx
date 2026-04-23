'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'
import {
  Building2, Users, Package, ShoppingCart, ClipboardList, CreditCard,
  Crown, FileText, Receipt, Zap, Truck, AlertCircle, Shield, KeyRound,
  Trash2, ArrowRight, Upload, TrendingUp, TrendingDown, DollarSign,
  AlertTriangle, Pencil, Link2,
} from 'lucide-react'
import { formatCOP, formatDateTime, formatDate, getSubscriptionStatusBadge, UsageBar, BILLING_PERIODS } from './helpers'
import type { StoreDetail, PlanData, StoreOwner } from './types'
import { BranchesSection } from './branches-section'
import { PaymentReceiptsSection } from './payment-receipts-section'
import { EditStoreDialog } from './edit-store-dialog'

interface StoreDetailViewProps {
  store: StoreDetail
  plans: PlanData[]
  onBack: () => void
  onResetPassword: (user: StoreOwner) => void
  onRefresh: (storeId: number) => void
}

export function StoreDetailView({ store: detail, plans, onBack, onResetPassword, onRefresh }: StoreDetailViewProps) {
  const { store, stats, employees, roles, taxRates, categories, products, customers, orders, services, providers, expenses, subscription, inheritedFrom, dianInfo, invoiceStats } = detail
  const isBranch = !!store.parentStoreId
  const profit = stats.totalSales - stats.totalExpenses
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showResetProductsDialog, setShowResetProductsDialog] = useState(false)
  const [resettingProducts, setResettingProducts] = useState(false)
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscription?.planId?.toString() || '')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('MONTHLY')
  const [receiptCount, setReceiptCount] = useState(0)

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
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
        return Math.ceil((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      })()
    : null

  function openChangePlan() {
    const initialPlanId = subscription?.planId?.toString() || (plans.find(p => p.isActive)?.id?.toString() || '')
    const initialPlan = plans.find(p => p.id.toString() === initialPlanId)
    setSelectedPlanId(initialPlanId)
    if (initialPlan?.price === 0) {
      setSelectedPeriod('TRIAL')
    } else {
      setSelectedPeriod(subscription?.billingPeriod || 'MONTHLY')
    }
    setShowChangePlanDialog(true)
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
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}><ArrowRight className="h-4 w-4 rotate-180" />Volver</Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2.5">
          <div className={`h-8 w-8 ${isBranch ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-primary'} rounded-lg flex items-center justify-center`}>
            <Building2 className={`h-4 w-4 ${isBranch ? 'text-violet-600 dark:text-violet-400' : 'text-primary-foreground'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">{store.name}</h2>
              {isBranch && (
                <Badge variant="outline" className="text-[10px] gap-1 border-violet-300 dark:border-violet-500/30 text-violet-600 dark:text-violet-400">
                  <Link2 className="h-2.5 w-2.5" />Sucursal
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {store.user.fullName} · {store.nit || 'Sin NIT'}
              {isBranch && inheritedFrom && <span className="text-violet-500 dark:text-violet-400"> · Hereda de {inheritedFrom.name}</span>}
            </p>
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
                  <Button variant="default" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => setShowEditDialog(true)}>
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
          <Card className={`rounded-xl border-border/50 ${isBranch ? 'border-l-4 border-l-violet-500' : 'border-l-4 border-l-amber-500'}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isBranch ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-amber-100 dark:bg-amber-500/15'}`}>
                    <Crown className={`h-4 w-4 ${isBranch ? 'text-violet-600 dark:text-violet-400' : 'text-amber-600 dark:text-amber-400'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Suscripción
                      {isBranch && inheritedFrom && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-violet-300 dark:border-violet-500/30 text-violet-600 dark:text-violet-400">
                          <Link2 className="h-2.5 w-2.5" />Heredada
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {isBranch && inheritedFrom
                        ? <>Suscripción heredada de <span className="font-medium text-violet-600 dark:text-violet-400">{inheritedFrom.name}</span></>
                        : 'Plan y estado de la suscripción'}
                    </CardDescription>
                  </div>
                </div>
                {!isBranch && (
                  <Button variant="outline" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={openChangePlan}>
                    <CreditCard className="h-3.5 w-3.5" />Cambiar Plan
                  </Button>
                )}
                {isBranch && inheritedFrom && (
                  <Button variant="outline" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => onRefresh(inheritedFrom.id)}>
                    <ArrowRight className="h-3.5 w-3.5" />Ver Tienda Principal
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {subscription ? (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Plan Actual</p>
                    <div className="flex items-center gap-2">
                      <Crown className={`h-4 w-4 ${isBranch ? 'text-violet-500' : 'text-amber-500'}`} />
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
                {subscription && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Uso del Plan</p>
                    <div className="grid grid-cols-2 gap-3">
                      <UsageBar label="Empleados" current={store._count.employees} max={subscription.plan.maxEmployees} icon={<Users className="h-3 w-3" />} />
                      <UsageBar label="Productos" current={store._count.products} max={subscription.plan.maxProducts} icon={<Package className="h-3 w-3" />} />
                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="flex items-center justify-center py-6 text-center">
                  <div>
                    <Crown className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm text-muted-foreground">
                      {isBranch ? 'Sin suscripción heredada' : 'Sin suscripción activa'}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {isBranch ? 'La tienda principal no tiene suscripción activa' : 'Asigne un plan a esta tienda'}
                    </p>
                    {isBranch && inheritedFrom && (
                      <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => onRefresh(inheritedFrom.id)}>
                        <ArrowRight className="h-3.5 w-3.5" />Ver Tienda Principal
                      </Button>
                    )}
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

          {/* Sucursales (Branches) — only for parent stores, not for branches */}
          {!isBranch && (
            <BranchesSection
              storeId={store.id}
              storeName={store.name}
              storeLegalName={store.legalName}
              storeNit={store.nit}
              onRefresh={onRefresh}
            />
          )}

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
              <TabsTrigger value="receipts" className="gap-1.5"><Upload className="h-3.5 w-3.5" />Pagos ({receiptCount})</TabsTrigger>
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset contraseña" aria-label="Restablecer contraseña" onClick={() => onResetPassword(emp.user)}>
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

            {/* COMPROBANTES DE PAGO (extracted component) */}
            <PaymentReceiptsSection
              storeId={store.id}
              storeName={store.name}
              onRefresh={onRefresh}
              onCountChange={setReceiptCount}
            />
          </Tabs>
        </div>
      </main>

      {/* Edit Store Dialog */}
      <EditStoreDialog
        store={store}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSaved={() => onRefresh(store.id)}
      />

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
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={selectedPlanId} onValueChange={(val) => {
                setSelectedPlanId(val)
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

      <footer className="border-t py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        Ventify POS · Detalle de Tienda · {store.name}
      </footer>
    </div>
  )
}
