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
  resolutionNumber?: string
  resolutionDate?: string
  pinSoftware?: string
  providerNit: string
}

export interface QRCodeParams {
  storeNit: string
  prefix: string
  consecutive: number
  date: string            // YYYY-MM-DD
  grandTotal: number
  cufe: string
  testMode?: boolean
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

/**
 * Obtiene la URL base de la aplicación desde el request.
 * En producción usa las headers, en desarrollo usa localhost.
 */
export function getAppBaseUrl(request: Request): string {
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = request.headers.get('x-forwarded-proto') || 'https'
  return `${protocol}://${host}`
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
 */
export function getDIANPaymentCode(paymentMethod: string): string {
  return PAYMENT_CODE_MAP[paymentMethod.toUpperCase()] ?? '99'
}

// ─── NIT: Limpieza y Validación de DV ─────────────────────────────────────

/**
 * Limpia un NIT colombiano: elimina puntos, guiones y espacios.
 * Retorna solo los dígitos (incluyendo el DV como último dígito).
 *
 * Ejemplos:
 *  - "900.123.456-7" → "9001234567"
 *  - "222222222222"  → "222222222222"
 *  - "900123456-7"   → "9001234567"
 */
export function cleanNit(nit: string): string {
  if (!nit || typeof nit !== 'string') return ''
  return nit.replace(/[^0-9]/g, '')
}

/**
 * Separa un NIT en dígitos principales y dígito de verificación (DV).
 *
 * Ejemplos:
 *  - "9001234567"    → { digits: "900123456", dv: 7 }
 *  - "222222222222"  → { digits: "22222222222", dv: 2 }
 *  - "8301044871"    → { digits: "830104487", dv: 1 }
 */
export function splitNitDV(nit: string): { digits: string; dv: number } {
  const cleaned = cleanNit(nit)
  if (cleaned.length <= 1) return { digits: cleaned, dv: 0 }

  const dv = parseInt(cleaned[cleaned.length - 1], 10)
  const digits = cleaned.slice(0, -1)
  return { digits, dv }
}

/**
 * Calcula el dígito de verificación (DV) de un NIT colombiano.
 *
 * Algoritmo oficial DIAN:
 * 1. Se asignan pesos [71,67,59,53,47,43,41,37,29,23,19,17,13,7,3] de izquierda a derecha.
 *    Para NITs más cortos que 15 dígitos, se usan los últimos N pesos.
 * 2. Se multiplica cada dígito por su peso.
 * 3. Se suman todos los productos.
 * 4. El DV se calcula como: 11 - (suma mod 11).
 *    Si el resultado es > 9, DV = 0.
 *    Si (suma mod 11) es 0 o 1, DV = (suma mod 11).
 *
 * @param nitDigits - NIT sin el DV (solo dígitos numéricos)
 * @returns El dígito de verificación (0-9)
 *
 * @example
 * calculateNITDV("900123456")  // → 7
 * calculateNITDV("22222222222") // → 2
 * calculateNITDV("830104487")  // → 1
 */
export function calculateNITDV(nitDigits: string): number {
  const cleaned = cleanNit(nitDigits)
  if (cleaned.length === 0) return -1

  // Pesos oficiales DIAN (hasta 15 posiciones)
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]

  // Tomar los últimos N pesos según la longitud del NIT
  const n = cleaned.length
  const relevantWeights = weights.slice(-n)

  // Multiplicar cada dígito por su peso
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += parseInt(cleaned[i], 10) * relevantWeights[i]
  }

  const remainder = sum % 11

  // Calcular DV
  if (remainder === 0 || remainder === 1) {
    return remainder
  }
  return 11 - remainder
}

/**
 * Valida que el dígito de verificación de un NIT colombiano sea correcto.
 *
 * Para el NIT genérico "222222222222" (consumidor final), siempre retorna true.
 *
 * @param nit - NIT en cualquier formato (con puntos, guiones, etc.)
 * @returns true si el DV es válido, false si no
 */
export function validateNITDV(nit: string): boolean {
  const cleaned = cleanNit(nit)
  if (cleaned.length < 2) return false

  // Consumidor final genérico — siempre válido
  if (cleaned === '222222222222') return true

  const expectedDV = calculateNITDV(cleaned.slice(0, -1))
  const actualDV = parseInt(cleaned[cleaned.length - 1], 10)

  return expectedDV === actualDV
}

/**
 * Formatea un NIT para visualización: "900123456-7"
 */
export function formatNIT(nit: string): string {
  const { digits, dv } = splitNitDV(nit)
  if (!digits) return nit
  return `${digits}-${dv}`
}

// ─── Generacion CUFE (DIAN v2.1 — sin separadores) ──────────────────────

/**
 * Genera el CUFE (Código Único de Factura Electrónica) siguiendo la
 * especificación DIAN v2.1.
 *
 * Los campos se concatenan SIN separadores (concatenación directa),
 * y el resultado se hashea con SHA-384 y se codifica en base64.
 *
 * @param params - Parámetros de la factura para el CUFE
 * @returns CUFE base64 (64 caracteres)
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
    resolutionNumber = '',
    resolutionDate = '',
    pinSoftware = '',
    providerNit,
  } = params

  // Limpiar NITs: solo dígitos
  const cleanStoreNit = cleanNit(storeNit)
  const cleanCustomerNit = cleanNit(customerNit)
  const cleanProviderNit = cleanNit(providerNit)

  // Dividir NIT emisor en dígitos + DV
  const { digits: storeDigits, dv: storeDV } = splitNitDV(storeNit)
  const { digits: customerDigits, dv: customerDV } = splitNitDV(customerNit)

  // Total sin impuestos = subtotalBase (base antes de IVA)
  const totalSinImpuestos = subtotalBase

  // Concatenar campos según DIAN v2.1 (SIN separadores)
  const fields = [
    String(1),                             // Tipo emisor: 1 = factura de venta
    storeDigits,                           // NIT emisor (sin DV)
    padField(storeDV, 1),                  // DV emisor
    issueDate,                             // YYYYMMDD
    issueTime,                             // HHmmssSSS
    prefix,                                // Prefijo resolución
    padField(consecutive, 20),             // Consecutivo (20 dígitos)
    String(1),                             // Tipo receptor: 1 = NIT
    customerDigits,                        // NIT receptor (sin DV)
    padField(customerDV, 1),               // DV receptor
    padField(Math.round(subtotalBase), 20),       // Base gravable
    padField(Math.round(totalSinImpuestos), 20),  // Total sin impuestos
    padField(Math.round(totalTaxAmount), 20),     // Total impuestos
    padField(Math.round(discountAmount), 20),     // Total descuento
    padField(Math.round(grandTotal), 20),         // Total factura
    currencyCode,                          // Moneda
    String(10),                            // Tipo operación: 10 = venta estándar
    resolutionNumber,                      // Número resolución
    resolutionDate.replace(/-/g, ''),      // Fecha resolución YYYYMMDD
    pinSoftware,                           // PIN software
    cleanProviderNit,                      // NIT proveedor tecnológico
  ]

  const rawString = fields.join('')
  const hash = crypto.createHash('sha384').update(rawString, 'utf8').digest('base64')

  return hash
}

// ─── Generacion URL QR ────────────────────────────────────────────────────

/**
 * Genera la URL del código QR para la factura electrónica DIAN.
 * Usa la URL de habilitación o producción según el modo.
 */
export function generateQRCodeURL(params: QRCodeParams): string {
  const {
    storeNit,
    prefix,
    consecutive,
    date,
    grandTotal,
    cufe,
    testMode = true,
  } = params

  const formattedNumber = formatInvoiceNumber(prefix, consecutive)
  const baseURL = testMode
    ? 'https://catalogo-vpfe-hab.dian.gov.co/documento/consultar'
    : 'https://catalogo-vpfe.dian.gov.co/documento/consultar'

  const urlParams = new URLSearchParams({
    nit: cleanNit(storeNit),
    numeracion: formattedNumber,
    fecha: date,
    total: String(Math.round(grandTotal)),
    uuid: cufe,
  })

  return `${baseURL}?${urlParams.toString()}`
}

// ─── CUDFE (Nota Crédito / Nota Débito) ──────────────────────────────────

/**
 * Genera el CUDFE para Notas Crédito/Débito.
 * Igual al CUFE pero el campo tipoOperación se reemplaza por el CUDE de la factura original.
 */
export function generateCUDFE(params: CUFEParams & { cude: string }): string {
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
    resolutionNumber = '',
    resolutionDate = '',
    pinSoftware = '',
    providerNit,
    cude,
  } = params

  const { digits: storeDigits, dv: storeDV } = splitNitDV(storeNit)
  const { digits: customerDigits, dv: customerDV } = splitNitDV(customerNit)

  // Concatenar: igual que CUFE pero campo tipoOperación = CUDE de factura original
  const fields = [
    String(1),
    storeDigits,
    padField(storeDV, 1),
    issueDate,
    issueTime,
    prefix,
    padField(consecutive, 20),
    String(1),
    customerDigits,
    padField(customerDV, 1),
    padField(Math.round(subtotalBase), 20),
    padField(Math.round(subtotalBase), 20),
    padField(Math.round(totalTaxAmount), 20),
    padField(Math.round(discountAmount), 20),
    padField(Math.round(grandTotal), 20),
    currencyCode,
    cude,                                  // CUDE de la factura original (reemplaza tipoOperación)
    resolutionNumber,
    resolutionDate.replace(/-/g, ''),
    pinSoftware,
    cleanNit(providerNit),
  ]

  const rawString = fields.join('')
  return crypto.createHash('sha384').update(rawString, 'utf8').digest('base64')
}

// ─── Calculo de factura desde orden ──────────────────────────────────────

/**
 * Calcula todos los campos tributarios de una factura a partir de una orden y sus items.
 * En Colombia, los precios al público INCLUYEN IVA.
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
  const subtotalBase = order.subtotal - totalTaxAmount
  const totalWithTax = order.subtotal
  const discountAmount = order.discountAmount
  const tipAmount = order.tipAmount
  const grandTotal = totalWithTax - discountAmount + tipAmount

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
