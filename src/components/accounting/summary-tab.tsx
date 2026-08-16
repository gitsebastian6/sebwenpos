'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  DollarSign,
  Heart,
  CircleDollarSign,
  HandCoins,
  Scale,
  BarChart3,
  Wallet,
  TrendingUp,
} from 'lucide-react'
import type { LedgerAccount } from './accounting-types'
import {
  ACCOUNT_TYPE_LABELS,
  formatCurrency,
  formatBalance,
  getBalanceColor,
  getAccountTypeColor,
} from './accounting-types'

interface SummaryTabProps {
  accounts: LedgerAccount[]
  currencyCode: string
}

export function SummaryTab({ accounts, currencyCode }: SummaryTabProps) {
  // Summary calculations
  const totalIngresos = accounts
    .filter((a) => a.type === 'INCOME')
    .reduce((sum, a) => sum + Math.abs(a.balance), 0)

  const totalGastos = accounts
    .filter((a) => a.type === 'EXPENSE')
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0)

  const totalActivos = accounts
    .filter((a) => a.type === 'ASSET')
    .reduce((sum, a) => sum + a.balance, 0)

  const balanceCaja = accounts.find((a) => a.type === 'ASSET' && a.isDefault)?.balance ?? 0

  const cxcAccount = accounts.find((a) => a.type === 'ASSET' && a.name.includes('Cuentas por Cobrar'))
  const cuentasPorCobrar = cxcAccount?.balance ?? 0

  const propinaAccount = accounts.find((a) => a.type === 'INCOME' && a.name === 'Propina')
  const totalPropinas = propinaAccount ? Math.abs(propinaAccount.balance) : 0

  const ventasAccount = accounts.find((a) => a.type === 'INCOME' && a.name === 'Ventas')
  const totalVentasBrutas = ventasAccount ? Math.abs(ventasAccount.balance) : (totalIngresos - totalPropinas)

  const descuentoAccount = accounts.find((a) => a.type === 'EXPENSE' && a.name === 'Descuentos en Ventas')
  const totalDescuentos = descuentoAccount ? Math.max(0, descuentoAccount.balance) : 0
  const totalVentas = totalVentasBrutas - totalDescuentos

  const perdidaAccount = accounts.find((a) => a.type === 'EXPENSE' && a.name === 'Pérdida por Merma')
  const totalPerdidas = perdidaAccount ? Math.max(0, perdidaAccount.balance) : 0

  const netIncome = totalIngresos - totalGastos
  const barMax = Math.max(totalIngresos, totalGastos, 1)

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ventas */}
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
          <CardHeader className="pb-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <CardDescription className="text-xs">Total Ventas</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 tabular-nums">
              {formatCurrency(totalVentas, currencyCode)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {totalDescuentos > 0
                ? `Bruto: ${formatCurrency(totalVentasBrutas, currencyCode)} · Descuentos: -${formatCurrency(totalDescuentos, currencyCode)}`
                : 'Productos y servicios'}
            </p>
          </CardContent>
        </Card>

        {/* Propinas */}
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
          <CardHeader className="pb-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-pink-100 dark:bg-pink-950 flex items-center justify-center">
                <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400" />
              </div>
              <CardDescription className="text-xs">Propinas</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pink-700 dark:text-pink-400 tabular-nums">
              {formatCurrency(totalPropinas, currencyCode)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Total ingresos: {formatCurrency(totalIngresos, currencyCode)}
            </p>
          </CardContent>
        </Card>

        {/* Balance de Caja */}
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardHeader className="pb-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardDescription className="text-xs">Caja General</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatCurrency(balanceCaja, currencyCode)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Total activos: {formatCurrency(totalActivos, currencyCode)}
            </p>
          </CardContent>
        </Card>

        {/* Cuentas por Cobrar */}
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardHeader className="pb-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <HandCoins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <CardDescription className="text-xs">Cuentas por Cobrar</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
              {formatCurrency(cuentasPorCobrar, currencyCode)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Fiado pendiente</p>
          </CardContent>
        </Card>
      </div>

      {/* Income vs Expense comparison */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Ingresos vs Gastos</CardTitle>
          </div>
          <CardDescription>
            Comparación del periodo acumulado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ingresos bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-teal-500" />
                <span className="text-sm font-medium">Ingresos</span>
              </div>
              <span className="text-sm font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                {formatCurrency(totalIngresos, currencyCode)}
              </span>
            </div>
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${barMax > 0 ? (totalIngresos / barMax) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Gastos bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm font-medium">Gastos</span>
              </div>
              <span className="text-sm font-bold text-red-700 dark:text-red-400 tabular-nums">
                {formatCurrency(totalGastos, currencyCode)}
              </span>
            </div>
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-500"
                style={{ width: `${barMax > 0 ? (totalGastos / barMax) * 100 : 0}%` }}
              />
            </div>
            {(totalDescuentos > 0 || totalPerdidas > 0) && (
              <p className="text-[11px] text-muted-foreground">
                Incluye {totalDescuentos > 0 && `${formatCurrency(totalDescuentos, currencyCode)} en descuentos`}
                {totalDescuentos > 0 && totalPerdidas > 0 && ' y '}
                {totalPerdidas > 0 && `${formatCurrency(totalPerdidas, currencyCode)} en pérdidas por merma`}
                {' '}— no son gastos operativos, son deducciones de venta e inventario.
              </p>
            )}
          </div>

          <Separator />

          {/* Net result */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Resultado Neto</span>
            </div>
            <span
              className={`text-lg font-bold tabular-nums ${
                netIncome >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {netIncome >= 0 ? '+' : '-'}
              {formatCurrency(Math.abs(netIncome), currencyCode)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Account balances breakdown by type */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Saldos por Tipo de Cuenta</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((type) => {
              const typeAccounts = accounts.filter((a) => a.type === type)
              const total = typeAccounts.reduce((sum, a) => sum + a.balance, 0)
              if (typeAccounts.length === 0) return null

              return (
                <div
                  key={type}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${getAccountTypeColor(type)}`}
                    >
                      {ACCOUNT_TYPE_LABELS[type]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ({typeAccounts.length})
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${getBalanceColor(total, type)}`}>
                    {formatBalance(total, type, currencyCode)}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
