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
  FileText,
  ShoppingCart,
  Users,
  PackageX,
  Receipt,
  DollarSign,
  AlertTriangle,
  CalendarDays,
  Loader2,
  Armchair,
  Monitor,
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

function formatBalance(balanceInCents: number, type: string, currencyCode?: string) {
  const prefix = balanceInCents < 0 ? '-' : ''
  return `${prefix}${formatCurrency(Math.abs(balanceInCents), currencyCode)}`
}

function getBalanceColor(balanceInCents: number, type: string) {
  if (balanceInCents === 0) return 'text-muted-foreground'
  const isDebitNormal = type === 'ASSET' || type === 'EXPENSE'
  if (isDebitNormal) {
    return balanceInCents > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }
  // Credit-normal accounts: positive balance = debt/obligation (red), negative = favorable (green)
  return balanceInCents > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
}

// ─── Report Types ──────────────────────────────────────────────────────────────

interface ReportData {
  period: { from: string | null; to: string | null }
  sales: {
    total: number
    completed: number
    credit: number
    orderCount: number
    avgTicket: number
  }
  salesByPayment: Record<string, { count: number; total: number }>
  salesBySource: { MESA: { count: number; total: number }; POS: { count: number; total: number } }
  salesByCategory: Record<string, { quantity: number; total: number }>
  topProducts: Array<{ productId: number; name: string; quantity: number; total: number }>
  customerDebts: Array<{ id: number; name: string; phone: string | null; totalDebt: number }>
  lowStockProducts: Array<{
    id: number
    name: string
    currentStock: number
    minStock: number
    salePrice: number
    category: { name: string } | null
  }>
  inventory: {
    totalCostValue: number
    totalRetailValue: number
    lowStockCount: number
  }
  accountBalances: Record<string, number>
  services: { totalAmount: number; transactionCount: number }
  openTables: { count: number; consumption: number }
  dailySales: Array<{ date: string; sales: number; orders: number }>
  profit: number
  recentOrders: Array<{
    id: number
    orderNumber: string
    customer: string
    total: number
    paymentMethod: string
    status: string
    source: string
    tableName: string | null
    items: Array<{ name: string; quantity: number; unitPrice: number; totalRow: number }>
    createdAt: string
  }>
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
  CREDIT: 'Fiado',
  DAVIPLATA: 'Daviplata',
  NEQUI: 'Nequi',
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: 'bg-emerald-500',
  CARD: 'bg-violet-500',
  TRANSFER: 'bg-sky-500',
  MIXED: 'bg-orange-500',
  CREDIT: 'bg-amber-500',
  DAVIPLATA: 'bg-rose-500',
  NEQUI: 'bg-teal-500',
}

const CATEGORY_COLORS = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
]

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountingView() {
  const store = useAuthStore((s) => s.store)
  const currencyCode = store?.currencyCode || 'COP'
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

  // ─── Report state ────────────────────────────────────────────────────────
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')

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

  // ─── Fetch reports ────────────────────────────────────────────────────────

  const fetchReports = useCallback(async () => {
    if (!store?.id) return
    setIsLoadingReport(true)
    try {
      let url = `/api/reports?storeId=${store.id}`
      if (reportFrom) url += `&from=${reportFrom}`
      if (reportTo) url += `&to=${reportTo}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setReportData(data)
      }
    } catch {
      // silent fail
    } finally {
      setIsLoadingReport(false)
    }
  }, [store?.id, reportFrom, reportTo])

  useEffect(() => {
    if (activeTab === 'informes' && !reportData) {
      fetchReports()
    }
  }, [activeTab, reportData, fetchReports])

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
        <TabsList className="grid w-full grid-cols-4 lg:w-[540px]">
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
          <TabsTrigger value="informes" className="gap-1.5">
            <FileText className="h-4 w-4 hidden sm:block" />
            Informes
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
                          {formatBalance(account.balance, account.type, currencyCode)}
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
                                {formatCurrency(entry.amount, currencyCode)}
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
                          {formatCurrency(totals.debits, currencyCode)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                        <span className="text-xs text-muted-foreground">Créditos:</span>
                        <span className="text-sm font-bold text-orange-700 dark:text-orange-400 tabular-nums">
                          {formatCurrency(totals.credits, currencyCode)}
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
                    {formatCurrency(totalIngresos, currencyCode)}
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
                    {formatCurrency(totalGastos, currencyCode)}
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
                    {formatCurrency(balanceCaja, currencyCode)}
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
                    {formatCurrency(cuentasPorCobrar, currencyCode)}
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
                          {formatBalance(total, type, currencyCode)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* ─── Tab 4: Informes ──────────────────────────────────────────── */}
        <TabsContent value="informes">
          <div className="space-y-6">
            {/* ─── Date Range Filter ─────────────────────────────────────── */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      <CalendarDays className="h-3 w-3 inline mr-1" />
                      Desde
                    </Label>
                    <Input
                      type="date"
                      value={reportFrom}
                      onChange={(e) => setReportFrom(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      <CalendarDays className="h-3 w-3 inline mr-1" />
                      Hasta
                    </Label>
                    <Input
                      type="date"
                      value={reportTo}
                      onChange={(e) => setReportTo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    onClick={fetchReports}
                    disabled={isLoadingReport}
                    className="h-9 gap-1.5"
                  >
                    {isLoadingReport ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    Generar Informe
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isLoadingReport ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-0">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-32 mt-2" />
                      <Skeleton className="h-3 w-20 mt-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : reportData ? (
              <>
                {/* ─── KPI Cards Row ─────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total Ventas */}
                  <Card className="relative overflow-hidden">
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
                        {formatCurrency(reportData.sales.total, currencyCode)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {reportData.sales.orderCount} órdenes · Ticket prom: {formatCurrency(reportData.sales.avgTicket, currencyCode)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Contado vs Fiado */}
                  <Card className="relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                    <CardHeader className="pb-0">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                          <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <CardDescription className="text-xs">Contado vs Fiado</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(reportData.sales.completed, currencyCode)}
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        Fiado: {formatCurrency(reportData.sales.credit, currencyCode)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Comisión Servicios */}
                  <Card className="relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
                    <CardHeader className="pb-0">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                          <Receipt className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <CardDescription className="text-xs">Ingresos Servicios</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-violet-700 dark:text-violet-400 tabular-nums">
                        {formatCurrency(reportData.services.totalAmount, currencyCode)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {reportData.services.transactionCount} transacciones
                      </p>
                    </CardContent>
                  </Card>

                  {/* Mesas Abiertas */}
                  <Card className="relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                    <CardHeader className="pb-0">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                          <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <CardDescription className="text-xs">Mesas Abiertas</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                        {reportData.openTables.count}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Consumo: {formatCurrency(reportData.openTables.consumption, currencyCode)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* ─── Ventas por Método de Pago ──────────────────────────── */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Ventas por Método de Pago</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.keys(reportData.salesByPayment).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                    ) : (
                      (() => {
                        const methods = reportData.salesByPayment
                        const maxPayment = Math.max(...Object.values(methods).map((m) => m.total), 1)
                        return Object.entries(methods)
                          .sort((a, b) => b[1].total - a[1].total)
                          .map(([method, data]) => (
                            <div key={method} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`h-3 w-3 rounded-full ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`} />
                                  <span className="text-sm font-medium">
                                    {PAYMENT_METHOD_LABELS[method] || method}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    ({data.count})
                                  </span>
                                </div>
                                <span className="text-sm font-bold tabular-nums">
                                  {formatCurrency(data.total, currencyCode)}
                                </span>
                              </div>
                              <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`}
                                  style={{ width: `${(data.total / maxPayment) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))
                      })()
                    )}
                  </CardContent>
                </Card>

                {/* ─── Ventas por Categoría + Top Productos ──────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Ventas por Categoría */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">Ventas por Categoría</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(reportData.salesByCategory).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                          {Object.entries(reportData.salesByCategory)
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([cat, data], idx) => {
                              const totalAllSales = Object.values(reportData.salesByCategory).reduce(
                                (s, d) => s + d.total,
                                0
                              )
                              const pct = totalAllSales > 0 ? ((data.total / totalAllSales) * 100).toFixed(1) : '0'
                              return (
                                <div
                                  key={cat}
                                  className={`p-3 rounded-lg border ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                                >
                                  <p className="text-xs font-semibold truncate">{cat}</p>
                                  <p className="text-sm font-bold tabular-nums mt-1">
                                    {formatCurrency(data.total, currencyCode)}
                                  </p>
                                  <p className="text-[10px] opacity-70 mt-0.5">
                                    {data.quantity} uds · {pct}%
                                  </p>
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top 10 Productos */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">Top 10 Productos</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">#</TableHead>
                              <TableHead>Producto</TableHead>
                              <TableHead className="text-right w-16">Uds</TableHead>
                              <TableHead className="text-right w-28">Ingreso</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.topProducts.slice(0, 10).map((product, idx) => {
                              const maxProductTotal = reportData.topProducts[0]?.total || 1
                              return (
                                <TableRow key={product.productId}>
                                  <TableCell className="text-xs font-bold text-muted-foreground">
                                    {idx + 1}
                                  </TableCell>
                                  <TableCell>
                                    <div className="space-y-1">
                                      <span className="text-sm font-medium truncate block max-w-[150px]">
                                        {product.name}
                                      </span>
                                      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-teal-500 rounded-full transition-all duration-500"
                                          style={{ width: `${(product.total / maxProductTotal) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-sm tabular-nums">
                                    {product.quantity}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-bold tabular-nums text-teal-700 dark:text-teal-400">
                                    {formatCurrency(product.total, currencyCode)}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ─── Cuentas por Cobrar ─────────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <HandCoins className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Cuentas por Cobrar</CardTitle>
                    </div>
                    <CardDescription>
                      {reportData.customerDebts.length} cliente{reportData.customerDebts.length !== 1 ? 's' : ''} con deuda
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {reportData.customerDebts.length === 0 ? (
                      <div className="flex flex-col items-center py-8">
                        <HandCoins className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No hay deudas pendientes</p>
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cliente</TableHead>
                              <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                              <TableHead className="text-right w-32">Deuda</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.customerDebts.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell className="font-medium">{c.name}</TableCell>
                                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                  {c.phone || '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge
                                    variant="outline"
                                    className="text-xs font-bold text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                                  >
                                    {formatCurrency(c.totalDebt, currencyCode)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ─── Productos con Stock Bajo ───────────────────────────── */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <PackageX className="h-5 w-5 text-red-500" />
                      <CardTitle className="text-base">Productos con Stock Bajo</CardTitle>
                    </div>
                    <CardDescription>
                      {reportData.lowStockProducts.length} producto{reportData.lowStockProducts.length !== 1 ? 's' : ''} con stock ≤ 5 unidades
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {reportData.lowStockProducts.length === 0 ? (
                      <div className="flex flex-col items-center py-8">
                        <PackageX className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Todo el inventario está en buen nivel</p>
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                              <TableHead className="text-center w-20">Stock</TableHead>
                              <TableHead className="hidden md:table-cell text-center w-20">Mín.</TableHead>
                              <TableHead className="text-right w-28">Precio</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.lowStockProducts.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                  {p.category?.name || '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant="outline"
                                    className={`text-xs font-bold ${
                                      p.currentStock === 0
                                        ? 'text-red-700 dark:text-red-400 border-red-300 dark:border-red-700'
                                        : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700'
                                    }`}
                                  >
                                    {p.currentStock === 0 ? (
                                      <span className="flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        0
                                      </span>
                                    ) : (
                                      p.currentStock
                                    )}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-center text-sm text-muted-foreground">
                                  {p.minStock}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">
                                  {formatCurrency(p.salePrice, currencyCode)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ─── Inventario Valorizado + Balance Cuentas ────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Inventario Valorizado */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Scale className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">Inventario Valorizado</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                        <p className="text-xs text-muted-foreground">Valor al Costo</p>
                        <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(reportData.inventory.totalCostValue, currencyCode)}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                        <p className="text-xs text-muted-foreground">Valor al Público (Retail)</p>
                        <p className="text-xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                          {formatCurrency(reportData.inventory.totalRetailValue, currencyCode)}
                        </p>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Margen estimado</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatCurrency(
                            reportData.inventory.totalRetailValue - reportData.inventory.totalCostValue,
                            currencyCode
                          )}
                        </span>
                      </div>
                      {reportData.inventory.lowStockCount > 0 && (
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">
                            {reportData.inventory.lowStockCount} producto{reportData.inventory.lowStockCount !== 1 ? 's' : ''} con stock bajo
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Balance de Cuentas Contables */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">Balance de Cuentas</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cuenta</TableHead>
                              <TableHead className="text-right w-28">Saldo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(reportData.accountBalances).map(([name, balance]) => {
                              const acc = accounts.find((a) => a.name === name)
                              const type = acc?.type || ''
                              return (
                                <TableRow key={name}>
                                  <TableCell className="text-sm font-medium">{name}</TableCell>
                                  <TableCell className="text-right">
                                    <span
                                      className={`text-sm font-bold tabular-nums ${getBalanceColor(balance, type)}`}
                                    >
                                      {formatBalance(balance, type, currencyCode)}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ─── Últimos 7 Días ─────────────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Ventas de los Últimos 7 Días</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const maxDay = Math.max(...reportData.dailySales.map((d) => d.sales), 1)
                      return reportData.dailySales.map((day) => (
                        <div key={day.date} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize">{formatDayLabel(day.date)}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-muted-foreground">{day.orders} ord.</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatCurrency(day.sales, currencyCode)}
                              </span>
                            </div>
                          </div>
                          <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${(day.sales / maxDay) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))
                    })()}
                    <Separator />
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm font-medium">Utilidad Estimada</span>
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(reportData.profit, currencyCode)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* ─── Ventas por Origen ──────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Ventas por Origen</CardTitle>
                    </div>
                    <CardDescription>¿De dónde salen las ventas?</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const src = reportData.salesBySource
                      const totalAll = (src.MESA.total || 0) + (src.POS.total || 0) || 1
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                              <div className="flex items-center gap-2 mb-2">
                                <Armchair className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <span className="text-sm font-semibold">Mesas</span>
                              </div>
                              <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                                {formatCurrency(src.MESA.total, currencyCode)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {src.MESA.count} ventas · {totalAll > 0 ? ((src.MESA.total / totalAll) * 100).toFixed(0) : 0}%
                              </p>
                              <div className="h-2 w-full bg-amber-100 dark:bg-amber-900 rounded-full mt-2 overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                  style={{ width: `${(src.MESA.total / totalAll) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="p-4 rounded-lg border bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
                              <div className="flex items-center gap-2 mb-2">
                                <Monitor className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                <span className="text-sm font-semibold">Punto de Venta</span>
                              </div>
                              <p className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
                                {formatCurrency(src.POS.total, currencyCode)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {src.POS.count} ventas · {totalAll > 0 ? ((src.POS.total / totalAll) * 100).toFixed(0) : 0}%
                              </p>
                              <div className="h-2 w-full bg-sky-100 dark:bg-sky-900 rounded-full mt-2 overflow-hidden">
                                <div
                                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                                  style={{ width: `${(src.POS.total / totalAll) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>

                {/* ─── Detalle de Ventas ──────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Informe Detallado de Ventas</CardTitle>
                    </div>
                    <CardDescription>
                      {reportData.recentOrders.length} ordenes con origen, productos y método de pago
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {reportData.recentOrders.length === 0 ? (
                      <div className="flex flex-col items-center py-8">
                        <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No hay ventas en este periodo</p>
                      </div>
                    ) : (
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[120px]">Fecha</TableHead>
                              <TableHead className="w-[90px]">Orden</TableHead>
                              <TableHead className="w-[100px]">Origen</TableHead>
                              <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                              <TableHead>Método</TableHead>
                              <TableHead className="text-right w-[110px]">Total</TableHead>
                              <TableHead className="hidden lg:table-cell text-left">Productos</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.recentOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-medium">
                                      {formatDate(order.createdAt)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {formatTime(order.createdAt)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {order.orderNumber}
                                </TableCell>
                                <TableCell>
                                  {order.source === 'MESA' ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px] whitespace-nowrap"
                                    >
                                      <Armchair className="h-3 w-3 mr-1 inline" />
                                      {order.tableName || 'Mesa'}
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800 text-[10px] whitespace-nowrap"
                                    >
                                      <Monitor className="h-3 w-3 mr-1 inline" />
                                      POS
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-sm">
                                  {order.customer}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] whitespace-nowrap ${
                                      order.paymentMethod === 'CREDIT'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                        : order.paymentMethod === 'CASH'
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                        : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800'
                                    }`}
                                  >
                                    {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-sm font-bold tabular-nums">
                                    {formatCurrency(order.total, currencyCode)}
                                  </span>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <div className="max-w-[200px]">
                                    {order.items.slice(0, 3).map((item, idx) => (
                                      <div key={idx} className="text-xs text-muted-foreground truncate">
                                        {item.quantity}x {item.name}
                                        <span className="text-[10px] ml-1 opacity-60">
                                          ({formatCurrency(item.totalRow, currencyCode)})
                                        </span>
                                      </div>
                                    ))}
                                    {order.items.length > 3 && (
                                      <p className="text-[10px] text-muted-foreground/60">
                                        +{order.items.length - 3} más...
                                      </p>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {/* Summary footer */}
                    <Separator />
                    <div className="flex items-center justify-between p-4 bg-muted/30">
                      <span className="text-sm font-medium text-muted-foreground">
                        Total: {reportData.recentOrders.length} ordenes
                      </span>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <Armchair className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs text-muted-foreground">Mesas:</span>
                          <span className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                            {formatCurrency(reportData.salesBySource.MESA.total, currencyCode)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-sky-500" />
                          <span className="text-xs text-muted-foreground">POS:</span>
                          <span className="text-sm font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                            {formatCurrency(reportData.salesBySource.POS.total, currencyCode)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
