/**
 * Viva POS — Application Constants
 *
 * All configurable values are centralized here.
 * DIAN-standard values are documented with their official reference.
 * Everything else comes from environment variables or store configuration.
 */

// ═══════════════════════════════════════════════════════════════
// DIAN (Dirección de Impuestos y Aduanas Nacionales) Standards
// These are Colombian tax authority standard values — NOT configurable.
// Reference: DIAN Resolution 000042 (2020) — Factura Electrónica V2.1
// ═══════════════════════════════════════════════════════════════

/** NIT genérico para Consumidor Final (estándar DIAN) */
export const DIAN_CONSUMIDOR_FINAL_NIT = '222222222222'

/** NIT genérico para Consumidor Final con DV (para validaciones) */
export const DIAN_CONSUMIDOR_FINAL_NIT_DV = '222222222222'

/** Default currency for Colombian commerce */
export const DEFAULT_CURRENCY = 'COP'

/** Invoice type code for standard invoices (DIAN UBL 2.1) */
export const DIAN_INVOICE_TYPE = '01'

/** Invoice type code for export invoices */
export const DIAN_EXPORT_INVOICE_TYPE = '02'

// ═══════════════════════════════════════════════════════════════
// Viva Business Constants
// ═══════════════════════════════════════════════════════════════

/** Support phone number — loaded from env var SUPPORT_PHONE */
export function getSupportPhone(): string {
  const phone = process.env.SUPPORT_PHONE
  if (!phone) {
    throw new Error('SUPPORT_PHONE environment variable is required. Set it in .env')
  }
  return phone
}

/** DIAN Software Provider NIT — loaded from env var DIAN_SOFTWARE_PROVIDER_NIT */
export function getSoftwareProviderNIT(): string {
  const nit = process.env.DIAN_SOFTWARE_PROVIDER_NIT
  if (!nit) {
    throw new Error('DIAN_SOFTWARE_PROVIDER_NIT environment variable is required. Set it in .env')
  }
  return nit
}

/** DIAN Software Name — loaded from env var DIAN_SOFTWARE_NAME */
export function getSoftwareName(): string {
  const name = process.env.DIAN_SOFTWARE_NAME
  if (!name) {
    throw new Error('DIAN_SOFTWARE_NAME environment variable is required. Set it in .env')
  }
  return name
}
