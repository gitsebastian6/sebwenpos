'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Heart,
  Printer,
  RotateCcw,
  Trash2,
  ListOrdered,
  Search,
  Pencil,
  ShieldAlert,
} from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'
import {
  printCashRegisterClose,
  type CashRegisterCloseData,
  printDailySummary,
  type DailySummaryData,
  printProductCatalog,
  type ProductCatalogData,
  printKardex,
  type KardexData,
} from '@/lib/print-ticket'
import { KPIBar } from '@/components/shared/kpi-bar'
import { formatDateShort } from '@/lib/format'

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



function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBalance(balance: number, type: string, currencyCode?: string) {
  const prefix = balance < 0 ? '-' : ''
  return `${prefix}${formatCurrency(Math.abs(balance), currencyCode)}`
}

function getBalanceColor(balance: number, type: string) {
  if (balance === 0) return 'text-muted-foreground'
  const isDebitNormal = type === 'ASSET' || type === 'EXPENSE'
  if (isDebitNormal) {
    return balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }
  // Credit-normal accounts: positive balance = debt/obligation (red), negative = favorable (green)
  return balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
}

// ─── Report Types ──────────────────────────────────────────────────────────────

interface ReportData {
  period: { from: string | null; to: string | null }
  sales: {
    total: number
    subtotal: number
    tips: number
    tipsOrderCount: number
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
    subtotal: number
    tipAmount: number
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
  EFECTIVO: 'Efectivo',
  CARD: 'Tarjeta',
  TARJETA: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
  CREDIT: 'Fiado',
  FIADO: 'Fiado',
  DAVIPLATA: 'Daviplata',
  NEQUI: 'Nequi',
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: 'bg-emerald-500',
  EFECTIVO: 'bg-emerald-500',
  CARD: 'bg-violet-500',
  TARJETA: 'bg-violet-500',
  TRANSFER: 'bg-sky-500',
  MIXED: 'bg-orange-500',
  CREDIT: 'bg-amber-500',
  FIADO: 'bg-amber-500',
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

// ─── Cash Register Types ──────────────────────────────────────────────────────

interface CashShift {
  id: number
  storeId: number
  userId: number
  openedAt: string
  closedAt: string | null
  openingBalance: number
  closingBalance: number | null
  expectedCash: number | null
  difference: number | null
  status: string
  countBreakdown: string | null
  notes: string | null
  user: { id: number; fullName: string | null; phone: string | null }
}

interface CashShiftSummary {
  totalOrders: number
  totalSales: number
  totalTips: number
  cashSales: number
  otherSales: number
  byPayment: Record<string, { count: number; total: number; tips: number }>
}

const CASH_METHODS = ['CASH', 'EFECTIVO', 'CARD', 'TARJETA', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'MIXED', 'CREDIT', 'FIADO']

// Normalize aliases to canonical payment method forms
const PAYMENT_CANONICAL: Record<string, string> = {
  EFECTIVO: 'CASH',
  TARJETA: 'CARD',
  FIADO: 'CREDIT',
}
// Canonical order for display
const CANONICAL_ORDER = ['CASH', 'DAVIPLATA', 'NEQUI', 'TRANSFER', 'CARD', 'MIXED', 'CREDIT']

function normalizePaymentMethod(method: string): string {
  return PAYMENT_CANONICAL[method] || method
}

function getCanonicalMethods(rawMethods: string[]): string[] {
  const normalized = new Set(rawMethods.map(normalizePaymentMethod))
  // Always include CASH as it's the base for physical cash
  normalized.add('CASH')
  // Return in canonical order
  return CANONICAL_ORDER.filter((m) => normalized.has(m))
}

function getExpectedForCanonical(shiftByPayment: Record<string, { count: number; total: number; tips: number }>, canonical: string): { count: number; total: number; tips: number } {
  const aliases = Object.entries(PAYMENT_CANONICAL).filter(([, v]) => v === canonical).map(([k]) => k)
  const direct = shiftByPayment[canonical]
  let count = direct?.count || 0
  let total = direct?.total || 0
  let tips = direct?.tips || 0
  for (const alias of aliases) {
    const aliasData = shiftByPayment[alias]
    if (aliasData) {
      count += aliasData.count
      total += aliasData.total
      tips += aliasData.tips
    }
  }
  return { count, total, tips }
}

// ─── Expense Types & Constants ──────────────────────────────────────────────

interface Expense {
  id: number
  storeId: number
  category: string
  description: string
  amount: number
  date: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

const EXPENSE_CATEGORIES = [
  'ARRIENDO', 'SERVICIOS', 'NOMINA', 'INSUMOS',
  'LICENCIAS', 'IMPUESTOS', 'TRANSPORTE', 'MANTENIMIENTO', 'OTRO',
] as const

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ARRIENDO: 'Arriendo',
  SERVICIOS: 'Servicios',
  NOMINA: 'Nómina',
  INSUMOS: 'Insumos',
  LICENCIAS: 'Licencias',
  IMPUESTOS: 'Impuestos',
  TRANSPORTE: 'Transporte',
  MANTENIMIENTO: 'Mantenimiento',
  OTRO: 'Otro',
}

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  ARRIENDO: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  SERVICIOS: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  NOMINA: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  INSUMOS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  LICENCIAS: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  IMPUESTOS: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  TRANSPORTE: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  MANTENIMIENTO: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  OTRO: 'bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-300 border-gray-200 dark:border-gray-800',
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

  // ─── Cash Register state ────────────────────────────────────────────────
  const [openShifts, setOpenShifts] = useState<Array<{
    shift: CashShift
    orderCount: number
    totalSales: number
    totalTips: number
    cashSales: number
    otherSales: number
    creditSales: number
    expectedCash: number
    byPayment: Record<string, { count: number; total: number; tips: number }>
    recentOrders: Array<{ id: number; orderNumber: string; total: number; paymentMethod: string; status: string; createdAt: string }>
  }>>([])
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null)
  const [shiftHistory, setShiftHistory] = useState<CashShift[]>([])
  const [isLoadingCash, setIsLoadingCash] = useState(false)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [openBalance, setOpenBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')
  const [closeCount, setCloseCount] = useState<Record<string, string>>({})
  const [closeNotes, setCloseNotes] = useState('')
  const [isSavingShift, setIsSavingShift] = useState(false)
  const [lastClosedShift, setLastClosedShift] = useState<{ shift: CashShift; summary: CashShiftSummary } | null>(null)
  const [deleteShiftId, setDeleteShiftId] = useState<number | null>(null)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetNote, setResetNote] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [showResetFinalConfirm, setShowResetFinalConfirm] = useState(false)
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')

  // ─── Shift Detail state ───────────────────────────────────────────────
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailShiftId, setDetailShiftId] = useState<number | null>(null)
  const [detailShiftData, setDetailShiftData] = useState<{
    shift: CashShift
    orderSummary: CashShiftSummary
    aggregatedProducts: Array<{
      productId: number | null
      serviceId: number | null
      name: string
      category: string | null
      sku: string | null
      quantity: number
      total: number
      isService: boolean
    }>
    orders: Array<{
      id: number
      orderNumber: string
      total: number
      subtotal: number
      tipAmount: number
      paymentMethod: string
      status: string
      createdAt: string
      customer: { id: number; name: string; phone: string | null } | null
      tableName: string | null
      items: Array<{
        id: number
        name: string
        sku: string | null
        category: string | null
        quantity: number
        unitPrice: number
        totalRow: number
        isService: boolean
      }>
    }>
  } | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailSearch, setDetailSearch] = useState('')

  // ─── Expenses state ──────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false)
  const [expenseFilterFrom, setExpenseFilterFrom] = useState('')
  const [expenseFilterTo, setExpenseFilterTo] = useState('')
  const [expenseFilterCategory, setExpenseFilterCategory] = useState<string>('')
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null)
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  const [expenseFormCategory, setExpenseFormCategory] = useState('OTRO')
  const [expenseFormDescription, setExpenseFormDescription] = useState('')
  const [expenseFormAmount, setExpenseFormAmount] = useState('')
  const [expenseFormDate, setExpenseFormDate] = useState('')
  const [expenseFormNotes, setExpenseFormNotes] = useState('')

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

  // ─── Cash Register fetches ─────────────────────────────────────────────────

  const fetchCurrentShift = useCallback(async () => {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/cash-register/current?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        setOpenShifts(data.shifts || [])
      }
    } catch { /* silent */ }
  }, [store?.id])

  const fetchShiftHistory = useCallback(async () => {
    if (!store?.id) return
    setIsLoadingCash(true)
    try {
      let url = `/api/cash-register?storeId=${store.id}&limit=50`
      if (historyFrom) url += `&from=${historyFrom}`
      if (historyTo) url += `&to=${historyTo}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setShiftHistory(data.shifts || [])
      }
    } catch { /* silent */ } finally {
      setIsLoadingCash(false)
    }
  }, [store?.id, historyFrom, historyTo])

  useEffect(() => {
    if (activeTab === 'caja') {
      fetchCurrentShift()
      fetchShiftHistory()
    }
  }, [activeTab, fetchCurrentShift, fetchShiftHistory])

  // ─── Expenses fetch ──────────────────────────────────────────────────────

  const fetchExpenses = useCallback(async () => {
    if (!store?.id) return
    setIsLoadingExpenses(true)
    try {
      let url = `/api/expenses?storeId=${store.id}`
      if (expenseFilterFrom) url += `&from=${expenseFilterFrom}`
      if (expenseFilterTo) url += `&to=${expenseFilterTo}`
      if (expenseFilterCategory) url += `&category=${expenseFilterCategory}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setExpenses(data.expenses || [])
      }
    } catch { /* silent */ } finally {
      setIsLoadingExpenses(false)
    }
  }, [store?.id, expenseFilterFrom, expenseFilterTo, expenseFilterCategory])

  useEffect(() => {
    if (activeTab === 'gastos') {
      fetchExpenses()
    }
  }, [activeTab, fetchExpenses])

  // ─── Expense handlers ───────────────────────────────────────────────────

  function openCreateExpenseDialog() {
    setEditingExpense(null)
    setExpenseFormCategory('OTRO')
    setExpenseFormDescription('')
    setExpenseFormAmount('')
    setExpenseFormDate(new Date().toISOString().split('T')[0])
    setExpenseFormNotes('')
    setShowExpenseDialog(true)
  }

  function openEditExpenseDialog(expense: Expense) {
    setEditingExpense(expense)
    setExpenseFormCategory(expense.category)
    setExpenseFormDescription(expense.description)
    setExpenseFormAmount(String(expense.amount))
    setExpenseFormDate(new Date(expense.date).toISOString().split('T')[0])
    setExpenseFormNotes(expense.notes || '')
    setShowExpenseDialog(true)
  }

  async function handleSaveExpense() {
    if (!store?.id) return
    const amount = parseInt(expenseFormAmount)
    if (!expenseFormDescription.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Ingresa descripción y monto válido')
      return
    }
    setIsSavingExpense(true)
    try {
      const payload = {
        storeId: store.id,
        category: expenseFormCategory,
        description: expenseFormDescription.trim(),
        amount,
        date: new Date(expenseFormDate + 'T12:00:00').toISOString(),
        notes: expenseFormNotes.trim() || undefined,
      }

      let res: Response
      if (editingExpense) {
        res = await fetch(`/api/expenses/${editingExpense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        toast.success(editingExpense ? 'Gasto actualizado' : 'Gasto registrado')
        setShowExpenseDialog(false)
        fetchExpenses()
        fetchAccounts()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al guardar gasto')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSavingExpense(false)
    }
  }

  async function handleDeleteExpense() {
    if (!deleteExpenseId) return
    setIsSavingExpense(true)
    try {
      const res = await fetch(`/api/expenses/${deleteExpenseId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Gasto eliminado')
        setDeleteExpenseId(null)
        fetchExpenses()
        fetchAccounts()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al eliminar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSavingExpense(false)
    }
  }

  // ─── Expense stats ──────────────────────────────────────────────────────
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0]

  const totalGastosMes = expenses
    .filter((e) => new Date(e.date) >= monthStart)
    .reduce((sum, e) => sum + e.amount, 0)

  const gastosHoy = expenses
    .filter((e) => {
      const d = new Date(e.date)
      return d.toISOString().split('T')[0] === todayStr
    })
    .reduce((sum, e) => sum + e.amount, 0)

  const categoryTotals: Record<string, number> = {}
  expenses
    .filter((e) => new Date(e.date) >= monthStart)
    .forEach((e) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount
    })
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]
  const topCategoryLabel = topCategory ? EXPENSE_CATEGORY_LABELS[topCategory[0]] || topCategory[0] : 'N/A'

  // ─── Cash Register handlers ────────────────────────────────────────────────

  async function handleOpenShift() {
    if (!store?.id || !openBalance) return
    setIsSavingShift(true)
    try {
      const res = await fetch('/api/cash-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          userId: useAuthStore.getState().user?.id || 0,
          openingBalance: parseInt(openBalance) || 0,
          notes: openNotes || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Caja abierta exitosamente')
        setShowOpenDialog(false)
        setOpenBalance('')
        setOpenNotes('')
        fetchCurrentShift()
        fetchShiftHistory()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al abrir caja')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSavingShift(false)
    }
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  async function handleCloseShift() {
    const shiftData = openShifts.find((s) => s.shift.id === selectedShiftId)
    if (!shiftData) {
      toast.error('No se encontró el turno seleccionado')
      return
    }

    // Calculate total closing balance from all count entries
    let closingBalance = 0
    const breakdown: Record<string, number> = {}
    for (const [method, val] of Object.entries(closeCount)) {
      const num = parseInt(val) || 0
      if (num > 0) {
        breakdown[method] = num
        if (method === 'CASH') {
          closingBalance += num
        }
      }
    }

    // Build the request body — always send closingBalance as a number
    const body: Record<string, unknown> = { closingBalance }
    if (Object.keys(breakdown).length > 0) body.countBreakdown = breakdown
    if (closeNotes) body.notes = closeNotes

    setIsSavingShift(true)
    try {
      const res = await fetch(`/api/cash-register/${shiftData.shift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const responseText = await res.text()
      let data: Record<string, unknown> | null = null
      try { data = JSON.parse(responseText) } catch { /* not JSON */ }

      if (!res.ok || !data) {
        const errMsg = data?.error || `Error ${res.status}: ${responseText.slice(0, 100)}`
        toast.error(errMsg)
        return
      }

      // Success — close dialog immediately
      toast.success('✅ Caja cerrada exitosamente')
      setShowCloseDialog(false)
      setCloseCount({})
      setCloseNotes('')
      setSelectedShiftId(null)

      // Refresh data
      fetchCurrentShift()
      fetchShiftHistory()

      // Try to fetch detail for printing (non-blocking)
      try {
        const detailRes = await fetch(`/api/cash-register/${shiftData.shift.id}`)
        if (detailRes.ok) {
          const detail = await detailRes.json()
          const closedShiftData = { shift: data.shift, summary: detail.orderSummary }
          setLastClosedShift(closedShiftData)
          printShiftReport(data.shift, detail.orderSummary)
        } else {
          setLastClosedShift({ shift: data.shift, summary: { totalOrders: 0, totalSales: 0, totalTips: 0, cashSales: 0, otherSales: 0, byPayment: {} } })
        }
      } catch {
        setLastClosedShift({ shift: data.shift, summary: { totalOrders: 0, totalSales: 0, totalTips: 0, cashSales: 0, otherSales: 0, byPayment: {} } })
      }
    } catch {
      toast.error('Error de conexión al cerrar caja. Intenta de nuevo.')
    } finally {
      setIsSavingShift(false)
    }
  }

  // Reopen a closed shift
  async function handleReopenShift(shiftId: number) {
    try {
      const res = await fetch(`/api/cash-register/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen' }),
      })
      if (res.ok) {
        toast.success('Turno reabierto correctamente')
        fetchCurrentShift()
        fetchShiftHistory()
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }))
        toast.error(err.error || 'No se pudo reabrir el turno')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  // Delete a shift (only if no orders)
  async function handleDeleteShift(shiftId: number) {
    try {
      const res = await fetch(`/api/cash-register/${shiftId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Turno eliminado correctamente')
        fetchCurrentShift()
        fetchShiftHistory()
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }))
        toast.error(err.error || 'No se pudo eliminar el turno')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  // ─── Reset de Saldos ──────────────────────────────────────────────────
  async function handleResetDebts() {
    if (!store?.id) return
    setIsResetting(true)
    try {
      const res = await fetch('/api/customers/reset-debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, note: resetNote.trim() || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message)
        setShowResetDialog(false)
        setResetNote('')
        fetchReports()
        fetchAccounts()
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }))
        toast.error(err.error || 'No se pudo resetear saldos')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsResetting(false)
    }
  }

  // Show shift detail dialog (products invoiced during the shift)
  async function handleShowShiftDetail(shiftId: number) {
    setDetailShiftId(shiftId)
    setShowDetailDialog(true)
    setDetailSearch('')
    setIsLoadingDetail(true)
    setDetailShiftData(null)
    try {
      const res = await fetch(`/api/cash-register/${shiftId}?storeId=${store?.id}&includeOrders=true`)
      if (res.ok) {
        const data = await res.json()
        setDetailShiftData(data)
      } else {
        toast.error('No se pudo obtener el detalle del turno')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  // Print a shift report (AZ format) — reusable for both auto-print after close and from history
  async function printShiftReport(shift: CashShift, summary: CashShiftSummary) {
    if (!store) return
    const payBreakdown = Object.entries(summary.byPayment).map(([method, data]) => ({
      method,
      count: data.count,
      total: data.total,
    }))
    let parsedCount: Record<string, number> = {}
    if (shift.countBreakdown) {
      try { parsedCount = JSON.parse(shift.countBreakdown) } catch { /* ignore */ }
    }
    const closeData: CashRegisterCloseData = {
      storeName: store.name,
      storeNIT: store.nit || undefined,
      storeAddress: store.address || undefined,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt || new Date().toISOString(),
      responsibleName: shift.user.fullName || 'Usuario',
      openingBalance: shift.openingBalance,
      totalCashSales: summary.cashSales,
      totalOtherSales: summary.otherSales,
      expectedCash: shift.expectedCash || 0,
      actualCash: shift.closingBalance || 0,
      difference: shift.difference || 0,
      totalTips: summary.totalTips,
      paymentBreakdown: payBreakdown,
      countBreakdown: Object.keys(parsedCount).length > 0 ? parsedCount : undefined,
      currencyCode: currencyCode,
    }
    printCashRegisterClose(closeData)
  }

  // Print a closed shift from history
  async function handlePrintShiftFromHistory(shiftId: number) {
    if (!store) return
    try {
      const res = await fetch(`/api/cash-register/${shiftId}?storeId=${store.id}`)
      if (res.ok) {
        const detail = await res.json()
        printShiftReport(detail.shift, detail.orderSummary)
      } else {
        toast.error('No se pudo obtener el detalle del turno')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  function handlePrintClose() {
    if (!lastClosedShift) return
    printShiftReport(lastClosedShift.shift, lastClosedShift.summary)
  }

  async function handlePrintDailySummary() {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/reports/daily?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        const printData: DailySummaryData = {
          storeName: store.name,
          storeNIT: store.nit || undefined,
          date: data.date,
          totalOrders: data.orders.total,
          completedOrders: data.orders.completed,
          cancelledOrders: data.orders.cancelled,
          totalSales: data.sales.total,
          subtotal: data.sales.subtotal,
          tips: data.sales.tips,
          paymentBreakdown: Object.entries(data.byPayment).map(([method, d]) => ({
            method,
            count: d.count,
            total: d.total,
            tips: d.tips,
          })),
          topProducts: data.topProducts.map((p: { name: string; quantity: number; total: number }) => p),
          openingBalance: data.cash.openingBalance,
          expectedCash: data.cash.expectedCash,
          services: data.services,
          currencyCode,
        }
        printDailySummary(printData)
      }
    } catch { toast.error('Error al generar corte Z') }
  }

  async function handlePrintCatalog() {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/products?storeId=${store.id}&active=true&limit=500`)
      if (res.ok) {
        const data = await res.json()
        const rawProducts = Array.isArray(data) ? data : (data.data || [])
        const products = rawProducts.map((p: { name: string; category: { name: string } | null; salePrice: number; currentStock: number; sku: string | null }) => ({
          name: p.name,
          category: p.category?.name || 'Sin Categoría',
          price: p.salePrice,
          stock: p.currentStock,
          sku: p.sku,
        }))
        const printData: ProductCatalogData = {
          storeName: store.name,
          storeNIT: store.nit || undefined,
          products,
          currencyCode,
        }
        printProductCatalog(printData)
      }
    } catch { toast.error('Error al generar catálogo') }
  }

  async function handlePrintKardex(productId: number, productName: string, category: string, sku?: string | null) {
    if (!store?.id) return
    try {
      const res = await fetch(`/api/inventory/kardex?storeId=${store.id}&productId=${productId}`)
      if (res.ok) {
        const data = await res.json()
        const printData: KardexData = {
          storeName: store.name,
          productName,
          category,
          sku,
          movements: data.movements,
          currencyCode,
        }
        printKardex(printData)
      }
    } catch { toast.error('Error al generar kardex') }
  }

  // ─── Summary calculations ────────────────────────────────────────────────
  // INCOME accounts: balance = DEBIT - CREDIT. Normal balance is negative (credits > debits).
  // The actual income is the absolute value of the negative balance.
  const totalIngresos = accounts
    .filter((a) => a.type === 'INCOME')
    .reduce((sum, a) => sum + Math.abs(a.balance), 0)

  // EXPENSE accounts: balance = DEBIT - CREDIT. Normal balance is positive (debits > credits).
  const totalGastos = accounts
    .filter((a) => a.type === 'EXPENSE')
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0)

  // Total assets (all ASSET accounts)
  const totalActivos = accounts
    .filter((a) => a.type === 'ASSET')
    .reduce((sum, a) => sum + a.balance, 0)

  const balanceCaja = accounts.find((a) => a.type === 'ASSET' && a.isDefault)?.balance ?? 0

  // Cuentas por Cobrar: find by partial name match
  const cxcAccount = accounts.find((a) => a.type === 'ASSET' && a.name.includes('Cuentas por Cobrar'))
  const cuentasPorCobrar = cxcAccount?.balance ?? 0

  // Propinas (from Propina INCOME account)
  const propinaAccount = accounts.find((a) => a.type === 'INCOME' && a.name === 'Propina')
  const totalPropinas = propinaAccount ? Math.abs(propinaAccount.balance) : 0

  // Ventas (total income minus propinas)
  const ventasAccount = accounts.find((a) => a.type === 'INCOME' && a.name === 'Ventas')
  const totalVentas = ventasAccount ? Math.abs(ventasAccount.balance) : (totalIngresos - totalPropinas)

  const netIncome = totalIngresos - totalGastos

  const barMax = Math.max(totalIngresos, totalGastos, 1)

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <KPIBar context="accounting" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 lg:w-[768px]">
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
          <TabsTrigger value="caja" className="gap-1.5">
            <Wallet className="h-4 w-4 hidden sm:block" />
            Caja
          </TabsTrigger>
          <TabsTrigger value="gastos" className="gap-1.5">
            <Receipt className="h-4 w-4 hidden sm:block" />
            Gastos
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
              <Button variant="outline"
                size="sm"
                onClick={fetchAccounts}
                className="gap-1.5 active:scale-[0.98] transition-all"
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
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                      <Button variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-xs active:scale-[0.98] transition-all"
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
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Cuenta
                    </Label>
                    <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                      <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40">
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
                    <Button variant="outline"
                      size="sm"
                      onClick={handleClearFilters}
                      className="h-9 active:scale-[0.98] transition-all"
                    >
                      Limpiar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            {isLoadingEntries ? (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-muted/30 transition-colors">
                          <TableHead className="w-[120px]">Fecha</TableHead>
                          <TableHead>Cuenta</TableHead>
                          <TableHead className="w-[100px]">Tipo</TableHead>
                          <TableHead className="text-right w-[130px]">Monto</TableHead>
                          <TableHead className="whitespace-nowrap text-xs">Descripción</TableHead>
                          <TableHead className="whitespace-nowrap text-xs w-[80px]">Referencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={entry.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium">
                                  {formatDateShort(entry.createdAt)}
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
                            <TableCell>
                              <span className="text-xs text-muted-foreground truncate max-w-[120px] block" title={entry.description || ''}>
                                {entry.description || '—'}
                              </span>
                            </TableCell>
                            <TableCell>
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
                  <p className="text-[11px] text-muted-foreground mt-1">Productos y servicios</p>
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
        </TabsContent>
        {/* ─── Tab 4: Informes ──────────────────────────────────────────── */}
        <TabsContent value="informes">
          <div className="space-y-6">
            {/* ─── Date Range Filter ─────────────────────────────────────── */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                  <Button className="h-9 gap-1.5 active:scale-[0.98] transition-all" onClick={fetchReports}
                    disabled={isLoadingReport}
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
                        {formatCurrency(reportData.sales.total, currencyCode)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {reportData.sales.orderCount} órdenes · Ticket prom: {formatCurrency(reportData.sales.avgTicket, currencyCode)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Contado vs Fiado */}
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
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
                        {formatCurrency(reportData.sales.tips, currencyCode)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {reportData.sales.tipsOrderCount} órdenes con propina
                      </p>
                    </CardContent>
                  </Card>

                  {/* Mesas Abiertas */}
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
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
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                            <TableRow className="hover:bg-muted/30 transition-colors">
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
                                <TableRow className="hover:bg-muted/30 transition-colors" key={product.productId}>
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
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HandCoins className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <CardTitle className="text-base">Cuentas por Cobrar</CardTitle>
                          <CardDescription className="text-xs">
                            {reportData.customerDebts.length} cliente{reportData.customerDebts.length !== 1 ? 's' : ''} con deuda
                          </CardDescription>
                        </div>
                      </div>
                      <Button variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 active:scale-[0.98] transition-all"
                        onClick={() => setShowResetDialog(true)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Resetear Saldos
                      </Button>
                    </div>
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
                            <TableRow className="hover:bg-muted/30 transition-colors">
                              <TableHead>Cliente</TableHead>
                              <TableHead className="whitespace-nowrap text-xs">Teléfono</TableHead>
                              <TableHead className="text-right w-32">Deuda</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.customerDebts.map((c) => (
                              <TableRow className="hover:bg-muted/30 transition-colors" key={c.id}>
                                <TableCell className="font-medium">{c.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
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
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                            <TableRow className="hover:bg-muted/30 transition-colors">
                              <TableHead>Producto</TableHead>
                              <TableHead className="whitespace-nowrap text-xs">Categoría</TableHead>
                              <TableHead className="text-center w-20">Stock</TableHead>
                              <TableHead className="text-center w-16 text-xs">Mín.</TableHead>
                              <TableHead className="text-right w-28">Precio</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.lowStockProducts.map((p) => (
                              <TableRow className="hover:bg-muted/30 transition-colors" key={p.id}>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
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
                                <TableCell className="text-center text-xs text-muted-foreground">
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
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                            <TableRow className="hover:bg-muted/30 transition-colors">
                              <TableHead>Cuenta</TableHead>
                              <TableHead className="text-right w-28">Saldo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(reportData.accountBalances).map(([name, balance]) => {
                              const acc = accounts.find((a) => a.name === name)
                              const type = acc?.type || ''
                              return (
                                <TableRow className="hover:bg-muted/30 transition-colors" key={name}>
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
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
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
                            <TableRow className="hover:bg-muted/30 transition-colors">
                              <TableHead className="w-[120px]">Fecha</TableHead>
                              <TableHead className="w-[90px]">Orden</TableHead>
                              <TableHead className="w-[100px]">Origen</TableHead>
                              <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                              <TableHead>Método</TableHead>
                              <TableHead className="text-right w-[110px]">Total</TableHead>
                              <TableHead className="text-left whitespace-nowrap text-xs">Productos</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.recentOrders.map((order) => (
                              <TableRow className="hover:bg-muted/30 transition-colors" key={order.id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-medium">
                                      {formatDateShort(order.createdAt)}
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
                                <TableCell className="text-xs">
                                  <span className="truncate max-w-[80px] block" title={order.customer}>{order.customer}</span>
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
                                  <div className="flex flex-col items-end">
                                    <span className="text-sm font-bold tabular-nums">
                                      {formatCurrency(order.total, currencyCode)}
                                    </span>
                                    {order.tipAmount > 0 && (
                                      <span className="text-[10px] text-pink-600 dark:text-pink-400 font-medium">
                                        +Propina {formatCurrency(order.tipAmount, currencyCode)}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
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
                                <TableCell>
                                  <Button variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 active:scale-[0.98] transition-all"
                                    title="Imprimir factura"
                                    onClick={() => {
                                      const items: TicketItem[] = order.items.map((item) => ({
                                        name: item.name,
                                        quantity: item.quantity,
                                        unitPrice: item.unitPrice,
                                        total: item.totalRow,
                                      }))
                                      printTicket({
                                        storeName: store?.name || '',
                                        orderNumber: order.orderNumber,
                                        date: order.createdAt,
                                        customer: order.customer || undefined,
                                        tableName: order.tableName || undefined,
                                        items,
                                        subtotal: order.subtotal,
                                        tipAmount: order.tipAmount || 0,
                                        total: order.total,
                                        paymentMethod: order.paymentMethod,
                                        currencyCode,
                                      })
                                    }}
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
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

        {/* ─── Tab 5: Caja ──────────────────────────────────────────────── */}
        <TabsContent value="caja">
          <div className="space-y-6">
            {/* ─── Current Shift Status Card(s) ──────────────────────────── */}
            {openShifts.length > 0 ? (
              <>
              {openShifts.map((shiftData, shiftIndex) => (
                <div key={shiftData.shift.id} className="space-y-4">
                  {/* ─── Unified Turno Card ────────────────────────────────── */}
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Turno #{shiftIndex + 1}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              {shiftData.shift.user.fullName || 'Usuario'} · Apertura: {formatDateShort(shiftData.shift.openedAt)} {formatTime(shiftData.shift.openedAt)}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 font-semibold">
                            ABIERTA
                          </Badge>
                          <Button variant="outline" size="sm" onClick={fetchCurrentShift} className="gap-1 h-8 active:scale-[0.98] transition-all">
                            <Loader2 className="h-3 w-3" />
                            <span className="">Actualizar</span>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {/* ─── Saldo Inicial + Saldo al Momento ─────────────────── */}
                    <div className="px-6 pb-3">
                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 border p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground font-medium">Saldo Inicial</p>
                          </div>
                          <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(shiftData.shift.openingBalance, currencyCode)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Fondo de apertura</p>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground font-medium">Saldo al Momento</p>
                          </div>
                          <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(shiftData.expectedCash, currencyCode)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Apertura + Efectivo recibido</p>
                        </div>
                      </div>
                    </div>

                    <Separator className="mx-6" />

                    {/* ─── Resumen del Turno ────────────────────────────────── */}
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-900 p-3">
                          <p className="text-[10px] text-muted-foreground font-medium">Ventas Totales</p>
                          <p className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                            {formatCurrency(shiftData.totalSales, currencyCode)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{shiftData.orderCount} órdenes</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 p-3">
                          <p className="text-[10px] text-muted-foreground font-medium">Efectivo</p>
                          <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(shiftData.cashSales, currencyCode)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-violet-50 dark:bg-violet-950/50 border border-violet-100 dark:border-violet-900 p-3">
                          <p className="text-[10px] text-muted-foreground font-medium">Otros Métodos</p>
                          <p className="text-lg font-bold tabular-nums text-violet-700 dark:text-violet-400">
                            {formatCurrency(shiftData.otherSales, currencyCode)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 p-3">
                          <p className="text-[10px] text-muted-foreground font-medium">Fiado</p>
                          <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                            {formatCurrency(shiftData.creditSales, currencyCode)}
                          </p>
                        </div>
                      </div>

                      {shiftData.totalTips > 0 && (
                        <div className="flex items-center gap-2 bg-pink-50 dark:bg-pink-950 rounded-lg px-3 py-2 border border-pink-100 dark:border-pink-900">
                          <Heart className="h-4 w-4 text-pink-500" />
                          <span className="text-xs text-pink-700 dark:text-pink-300">Propinas:</span>
                          <span className="text-sm font-bold text-pink-700 dark:text-pink-300 tabular-nums">
                            {formatCurrency(shiftData.totalTips, currencyCode)}
                          </span>
                        </div>
                      )}

                      {/* Payment method breakdown */}
                      {Object.keys(shiftData.byPayment).length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground font-medium">Desglose por Método de Pago</p>
                          <div className="space-y-1">
                            {Object.entries(shiftData.byPayment).map(([method, data]) => (
                              <div key={method} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <div className={`h-2 w-2 rounded-full ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`} />
                                  <span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[method] || method}</span>
                                  <span className="text-muted-foreground">({data.count})</span>
                                </div>
                                <span className="font-semibold tabular-nums">{formatCurrency(data.total, currencyCode)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => { setSelectedShiftId(shiftData.shift.id); setShowCloseDialog(true) }} variant="destructive" size="sm">
                          <Wallet className="h-3.5 w-3.5" />
                          Cerrar Caja
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ─── Últimas Ventas ────────────────────────────────────── */}
                  {shiftData.recentOrders.length > 0 && (
                    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Últimas Ventas del Turno #{shiftIndex + 1}</CardTitle>
                          <Badge variant="secondary" className="text-[10px]">{shiftData.orderCount} total</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="max-h-[300px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-muted/30 transition-colors">
                                <TableHead className="w-[100px]">Hora</TableHead>
                                <TableHead>Orden</TableHead>
                                <TableHead className="whitespace-nowrap text-xs">Método</TableHead>
                                <TableHead className="text-right w-[110px]">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {shiftData.recentOrders.map((order) => (
                                <TableRow className="hover:bg-muted/30 transition-colors" key={order.id}>
                                  <TableCell>
                                    <span className="text-xs tabular-nums">{formatTime(order.createdAt)}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs font-medium">{order.orderNumber}</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      <div className={`h-2 w-2 rounded-full ${PAYMENT_METHOD_COLORS[order.paymentMethod] || 'bg-gray-400'}`} />
                                      <span className="text-xs">{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className="text-xs font-semibold tabular-nums">
                                      {formatCurrency(order.total, currencyCode)}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ))}
              </>
            ) : (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                      <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <CardDescription className="text-xs">Caja Cerrada</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">No hay un turno abierto. Abre la caja para registrar ventas en efectivo.</p>
                  <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => setShowOpenDialog(true)}>
                    <Wallet className="h-4 w-4" />
                    Abrir Caja
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ─── Last Closed Difference ────────────────────────────────── */}
            {lastClosedShift && (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Último Cierre</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Efectivo Esperado</span>
                    <span className="text-sm font-bold tabular-nums">
                      {formatCurrency(lastClosedShift.shift.expectedCash || 0, currencyCode)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Efectivo Real</span>
                    <span className="text-sm font-bold tabular-nums">
                      {formatCurrency(lastClosedShift.shift.closingBalance || 0, currencyCode)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Diferencia</span>
                    <span className={`text-base font-bold tabular-nums ${
                      (lastClosedShift.shift.difference || 0) >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {(lastClosedShift.shift.difference || 0) >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(lastClosedShift.shift.difference || 0), currencyCode)}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handlePrintClose} className="gap-1.5 mt-2 active:scale-[0.98] transition-all">
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir Cierre
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ─── Print Actions ──────────────────────────────────────────── */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Acciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrintDailySummary} className="gap-1.5 active:scale-[0.98] transition-all">
                    <FileText className="h-3.5 w-3.5" />
                    Corte Z del Día
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrintCatalog} className="gap-1.5 active:scale-[0.98] transition-all">
                    <Receipt className="h-3.5 w-3.5" />
                    Imprimir Catálogo
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ─── Shift History ──────────────────────────────────────────── */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">Historial de Turnos</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setHistoryFrom(''); setHistoryTo('') }}
                      className="gap-1.5 text-xs"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Limpiar
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchShiftHistory} className="gap-1.5 active:scale-[0.98] transition-all">
                      <Loader2 className="h-3.5 w-3.5" />
                      Actualizar
                    </Button>
                  </div>
                </div>
                {/* Date filter row */}
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Desde</Label>
                    <Input
                      type="date"
                      value={historyFrom}
                      onChange={(e) => setHistoryFrom(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Hasta</Label>
                    <Input
                      type="date"
                      value={historyTo}
                      onChange={(e) => setHistoryTo(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button size="sm" onClick={fetchShiftHistory} className="h-8 gap-1.5 active:scale-[0.98] transition-all">
                      <Search className="h-3.5 w-3.5" />
                      Filtrar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-muted/30 transition-colors">
                        <TableHead className="w-[80px]">Responsable</TableHead>
                        <TableHead className="w-[85px]">Hora Apertura</TableHead>
                        <TableHead className="w-[85px]">Hora Cierre</TableHead>
                        <TableHead className="text-right w-[110px]">Saldo Inicial</TableHead>
                        <TableHead className="text-right w-[110px]">Saldo Final</TableHead>
                        <TableHead className="text-right w-[90px]">Diferencia</TableHead>
                        <TableHead className="w-[65px]">Estado</TableHead>
                        <TableHead className="w-[90px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingCash ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={i}>
                            {Array.from({ length: 8 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : shiftHistory.length === 0 ? (
                        <TableRow className="hover:bg-muted/30 transition-colors">
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                            No hay turnos registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        shiftHistory.map((shift) => (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={shift.id}>
                            <TableCell>
                              <span className="text-xs font-medium truncate max-w-[90px] block">
                                {shift.user.fullName || 'Usuario'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium tabular-nums">{formatTime(shift.openedAt)}</span>
                                <span className="text-[10px] text-muted-foreground">{formatDateShort(shift.openedAt)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {shift.closedAt ? (
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium tabular-nums">{formatTime(shift.closedAt)}</span>
                                  <span className="text-[10px] text-muted-foreground">{formatDateShort(shift.closedAt)}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-semibold tabular-nums">
                                {formatCurrency(shift.openingBalance, currencyCode)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-semibold tabular-nums">
                                {shift.closingBalance !== null ? formatCurrency(shift.closingBalance, currencyCode) : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {shift.difference !== null ? (
                                <span className={`text-xs font-bold tabular-nums ${
                                  shift.difference >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                                }`}>
                                  {shift.difference >= 0 ? '+' : '-'}{formatCurrency(Math.abs(shift.difference), currencyCode)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={shift.status === 'OPEN'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[9px]'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 text-[9px]'
                                }
                              >
                                {shift.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 active:scale-[0.98] transition-all"
                                  title="Ver detalles"
                                  onClick={() => handleShowShiftDetail(shift.id)}
                                >
                                  <ListOrdered className="h-3.5 w-3.5" />
                                </Button>
                                {shift.status === 'CLOSED' && (
                                  <Button variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 active:scale-[0.98] transition-all"
                                    title="Imprimir informe"
                                    onClick={() => handlePrintShiftFromHistory(shift.id)}
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {shift.status === 'CLOSED' && (
                                  <Button variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50 active:scale-[0.98] transition-all"
                                    title="Reabrir turno"
                                    onClick={() => handleReopenShift(shift.id)}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {shift.status === 'OPEN' && (
                                  <Button variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 active:scale-[0.98] transition-all"
                                    title="Eliminar turno"
                                    onClick={() => setDeleteShiftId(shift.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 6: Gastos ──────────────────────────────────────────────── */}
        <TabsContent value="gastos">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Gastos Operacionales</h2>
                <p className="text-sm text-muted-foreground">
                  {expenses.length} gasto{expenses.length !== 1 ? 's' : ''} registrado{expenses.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={openCreateExpenseDialog} size="sm">
                <Receipt className="h-3.5 w-3.5" />
                Registrar Gasto
              </Button>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Gastos del Mes</p>
                      <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                        {formatCurrency(totalGastosMes, currencyCode)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gastos Hoy</p>
                      <p className="text-lg font-bold tabular-nums">
                        {formatCurrency(gastosHoy, currencyCode)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Categoría Principal</p>
                      <p className="text-lg font-bold">{topCategoryLabel}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Desde</Label>
                    <Input
                      type="date"
                      value={expenseFilterFrom}
                      onChange={(e) => setExpenseFilterFrom(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Hasta</Label>
                    <Input
                      type="date"
                      value={expenseFilterTo}
                      onChange={(e) => setExpenseFilterTo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant={expenseFilterCategory === '' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterCategory('')}
                      className="h-9"
                    >
                      Todas
                    </Button>
                    <Button
                      variant={expenseFilterCategory === 'ARRIENDO' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'ARRIENDO' ? '' : 'ARRIENDO')}
                      className="h-9"
                    >
                      Arriendo
                    </Button>
                    <Button
                      variant={expenseFilterCategory === 'NOMINA' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'NOMINA' ? '' : 'NOMINA')}
                      className="h-9"
                    >
                      Nómina
                    </Button>
                    <Button
                      variant={expenseFilterCategory === 'SERVICIOS' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'SERVICIOS' ? '' : 'SERVICIOS')}
                      className="h-9"
                    >
                      Servicios
                    </Button>
                    <Button
                      variant={expenseFilterCategory === 'IMPUESTOS' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'IMPUESTOS' ? '' : 'IMPUESTOS')}
                      className="h-9"
                    >
                      Impuestos
                    </Button>
                  </div>
                  {(expenseFilterFrom || expenseFilterTo || expenseFilterCategory) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setExpenseFilterFrom('')
                        setExpenseFilterTo('')
                        setExpenseFilterCategory('')
                      }}
                      className="h-9"
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Expenses list */}
            {isLoadingExpenses ? (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-6 w-20" />
                        <Skeleton className="h-6 w-32 flex-1" />
                        <Skeleton className="h-6 w-24" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : expenses.length === 0 ? (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Receipt className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">No hay gastos registrados</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Los gastos registrados aparecerán aquí
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
                <CardContent className="p-0">
                  {/* Expenses table - responsive */}
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-muted/30 transition-colors">
                          <TableHead className="w-[80px] text-xs whitespace-nowrap">Fecha</TableHead>
                          <TableHead className="w-[100px] text-xs whitespace-nowrap">Categoría</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Descripción</TableHead>
                          <TableHead className="text-right w-[110px] text-xs whitespace-nowrap">Monto</TableHead>
                          <TableHead className="w-[80px] text-center text-xs">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense) => (
                          <TableRow className="hover:bg-muted/30 transition-colors" key={expense.id}>
                            <TableCell className="text-xs tabular-nums whitespace-nowrap">
                              {formatDateShort(expense.date)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${EXPENSE_CATEGORY_COLORS[expense.category] || 'bg-secondary text-secondary-foreground border-border'}`}
                              >
                                {EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-xs font-medium truncate max-w-[140px]" title={expense.description}>{expense.description}</p>
                                {expense.notes && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[140px]" title={expense.notes}>{expense.notes}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold tabular-nums text-red-600 dark:text-red-400 whitespace-nowrap">
                              -{formatCurrency(expense.amount, currencyCode)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 active:scale-[0.98] transition-all"
                                  onClick={() => openEditExpenseDialog(expense)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 active:scale-[0.98] transition-all"
                                  onClick={() => setDeleteExpenseId(expense.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ─── Dialog: Open Cash ─────────────────────────────────────────── */}
        <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
          <DialogContent className="backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle>Abrir Caja</DialogTitle>
              <DialogDescription>Registra el saldo inicial en la caja registradora</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Saldo Inicial (COP)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={openBalance}
                  onChange={(e) => setOpenBalance(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea
                  placeholder="Observaciones..."
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOpenDialog(false)}>Cancelar</Button>
              <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={handleOpenShift} disabled={isSavingShift || !openBalance}>
                {isSavingShift && <Loader2 className="h-4 w-4 animate-spin" />}
                Abrir Caja
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Dialog: Close Cash — Conteo Detallado ────────────────────── */}
        <Dialog open={showCloseDialog} onOpenChange={(open) => {
          if (!open) { setSelectedShiftId(null); setCloseCount({}) }
          setShowCloseDialog(open)
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Conteo Final — Cerrar Caja
              </DialogTitle>
              <DialogDescription>
                Ingresa los valores reales que tienes en cada método de pago
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const shiftData = openShifts.find((s) => s.shift.id === selectedShiftId)
              if (!shiftData) return null

              // Build payment methods list from the shift's actual sales (deduplicated/normalized)
              const paymentMethods = Object.keys(shiftData.byPayment)
              const methodsUsed = getCanonicalMethods(paymentMethods)

              // Pre-fill counts when dialog opens (only once)
              const getInitialValue = (method: string) => {
                if (closeCount[method] !== undefined) return closeCount[method]
                return ''
              }

              const reportedCash = parseInt(closeCount['CASH'] || '0') || 0
              const expectedCash = shiftData.expectedCash
              const diffCash = reportedCash - expectedCash

              return (
                <div className="space-y-4 py-2">
                  {/* Saldo Inicial */}
                  <div className="rounded-lg bg-muted/50 border p-3 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">Saldo Inicial (Apertura)</p>
                      <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(shiftData.shift.openingBalance, currencyCode)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">Ventas en Efectivo</p>
                      <p className="text-sm font-bold tabular-nums">
                        {formatCurrency(shiftData.cashSales, currencyCode)}
                      </p>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">Efectivo Esperado</p>
                      <p className="text-sm font-bold tabular-nums">
                        {formatCurrency(expectedCash, currencyCode)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Conteo detallado */}
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Conteo por Método de Pago</p>

                    {methodsUsed.map((method) => {
                      const expectedData = getExpectedForCanonical(shiftData.byPayment, method)
                      const isCashMethod = method === 'CASH'
                      // For CASH, include opening balance so user's physical count matches expected
                      const expected = isCashMethod ? expectedData.total + shiftData.shift.openingBalance : expectedData.total
                      const reported = parseInt(closeCount[method] || '0') || 0
                      const diff = reported - expected
                      const label = PAYMENT_METHOD_LABELS[method] || method
                      const color = PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'

                      return (
                        <div key={method} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`h-3 w-3 rounded-full ${color}`} />
                            <Label className="text-xs font-semibold flex-1">{label}</Label>
                            {expected > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                Esperado: {formatCurrency(expected, currencyCode)}{isCashMethod ? ` (${expectedData.count} ventas + ${formatCurrency(shiftData.shift.openingBalance, currencyCode)} apertura)` : ` (${expectedData.count})`}
                              </span>
                            )}
                          </div>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={getInitialValue(method)}
                            onChange={(e) => setCloseCount(prev => ({ ...prev, [method]: e.target.value }))}
                            className="h-9 tabular-nums"
                          />
                          {reported > 0 && expected > 0 && (
                            <p className={`text-[10px] font-medium tabular-nums ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                              {diff === 0 ? '✓ Cuadra' : diff > 0 ? `+${formatCurrency(diff, currencyCode)} de más` : `${formatCurrency(Math.abs(diff), currencyCode)} de menos`}
                            </p>
                          )}
                        </div>
                      )
                    })}

                    {/* Allow adding other methods */}
                    {methodsUsed.length > 0 && (
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">
                          Los métodos se muestran según las ventas del turno
                        </p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Resumen del conteo */}
                  <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Resumen del Conteo</p>

                    {/* Efectivo */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-xs">Efectivo Reportado (apertura + ventas)</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(reportedCash, currencyCode)}
                      </span>
                    </div>

                    {/* Diferencia efectivo */}
                    <div className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                      diffCash === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : diffCash > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-red-50 dark:bg-red-950/30'
                    }`}>
                      <span className="text-xs font-medium">Diferencia Efectivo</span>
                      <span className={`text-sm font-bold tabular-nums ${
                        diffCash === 0 ? 'text-emerald-600 dark:text-emerald-400' : diffCash > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {diffCash === 0 ? '✓ Cuadra perfectamente' : `${diffCash > 0 ? '+' : ''}${formatCurrency(diffCash, currencyCode)}`}
                      </span>
                    </div>

                    {/* Otros métodos total */}
                    {(() => {
                      let otherTotal = 0
                      for (const [method, val] of Object.entries(closeCount)) {
                        if (method !== 'CASH') {
                          otherTotal += parseInt(val) || 0
                        }
                      }
                      if (otherTotal === 0) return null
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Otros Métodos</span>
                          <span className="text-sm font-bold tabular-nums">
                            {formatCurrency(otherTotal, currencyCode)}
                          </span>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Notas */}
                  <div className="space-y-2">
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Textarea
                      placeholder="Observaciones del cierre..."
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )
            })()}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => { setSelectedShiftId(null); setCloseCount({}); setShowCloseDialog(false) }}>Cancelar</Button>
              <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={handleCloseShift} disabled={isSavingShift} variant="destructive">
                {isSavingShift && <Loader2 className="h-4 w-4 animate-spin" />}
                <Scale className="h-4 w-4" />
                Confirmar y Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Dialog: Shift Detail (Products Invoiced) ─────────────────── */}
        <Dialog open={showDetailDialog} onOpenChange={(open) => {
          if (!open) { setDetailShiftId(null); setDetailShiftData(null); setDetailSearch('') }
          setShowDetailDialog(open)
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                Detalle del Turno
              </DialogTitle>
              <DialogDescription>
                Productos y servicios facturados durante este turno de caja
              </DialogDescription>
            </DialogHeader>

            {isLoadingDetail ? (
              <div className="space-y-4 py-4">
                <div className="flex gap-4">
                  <Skeleton className="h-20 w-48" />
                  <Skeleton className="h-20 w-48" />
                  <Skeleton className="h-20 w-48" />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : detailShiftData ? (
              <div className="space-y-4">
                {/* Shift Info Header */}
                <div className="rounded-lg bg-muted/50 border p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsable</p>
                      <p className="text-sm font-semibold truncate">{detailShiftData.shift.user.fullName || 'Usuario'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Apertura</p>
                      <p className="text-sm font-semibold tabular-nums">{formatTime(detailShiftData.shift.openedAt)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDateShort(detailShiftData.shift.openedAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cierre</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {detailShiftData.shift.closedAt ? formatTime(detailShiftData.shift.closedAt) : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {detailShiftData.shift.closedAt ? formatDateShort(detailShiftData.shift.closedAt) : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estado</p>
                      <Badge variant="outline" className={
                        detailShiftData.shift.status === 'OPEN'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px]'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 text-[10px]'
                      }>
                        {detailShiftData.shift.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Órdenes</p>
                    <p className="text-lg font-bold tabular-nums">{detailShiftData.orderSummary.totalOrders}</p>
                  </Card>
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ventas Totales</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(detailShiftData.orderSummary.totalSales, currencyCode)}
                    </p>
                  </Card>
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Propinas</p>
                    <p className="text-lg font-bold tabular-nums text-pink-600 dark:text-pink-400">
                      {formatCurrency(detailShiftData.orderSummary.totalTips, currencyCode)}
                    </p>
                  </Card>
                  <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Efectivo</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatCurrency(detailShiftData.orderSummary.cashSales, currencyCode)}
                    </p>
                  </Card>
                </div>

                {/* Search */}
                <div className="relative">
                  <Input
                    placeholder="Buscar producto o servicio..."
                    value={detailSearch}
                    onChange={(e) => setDetailSearch(e.target.value)}
                    className="h-9 pl-8"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>

                {/* Aggregated Products Table (A-Z) */}
                {(() => {
                  const searchLower = detailSearch.toLowerCase().trim()
                  const filteredProducts = searchLower
                    ? detailShiftData.aggregatedProducts.filter((p) =>
                        p.name.toLowerCase().includes(searchLower) ||
                        p.category?.toLowerCase().includes(searchLower) ||
                        p.sku?.toLowerCase().includes(searchLower)
                      )
                    : detailShiftData.aggregatedProducts

                  if (filteredProducts.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <PackageX className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {searchLower ? 'No se encontraron productos' : 'No hay productos facturados en este turno'}
                        </p>
                      </div>
                    )
                  }

                  const totalQty = filteredProducts.reduce((sum, p) => sum + p.quantity, 0)
                  const totalVal = filteredProducts.reduce((sum, p) => sum + p.total, 0)

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Productos Facturados (A-Z) — {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {totalQty} unidades · Total: <span className="font-bold text-foreground">{formatCurrency(totalVal, currencyCode)}</span>
                        </p>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-muted/30 transition-colors">
                              <TableHead className="w-[40px] text-center text-[10px]">#</TableHead>
                              <TableHead className="text-[11px]">Producto/Servicio</TableHead>
                              <TableHead className="text-[11px] whitespace-nowrap w-[80px]">Categoría</TableHead>
                              <TableHead className="text-[11px] text-center w-[60px]">Cant.</TableHead>
                              <TableHead className="text-[11px] text-right w-[100px]">Unitario</TableHead>
                              <TableHead className="text-[11px] text-right w-[110px]">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredProducts.map((product, idx) => (
                              <TableRow className="hover:bg-muted/30 transition-colors" key={`${product.productId || 'svc'}-${product.serviceId || 'prd'}-${product.name}`}>
                                <TableCell className="text-center text-[10px] text-muted-foreground tabular-nums">
                                  {idx + 1}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      {product.isService && (
                                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 border-violet-200">Svc</Badge>
                                      )}
                                      <span className="text-xs font-medium truncate max-w-[180px]">{product.name}</span>
                                    </div>
                                    {product.sku && (
                                      <span className="text-[9px] text-muted-foreground">SKU: {product.sku}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {product.category ? (
                                    <Badge variant="outline" className="text-[9px]">{product.category}</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-xs font-semibold tabular-nums">
                                  {product.quantity}
                                </TableCell>
                                <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                                  {formatCurrency(Math.round(product.total / product.quantity), currencyCode)}
                                </TableCell>
                                <TableCell className="text-right text-xs font-bold tabular-nums">
                                  {formatCurrency(product.total, currencyCode)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )
                })()}

                {/* Orders Detail (Accordion-style) */}
                {detailShiftData.orders.length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Órdenes del Turno — {detailShiftData.orders.length}
                    </p>
                    <div className="max-h-[250px] overflow-y-auto rounded-lg border space-y-0">
                      {detailShiftData.orders.map((order) => {
                        const payLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod
                        const payColor = PAYMENT_METHOD_COLORS[order.paymentMethod] || 'bg-gray-400'
                        return (
                          <div key={order.id} className="border-b last:border-b-0 p-3 hover:bg-muted/30 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] font-mono font-bold text-muted-foreground">{order.orderNumber}</span>
                                {order.tableName && (
                                  <Badge variant="outline" className="text-[8px] px-1 py-0">
                                    <Armchair className="h-2.5 w-2.5 mr-0.5" />{order.tableName}
                                  </Badge>
                                )}
                                <div className={`h-2 w-2 rounded-full ${payColor} shrink-0`} />
                                <span className="text-[9px] text-muted-foreground">{payLabel}</span>
                                {order.customer && (
                                  <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">
                                    · {order.customer.name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] text-muted-foreground tabular-nums">
                                  {formatTime(order.createdAt)}
                                </span>
                                <span className="text-xs font-bold tabular-nums">
                                  {formatCurrency(order.total, currencyCode)}
                                </span>
                              </div>
                            </div>
                            {/* Items within order */}
                            <div className="mt-1.5 ml-4 space-y-0.5">
                              {order.items.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-[10px]">
                                  <div className="flex items-center gap-1 min-w-0">
                                    {item.isService && (
                                      <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 border-violet-200 leading-none">Svc</Badge>
                                    )}
                                    <span className="truncate max-w-[200px]">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                    <span className="text-muted-foreground">×{item.quantity}</span>
                                    <span className="font-medium">{formatCurrency(item.totalRow, currencyCode)}</span>
                                  </div>
                                </div>
                              ))}
                              {order.tipAmount > 0 && (
                                <div className="flex items-center justify-between text-[10px] text-pink-600 dark:text-pink-400">
                                  <div className="flex items-center gap-1">
                                    <Heart className="h-2.5 w-2.5" />
                                    <span>Propina</span>
                                  </div>
                                  <span className="font-medium tabular-nums">{formatCurrency(order.tipAmount, currencyCode)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Payment Method Breakdown */}
                {Object.keys(detailShiftData.orderSummary.byPayment).length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ventas por Método de Pago</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(detailShiftData.orderSummary.byPayment)
                        .sort(([, a], [, b]) => b.total - a.total)
                        .map(([method, data]) => {
                          const label = PAYMENT_METHOD_LABELS[method] || method
                          const color = PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'
                          return (
                            <div key={method} className="rounded-lg border p-2.5 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                                <span className="text-[10px] font-medium">{label}</span>
                                <span className="text-[9px] text-muted-foreground ml-auto tabular-nums">{data.count}</span>
                              </div>
                              <p className="text-xs font-bold tabular-nums">{formatCurrency(data.total, currencyCode)}</p>
                              {data.tips > 0 && (
                                <p className="text-[9px] text-pink-500 tabular-nums">+{formatCurrency(data.tips, currencyCode)} propina</p>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No se pudo cargar el detalle</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ─── AlertDialog: Delete Shift ────────────────────────────────── */}
        <AlertDialog open={deleteShiftId !== null} onOpenChange={(open) => { if (!open) setDeleteShiftId(null) }}>
          <AlertDialogContent className="backdrop-blur-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar turno?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará el registro del turno.
                Solo se pueden eliminar turnos que no tengan ventas asociadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { if (deleteShiftId) { handleDeleteShift(deleteShiftId); setDeleteShiftId(null) } }}
                className="bg-red-600 hover:bg-red-700"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* ─── Dialog: Resetear Saldos ─────────────────────────────────── */}
        <Dialog open={showResetDialog} onOpenChange={(open) => { if (!open) { setShowResetDialog(false); setResetNote('') } }}>
          <DialogContent className="max-w-sm backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-destructive" />
                Resetear Saldos
              </DialogTitle>
              <DialogDescription>
                Condona todas las deudas pendientes de los clientes. Las órdenes fiadas quedarán marcadas como saldadas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Esta acción registra las deudas como <strong>condonaciones</strong> en contabilidad (cuenta Concesiones y Castigos). No se puede deshacer.
                  </p>
                </div>
              </div>
              {reportData?.customerDebts?.length > 0 && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Deudas actuales:</p>
                  {reportData.customerDebts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span>{c.name}</span>
                      <span className="font-semibold">{formatCurrency(c.totalDebt, currencyCode)}</span>
                    </div>
                  ))}
                  <Separator className="my-1" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Total a condonar</span>
                    <span className="text-destructive">
                      {formatCurrency(reportData?.customerDebts?.reduce((s, c) => s + c.totalDebt, 0) || 0, currencyCode)}
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs">Nota (opcional)</Label>
                <Input
                  value={resetNote}
                  onChange={(e) => setResetNote(e.target.value)}
                  placeholder="Ej: Condonación inicio de mes"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowResetDialog(false); setResetNote('') }}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => setShowResetFinalConfirm(true)}
                disabled={isResetting || !reportData?.customerDebts?.length}
              >
                {isResetting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Resetear Todo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* ─── Confirmación FINAL: Resetear Saldos ─────────────────────── */}
        <AlertDialog open={showResetFinalConfirm} onOpenChange={(open) => { if (!open) setShowResetFinalConfirm(false) }}>
          <AlertDialogContent className="max-w-sm backdrop-blur-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <ShieldAlert className="h-5 w-5" />
                Última Confirmación
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3 pt-2">
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30 p-3">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    ¿Estás ABSOLUTAMENTE seguro?
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Vas a condonar las deudas de <strong>{reportData?.customerDebts?.length || 0} cliente{(reportData?.customerDebts?.length || 0) !== 1 ? 's' : ''}</strong> por un total de:
                  </p>
                  <p className="text-lg font-bold text-red-700 dark:text-red-300 mt-1">
                    {formatCurrency(reportData?.customerDebts?.reduce((s, c) => s + c.totalDebt, 0) || 0, currencyCode)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta acción <strong className="text-destructive">NO se puede deshacer</strong>. Se registrarán como condonaciones en la contabilidad y las órdenes fiadas quedarán saldadas.
                </p>
                {resetNote && (
                  <p className="text-xs text-muted-foreground">
                    Nota: <em>{resetNote}</em>
                  </p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="mt-0">Volver Atrás</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { setShowResetFinalConfirm(false); handleResetDebts() }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isResetting ? 'Procesando...' : 'Sí, Resetear Todo'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* ─── Dialog: Create/Edit Expense ────────────────────────────────── */}
        <Dialog open={showExpenseDialog} onOpenChange={(open) => { if (!open) setShowExpenseDialog(false) }}>
          <DialogContent className="max-w-md backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle>{editingExpense ? 'Editar Gasto' : 'Registrar Gasto'}</DialogTitle>
              <DialogDescription>
                {editingExpense ? 'Modifica los datos del gasto' : 'Ingresa los datos del nuevo gasto'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Categoría</Label>
                <Select value={expenseFormCategory} onValueChange={setExpenseFormCategory}>
                  <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Descripción</Label>
                <Input
                  placeholder="Ej: Pago arriendo mes de enero"
                  value={expenseFormDescription}
                  onChange={(e) => setExpenseFormDescription(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Monto (COP)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={expenseFormAmount}
                    onChange={(e) => setExpenseFormAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Fecha</Label>
                  <Input
                    type="date"
                    value={expenseFormDate}
                    onChange={(e) => setExpenseFormDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notas (opcional)</Label>
                <Textarea
                  placeholder="Observaciones adicionales..."
                  value={expenseFormNotes}
                  onChange={(e) => setExpenseFormNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancelar</Button>
              <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={handleSaveExpense} disabled={isSavingExpense || !expenseFormDescription.trim() || !expenseFormAmount}>
                {isSavingExpense && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingExpense ? 'Guardar Cambios' : 'Registrar Gasto'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── AlertDialog: Delete Expense ────────────────────────────────── */}
        <AlertDialog open={deleteExpenseId !== null} onOpenChange={(open) => { if (!open) setDeleteExpenseId(null) }}>
          <AlertDialogContent className="backdrop-blur-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará el registro del gasto y sus asientos contables.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteExpense}
                disabled={isSavingExpense}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSavingExpense ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Tabs>
    </div>
  )
}
