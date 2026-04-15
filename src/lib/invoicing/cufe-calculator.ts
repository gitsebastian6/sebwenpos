import crypto from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input parameters for CUFE generation following DIAN v2.1 specification.
 *
 * All monetary amounts should be provided in the invoice's minor unit (centavos).
 * NITs must be provided as digit strings; use `cleanNIT()` to extract digits
 * and the verification digit from formatted NITs like "900.123.456-7".
 */
export interface CUFEInput {
  /** Tipo de emisor — 1 for factura de venta */
  tipoEmisor: number
  /** NIT of the seller — digits only, without DV (e.g. "900123456") */
  nitEmisor: string
  /** Dígito de verificación del emisor (0-9) */
  dvEmisor: number
  /** Fecha de emisión — YYYYMMDD */
  fechaEmision: string
  /** Hora de emisión — HHmmssSSS (with milliseconds) */
  horaEmision: string
  /** Prefijo de numeración — e.g. "FE" */
  prefijo: string
  /** Consecutivo dentro del rango autorizado */
  consecutivo: number
  /** Tipo de documento del receptor: 1=NIT, 2=CC, 3=CE, 4=TI, 5=PP, 6=NIT extranjero */
  tipoReceptor: number
  /** NIT of buyer — digits only */
  nitReceptor: string
  /** Dígito de verificación del receptor (0 for consumidor final) */
  dvReceptor: number
  /** Base gravable (subtotal antes de impuestos) */
  subtotal: number
  /** Total sin impuestos */
  totalSinImpuestos: number
  /** Total de impuestos */
  totalImpuestos: number
  /** Total descuento */
  totalDescuento: number
  /** Total factura (gran total) */
  totalFactura: number
  /** Código de moneda — e.g. "COP" */
  moneda: string
  /** Tipo de operación — 10=venta estándar */
  tipoOperacion: number
  /** Número de la resolución de facturación (e.g. "18764") */
  numeroResolucion: string
  /** Fecha de la resolución — YYYYMMDD */
  fechaResolucion: string
  /** PIN del software proveído por la DIAN */
  pinSoftware: string
  /** NIT del proveedor tecnológico (digits only) */
  nitProveedorTecnologico: string
}

/**
 * Extended input for CUDFE generation (credit/debit notes).
 * Adds the CUDE of the original invoice to the standard CUFE fields.
 */
export interface CUDFEInput extends CUFEInput {
  /** CUDE (Código Único de Documento Electrónico) of the original invoice */
  cude: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pads a value with leading zeros to reach the specified length.
 *
 * @example
 * padLeft(42, 5)    // "00042"
 * padLeft("7", 3)   // "007"
 */
export function padLeft(value: string | number, length: number): string {
  return String(value).padStart(length, '0')
}

/**
 * Extracts the numeric digits and verification digit from a formatted NIT.
 *
 * Handles common Colombian NIT formats:
 * - "900.123.456-7"   → { digits: "900123456", dv: 7 }
 * - "900123456-7"     → { digits: "900123456", dv: 7 }
 * - "9001234567"      → { digits: "900123456", dv: 7 }
 * - "222222222222"    → { digits: "22222222222", dv: 2 }
 *
 * When no explicit dash is present, the last digit is treated as the DV.
 * When the string is all digits and has an odd length, the first N-1 digits
 * are the NIT and the last one is the DV.
 *
 * @param nit - Raw NIT string in any common format
 * @returns An object with `digits` (NIT without DV) and `dv` (verification digit)
 */
export function cleanNIT(nit: string): { digits: string; dv: number } {
  if (!nit || typeof nit !== 'string') {
    return { digits: '0', dv: 0 }
  }

  // Strip all non-digit characters except the trailing DV after a dash
  const dashIndex = nit.lastIndexOf('-')

  if (dashIndex !== -1) {
    const beforeDash = nit.slice(0, dashIndex).replace(/[^0-9]/g, '')
    const dvPart = nit.slice(dashIndex + 1).replace(/[^0-9]/g, '')
    const dv = dvPart.length > 0 ? parseInt(dvPart[0], 10) : 0
    return { digits: beforeDash || '0', dv }
  }

  // No dash found — strip everything non-digit
  const allDigits = nit.replace(/[^0-9]/g, '')

  if (allDigits.length === 0) {
    return { digits: '0', dv: 0 }
  }

  // If it's the standard 10-digit NIT+DV (11 chars), split
  // Otherwise, last digit is assumed to be the DV
  if (allDigits.length <= 1) {
    return { digits: allDigits, dv: 0 }
  }

  const dv = parseInt(allDigits[allDigits.length - 1], 10)
  const digits = allDigits.slice(0, -1)

  return { digits, dv }
}

/**
 * Returns a truncated display-friendly version of a CUFE string.
 * SHA-384 base64 hashes are typically 64 characters long, which is hard
 * to display in tight UI layouts.
 *
 * @param cufe - The full CUFE base64 string
 * @returns First 40 characters followed by "..."
 *
 * @example
 * formatCUFEForDisplay("aBcDeF...") // "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDe..."
 */
export function formatCUFEForDisplay(cufe: string): string {
  if (!cufe) return ''
  if (cufe.length <= 43) return cufe
  return `${cufe.slice(0, 40)}...`
}

/**
 * Validates whether a string looks like a valid base64-encoded SHA-384 hash.
 *
 * SHA-384 produces a 48-byte (384-bit) digest. When base64-encoded:
 * - 48 bytes × (4/3) ≈ 64 characters
 * - With potential `=` padding, the string is 64, 68, or 72 characters.
 *
 * This function performs a minimal sanity check:
 * - Non-empty string
 * - Minimum length of 20 characters (generous lower bound for partial hashes)
 * - Contains only valid base64 characters (A-Z, a-z, 0-9, +, /, =)
 *
 * @param cufe - The CUFE string to validate
 * @returns `true` if the string passes basic validation, `false` otherwise
 */
export function validateCUFE(cufe: string): boolean {
  if (!cufe || typeof cufe !== 'string') return false
  if (cufe.length < 20) return false

  // Base64 alphabet: A-Z a-z 0-9 + / and optional = padding
  const base64Regex = /^[A-Za-z0-9+/]+=*$/
  return base64Regex.test(cufe)
}

// ─────────────────────────────────────────────────────────────────────────────
// CUFE Generation — DIAN v2.1 Specification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the raw concatenated string used as input to the SHA-384 hash
 * for CUFE calculation.
 *
 * Fields are concatenated with NO separator (direct string concatenation)
 * following the DIAN 2024 specification:
 *
 * ```
 * {tipoEmisor}
 * {nitEmisor}
 * {dvEmisor}
 * {fechaEmision}            — YYYYMMDD
 * {horaEmision}             — HHmmssSSS
 * {prefijo}
 * {consecutivo}             — 20 digits, zero-padded
 * {tipoReceptor}
 * {nitReceptor}
 * {dvReceptor}
 * {subtotal}                — 20 digits, zero-padded
 * {totalSinImpuestos}       — 20 digits, zero-padded
 * {totalImpuestos}          — 20 digits, zero-padded
 * {totalDescuento}          — 20 digits, zero-padded
 * {totalFactura}            — 20 digits, zero-padded
 * {moneda}
 * {tipoOperacion}
 * {numeroResolucion}
 * {fechaResolucion}         — YYYYMMDD
 * {pinSoftware}
 * {nitProveedorTecnologico}
 * ```
 *
 * All numeric monetary fields are rounded to the nearest integer before padding.
 */
function buildCUFEString(input: CUFEInput): string {
  const fields = [
    String(input.tipoEmisor),
    input.nitEmisor.replace(/[^0-9]/g, ''),
    padLeft(input.dvEmisor, 1),
    input.fechaEmision,
    input.horaEmision,
    input.prefijo,
    padLeft(input.consecutivo, 20),
    String(input.tipoReceptor),
    input.nitReceptor.replace(/[^0-9]/g, ''),
    padLeft(input.dvReceptor, 1),
    padLeft(Math.round(input.subtotal), 20),
    padLeft(Math.round(input.totalSinImpuestos), 20),
    padLeft(Math.round(input.totalImpuestos), 20),
    padLeft(Math.round(input.totalDescuento), 20),
    padLeft(Math.round(input.totalFactura), 20),
    input.moneda,
    String(input.tipoOperacion),
    input.numeroResolucion,
    input.fechaResolucion,
    input.pinSoftware,
    input.nitProveedorTecnologico.replace(/[^0-9]/g, ''),
  ]

  return fields.join('')
}

/**
 * Generates the CUFE (Código Único de Factura Electrónica) following the
 * DIAN v2.1 specification.
 *
 * The CUFE is a SHA-384 hash of the concatenated invoice fields,
 * base64-encoded. It uniquely identifies an electronic invoice and is
 * required by the DIAN for validation purposes.
 *
 * @param input - All required invoice fields per DIAN specification
 * @returns The base64-encoded SHA-384 hash (typically 64 characters)
 *
 * @example
 * const cufe = await generateCUFE({
 *   tipoEmisor: 1,
 *   nitEmisor: "900123456",
 *   dvEmisor: 7,
 *   fechaEmision: "20240115",
 *   horaEmision: "143022000",
 *   prefijo: "FE",
 *   consecutivo: 1,
 *   tipoReceptor: 1,
 *   nitReceptor: "830102345",
 *   dvReceptor: 2,
 *   subtotal: 84034,
 *   totalSinImpuestos: 84034,
 *   totalImpuestos: 15966,
 *   totalDescuento: 0,
 *   totalFactura: 100000,
 *   moneda: "COP",
 *   tipoOperacion: 10,
 *   numeroResolucion: "18764",
 *   fechaResolucion: "20200825",
 *   pinSoftware: "abc123xyz",
 *   nitProveedorTecnologico: "900987654",
 * })
 */
export function generateCUFE(input: CUFEInput): string {
  const rawString = buildCUFEString(input)
  const hash = crypto.createHash('sha384').update(rawString, 'utf8').digest('base64')
  return hash
}

/**
 * Generates the CUDFE (Código Único de Documento Fiscal Electrónico)
 * for credit notes, debit notes, and other supporting documents.
 *
 * The algorithm is identical to CUFE except that the `tipoOperacion`
 * field is replaced with the CUDE (Código Único de Documento Electrónico)
 * of the original invoice being referenced.
 *
 * @param input - All CUFE fields plus the `cude` of the original invoice
 * @returns The base64-encoded SHA-384 hash
 *
 * @example
 * const cudfe = await generateCUDFE({
 *   ...baseFields,
 *   cude: "originalInvoiceCUDE...",
 * })
 */
export function generateCUDFE(input: CUDFEInput): string {
  // Build the string same as CUFE but substitute tipoOperacion with CUDE
  const fields = [
    String(input.tipoEmisor),
    input.nitEmisor.replace(/[^0-9]/g, ''),
    padLeft(input.dvEmisor, 1),
    input.fechaEmision,
    input.horaEmision,
    input.prefijo,
    padLeft(input.consecutivo, 20),
    String(input.tipoReceptor),
    input.nitReceptor.replace(/[^0-9]/g, ''),
    padLeft(input.dvReceptor, 1),
    padLeft(Math.round(input.subtotal), 20),
    padLeft(Math.round(input.totalSinImpuestos), 20),
    padLeft(Math.round(input.totalImpuestos), 20),
    padLeft(Math.round(input.totalDescuento), 20),
    padLeft(Math.round(input.totalFactura), 20),
    input.moneda,
    input.cude, // tipoOperacion replaced by CUDE
    input.numeroResolucion,
    input.fechaResolucion,
    input.pinSoftware,
    input.nitProveedorTecnologico.replace(/[^0-9]/g, ''),
  ]

  const rawString = fields.join('')
  const hash = crypto.createHash('sha384').update(rawString, 'utf8').digest('base64')
  return hash
}
