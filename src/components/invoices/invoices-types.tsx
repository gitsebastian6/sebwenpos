'use client'

import { Badge } from '@/components/ui/badge'

// ── Constants ───────────────────────────────────────────────────────────────

export const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  PENDING_VALIDATE: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  VALIDATED: { label: 'Validada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  DELIVERED: { label: 'Entregada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  REJECTED: { label: 'Rechazada', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' },
  CANCELLED: { label: 'Anulada', className: 'bg-destructive/10 text-destructive border-destructive/20' },
}

export const STATUS_FILTERS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'PENDING_VALIDATE', label: 'Pendiente' },
  { value: 'VALIDATED', label: 'Validada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'CANCELLED', label: 'Anulada' },
]

export const PAYMENT_LABELS: Record<string, string> = {
  '1': 'Efectivo', '2': 'Tarjeta', '10': 'Transferencia', '42': 'Nequi/Daviplata', '99': 'Mixto',
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface InvoiceSummary {
  id: number
  invoiceNumber: string
  prefix: string
  consecutive: number
  customerNit: string
  customerName: string
  orderNumber: string | null
  subtotalBase: number
  totalTaxAmount: number
  grandTotal: number
  status: string
  testMode: boolean
  hasCUFE: boolean
  createdAt: string
  validatedAt: string | null
}

export interface InvoiceDetail extends InvoiceSummary {
  resolutionNumber: string | null
  resolutionDate: string | null
  customerAddress: string | null
  customerPhone: string | null
  customerEmail: string | null
  customerRegime: string
  customerType: string
  subtotalBase: number
  taxExemptAmount: number
  taxBreakdown: Array<{ code: string; name: string; rate: number; base: number; amount: number }>
  totalTaxAmount: number
  totalWithTax: number
  discountAmount: number
  tipAmount: number
  grandTotal: number
  paymentMethod: string | null
  cufe: string | null
  qrCode: string | null
  status: string
  dianResponse: string | null
  dianErrorCode: string | null
  sentAt: string | null
  validatedAt: string | null
  emailedAt: string | null
  notes: string | null
  testMode: boolean
  orderId: number
  order: {
    id: number
    orderNumber: string
    paymentMethod: string
    customer: { name: string; phone: string | null; email: string | null } | null
    orderItems: {
      id: number
      productName: string
      productId: number | null
      serviceId: number | null
      quantity: number
      unitPrice: number
      totalRow: number
      taxCode: string | null
      taxRate: number | null
      taxAmount: number
      taxBase: number
      notes: string | null
    }[]
  }
  store: {
    name: string
    legalName: string | null
    nit: string | null
    address: string | null
    phone: string | null
    currencyCode: string | null
  }
}

export interface OrderForInvoice {
  id: number
  orderNumber: string
  customerName: string | null
  status: string
  paymentMethod: string
  total: number
  createdAt: string
}

export interface ResolutionStatus {
  resolutionNumber: string | null
  consecutiveStart: number | null
  consecutiveEnd: number | null
  currentConsecutive: number | null
  remaining: number
  status: string
}

// ── Badge Components ────────────────────────────────────────────────────────

export function InvoiceStatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status]
  if (!badge) return <Badge variant="outline">{status}</Badge>
  return <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
}

export function ResolutionStatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Activa</Badge>
  if (status === 'INACTIVE') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">Inactiva</Badge>
  if (status === 'SUSPENDED') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">Suspendida</Badge>
  return <Badge variant="outline">{status}</Badge>
}
