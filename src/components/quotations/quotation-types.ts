import type { TaxBreakdownEntry } from '@/types'

// ─── Types ──────────────────────────────────────────────

export interface QuotationListItem {
  id: number
  quotationNumber: string
  customerName: string | null
  customerNit: string | null
  total: number
  status: string
  validUntil: string | null
  createdAt: string
  itemCount: number
}

export interface QuotationItem {
  id: number
  productId: number | null
  productName: string
  quantity: number
  unitPrice: number
  totalRow: number
  taxCode: string | null
  taxRate: number
  taxAmount: number
  taxBase: number
  notes: string | null
}

export type TaxBreakdownItem = TaxBreakdownEntry

export interface QuotationDetail extends Omit<QuotationListItem, 'itemCount'> {
  subtotal: number
  taxAmount: number
  taxBreakdown: TaxBreakdownItem[] | null
  discountAmount: number
  discountType: string
  validUntil: string | null
  notes: string | null
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
  convertedToOrderId: number | null
  updatedAt: string
  items: QuotationItem[]
}

export interface ProductSearchResult {
  id: number
  name: string
  salePrice: number
  currentStock: number
  sku: string | null
  category: { id: number; name: string; icon: string | null } | null
}

export interface CartItem {
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  notes: string
}

export type InvoiceMode = 'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'
export type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED'

// ─── Constants ──────────────────────────────────────────

export const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE: { label: 'Activa', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  CONVERTED: { label: 'Convertida', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800', dot: 'bg-sky-500' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  EXPIRED: { label: 'Vencida', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
}

export const STATUS_TABS = [
  { key: 'ALL', label: 'Todas' },
  { key: 'ACTIVE', label: 'Activas' },
  { key: 'CONVERTED', label: 'Convertidas' },
  { key: 'CANCELLED', label: 'Canceladas' },
  { key: 'EXPIRED', label: 'Vencidas' },
]

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'DAVIPLATA', label: 'Daviplata' },
  { value: 'NEQUI', label: 'Nequi' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'FIADO', label: 'Fiado' },
]
