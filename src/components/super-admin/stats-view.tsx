'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Store, Building2, Users, Package, ShoppingCart, Crown, DollarSign,
  TrendingUp, Clock, BadgeCheck, AlertCircle, AlertTriangle, User, FileText,
  Receipt, Zap, CheckCircle2, XCircle, Phone, Mail,
} from 'lucide-react'
import { formatCOP, formatDate } from './helpers'
import type { StatsData } from './types'

interface StatsViewProps {
  stats: StatsData | null
  loading: boolean
}

export function StatsView({ stats, loading }: StatsViewProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <TrendingUp className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
        <p className="text-muted-foreground font-medium">Sin datos disponibles</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Las estadísticas aparecerán cuando haya tiendas registradas</p>
      </div>
    )
  }

  return (
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
  )
}
