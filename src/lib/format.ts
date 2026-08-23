// ============================================================
// Sebwen POS — Shared Formatters & Utilities
// Centralized formatting functions used across all components
// ============================================================

import { QTY_PRECISION } from './constants'

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
    BANCOLOMBIA: 'Bancolombia',
    BANCOLIBRO: 'Bancolombia', // Backward compat: old records still render correctly
    TRANSFER: 'Transferencia',
    FIADO: 'Fiado',
    MIXED: 'Mixto',
    CREDIT: 'Crédito',
    OTHER: 'Otro',
    // Wompi payment methods
    WOMPI_CARD: 'Tarjeta (Wompi)',
    WOMPI_NEQUI: 'Nequi (Wompi)',
    WOMPI_DAVIPLATA: 'Daviplata (Wompi)',
    WOMPI_PSE: 'PSE (Wompi)',
    WOMPI_BANCOLOMBIA: 'Bancolombia (Wompi)',
    WOMPI: 'Wompi',
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

// ═══════════════════════════════════════════════════════════════
// Cantidades (stock) — client-safe helpers
// ═══════════════════════════════════════════════════════════════
// NOTA: estas funciones trabajan con `number` puro (el frontend recibe
// numbers de la API). La aritmética decimal server-side vive en
// `src/lib/stock-math.ts` (NO importar aquí — arrastraría Prisma al cliente).

/**
 * Redondea una cantidad a QTY_PRECISION decimales.
 * Ej: roundQty(1.005) → 1.005
 */
export function roundQty(n: number): number {
  const f = Math.pow(10, QTY_PRECISION)
  return Math.round(n * f) / f
}

/**
 * Piso de una cantidad a QTY_PRECISION decimales (para maxStock / límites).
 * Ej: floorQty(1.999) → 1.999
 */
export function floorQty(n: number): number {
  const f = Math.pow(10, QTY_PRECISION)
  return Math.floor(n * f) / f
}

/**
 * Formatea una cantidad para display, recortando ceros finales.
 * Ej: formatQty(1.5) → "1,5" ; formatQty(2) → "2"
 */
export function formatQty(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: QTY_PRECISION })
}

/**
 * Parsea un input de cantidad normalizando la coma decimal (locale es-CO) o
 * el punto (locale en-US): "1,5" → 1.5, "1.5" → 1.5, "1,500" → 1500.
 * Redondea a QTY_PRECISION para evitar floats sucios (0.1 + 0.2).
 * Devuelve 0 si el valor no es numérico.
 */
export function parseQtyInput(raw: string): number {
  if (!raw) return 0
  let s = raw.trim().replace(/\s/g, '')
  if (!s) return 0
  // Si hay coma Y punto, el punto es separador de miles → quitarlo
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    const parts = s.split(',')
    // Solo coma: si hay exactamente 3 dígitos después, es separador de miles
    if (parts.length === 2 && parts[1].length === 3) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(',', '.')
    }
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : roundQty(n)
}

// ─── Unidades de medida: fraccionables vs discretas ────────────────────────
// Un producto se vende "fraccionable" cuando su unidad puede partirse en
// cantidades con decimales (peso/volumen/longitud, o menudeo tipo "ración").
// Las unidades discretas (UND, CAJ, PAQ…) se venden por pieza entera: su
// stepper avanza de 1 en 1 y su maxStock se redondea a entero. La distinción
// se decide SIEMPRE por la unidad de LA LÍNEA que se vende (producto base o
// presentación), no por la del producto padre.

const FRACTIONAL_UNITS = new Set(['KG', 'G', 'MG', 'L', 'ML', 'M', 'CM', 'M2', 'M3', 'OZ', 'LB', 'POR', 'RAC'])
// Menudeo: se piden en porciones/raciones medianas (0.25) en vez de 0.1.
const MENUDEO_UNITS = new Set(['POR', 'RAC'])

/** true si la unidad acepta decimales (peso/volumen/medida/menudeo). */
export function isFractionalUnit(unitLabel?: string): boolean {
  if (!unitLabel) return false
  return FRACTIONAL_UNITS.has(unitLabel)
}

/**
 * Paso del botón +/− del stepper según la unidad de la línea.
 * Fraccionables → 0.1 (o 0.25 en menudeo POR/RAC); discretos → 1.
 * `serviceStep` se usa solo cuando NO hay unidad (servicios), permitiendo
 * pasos como 0.5 horas.
 */
export function qtyStepFor(unitLabel?: string, serviceStep = 1): number {
  if (!unitLabel) return serviceStep
  if (MENUDEO_UNITS.has(unitLabel)) return 0.25
  if (FRACTIONAL_UNITS.has(unitLabel)) return 0.1
  return 1
}

/**
 * Clampa una cantidad dentro de [min, max], redondeándola a QTY_PRECISION.
 * `max` puede ser undefined (stock ilimitado / servicios).
 */
export function clampQty(n: number, min = 0.001, max?: number): number {
  const r = roundQty(n)
  const lo = Math.max(min, Math.min(r, max === undefined ? Infinity : max))
  return roundQty(lo)
}
