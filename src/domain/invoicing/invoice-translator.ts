// ============================================================
// SEBWEN POS — InvoiceTranslator (Anti-Corruption Layer)
// CONTEXT_MAP §4: Sales → Invoicing. Traduce una Order completada
// a un borrador de factura electrónica DIAN sin contaminar el
// modelo de Sales con vocabulario de facturación.
// Función PURA: sin Prisma, sin HTTP, 100% testeable.
//
// ESTADO: es el seam ACL previsto (CONTEXT_MAP §4), NO está en el
// camino de creación de facturas. La ruta real (POST /api/invoices)
// usa lib/invoice-utils.calculateInvoiceFromOrder +
// invoicing/consecutive-counter + invoicing/xml-generator, que
// producen una factura DIAN real (consecutivo, CUFE, XML UBL). Este
// translator genera un BORRADOR de preview (número DRAFT-, sin CUFE)
// y hoy solo lo ejercita su test — se conserva como punto de
// extensión para un endpoint de previsualización / desacople futuro.
// ============================================================

export interface InvoiceDraftLine {
  /** Código de ítem: SKU del producto o identificador de servicio */
  itemCode: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  taxCode: string | null
  taxRate: number
  taxBase: number
  taxAmount: number
}

export interface OrderForInvoice {
  orderNumber: string
  storeName?: string
  customerName?: string | null
  customerNit?: string | null
  subtotal: number
  discountAmount: number
  tipAmount: number
  total: number
  lines: {
    productName: string
    serviceName?: string | null
    presentationName?: string | null
    unitsPerPack: number
    quantity: number
    unitPrice: number
    totalRow: number
    taxCode: string | null
    taxRate: number
    taxBase: number
    taxAmount: number
  }[]
}

export interface DianInvoiceDraft {
  invoiceNumber: string
  issueDate: string // ISO
  sellerName: string
  buyer: { name: string; taxId: string } // Consumidor final si no hay datos
  lines: InvoiceDraftLine[]
  allowanceTotal: number // descuentos
  taxExclusiveAmount: number // Σ bases gravables
  taxInclusiveAmount: number // Σ totales de línea
  payableAmount: number // total a pagar (sin propina: no es base gravable DIAN)
  tipAmount: number
  notes: string[]
}

const CONSUMIDOR_FINAL_NIT = '222222222222'

/**
 * Traduce una orden de Sales al borrador de factura DIAN de Invoicing.
 * Nunca lanza por datos faltantes: los campos ausentes se normalizan
 * (Consumidor Final) para que el borrador siempre sea válido.
 */
export function translateOrderToInvoiceDraft(
  order: OrderForInvoice,
  opts: { now?: Date } = {},
): DianInvoiceDraft {
  const lines: InvoiceDraftLine[] = order.lines.map((l) => ({
    itemCode: l.serviceName
      ? `SERVICIO-${slug(l.serviceName)}`
      : l.presentationName
        ? `${slug(l.productName)}-${slug(l.presentationName)}`
        : slug(l.productName),
    description: [
      l.serviceName ? `Servicio: ${l.serviceName}` : l.productName,
      l.presentationName && !l.serviceName ? ` (${l.presentationName} ×${l.unitsPerPack})` : '',
    ].join('').trim(),
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.totalRow,
    taxCode: l.taxCode,
    taxRate: l.taxRate,
    taxBase: l.taxBase,
    taxAmount: l.taxAmount,
  }))

  // La propina no es precio de venta: va fuera de la base gravable DIAN.
  const payableAmount = order.subtotal - order.discountAmount

  return {
    invoiceNumber: draftNumberFrom(order.orderNumber),
    issueDate: (opts.now ?? new Date()).toISOString(),
    sellerName: order.storeName || 'SEBWEN',
    buyer: {
      name: order.customerName?.trim() || 'Consumidor Final',
      taxId: normalizeNit(order.customerNit),
    },
    lines,
    allowanceTotal: order.discountAmount,
    taxExclusiveAmount: lines.reduce((s, l) => s + l.taxBase, 0),
    taxInclusiveAmount: lines.reduce((s, l) => s + l.lineTotal, 0),
    payableAmount,
    tipAmount: order.tipAmount,
    notes: buildNotes(order),
  }
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function draftNumberFrom(orderNumber: string): string {
  return `DRAFT-${orderNumber}`
}

function normalizeNit(nit?: string | null): string {
  const cleaned = nit?.replace(/[^0-9kK-]/g, '').trim()
  return cleaned && cleaned.length > 0 ? cleaned : CONSUMIDOR_FINAL_NIT
}

function buildNotes(order: OrderForInvoice): string[] {
  const notes: string[] = ['Documento borrador — pendiente de validación DIAN y CUFE']
  if (order.tipAmount > 0) {
    notes.push(`Propina voluntaria de $${order.tipAmount.toLocaleString('es-CO')} (no gravada)`)
  }
  if (order.discountAmount > 0) {
    notes.push(`Descuento aplicado de $${order.discountAmount.toLocaleString('es-CO')}`)
  }
  return notes
}
