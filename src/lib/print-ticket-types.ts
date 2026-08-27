// ─── Print Ticket Types & Constants ───────────────────────────────────────────
// All interfaces and shared constants for print-ticket functions

export interface TicketItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
  isService?: boolean
}

export interface TicketData {
  storeName: string
  storeAddress?: string
  storePhone?: string
  storeNIT?: string
  storeRegime?: string // Régimen fiscal: RESPONSABLE, NO_RESPONSABLE, SIMPLIFICADO
  invoiceResolution?: string // Número de resolución DIAN
  invoicePrefix?: string // Prefijo (FE, POS)
  invoiceStartNumber?: number
  invoiceEndNumber?: number
  resolutionNumber?: string // Alias for invoiceResolution
  resolutionStart?: number // Alias for invoiceStartNumber
  resolutionEnd?: number // Alias for invoiceEndNumber
  orderNumber: string
  date: string // ISO string
  customer?: string
  customerNit?: string // NIT del comprador
  tableName?: string
  items: TicketItem[]
  subtotal: number
  tipAmount: number
  total: number
  discountAmount?: number
  taxAmount?: number
  taxBreakdown?: Array<{ name: string; code: string; rate: number; base: number; amount: number }>
    paymentMethod: string
  paymentSplits?: Array<{ method: string; amount: number; reference?: string }>
  currencyCode: string
  notes?: string
  cufe?: string // Código Único de Factura Electrónica
  qrCodeUrl?: string // URL del código QR para verificar en DIAN
  isElectronic?: boolean // true = factura electrónica (muestra CUFE + QR + DIAN info)
  isDocEquivalente?: boolean // true = documento equivalente POS (muestra resolución + NIT)
  invoiceType?: string // '01'=normal, '03'=contingencia facturador, '04'=contingencia DIAN
}

export interface CashRegisterCloseData {
  storeName: string
  storeNIT?: string
  storeAddress?: string
  openedAt: string
  closedAt: string
  responsibleName: string
  openingBalance: number
  totalCashSales: number
  totalOtherSales: number
  expectedCash: number
  actualCash: number
  difference: number
  totalTips: number
  paymentBreakdown: Array<{ method: string; count: number; total: number }>
  countBreakdown?: Record<string, number>
  currencyCode: string
}

export interface DailySummaryData {
  storeName: string
  storeNIT?: string
  date: string
  totalOrders: number
  completedOrders: number
  cancelledOrders: number
  totalSales: number
  subtotal: number
  tips: number
  paymentBreakdown: Array<{ method: string; count: number; total: number; tips: number }>
  topProducts: Array<{ name: string; quantity: number; total: number }>
  openingBalance: number
  expectedCash: number
  services: number
  currencyCode: string
}

export interface ProductCatalogData {
  storeName: string
  storeNIT?: string
  products: Array<{
    name: string
    category: string
    price: number
    stock: number
    sku?: string | null
  }>
  currencyCode: string
}

export interface KardexData {
  storeName: string
  productName: string
  category: string
  sku?: string | null
  movements: Array<{
    date: string
    type: string
    qty: number
    balance: number
    notes: string
  }>
  currencyCode: string
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  EFECTIVO: 'Efectivo',
  DAVIPLATA: 'Daviplata',
  NEQUI: 'Nequi',
  CARD: 'Tarjeta',
  TARJETA: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
  CREDIT: 'Fiado',
  FIADO: 'Fiado',
}
