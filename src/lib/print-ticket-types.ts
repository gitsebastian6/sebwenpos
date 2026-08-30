// ─── Print Ticket Types & Constants ───────────────────────────────────────────
// All interfaces and shared constants for print-ticket functions

export interface TicketItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
  isService?: boolean
}

export type PaperWidth = '80' | '58'

export interface TicketData {
  storeName: string
  storeAddress?: string
  storePhone?: string
  storeNIT?: string
  storeRegime?: string // Régimen fiscal: RESPONSABLE, NO_RESPONSABLE, SIMPLIFICADO
  // Ancho del rollo térmico (Configuración → Tirilla). Default '80'.
  paperWidth?: PaperWidth
  // Denominación impresa del documento (sobreescribe el subtítulo por defecto en
  // la tirilla no electrónica). Ej: "Documento equivalente de POS".
  docDenomination?: string
  // Pie de página configurable (reemplaza "Gracias por su compra").
  footerText?: string
  // Leyenda tributaria libre (multilínea; se parte por saltos de línea).
  extraLegend?: string
  // Leyendas de calidad tributaria (Res. DIAN 000042/2020 art. 13 num. 8).
  isIvaWithholdingAgent?: boolean
  isSelfWithholdingAgent?: boolean
  isIncResponsible?: boolean
  // Resolución DIAN del documento equivalente POS (distinta de la de FE).
  posResolutionNumber?: string
  posResolutionPrefix?: string
  posResolutionFrom?: number
  posResolutionTo?: number
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
  // Entrega (ventas convertidas desde un pedido de la tienda virtual)
  fulfillmentType?: string // IN_STORE | DELIVERY | PICKUP
  deliveryFee?: number
  deliveryAddress?: string
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
  paperWidth?: PaperWidth
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
  paperWidth?: PaperWidth
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
  paperWidth?: PaperWidth
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
  paperWidth?: PaperWidth
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
