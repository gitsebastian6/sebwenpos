'use client'

import { useDashboardKPIs } from '@/hooks/use-dashboard-kpis'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  DollarSign,
  ShoppingCart,
  Receipt,
  Armchair,
  Users,
  TrendingUp,
  Package,
  Warehouse,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

// ── Context presets ─────────────────────────────────────

interface KPIItem {
  icon: LucideIcon
  label: string
  value: string
  color?: string
}

type KPIContext = 'pos' | 'tables' | 'orders' | 'accounting' | 'products' | 'customers' | 'inventory' | 'services' | 'default'

export function KPIBar({ context }: { context?: KPIContext }) {
  const { kpis, isLoading } = useDashboardKPIs()
  const store = useAuthStore((s) => s.store)
  const cc = store?.currencyCode || 'COP'

  if (isLoading) return <KPIBarSkeleton />

  if (!kpis) return null

  const items = buildKPIItems(kpis, context, cc)

  if (items.length === 0) return null

  return (
    <div className="rounded-lg border bg-card/50 backdrop-blur-sm px-3 py-2 mb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && <Separator orientation="vertical" className="h-4 hidden sm:block" />}
            <item.icon className={`h-4 w-4 shrink-0 ${item.color || 'text-foreground/60'}`} />
            <span className="text-muted-foreground text-xs">{item.label}:</span>
            <span className={`font-semibold text-sm ${item.color || ''}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Builder ─────────────────────────────────────────────

function buildKPIItems(kpis: NonNullable<ReturnType<typeof useDashboardKPIs>['kpis']>, context: KPIContext, cc: string): KPIItem[] {
  const s = kpis.sales
  const p = kpis.profitability
  const o = kpis.operational
  const inv = kpis.inventory
  const l = kpis.losses

  switch (context) {
    case 'pos':
      return [
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: ShoppingCart, label: 'Órdenes', value: String(o.ordersToday) },
        { icon: Receipt, label: 'Ticket Prom', value: formatCurrency(p.today.avgTicket, cc) },
        { icon: Armchair, label: 'Mesas Abiertas', value: String(o.openTablesCount), color: o.openTablesCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined },
      ]

    case 'tables':
      return [
        { icon: Armchair, label: 'Mesas Abiertas', value: String(o.openTablesCount), color: 'text-amber-600 dark:text-amber-400' },
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: Receipt, label: 'Ticket Prom', value: formatCurrency(p.today.avgTicket, cc) },
        { icon: ShoppingCart, label: 'Órdenes Hoy', value: String(o.ordersToday) },
      ]

    case 'orders':
      return [
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: ShoppingCart, label: 'Órdenes Mes', value: String(o.ordersThisMonth) },
        { icon: Receipt, label: 'Ticket Prom', value: formatCurrency(o.avgTicketMonth, cc) },
        { icon: Users, label: 'CxC', value: formatCurrency(o.totalDebt, cc), color: o.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : undefined },
      ]

    case 'accounting':
      return [
        { icon: DollarSign, label: 'Ventas Mes', value: formatCurrency(s.thisMonth, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: TrendingUp, label: 'Utilidad Neta', value: formatCurrency(p.month.netProfit, cc), color: p.month.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
        { icon: TrendingUp, label: 'Margen', value: `${p.month.margin}%`, color: p.month.margin >= 40 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400' },
        { icon: AlertTriangle, label: 'Punto Eq.', value: `${kpis.breakEven.achievedPercent}%` },
      ]

    case 'products':
      return [
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: Package, label: 'Agotados', value: String(l.outOfStockCount), color: l.outOfStockCount > 0 ? 'text-red-600 dark:text-red-400' : undefined },
        { icon: Warehouse, label: 'Inventario', value: formatCurrency(inv.totalCost, cc) },
        { icon: Package, label: 'Días Inv.', value: `${inv.daysOfInventory}`, color: inv.daysOfInventory > 30 ? 'text-red-600 dark:text-red-400' : undefined },
      ]

    case 'customers':
      return [
        { icon: Users, label: 'CxC Total', value: formatCurrency(o.totalDebt, cc), color: o.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : undefined },
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: Receipt, label: 'Ticket Prom', value: formatCurrency(o.avgTicketMonth, cc) },
      ]

    case 'inventory':
      return [
        { icon: Warehouse, label: 'Costo Inv.', value: formatCurrency(inv.totalCost, cc) },
        { icon: Package, label: 'Días Inv.', value: `${inv.daysOfInventory}`, color: inv.daysOfInventory > 30 ? 'text-red-600 dark:text-red-400' : undefined },
        { icon: AlertTriangle, label: 'Agotados', value: String(l.outOfStockCount), color: l.outOfStockCount > 0 ? 'text-red-600 dark:text-red-400' : undefined },
        { icon: TrendingUp, label: 'COGS/Día', value: formatCurrency(inv.avgDailyCOGS, cc) },
      ]

    case 'services':
      return [
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: ShoppingCart, label: 'Órdenes Hoy', value: String(o.ordersToday) },
        { icon: Receipt, label: 'Ticket Prom', value: formatCurrency(p.today.avgTicket, cc) },
      ]

    default:
      return [
        { icon: DollarSign, label: 'Ventas Hoy', value: formatCurrency(s.today, cc), color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: ShoppingCart, label: 'Órdenes Hoy', value: String(o.ordersToday) },
        { icon: TrendingUp, label: 'Margen', value: `${p.month.margin}%` },
        { icon: Users, label: 'CxC', value: formatCurrency(o.totalDebt, cc), color: o.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : undefined },
      ]
  }
}

// ── Skeleton ────────────────────────────────────────────

function KPIBarSkeleton() {
  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2 mb-4">
      <div className="flex items-center gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
