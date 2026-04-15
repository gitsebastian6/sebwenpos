import crypto from 'crypto'

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface CUFEParams {
  storeNit: string
  issueDate: string       // YYYYMMDD
  issueTime: string       // HHmmssSSS
  prefix: string
  consecutive: number
  customerNit: string
  subtotalBase: number
  totalTaxAmount: number
  discountAmount: number
  grandTotal: number
  currencyCode?: string
}

export interface QRCodeParams {
  storeNit: string
  prefix: string
  consecutive: number
  date: string            // YYYY-MM-DD
  grandTotal: number
  cufe: string
}

export interface TaxBreakdownItem {
  code: string
  name: string
  base: number
  rate: number
  amount: number
}

export interface InvoiceCalculation {
  subtotalBase: number
  taxExemptAmount: number
  totalTaxAmount: number
  totalWithTax: number
  discountAmount: number
  tipAmount: number
  grandTotal: number
  taxBreakdown: TaxBreakdownItem[]
  paymentMethod: string
}

// ─── Utilidades de formato ────────────────────────────────────────────────

/**
 * Rellena un valor con ceros a la izquierda hasta alcanzar la longitud deseada.
 */
export function padField(value: string | number, length: number): string {
  return String(value).padStart(length, '0')
}

/**
 * Formatea el numero de factura con prefijo y consecutivo.
 * Ejemplo: formatInvoiceNumber("FE", 1) → "FE-00000001"
 */
export function formatInvoiceNumber(prefix: string, consecutive: number): string {
  return `${prefix}-${padField(consecutive, 8)}`
}

// ─── Mapeo de metodos de pago ────────────────────────────────────────────

const PAYMENT_CODE_MAP: Record<string, string> = {
  CASH: '1',        // Efectivo
  CARD: '2',        // Tarjeta
  TRANSFER: '10',   // Transferencia/consignacion
  DAVIPLATA: '42',  // Daviplata/Nequi/Billetera movil
  NEQUI: '42',      // Nequi
  MIXED: '99',      // Pago mixto
  CREDIT: '99',     // Credito fiado (mixto por defecto)
  FIADO: '99',      // Fiado
}

/**
 * Mapea el metodo de pago del POS al codigo DIAN.
 * Si no se encuentra, retorna "99" (otro/no especificado).
 */
export function getDIANPaymentCode(paymentMethod: string): string {
  return PAYMENT_CODE_MAP[paymentMethod.toUpperCase()] ?? '99'
}

// ─── Generacion CUFE ──────────────────────────────────────────────────────

/**
 * Genera el CUFE (Codigo Unico de Factura Electronica) usando SHA-384.
 * Sigue el algoritmo simplificado de la DIAN.
 */
export function generateCUFE(params: CUFEParams): string {
  const {
    storeNit,
    issueDate,
    issueTime,
    prefix,
    consecutive,
    customerNit,
    subtotalBase,
    totalTaxAmount,
    discountAmount,
    grandTotal,
    currencyCode = 'COP',
  } = params

  // Limpiar NIT: eliminar caracteres no numericos excepto guion final
  const cleanNit = (nit: string) => {
    const cleaned = nit.replace(/[^0-9]/g, '')
    // Si termina en -X (digito de verificacion), preservar
    const dashMatch = nit.match(/(-[\d])$/)
    return dashMatch ? cleaned + dashMatch[1] : cleaned
  }

  const fields = [
    cleanNit(storeNit),
    issueDate,
    issueTime,
    padField(prefix, 4),
    padField(consecutive, 20),
    cleanNit(customerNit),
    padField(Math.round(subtotalBase), 20),
    padField(Math.round(subtotalBase), 20), // Total sin impuestos = subtotalBase
    padField(Math.round(totalTaxAmount), 20),
    padField(Math.round(discountAmount), 20),
    padField(Math.round(grandTotal), 20),
    currencyCode,
    '10',                // Codigo tipo operacion: venta estandar
    '',                  // CUDE placeholder (vacio para CUFE)
    '',                  // Numero certificado placeholder
    '900123456-7',       // NIT del proveedor del software (placeholder)
  ]

  const inputString = fields.join('|')

  return crypto.createHash('sha384').update(inputString).digest('base64')
}

// ─── Generacion URL QR ────────────────────────────────────────────────────

/**
 * Genera la URL del codigo QR para la factura electronica DIAN.
 * Esta URL permite consultar la validez de la factura en el portal de la DIAN.
 */
export function generateQRCodeURL(params: QRCodeParams): string {
  const {
    storeNit,
    prefix,
    consecutive,
    date,
    grandTotal,
    cufe,
  } = params

  const formattedNumber = formatInvoiceNumber(prefix, consecutive)
  const params2 = new URLSearchParams({
    nit: storeNit,
    numeracion: formattedNumber,
    fecha: date,
    total: String(Math.round(grandTotal)),
    uuid: cufe,
  })

  return `https://catalogo-vpfe-hab.dian.gov.co/documento/consultar?${params2.toString()}`
}

// ─── Calculo de factura desde orden ──────────────────────────────────────

/**
 * Calcula todos los campos tributarios de una factura a partir de una orden y sus items.
 * En Colombia, los precios al público INCLUYEN IVA. Por lo tanto:
 * - order.subtotal = precio total que paga el cliente (ya incluye IVA)
 * - taxBase = porción del precio que corresponde al producto antes de IVA
 * - taxAmount = porción del precio que corresponde al IVA
 * - grandTotal = order.subtotal - descuento + propina (NO se suma IVA de nuevo)
 */
export function calculateInvoiceFromOrder(
  order: {
    subtotal: number
    taxAmount: number
    tipAmount: number
    discountAmount: number
    paymentMethod: string
    taxBreakdown?: string | null
  },
  items: Array<{
    taxCode?: string | null
    taxRate: number
    taxAmount: number
    taxBase: number
  }>
): InvoiceCalculation {
  // Sumar bases y totales por codigo de impuesto
  const taxMap = new Map<string, TaxBreakdownItem>()

  for (const item of items) {
    if (!item.taxCode || item.taxRate === 0) continue

    const existing = taxMap.get(item.taxCode)
    if (existing) {
      existing.base += item.taxBase
      existing.amount += item.taxAmount
    } else {
      const nameMap: Record<string, string> = {
        '01': 'IVA 19%',
        '02': 'IVA 5%',
        '03': 'IVA 0% Exento',
        '04': 'IVA Excluido',
        '05': 'Impoconsumo',
      }
      taxMap.set(item.taxCode, {
        code: item.taxCode,
        name: nameMap[item.taxCode] ?? `Impuesto ${item.taxCode}`,
        base: item.taxBase,
        rate: item.taxRate,
        amount: item.taxAmount,
      })
    }
  }

  const taxBreakdown = Array.from(taxMap.values())

  const totalTaxAmount = taxBreakdown.reduce((sum, t) => sum + t.amount, 0)
  // Base gravable: subtotal - impuestos (porción antes de IVA)
  const subtotalBase = order.subtotal - totalTaxAmount
  // Total con impuestos = order.subtotal (porque en Colombia, precios ya incluyen IVA)
  const totalWithTax = order.subtotal
  const discountAmount = order.discountAmount
  const tipAmount = order.tipAmount
  // Total final = lo que paga el cliente (subtotal incluye IVA, no se suma de nuevo)
  const grandTotal = totalWithTax - discountAmount + tipAmount

  // Monto exento: items con codigo 03 o 04
  const exemptBase = taxBreakdown
    .filter((t) => t.code === '03' || t.code === '04')
    .reduce((sum, t) => sum + t.base, 0)

  return {
    subtotalBase,
    taxExemptAmount: exemptBase,
    totalTaxAmount,
    totalWithTax,
    discountAmount,
    tipAmount,
    grandTotal,
    taxBreakdown,
    paymentMethod: order.paymentMethod,
  }
}
