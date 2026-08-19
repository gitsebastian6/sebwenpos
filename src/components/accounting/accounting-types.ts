// ─── Shared Types, Constants, and Helpers for Accounting Module ────────────────

import { formatCurrency } from '@/lib/auth'
import { formatDateShort } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LedgerAccount {
  id: number
  name: string
  type: string
  isDefault: boolean
  balance: number
  entryCount: number
  createdAt: string
}

export interface JournalEntry {
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

export interface ReportData {
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
    items: Array<{ name: string; presentationName?: string | null; quantity: number; unitPrice: number; totalRow: number }>
    createdAt: string
  }>
}

export interface CashShift {
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

export interface CashShiftSummary {
  totalOrders: number
  totalSales: number
  totalTips: number
  cashSales: number
  otherSales: number
  byPayment: Record<string, { count: number; total: number; tips: number }>
}

export interface Expense {
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

// ─── Constants ───────────────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Capital',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
}

export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  ASSET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  LIABILITY: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  EQUITY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  INCOME: 'bg-emerald-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  EXPENSE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800',
}

export const DIRECTION_BADGE_CLASSES: Record<string, string> = {
  DEBIT: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  CREDIT: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-800',
}

export const REFERENCE_TYPE_LABELS: Record<string, string> = {
  ORDER: 'Orden',
  EXPENSE: 'Gasto',
  TOPUP: 'Recarga',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
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

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
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

export const CATEGORY_COLORS = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
]

export const EXPENSE_CATEGORIES = [
  'ARRIENDO', 'SERVICIOS', 'NOMINA', 'INSUMOS',
  'LICENCIAS', 'IMPUESTOS', 'TRANSPORTE', 'MANTENIMIENTO', 'OTRO',
] as const

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
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

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
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

// Cash register helpers
export const CASH_METHODS = ['CASH', 'EFECTIVO', 'CARD', 'TARJETA', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'MIXED', 'CREDIT', 'FIADO']

export const PAYMENT_CANONICAL: Record<string, string> = {
  EFECTIVO: 'CASH',
  TARJETA: 'CARD',
  FIADO: 'CREDIT',
}

export const CANONICAL_ORDER = ['CASH', 'DAVIPLATA', 'NEQUI', 'TRANSFER', 'CARD', 'MIXED', 'CREDIT']

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAccountTypeColor(type: string) {
  return ACCOUNT_TYPE_COLORS[type] || 'bg-secondary text-secondary-foreground border-border'
}

export function getDirectionBadgeClass(direction: string) {
  return DIRECTION_BADGE_CLASSES[direction] || 'bg-secondary text-secondary-foreground border-border'
}

export function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBalance(balance: number, type: string, currencyCode?: string) {
  const prefix = balance < 0 ? '-' : ''
  return `${prefix}${formatCurrency(Math.abs(balance), currencyCode)}`
}

export function getBalanceColor(balance: number, type: string) {
  if (balance === 0) return 'text-muted-foreground'
  const isDebitNormal = type === 'ASSET' || type === 'EXPENSE'
  if (isDebitNormal) {
    return balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }
  return balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
}

export function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
}

export function normalizePaymentMethod(method: string): string {
  return PAYMENT_CANONICAL[method] || method
}

export function getCanonicalMethods(rawMethods: string[]): string[] {
  const normalized = new Set(rawMethods.map(normalizePaymentMethod))
  normalized.add('CASH')
  return CANONICAL_ORDER.filter((m) => normalized.has(m))
}

export function getExpectedForCanonical(
  shiftByPayment: Record<string, { count: number; total: number; tips: number }>,
  canonical: string
): { count: number; total: number; tips: number } {
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

export { formatDateShort, formatCurrency }
