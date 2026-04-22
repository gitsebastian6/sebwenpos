'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import type { OpenTable } from '@/types'
import { formatCurrency } from '@/lib/auth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  Package,
  Armchair,
  Receipt,
  ShoppingCart,
  Target,
  CalendarDays,
  Warehouse,
  Flame,
  BarChart3,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Info,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── Types ───────────────────────────────────────────────

interface KPIS {
  sales: {
    today: number; yesterday: number; variance: number
    thisMonth: number; lastMonth: number; monthVariance: number
    thisYear: number
  }
  profitability: {
    today: { revenue: number; cogs: number; grossProfit: number; margin: number; avgTicket: number }
    month: { revenue: number; cogs: number; grossProfit: number; margin: number; netRevenue: number; netProfit: number; discounts: number; tips: number }
    year: { revenue: number; cogs: number; grossProfit: number; margin: number }
  }
  inventory: { totalCost: number; daysOfInventory: number; avgDailyCOGS: number }
  losses: { outOfStockCount: number; outOfStockValue: number; estimatedLostDailyRevenue: number; estimatedLostMonthlyRevenue: number }
  breakEven: { monthlyFixedCosts: number; variableCostRatio: number; contributionMargin: number; breakEvenPoint: number; distanceToBreakEven: number; achievedPercent: number }
  operational: { ordersToday: number; ordersThisMonth: number; avgTicketMonth: number; totalDebt: number; openTablesCount: number; openTables: OpenTable[] }
}

interface DashboardData {
  kpis: KPIS
  salesByDay: { date: string; total: number }[]
  topProducts: Array<{ product: { id: number; name: string; imgUrl?: string | null } | null; totalQuantity: number; totalRevenue: number; totalCOGS: number; grossProfit: number; marginPercent: number }>
  lowStockProducts: Array<{ id: number; name: string; currentStock: number; minStock: number }>
  recentOrders: Array<{ id: number; orderNumber: string; status: string; total: number; customerName: string | null; createdAt: string }>
}

// ── Chart Config ────────────────────────────────────────

const salesChartConfig = {
  sales: { label: 'Ventas', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

// ── Helpers ─────────────────────────────────────────────

function fmtShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function VarianceBadge({ value }: { value: number }) {
  if (value === 0) return <Badge variant="secondary" className="text-[10px]">—</Badge>
  const isUp = value > 0
  return (
    <Badge className={`text-[10px] gap-0.5 ${isUp ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800'}`}>
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </Badge>
  )
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    CREDIT: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }
  return map[status] || ''
}
function statusLabel(s: string) {
  const m: Record<string, string> = { COMPLETED: 'Completada', CREDIT: 'Fiado', PENDING: 'Pendiente', CANCELLED: 'Cancelada' }
  return m[s] || s
}

function marginColor(margin: number) {
  if (margin >= 50) return 'text-emerald-600 dark:text-emerald-400'
  if (margin >= 30) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function healthColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-500'
  if (percent >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

// ── Loading Skeleton ────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="rounded-xl border-border/50"><CardContent className="p-6"><Skeleton className="h-20 w-full rounded-lg" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="rounded-xl border-border/50"><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  )
}

// ── Mini KPI Card ───────────────────────────────────────

function KPICard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  subtitle,
  badge,
  tooltip,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  subtitle?: string
  badge?: React.ReactNode
  tooltip?: string
}) {
  const card = (
    <Card className="gap-3 rounded-xl border-border/50 hover:shadow-md transition-shadow duration-200">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardDescription className="text-xs font-medium text-muted-foreground">{title}</CardDescription>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-inset ring-primary/20 shadow-[0_0_10px_rgba(16,185,129,0.08)] ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <p className="text-xl font-bold tracking-tight leading-none">{value}</p>
          {badge}
        </div>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-1.5">{subtitle}</p>}
      </CardContent>
    </Card>
  )

  if (tooltip) {
    return (
      <TooltipProvider><Tooltip><TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip></TooltipProvider>
    )
  }
  return card
}

// ── Main Component ──────────────────────────────────────

export function DashboardView() {
  const store = useAuthStore((s) => s.store)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    if (!store) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/dashboard?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  if (loading) return <DashboardSkeleton />
  if (error) return (
    <Card className="border-destructive/50 rounded-xl"><CardContent className="p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive animate-pulse" />
        <p className="font-semibold">Error al cargar</p>
        <button onClick={fetchDashboard} className="text-sm text-primary underline">Reintentar</button>
      </div>
    </CardContent></Card>
  )
  if (!data) return null

  const cc = store?.currencyCode || 'COP'
  const kpi = data.kpis

  // Chart data
  const chartData = (data.salesByDay || []).map((d) => ({
    ...d,
    dateLabel: fmtShort(d.date),
    sales: d.total,
  }))

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* ═══════════════════════════════════════════════ */}
        {/* ── SECCIÓN 1: VENTAS (3 KPIs principales) ── */}
        {/* ═══════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ventas</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              title="Ventas Hoy"
              value={formatCurrency(kpi.sales.today, cc)}
              icon={CalendarDays}
              iconBg="bg-emerald-100 dark:bg-emerald-900/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              subtitle={`${kpi.operational.ordersToday} órdenes · Ticket ${formatCurrency(kpi.profitability.today.avgTicket, cc)}`}
              badge={<VarianceBadge value={kpi.sales.variance} />}
            />
            <KPICard
              title="Ventas del Mes"
              value={formatCurrency(kpi.sales.thisMonth, cc)}
              icon={BarChart3}
              iconBg="bg-sky-100 dark:bg-sky-900/40"
              iconColor="text-sky-600 dark:text-sky-400"
              subtitle={`${kpi.operational.ordersThisMonth} órdenes · ${formatCurrency(kpi.operational.avgTicketMonth, cc)} promedio`}
              badge={<VarianceBadge value={kpi.sales.monthVariance} />}
            />
            <KPICard
              title="Ventas del Año"
              value={formatCurrency(kpi.sales.thisYear, cc)}
              icon={TrendingUp}
              iconBg="bg-violet-100 dark:bg-violet-900/40"
              iconColor="text-violet-600 dark:text-violet-400"
              tooltip={`Utilidad bruta anual: ${formatCurrency(kpi.profitability.year.grossProfit, cc)} (${kpi.profitability.year.margin}%)`}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── SECCIÓN 2: RENTABILIDAD ── */}
        {/* ═══════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Rentabilidad</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Utilidad Bruta (Mes)"
              value={formatCurrency(kpi.profitability.month.grossProfit, cc)}
              icon={TrendingUp}
              iconBg="bg-emerald-100 dark:bg-emerald-900/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              subtitle={`Margen: ${kpi.profitability.month.margin}%`}
              tooltip={`Ingresos: ${formatCurrency(kpi.profitability.month.revenue, cc)} · Costos: ${formatCurrency(kpi.profitability.month.cogs, cc)}`}
            />
            <KPICard
              title="Utilidad Neta (Mes)"
              value={formatCurrency(kpi.profitability.month.netProfit, cc)}
              icon={ShieldCheck}
              iconBg={kpi.profitability.month.netProfit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}
              iconColor={kpi.profitability.month.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
              subtitle={kpi.profitability.month.discounts > 0 ? `Descuentos: ${formatCurrency(kpi.profitability.month.discounts, cc)}` : undefined}
              tooltip={`Ventas netas (sin descuentos): ${formatCurrency(kpi.profitability.month.netRevenue, cc)} · Tips: ${formatCurrency(kpi.profitability.month.tips, cc)}`}
            />
            <KPICard
              title="Costo Inventario"
              value={formatCurrency(kpi.inventory.totalCost, cc)}
              icon={Warehouse}
              iconBg="bg-amber-100 dark:bg-amber-900/40"
              iconColor="text-amber-600 dark:text-amber-400"
              subtitle={`COGS promedio/día: ${formatCurrency(kpi.inventory.avgDailyCOGS, cc)}`}
              tooltip={`Días de inventario: ${kpi.inventory.daysOfInventory} (rotación)`}
            />
            <KPICard
              title="Días de Inventario"
              value={`${kpi.inventory.daysOfInventory} días`}
              icon={Package}
              iconBg={kpi.inventory.daysOfInventory <= 15 ? 'bg-emerald-100 dark:bg-emerald-900/40' : kpi.inventory.daysOfInventory <= 30 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-red-100 dark:bg-red-900/40'}
              iconColor={kpi.inventory.daysOfInventory <= 15 ? 'text-emerald-600 dark:text-emerald-400' : kpi.inventory.daysOfInventory <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
              subtitle={kpi.inventory.daysOfInventory <= 15 ? '✓ Rotación óptima' : kpi.inventory.daysOfInventory <= 30 ? '⚠ Rotación aceptable' : '✗ Inventario alto'}
              tooltip={`Costo inventario ÷ COGS diario = días que puedes operar sin reabastecer. Ideal: <15 días para un bar.`}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── SECCIÓN 3: GRÁFICA + TOP PRODUCTOS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-xl border-border/50 hover:shadow-md transition-shadow duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <CardHeader>
              <CardTitle className="text-base">Ventas Últimos 7 Días</CardTitle>
              <CardDescription>Ingresos diarios en {cc}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={salesChartConfig} className="h-[260px] w-full">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value: any) => <span className="font-mono font-medium">{formatCurrency(Number(value), cc)}</span>} />} />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.sales === 0 ? 'hsl(0, 0%, 88%)' : 'hsl(142, 71%, 45%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/50 hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-4 w-4 text-emerald-500" />
                Top 10 Productos (Margen)
              </CardTitle>
              <CardDescription>Por unidades vendidas con rentabilidad</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/30 mb-2 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Sin datos de ventas</p>
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                  {data.topProducts.map((p, i) => (
                    <div key={p.product?.id || i} className="flex items-center justify-between rounded-lg border border-border/50 p-2.5 gap-2 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.product?.name || 'Eliminado'}</p>
                          <p className="text-[11px] text-muted-foreground">{p.totalQuantity} uds · Costo: {formatCurrency(p.totalCOGS, cc)}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatCurrency(p.totalRevenue, cc)}</p>
                        <p className={`text-[11px] font-medium ${marginColor(p.marginPercent)}`}>
                          +{formatCurrency(p.grossProfit, cc)} ({p.marginPercent}%)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── SECCIÓN 4: PUNTO DE EQUILIBRIO + PÉRDIDAS ── */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Punto de Equilibrio */}
          <Card className="border border-dashed border-border/50 rounded-xl hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Punto de Equilibrio
              </CardTitle>
              <CardDescription>Ventas mínimas para cubrir costos del mes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Ventas del mes</span>
                  <span>{kpi.breakEven.achievedPercent}% del objetivo</span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${kpi.breakEven.achievedPercent >= 100 ? 'bg-emerald-500' : kpi.breakEven.achievedPercent >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, kpi.breakEven.achievedPercent)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-1">Punto de Equilibrio</p>
                  <p className="text-lg font-bold">{formatCurrency(kpi.breakEven.breakEvenPoint, cc)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {kpi.breakEven.distanceToBreakEven > 0 ? 'Faltan para equilibrar' : '✓ Superado'}
                  </p>
                  <p className={`text-lg font-bold ${kpi.breakEven.distanceToBreakEven > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {kpi.breakEven.distanceToBreakEven > 0 ? formatCurrency(kpi.breakEven.distanceToBreakEven, cc) : '¡Equilibrado!'}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div>
                  <p className="text-muted-foreground">Costos Fijos</p>
                  <p className="font-semibold">{formatCurrency(kpi.breakEven.monthlyFixedCosts, cc)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Costo Variable</p>
                  <p className="font-semibold">{(kpi.breakEven.variableCostRatio * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Margen Contribución</p>
                  <p className="font-semibold">{(kpi.breakEven.contributionMargin * 100).toFixed(1)}%</p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>El punto de equilibrio es la cifra mínima en ventas para no perder dinero. Se calcula: Costos Fijos ÷ (1 − Ratio Costo Variable).</p>
              </div>
            </CardContent>
          </Card>

          {/* Pérdidas y Faltantes */}
          <Card className="border border-dashed border-border/50 rounded-xl hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Pérdidas y Alertas
              </CardTitle>
              <CardDescription>Stock agotado y ventas perdidas por faltantes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-1">Productos Agotados</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{kpi.losses.outOfStockCount}</p>
                </div>
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-1">Valor en Ventas Perdidas/Día</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(kpi.losses.estimatedLostDailyRevenue, cc)}</p>
                </div>
              </div>

              <Separator />

              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-medium">Estimación pérdida mensual</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(kpi.losses.estimatedLostMonthlyRevenue, cc)}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">Basado en la velocidad de venta de los {kpi.losses.outOfStockCount} productos agotados en los últimos 30 días</p>
              </div>

              {data.lowStockProducts.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">⚠ Productos en mínimo ({data.lowStockProducts.length})</p>
                    <div className="max-h-[100px] overflow-y-auto space-y-1">
                      {data.lowStockProducts.slice(0, 8).map(p => (
                        <div key={p.id} className="flex justify-between text-xs">
                          <span className="truncate">{p.name}</span>
                          <span className={p.currentStock === 0 ? 'text-red-600 font-semibold' : 'text-amber-600'}>{p.currentStock}/{p.minStock}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── SECCIÓN 5: RESUMEN RÁPIDO + OPERACIONES ── */}
        {/* ═══════════════════════════════════════════════ */}
        <Card className="border border-dashed border-border/50 rounded-xl hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Ticket Prom:</span>
                <span className="font-semibold">{formatCurrency(kpi.operational.avgTicketMonth, cc)}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <Armchair className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Mesas:</span>
                <span className="font-semibold">{kpi.operational.openTablesCount} abiertas</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">CxC:</span>
                <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(kpi.operational.totalDebt, cc)}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Margen Mes:</span>
                <Badge className={kpi.profitability.month.margin >= 40 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : kpi.profitability.month.margin >= 25 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>
                  {kpi.profitability.month.margin}%
                </Badge>
              </div>
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Ventas Netas Mes:</span>
                <span className="font-semibold">{formatCurrency(kpi.profitability.month.netRevenue, cc)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════ */}
        {/* ── SECCIÓN 6: ÓRDENES RECIENTES ── */}
        {/* ═══════════════════════════════════════════════ */}
        <Card className="rounded-xl border-border/50 hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Últimas Órdenes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">Sin órdenes registradas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Orden</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                      <TableHead className="text-xs text-right">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentOrders.map((order) => (
                      <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${statusColor(order.status)}`}>{statusLabel(order.status)}</Badge></TableCell>
                        <TableCell className="text-xs">{order.customerName || '—'}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(order.total, cc)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('es-CO')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Open Tables (if any) ── */}
        {kpi.operational.openTables.length > 0 && (
          <Card className="rounded-xl border-border/50 hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Armchair className="h-4 w-4 text-amber-500" />
                Mesas Abiertas
              </CardTitle>
              <CardDescription>{kpi.operational.openTables.length} mesa(s) ocupada(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {kpi.operational.openTables.map((t: OpenTable) => {
                  const elapsed = Math.floor((Date.now() - new Date(t.startedAt).getTime()) / 60000)
                  return (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 gap-3 hover:bg-amber-100/30 dark:hover:bg-amber-950/30 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Mesa {t.tableNumber}{t.tableName ? ` — ${t.tableName}` : ''}</p>
                        <p className="text-xs text-muted-foreground">{t.customerName ?? 'Sin cliente'} · {t.guests}p · {Math.floor(elapsed / 60)}h {elapsed % 60}m</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">{t.tableZone}</Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
