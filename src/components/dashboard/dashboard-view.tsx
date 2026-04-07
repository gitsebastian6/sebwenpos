'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
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
} from 'recharts'
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Users,
  TrendingDown,
  Package,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────

interface LowStockProduct {
  id: number
  name: string
  currentStock: number
  minStock: number
}

interface DailySale {
  date: string
  total: number
}

interface RecentOrder {
  id: number
  orderNumber: string
  status: string
  total: number
  createdAt: string
}

interface TopProduct {
  name: string
  quantitySold: number
  revenue: number
}

interface TopProductRaw {
  product: { id: number; name: string; imgUrl?: string | null } | null
  totalQuantity: number | null
  totalRevenue: number | null
}

interface DashboardData {
  totalSalesToday: number
  totalOrdersToday: number
  lowStockProducts: LowStockProduct[]
  totalDebt: number
  salesByDay?: DailySale[]
  dailySales?: DailySale[]
  recentOrders: RecentOrder[]
  topProducts?: TopProductRaw[]
  topProductsFormatted?: TopProduct[]
}

// ── Chart Config ────────────────────────────────────────

const salesChartConfig = {
  sales: {
    label: 'Ventas',
    color: 'hsl(142, 71%, 45%)',
  },
} satisfies ChartConfig

// ── Helpers ─────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function statusColor(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800'
    case 'CREDIT':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-400 border-sky-200 dark:border-sky-800'
    default:
      return ''
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'Completada'
    case 'PENDING':
      return 'Pendiente'
    case 'CANCELLED':
      return 'Cancelada'
    case 'CREDIT':
      return 'Crédito'
    default:
      return status
  }
}

// ── Loading Skeleton ────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-4">
            <CardHeader className="pb-0">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Stat Card ───────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  description,
}: {
  title: string
  value: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  description?: string
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardDescription className="text-sm font-medium">{title}</CardDescription>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
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
      if (!res.ok) throw new Error('Error al cargar datos del dashboard')
      const json = await res.json()

      // Normalize topProducts from API format to view format
      if (json.topProducts && Array.isArray(json.topProducts)) {
        json.topProductsFormatted = json.topProducts
          .map((tp: TopProductRaw) => ({
            name: tp.product?.name || 'Sin nombre',
            quantitySold: tp.totalQuantity || 0,
            revenue: tp.totalRevenue || 0,
          }))
          .filter((p: TopProduct) => p.quantitySold > 0)
      }

      // Normalize dailySales
      if (!json.dailySales && json.salesByDay) {
        json.dailySales = json.salesByDay
      }

      // Null-safe arrays
      json.dailySales = json.dailySales || []
      json.recentOrders = json.recentOrders || []
      json.lowStockProducts = json.lowStockProducts || []

      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const currencyCode = store?.currencyCode || 'MXN'

  // ── Loading state ──
  if (loading) return <DashboardSkeleton />

  // ── Error state ──
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="font-semibold">Error al cargar el dashboard</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <button
              onClick={fetchDashboard}
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Reintentar
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  // ── Chart data ──
  const dailySales = data.dailySales || []
  const chartData = dailySales.map((d) => ({
    ...d,
    dateLabel: formatDateShort(d.date),
    sales: d.total / 100,
  }))

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Top Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ventas Hoy"
          value={formatCurrency(data.totalSalesToday, currencyCode)}
          icon={DollarSign}
          iconBg="bg-emerald-100 dark:bg-emerald-900/40"
          iconColor="text-emerald-600 dark:text-emerald-400"
          description="Total de ventas del día"
        />
        <StatCard
          title="Órdenes Hoy"
          value={data.totalOrdersToday.toLocaleString('es-MX')}
          icon={ShoppingCart}
          iconBg="bg-sky-100 dark:bg-sky-900/40"
          iconColor="text-sky-600 dark:text-sky-400"
          description="Órdenes realizadas hoy"
        />
        <StatCard
          title="Productos con Stock Bajo"
          value={data.lowStockProducts.length.toLocaleString('es-MX')}
          icon={AlertTriangle}
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          iconColor="text-amber-600 dark:text-amber-400"
          description="Requieren reabastecimiento"
        />
        <StatCard
          title="Cuentas por Cobrar"
          value={formatCurrency(data.totalDebt, currencyCode)}
          icon={Users}
          iconBg="bg-red-100 dark:bg-red-900/40"
          iconColor="text-red-600 dark:text-red-400"
          description="Deuda total de clientes"
        />
      </div>

      {/* ── Middle Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ventas de los Últimos 7 Días</CardTitle>
            <CardDescription>Ingresos diarios en {currencyCode}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={salesChartConfig} className="h-[260px] w-full">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(v: number) =>
                    `${(v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())}`
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value: number) => (
                        <span className="font-mono font-medium">
                          {formatCurrency(value * 100, currencyCode)}
                        </span>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="sales"
                  fill="var(--color-sales)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alertas de Stock Bajo
            </CardTitle>
            <CardDescription>
              Productos con inventario al mínimo o agotado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.lowStockProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Todos los productos tienen stock suficiente
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {data.lowStockProducts.map((product) => {
                  const isOutOfStock = product.currentStock === 0
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-lg border p-3 gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock actual:{' '}
                          <span className={isOutOfStock ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                            {product.currentStock}
                          </span>
                          {' / Mín: '}
                          {product.minStock}
                        </p>
                      </div>
                      <Badge
                        className={
                          isOutOfStock
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800 shrink-0'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800 shrink-0'
                        }
                      >
                        {isOutOfStock ? 'Agotado' : 'Bajo'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Órdenes Recientes</CardTitle>
            <CardDescription>Últimas 10 órdenes registradas</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No hay órdenes registradas
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Orden</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] ${statusColor(order.status)}`}
                        >
                          {statusLabel(order.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(order.total, currencyCode)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString('es-MX')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-emerald-500" />
              Productos Más Vendidos
            </CardTitle>
            <CardDescription>Top 5 productos por unidades vendidas</CardDescription>
          </CardHeader>
          <CardContent>
            {(data.topProductsFormatted || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No hay datos de ventas aún
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(data.topProductsFormatted || []).map((product, index) => (
                  <div
                    key={product.name}
                    className="flex items-center justify-between rounded-lg border p-3 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {product.quantitySold} vendidos
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold shrink-0">
                      {formatCurrency(product.revenue, currencyCode)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
