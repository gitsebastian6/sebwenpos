'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  BookOpen,
  BarChart3,
  Eye,
  CircleDollarSign,
  HandCoins,
  Scale,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LedgerAccount {
  id: number
  name: string
  type: string
  isDefault: boolean
  balance: number
  entryCount: number
  createdAt: string
}

interface JournalEntry {
  id: number
  ledgerAccountId: number
  accountName: string
  accountType: string
  amount: number
  direction: string
  description: string | null
  referenceType: string | null
  referenceId: number | null
  createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Capital',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  ASSET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  LIABILITY: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  EQUITY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  INCOME: 'bg-emerald-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  EXPENSE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800',
}

const DIRECTION_BADGE_CLASSES: Record<string, string> = {
  DEBIT: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  CREDIT: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-800',
}

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  ORDER: 'Orden',
  EXPENSE: 'Gasto',
  TOPUP: 'Recarga',
}

function getAccountTypeColor(type: string) {
  return ACCOUNT_TYPE_COLORS[type] || 'bg-secondary text-secondary-foreground border-border'
}

function getDirectionBadgeClass(direction: string) {
  return DIRECTION_BADGE_CLASSES[direction] || 'bg-secondary text-secondary-foreground border-border'
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBalance(balanceInCents: number, type: string) {
  const prefix = balanceInCents < 0 ? '-' : ''
  return `${prefix}${formatCurrency(Math.abs(balanceInCents))}`
}

function getBalanceColor(balanceInCents: number, type: string) {
  if (balanceInCents === 0) return 'text-muted-foreground'
  const isDebitNormal = type === 'ASSET' || type === 'EXPENSE'
  if (isDebitNormal) {
    return balanceInCents > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }
  return balanceInCents > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountingView() {
  const store = useAuthStore((s) => s.store)
  const [activeTab, setActiveTab] = useState('cuentas')
  const [accounts, setAccounts] = useState<LedgerAccount[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [totals, setTotals] = useState({ debits: 0, credits: 0 })
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)

  // Filters for entries tab
  const [filterAccountId, setFilterAccountId] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // ─── Fetch accounts ──────────────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    if (!store?.id) return
    setIsLoadingAccounts(true)
    try {
      const res = await fetch(`/api/ledger?storeId=${store.id}&type=accounts`)
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts || [])
      }
    } catch {
      // silent fail
    } finally {
      setIsLoadingAccounts(false)
    }
  }, [store?.id])

  // ─── Fetch entries ───────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    if (!store?.id) return
    setIsLoadingEntries(true)
    try {
      let url = `/api/ledger?storeId=${store.id}&type=entries`
      if (filterAccountId && filterAccountId !== 'all') {
        url += `&accountId=${filterAccountId}`
      }
      if (filterFrom) url += `&from=${filterFrom}`
      if (filterTo) url += `&to=${filterTo}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
        setTotals(data.totals || { debits: 0, credits: 0 })
      }
    } catch {
      // silent fail
    } finally {
      setIsLoadingEntries(false)
    }
  }, [store?.id, filterAccountId, filterFrom, filterTo])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function handleViewMovements(accountId: number) {
    setFilterAccountId(String(accountId))
    setFilterFrom('')
    setFilterTo('')
    setActiveTab('movimientos')
  }

  function handleClearFilters() {
    setFilterAccountId('all')
    setFilterFrom('')
    setFilterTo('')
  }

  // ─── Summary calculations ────────────────────────────────────────────────

  const totalIngresos = accounts
    .filter((a) => a.type === 'INCOME')
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0)

  const totalGastos = accounts
    .filter((a) => a.type === 'EXPENSE')
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0)

  const balanceCaja = accounts.find((a) => a.type === 'ASSET' && a.isDefault)?.balance ?? 0

  const cuentasPorCobrar = accounts.find((a) => a.name === 'Cuentas por Cobrar')?.balance ?? 0

  const netIncome = totalIngresos - totalGastos

  const barMax = Math.max(totalIngresos, totalGastos, 1)

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="cuentas" className="gap-1.5">
            <BookOpen className="h-4 w-4 hidden sm:block" />
            Cuentas
          </TabsTrigger>
          <TabsTrigger value="movimientos" className="gap-1.5">
            <ArrowRightLeft className="h-4 w-4 hidden sm:block" />
            Movimientos
          </TabsTrigger>
          <TabsTrigger value="resumen" className="gap-1.5">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            Resumen
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Cuentas ──────────────────────────────────────────── */}
        <TabsContent value="cuentas">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Catálogo de Cuentas</h2>
                <p className="text-sm text-muted-foreground">
                  {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} registrada{accounts.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAccounts}
                className="gap-1.5"
              >
                <Wallet className="h-3.5 w-3.5" />
                Actualizar
              </Button>
            </div>

            {isLoadingAccounts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-16 mt-2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-7 w-24 mb-4" />
                      <Skeleton className="h-8 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <BookOpen className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    No hay cuentas contables registradas
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Las cuentas se crearán automáticamente al realizar ventas
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((account) => (
                  <Card
                    key={account.id}
                    className="group transition-shadow hover:shadow-md"
                  >
                    <CardHeader className="pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-bold leading-tight truncate">
                          {account.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${getAccountTypeColor(account.type)}`}
                        >
                          {ACCOUNT_TYPE_LABELS[account.type] || account.type}
                        </Badge>
                      </div>
                      {account.isDefault && (
                        <CardDescription className="mt-1">
                          Cuenta principal
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Saldo actual</p>
                        <p className={`text-xl font-bold tracking-tight ${getBalanceColor(account.balance, account.type)}`}>
                          {formatBalance(account.balance, account.type)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {account.entryCount} movimiento{account.entryCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Separator />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        onClick={() => handleViewMovements(account.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver Movimientos
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── Tab 2: Movimientos ───────────────────────────────────────── */}
        <TabsContent value="movimientos">
          <div className="space-y-4">
            {/* Filter bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Cuenta
                    </Label>
                    <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Todas las cuentas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las cuentas</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name} ({ACCOUNT_TYPE_LABELS[a.type]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Desde
                    </Label>
                    <Input
                      type="date"
                      value={filterFrom}
                      onChange={(e) => setFilterFrom(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Hasta
                    </Label>
                    <Input
                      type="date"
                      value={filterTo}
                      onChange={(e) => setFilterTo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearFilters}
                      className="h-9"
                    >
                      Limpiar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            {isLoadingEntries ? (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : entries.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    No se encontraron movimientos
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Intenta ajustar los filtros o la fecha
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Fecha</TableHead>
                          <TableHead>Cuenta</TableHead>
                          <TableHead className="w-[100px]">Tipo</TableHead>
                          <TableHead className="text-right w-[130px]">Monto</TableHead>
                          <TableHead className="hidden md:table-cell">Descripción</TableHead>
                          <TableHead className="hidden lg:table-cell w-[120px]">Referencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium">
                                  {formatDate(entry.createdAt)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatTime(entry.createdAt)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate max-w-[150px]">
                                  {entry.accountName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 text-[9px] px-1.5 py-0 ${getAccountTypeColor(entry.accountType)}`}
                                >
                                  {ACCOUNT_TYPE_LABELS[entry.accountType]?.slice(0, 4) || entry.accountType.slice(0, 4)}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-semibold ${getDirectionBadgeClass(entry.direction)}`}
                              >
                                {entry.direction === 'DEBIT' ? 'Débito' : 'Crédito'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={`text-sm font-semibold tabular-nums ${
                                  entry.direction === 'DEBIT'
                                    ? 'text-teal-700 dark:text-teal-400'
                                    : 'text-orange-700 dark:text-orange-400'
                                }`}
                              >
                                {entry.direction === 'DEBIT' ? '+' : '-'}
                                {formatCurrency(entry.amount)}
                              </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                                {entry.description || '—'}
                              </span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {entry.referenceType ? (
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                  {REFERENCE_TYPE_LABELS[entry.referenceType] || entry.referenceType}
                                  {entry.referenceId ? ` #${entry.referenceId}` : ''}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Summary row */}
                  <Separator />
                  <div className="flex items-center justify-between p-4 bg-muted/30">
                    <span className="text-sm font-medium text-muted-foreground">
                      Resumen: {entries.length} movimiento{entries.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                        <span className="text-xs text-muted-foreground">Débitos:</span>
                        <span className="text-sm font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                          {formatCurrency(totals.debits)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                        <span className="text-xs text-muted-foreground">Créditos:</span>
                        <span className="text-sm font-bold text-orange-700 dark:text-orange-400 tabular-nums">
                          {formatCurrency(totals.credits)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ─── Tab 3: Resumen ───────────────────────────────────────────── */}
        <TabsContent value="resumen">
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Ingresos */}
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <CardDescription className="text-xs">Total Ingresos</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                    {formatCurrency(totalIngresos)}
                  </p>
                </CardContent>
              </Card>

              {/* Total Gastos */}
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
                      <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <CardDescription className="text-xs">Total Gastos</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">
                    {formatCurrency(totalGastos)}
                  </p>
                </CardContent>
              </Card>

              {/* Balance de Caja */}
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                      <CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <CardDescription className="text-xs">Balance de Caja</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(balanceCaja)}
                  </p>
                </CardContent>
              </Card>

              {/* Cuentas por Cobrar */}
              <Card className="relative overflow-hidden">
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
                    {formatCurrency(cuentasPorCobrar)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Income vs Expense comparison */}
            <Card>
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
                      {formatCurrency(totalIngresos)}
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
                      {formatCurrency(totalGastos)}
                    </span>
                  </div>
                  <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-500"
                      style={{ width: `${barMax > 0 ? (totalGastos / barMax) * 100 : 0}%` }}
                    />
                  </div>
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
                    {formatCurrency(Math.abs(netIncome))}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Account balances breakdown by type */}
            <Card>
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
                          {formatBalance(total, type)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
