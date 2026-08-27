/**
 * Barcode checksum validation
 * ────────────────────────────
 * Validates GTIN-family codes (EAN-8, UPC-A/12, EAN-13, GTIN-14) using
 * the standard modulo-10 check digit. Prevents partial/false reads from
 * the camera scanner before they reach business logic.
 */

const GTIN_PATTERN = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/

/** Returns true if `code` is a syntactically valid EAN/UPC barcode. */
export function isValidGtin(code: string): boolean {
  if (!GTIN_PATTERN.test(code)) return false
  const digits = code.split('').map(Number)
  const checkDigit = digits.pop() as number
  let sum = 0
  let weight = 3
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * weight
    weight = weight === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10 === checkDigit
}

/**
 * Decides whether a raw scanned string should be accepted:
 * - GTIN-family codes must pass the check digit.
 * - Any other alphanumeric code (internal SKUs) is accepted with length >= minLength.
 */
export function isAcceptableScan(code: string, minLength = 4): boolean {
  const trimmed = code.trim()
  if (trimmed.length < minLength) return false
  if (GTIN_PATTERN.test(trimmed)) return isValidGtin(trimmed)
  return true
}
