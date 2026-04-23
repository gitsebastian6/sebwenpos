// ============================================================
// Ventify POS — Shared Formatters & Utilities
// Centralized formatting functions used across all components
// ============================================================

/**
 * Format a number as Colombian Pesos (COP).
 * Uses Intl.NumberFormat for proper comma separation: $50,000
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a number as simple COP string with dot separation: $50.000
 * Used in PDFs where Intl formatting may not render correctly.
 */
export function formatCOPSimple(amount: number): string {
  const rounded = Math.round(amount)
  const formatted = rounded.toLocaleString('es-CO')
  return `$${formatted}`
}

/**
 * Format a Date object or ISO string to a short Spanish date.
 * Example: "15 jun. 2024"
 */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Format a Date object or ISO string to a long Spanish date.
 * Example: "15 de junio de 2024"
 */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format a Date object or ISO string to a time string.
 * Example: "3:45 PM"
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Format a Date object or ISO string to a full datetime string.
 * Example: "15 jun. 2024, 3:45 PM"
 */
export function formatDateTime(date: string | Date): string {
  return `${formatDateShort(date)}, ${formatTime(date)}`
}

/**
 * Map payment method code to Spanish label.
 * Works with both string codes ('CASH', 'CARD') and DIAN numeric codes ('1', '2').
 */
export function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    NEQUI: 'Nequi',
    DAVIPLATA: 'Daviplata',
    BANCOLIBRO: 'Bancolibro',
    TRANSFER: 'Transferencia',
    FIADO: 'Fiado',
    MIXED: 'Mixto',
    CREDIT: 'Crédito',
    OTHER: 'Otro',
    // DIAN numeric codes
    '1': 'Efectivo',
    '2': 'Tarjeta',
    '10': 'Transferencia/Consignación',
    '42': 'Daviplata/Nequi',
    '99': 'Otro/Mixto',
  }
  return labels[method] || method
}

/**
 * Map DIAN numeric payment code to Spanish label.
 * Alias for paymentMethodLabel, kept for backward compatibility.
 */
export function getPaymentMethodName(code: string): string {
  return paymentMethodLabel(code)
}

/**
 * Map order status to Spanish label.
 */
export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    COMPLETED: 'Completada',
    PENDING: 'Pendiente',
    CANCELLED: 'Cancelada',
    CREDIT: 'Fiado',
  }
  return labels[status] || status
}

/**
 * Map quotation status to Spanish label.
 */
export function quotationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Borrador',
    SENT: 'Enviada',
    ACCEPTED: 'Aceptada',
    REJECTED: 'Rechazada',
    CONVERTED: 'Convertida',
    EXPIRED: 'Expirada',
    CANCELLED: 'Cancelada',
  }
  return labels[status] || status
}
