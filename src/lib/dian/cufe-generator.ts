import crypto from 'crypto'

/**
 * Input parameters for CUFE/CUDFE generation following DIAN v2.1 specification.
 */
export interface CUFEInput {
  /** Full NIT with DV: "900123456-7" */
  storeNit: string
  /** Issue date in YYYYMMDD format */
  issueDate: string
  /** Issue time in HHmmssSSS format */
  issueTime: string
  /** Invoice prefix from resolution: "FE", "POS" */
  prefix: string
  /** Consecutive number within the authorized range */
  consecutive: number
  /** Customer NIT: 13 digits for consumer final, or full NIT with DV */
  customerNit: string
  /** Taxable base amount (before tax), in COP — must be integer */
  subtotalBase: number
  /** Total without taxes, in COP — must be integer */
  totalWithoutTax: number
  /** Total tax amount, in COP — must be integer */
  totalTaxAmount: number
  /** Discount amount, in COP — must be integer */
  discountAmount: number
  /** Grand total (final amount to pay), in COP — must be integer */
  grandTotal: number
  /** ISO 4217 currency code, default "COP" */
  currencyCode: string
  /** Software provider NIT (digits only, no dash) — optional for PTE */
  pteNit?: string
  /** Certificate number — empty string for PTE */
  certificateNumber?: string
}

/**
 * Cleans a NIT by removing all non-digit characters including the dash.
 * DIAN CUFE uses the FULL NIT including DV but without separators.
 * "900123456-7" → "9001234567"
 */
function cleanNit(nit: string): string {
  return nit.replace(/[^0-9]/g, '')
}

/**
 * Pads a numeric string with leading zeros to reach the specified length.
 */
function padZero(value: string | number, length: number): string {
  return String(value).padStart(length, '0')
}

/**
 * Generates the CUFE (Código Único de Factura Electrónica) following
 * the strict DIAN v2.1 specification.
 *
 * Algorithm:
 * 1. Clean and format all 16 fields according to DIAN padding rules
 * 2. Join fields with "|" separator
 * 3. Apply SHA-384 hash
 * 4. Encode result as Base64
 *
 * Field order (strict):
 * 1. NIT emisor (digits only, no dash) — 20 chars padded with 0
 * 2. Fecha emisión YYYYMMDD — 8 chars
 * 3. Hora emisión HHmmssSSS — 9 chars
 * 4. Prefijo — left padded with spaces to 4 chars
 * 5. Consecutivo — 20 chars padded with 0
 * 6. NIT receptor (digits only) — 20 chars padded with 0
 * 7. Base gravable IVA — 20 chars padded with 0
 * 8. Total sin impuestos — 20 chars padded with 0
 * 9. Total impuestos — 20 chars padded with 0
 * 10. Descuento — 20 chars padded with 0
 * 11. Total factura — 20 chars padded with 0
 * 12. Moneda — "COP"
 * 13. Tipo operación — "10" (standard invoice)
 * 14. CUDE — empty for CUFE
 * 15. Numero certificado — empty for PTE
 * 16. NIT del PTE (digits only) — empty if not set
 */
export function generateCUFE(input: CUFEInput): string {
  const {
    storeNit,
    issueDate,
    issueTime,
    prefix,
    consecutive,
    customerNit,
    subtotalBase,
    totalWithoutTax,
    totalTaxAmount,
    discountAmount,
    grandTotal,
    currencyCode,
    pteNit,
    certificateNumber,
  } = input

  // Clean NITs: remove all non-digit characters
  // DIAN uses full NIT including DV but without dash
  const storeNitClean = cleanNit(storeNit)
  const customerNitClean = cleanNit(customerNit)

  // Build the 16 fields joined by "|"
  const fields = [
    padZero(storeNitClean, 20),          // 1. NIT emisor — 20 chars
    issueDate.padEnd(8),                 // 2. Fecha emisión — 8 chars YYYYMMDD
    issueTime.padEnd(9),                 // 3. Hora emisión — 9 chars HHmmssSSS
    prefix.padStart(4, ' '),             // 4. Prefijo — 4 chars left-padded with spaces
    padZero(consecutive, 20),            // 5. Consecutivo — 20 chars
    padZero(customerNitClean, 20),       // 6. NIT receptor — 20 chars
    padZero(Math.round(subtotalBase), 20),  // 7. Base gravable IVA — 20 chars
    padZero(Math.round(totalWithoutTax), 20), // 8. Total sin impuestos — 20 chars
    padZero(Math.round(totalTaxAmount), 20),  // 9. Total impuestos — 20 chars
    padZero(Math.round(discountAmount), 20),  // 10. Descuento — 20 chars
    padZero(Math.round(grandTotal), 20),      // 11. Total factura — 20 chars
    currencyCode,                         // 12. Moneda — "COP"
    '10',                                 // 13. Tipo operación — "10" (venta estándar)
    '',                                   // 14. CUDE — empty for CUFE
    certificateNumber ?? '',              // 15. Numero certificado — empty for PTE
    pteNit ? cleanNit(pteNit) : '',       // 16. NIT del PTE — empty if not set
  ]

  const inputString = fields.join('|')

  // SHA-384 → Base64
  return crypto.createHash('sha384').update(inputString).digest('base64')
}

/**
 * Generates the CUDFE (Código Único de Documento Fiscal Electrónico)
 * for credit notes, debit notes, and other supporting documents.
 *
 * Same algorithm as CUFE but includes the CUDE (Código Único de Documento Electrónico)
 * in field 14 and uses operation type "30" for export or "10" for credit notes.
 */
export function generateCUDFE(input: CUFEInput & { cude: string }): string {
  const {
    storeNit,
    issueDate,
    issueTime,
    prefix,
    consecutive,
    customerNit,
    subtotalBase,
    totalWithoutTax,
    totalTaxAmount,
    discountAmount,
    grandTotal,
    currencyCode,
    pteNit,
    certificateNumber,
    cude,
  } = input

  const storeNitClean = cleanNit(storeNit)
  const customerNitClean = cleanNit(customerNit)

  const fields = [
    padZero(storeNitClean, 20),
    issueDate.padEnd(8),
    issueTime.padEnd(9),
    prefix.padStart(4, ' '),
    padZero(consecutive, 20),
    padZero(customerNitClean, 20),
    padZero(Math.round(subtotalBase), 20),
    padZero(Math.round(totalWithoutTax), 20),
    padZero(Math.round(totalTaxAmount), 20),
    padZero(Math.round(discountAmount), 20),
    padZero(Math.round(grandTotal), 20),
    currencyCode,
    '10',                    // Tipo operación: "10" for credit notes
    cude,                    // 14. CUDE — value for CUDFE
    certificateNumber ?? '',
    pteNit ? cleanNit(pteNit) : '',
  ]

  const inputString = fields.join('|')

  return crypto.createHash('sha384').update(inputString).digest('base64')
}
