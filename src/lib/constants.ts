/**
 * Sebwen POS — Application Constants
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
// Units of Measure (Unidades de Medida)
// Catalog for products/presentations. UND is the standard code for any
// individually-sold item — deliberately no separate "PZA" (pieza), to avoid
// two codes meaning the same thing. DIAN itself recognizes kg, m, m², m³, L
// and unidad (U) as standard physical-quantity units for electronic invoicing.
// ═══════════════════════════════════════════════════════════════

export interface UnitOfMeasureOption {
  value: string
  label: string
}

export const UNIT_OF_MEASURE_OPTIONS: UnitOfMeasureOption[] = [
  { value: 'UND', label: 'Unidad' },
  { value: 'CAJ', label: 'Caja' },
  { value: 'PAQ', label: 'Paquete' },
  { value: 'FAR', label: 'Fardo' },
  { value: 'PACA', label: 'Paca' },
  { value: 'DOC', label: 'Docena' },
  { value: 'PAR', label: 'Par' },
  { value: 'KIT', label: 'Kit' },
  { value: 'BOL', label: 'Bolsa' },
  { value: 'BOT', label: 'Botella' },
  { value: 'LAT', label: 'Lata' },
  { value: 'ENV', label: 'Envase' },
  { value: 'FCO', label: 'Frasco' },
  { value: 'SOB', label: 'Sobre' },
  { value: 'ROL', label: 'Rollo' },
  { value: 'BOB', label: 'Bobina' },
  { value: 'TUB', label: 'Tubo' },
  { value: 'SAC', label: 'Saco' },
  { value: 'BUL', label: 'Bulto' },
  { value: 'BDJ', label: 'Bandeja' },
  { value: 'BLT', label: 'Blíster' },
  { value: 'EST', label: 'Estuche' },
  { value: 'TAR', label: 'Tarro' },
  { value: 'CAR', label: 'Cartucho' },
  { value: 'CAN', label: 'Caneca' },
  { value: 'BID', label: 'Bidón' },
  { value: 'TAM', label: 'Tambor' },
  { value: 'CIL', label: 'Cilindro' },
  { value: 'BARR', label: 'Barril' },
  { value: 'CUB', label: 'Cubeta' },
  { value: 'JAB', label: 'Jaba' },
  { value: 'PAL', label: 'Palé' },
  { value: 'CONT', label: 'Contenedor' },
  { value: 'ATD', label: 'Atado' },
  { value: 'MAN', label: 'Manojo' },
  { value: 'POR', label: 'Porción' },
  { value: 'RAC', label: 'Ración' },
  { value: 'EMB', label: 'Embalaje' },
  { value: 'ML', label: 'Mililitro' },
  { value: 'L', label: 'Litro' },
  { value: 'MG', label: 'Miligramo' },
  { value: 'G', label: 'Gramo' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'OZ', label: 'Onza' },
  { value: 'LB', label: 'Libra' },
  { value: 'M', label: 'Metro' },
  { value: 'CM', label: 'Centímetro' },
  { value: 'M2', label: 'Metro cuadrado' },
  { value: 'M3', label: 'Metro cúbico' },
]

// ═══════════════════════════════════════════════════════════════
// Sebwen Business Constants
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
