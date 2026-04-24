// ============================================================
// Ventify POS — Shared TypeScript Types
// Centralized type definitions for all components and API routes
// ============================================================

// ---- Product ----
export interface Product {
  id: number
  storeId: number
  categoryId: number | null
  providerId: number | null
  taxRateId: number | null
  sku: string | null
  name: string
  description: string | null
  imgUrl: string | null
  invima: string | null
  costPrice: number
  salePrice: number
  commission: number
  currentStock: number
  minStock: number
  isActive: boolean
  barcode?: string | null
  category?: { id: number; name: string; icon: string | null } | null
  provider?: { id: number; name: string } | null
  taxRate?: { id: number; name: string; code: string; rate: number; rateType: string } | null
  _count?: { orderItems: number }
}

/** Minimal product for POS / Tables */
export interface ProductSummary {
  id: number
  name: string
  salePrice: number
  currentStock?: number
  imgUrl?: string | null
  sku?: string | null
  barcode?: string | null
  category?: { id: number; name: string } | null
  taxRate?: { id: number; name: string; code: string; rate: number; rateType: string } | null
}

// ---- Customer ----
export interface Customer {
  id: number
  name: string
  phone: string | null
  email: string | null
  totalDebt: number
  createdAt: string
  nit?: string | null
  _count?: { orders: number }
}

/** Minimal customer for POS / Tables */
export interface CustomerSummary {
  id: number
  name: string
  phone: string | null
  nit?: string | null
}

// ---- Category ----
export interface Category {
  id: number
  storeId: number
  name: string
  icon: string | null
  createdAt: string
  _count?: { products: number }
}

export interface CategorySummary {
  id: number
  name: string
}

// ---- Service ----
export interface Service {
  id: number
  name: string
  description: string | null
  price: number
  icon: string
  unit: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
  _count?: { serviceTransactions: number }
}

// ---- Provider ----
export interface Provider {
  id: number
  storeId: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  nit: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderSummary {
  id: number
  name: string
  isActive: boolean
}

// ---- Tax Rate ----
export interface TaxRate {
  id: number
  name: string
  code: string
  rate: number
  rateType: string
  applyTo: string
  category: string
  isActive: boolean
  isDefault: boolean
  description?: string | null
  _count?: { products: number }
}

// ---- Payment Method ----
export const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'NEQUI',
  'DAVIPLATA',
  'BANCOLIBRO',
  'TRANSFER',
  'FIADO',
  'MIXED',
  'CREDIT',
  'OTHER',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// ---- Invoice ----
export type InvoiceMode = 'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'

// ---- Order ----
export interface OrderItemData {
  id: number
  productId?: number | null
  serviceId?: number | null
  productName: string
  quantity: number
  unitPrice: number
  totalRow: number
  isService: boolean
}

export interface OrderData {
  orderNumber: string
  total: number
  createdAt: string
  customer?: { name: string } | null
  orderItems: OrderItemData[]
}

export interface LastOrderData extends OrderData {
  id: number
  status: string
  paymentMethod: string
  customerNit?: string | null
  customerName?: string | null
  subtotal?: number
  tipAmount?: number
  taxAmount?: number
  taxBreakdown?: unknown[] | null
  discountAmount?: number
  notes?: string | null
}

// ---- Invoice Response ----
export interface InvoiceData {
  id: number
  invoiceNumber: string
  consecutive: number
  prefix: string
  status: string
  cufe?: string | null
  issueDate: string
  grandTotal: number
  customerName: string
  customerNit: string
  paymentMethod: string
  xmlContent?: string | null
}

export interface LastInvoiceData extends InvoiceData {
  testMode?: boolean
  dianMessage?: string | null
  qrCode?: string | null
}

// ---- Cart ----
export interface CartItem {
  productId: number | null
  serviceId: number | null
  name: string
  salePrice: number
  quantity: number
  maxStock: number
  isService: boolean
  notes?: string
  taxRate?: { id: number; name: string; code: string; rate: number; rateType: string } | null
}

export interface ComandaItem {
  id: number
  productName: string
  quantity: number
  notes: string | null
  price: number
  isService: boolean
  sessionComandaItem?: { id: number } | null
}

// ---- Quotation ----
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

// ---- Tables ----
export interface OpenTable {
  id: number
  tableNumber: number
  tableName: string | null
  customerName: string | null
  guests: number
  startedAt: string
  tableZone: string
}

// ---- Dashboard ----
export interface TaxBreakdownEntry {
  name: string
  code: string
  rate: number
  base: number
  taxAmount: number
  amount?: number
}

// ---- Inventory ----
export interface TraceMovement {
  date: string | null
  type: 'SALE' | 'PURCHASE' | 'RETURN' | 'LOSS' | 'ADJUSTMENT'
  quantity: number
  notes: string | null
  referenceId?: string
  balance?: number
}

// ---- Customer History ----
export interface OrderHistoryEntry {
  id: number
  orderNumber: string
  status: string
  paymentMethod: string
  total: number
  createdAt: string
}

// ---- Create Invoice Body ----
export interface CreateInvoiceBody {
  orderId: number
  testMode: boolean
  customerNit: string
  customerName: string
  autoSend: boolean
  customerEmail?: string
}

// ---- Return Order Detail ----
export interface ReturnOrderDetail {
  id: number
  orderNumber: string
  status: string
  total: number
  customerName?: string | null
  orderItems: Array<{
    id: number
    productId: number | null
    productName: string
    quantity: number
    returnedQuantity: number | null
    isService: boolean
    unitPrice: number
    totalRow: number
  }>
}
