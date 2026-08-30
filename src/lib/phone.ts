// ---------------------------------------------------------------------------
// Sebwen POS — Teléfonos para WhatsApp (click-to-chat / wa.me)
// ---------------------------------------------------------------------------
// wa.me exige el número en formato internacional: código de país + número
// local, SOLO dígitos, sin '+', sin espacios, sin guiones, sin 0 inicial.
// Errores típicos que rompen el link: dejar el '+', dejar el 0 local, o no
// poner código de país (ver docs). Aquí normalizamos una vez y reusamos en el
// storefront y en el botón "escribir al cliente" de la bandeja.
// ---------------------------------------------------------------------------

// Código de marcación por país ISO-3166-1 alpha-2 (los que soporta la app).
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  CO: '57',
  MX: '52',
  PE: '51',
  CL: '56',
  AR: '54',
  BR: '55',
  US: '1',
  EC: '593',
  PA: '507',
  VE: '58',
  BO: '591',
  PY: '595',
  UY: '598',
  CR: '506',
  GT: '502',
  DO: '1',
  ES: '34',
}

// Fallback cuando la tienda no tiene countryCode: inferir del código de moneda.
const CURRENCY_TO_DIAL: Record<string, string> = {
  COP: '57',
  MXN: '52',
  PEN: '51',
  CLP: '56',
  ARS: '54',
  BRL: '55',
  USD: '1',
  VEB: '58',
  VES: '58',
  BOB: '591',
  PYG: '595',
  UYU: '598',
  CRC: '506',
  GTQ: '502',
  EUR: '34',
}

export const DEFAULT_DIAL_CODE = '57'

/** Código de marcación por defecto para una tienda. */
export function defaultDialCode(opts: { countryCode?: string | null; currencyCode?: string | null }): string {
  const cc = (opts.countryCode || '').trim().toUpperCase()
  if (cc && COUNTRY_DIAL_CODES[cc]) return COUNTRY_DIAL_CODES[cc]
  const cur = (opts.currencyCode || '').trim().toUpperCase()
  if (cur && CURRENCY_TO_DIAL[cur]) return CURRENCY_TO_DIAL[cur]
  return DEFAULT_DIAL_CODE
}

const KNOWN_DIAL_CODES = Array.from(
  new Set([...Object.values(COUNTRY_DIAL_CODES), ...Object.values(CURRENCY_TO_DIAL)]),
).sort((a, b) => b.length - a.length) // más largos primero (593 antes que 59/5)

/**
 * Normaliza un teléfono a solo dígitos con código de país, listo para wa.me.
 *
 * - quita todo lo que no sea dígito (incluye el '+')
 * - quita el '00' de marcación internacional si viene
 * - quita el 0 inicial del número local
 * - si ya empieza por un código de país conocido y el largo es plausible, lo respeta
 * - si no, antepone `dialCode`
 *
 * Devuelve '' si no quedan suficientes dígitos para ser un número válido.
 */
export function normalizePhone(raw: string | null | undefined, dialCode: string = DEFAULT_DIAL_CODE): string {
  let digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''

  // Prefijo internacional 00 -> tratar el resto como ya-internacional
  if (digits.startsWith('00')) digits = digits.slice(2)

  const dc = (dialCode || DEFAULT_DIAL_CODE).replace(/\D/g, '') || DEFAULT_DIAL_CODE

  // ¿Ya trae un código de país al frente? (el propio, u otro conocido)
  const candidates = [dc, ...KNOWN_DIAL_CODES]
  for (const code of candidates) {
    if (digits.startsWith(code) && digits.length - code.length >= 7 && digits.length - code.length <= 12) {
      return digits
    }
  }

  // Número local: quitar 0 inicial y anteponer el código de la tienda
  digits = digits.replace(/^0+/, '')
  if (digits.length < 6) return ''
  return dc + digits
}

/** Construye el enlace wa.me con el mensaje ya codificado. */
export function buildWaMeUrl(phoneNormalized: string, message?: string): string {
  const base = `https://wa.me/${phoneNormalized}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
