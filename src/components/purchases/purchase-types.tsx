import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock } from 'lucide-react'
import { format, isBefore, parseISO } from 'date-fns'
import type { Purchase } from '@/hooks/api/use-purchases'

// ── Form Types ──

export interface PurchaseItemRow {
  id: string
  productId: string
  quantity: string
  unitCost: string
  ivaRate: number
  discountAmount: string
  lotNumber: string
  expiryDate: string
  manufacturingDate: string
}

// ── Constants ──

export const DOC_TYPES = [
  { value: 'FACTURA_COMPRA', label: 'Factura Compra', short: 'FC', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'NOTA_CREDITO', label: 'Nota Crédito', short: 'NC', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'NOTA_DEBITO', label: 'Nota Débito', short: 'ND', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'RECIBO_CAJA', label: 'Recibo Caja', short: 'RC', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
] as const

export const PAYMENT_TERMS = [
  { value: 'CONTADO', label: 'Contado' },
  { value: 'CREDITO_30', label: 'Crédito 30 días' },
  { value: 'CREDITO_60', label: 'Crédito 60 días' },
  { value: 'CREDITO_90', label: 'Crédito 90 días' },
] as const

export const IVA_RATES = [
  { value: 0, label: '0% (Exento)' },
  { value: 5, label: '5%' },
  { value: 19, label: '19%' },
] as const

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CHECK', label: 'Cheque' },
  { value: 'CARD', label: 'Tarjeta' },
] as const

// ── Helpers ──

export function getDocBadge(type: string) {
  return DOC_TYPES.find(d => d.value === type) || DOC_TYPES[0]
}

export function getPaymentStatusBadge(status: string) {
  switch (status) {
    case 'PAID': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Pagado</Badge>
    case 'PARTIAL': return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-100"><Clock className="h-3 w-3 mr-1" />Parcial</Badge>
    default: return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>
  }
}

export function getStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100">Completada</Badge>
    case 'PENDING': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100">Pendiente</Badge>
    case 'CANCELLED': return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100">Cancelada</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isOverdue(purchase: Purchase): boolean {
  if (!purchase.dueDate) return false
  if (purchase.paymentStatus === 'PAID') return false
  if (purchase.status === 'CANCELLED') return false
  return isBefore(parseISO(purchase.dueDate), new Date())
}

export const EMPTY_ITEM = (): PurchaseItemRow => ({
  id: crypto.randomUUID(),
  productId: '',
  quantity: '1',
  unitCost: '',
  ivaRate: 19,
  discountAmount: '0',
  lotNumber: '',
  expiryDate: '',
  manufacturingDate: '',
})

// ── Line calculations ──

export function calcLineSubtotal(item: PurchaseItemRow) {
  return (Number(item.quantity) || 0) * (Number(item.unitCost) || 0)
}

export function calcLineIva(item: PurchaseItemRow) {
  return Math.round(calcLineSubtotal(item) * item.ivaRate / 100)
}

export function calcLineTotal(item: PurchaseItemRow) {
  return Math.max(0, calcLineSubtotal(item) + calcLineIva(item) - (Number(item.discountAmount) || 0))
}
