// ============================================================
// SEBWEN POS — Domain Service: TaxCalculator
// Contexto: Sales (Ventas POS) — Shared Kernel con Restaurant
// ──────────────────────────────────────────────────────────
// Cálculo de impuestos colombianos con precios **tax-inclusive** (IVA
// embebido en el precio al público) según la norma DIAN.
//
// POR QUÉ EXISTE:
//   Antes esta lógica vivía duplicada en TRES handlers de ruta
//   (orders/route.ts, quotations/route.ts, quotations/[id]/route.ts)
//   como funciones `calcTax` idénticas. DDD (Eric Evans): una regla
//   de negocio, un lugar. Aquí es la única fuente de verdad.
//
// PROPIEDADES DDD:
//   - Domain Service **puro**: no importa Prisma ni la base de datos.
//     Testeable en aislamiento (ver __tests__/tax-calculator.test.ts).
//   - Expresa el Lenguaje Ubicuo: totalRow, taxBase, taxAmount, IVA,
//     Exento (03), Excluido (04), Impoconsumo (FIXED_AMOUNT).
//   - El prorrateo del descuento sobre la base de IVA es una regla
//     DIAN crítica (no declarar IVA sobre dinero no cobrado) que
//     antes estaba embebida en orders/route.ts; ahora es un método
//     con nombre y tests propios.
// ============================================================

// ─── Value Objects ─────────────────────────────────────────────

/** Códigos de impuesto DIAN. 01=IVA19, 02=IVA5, 03=Exento, 04=Excluido, 05=Impoconsumo. */
export type TaxCode = '01' | '02' | '03' | '04' | '05' | string

/** Tipo de cálculo de la tasa. PERCENTAGE = IVA incluido; FIXED_AMOUNT = impoconsumo. */
export type TaxRateType = 'PERCENTAGE' | 'FIXED_AMOUNT' | string

/**
 * Vista mínima de una tasa de impuesto tal como la consume el cálculo.
 * Es un Value Object: dos instancias con los mismos campos son equivalentes.
 */
export interface TaxRateInfo {
  code: TaxCode
  rate: number
  rateType: TaxRateType
}

/** Resultado del cálculo de impuesto para una línea de venta. */
export interface LineTax {
  /** Código DIAN, o null si la línea no lleva impuesto. */
  taxCode: TaxCode | null
  /** Tasa aplicada (p. ej. 19 para IVA 19%). */
  taxRate: number
  /** Valor del impuesto en COP (entero). */
  taxAmount: number
  /** Base gravable en COP (precio sin impuesto). */
  taxBase: number
}

/** Forma de un ítem con su tax calculado, lista para acumular en el breakdown. */
export interface TaxableLine extends LineTax {
  totalRow: number
}

/** Acumulador de breakdown agrupado por código de impuesto. */
export interface TaxBreakdownEntry {
  code: TaxCode
  name: string
  base: number
  rate: number
  amount: number
}

// ─── Constantes del dominio ────────────────────────────────────

/** Códigos DIAN de líneas EXENTAS (03) o EXCLUIDAS (04): base = total, impuesto = 0. */
export const EXEMPT_CODES: ReadonlySet<string> = new Set(['03', '04'])

// ─── Domain Service ────────────────────────────────────────────

/**
 * Calcula el impuesto de UNA línea de venta bajo pricing tax-inclusive
 * (Colombia). Reglas:
 *
 *   - Sin tasa → sin impuesto; base = totalRow.
 *   - Exento (03) / Excluido (04) → impuesto 0; base = totalRow.
 *   - PERCENTAGE con rate > 0 (IVA) → base = totalRow / (1 + rate/100),
 *     impuesto = totalRow - base (el impuesto va embebido en el precio).
 *   - FIXED_AMOUNT (impoconsumo) → hoy: base = totalRow, impuesto = 0
 *     (los precios del POS incluyen todo; se deja explícito para futura
 *     extensión por unidad).
 */
export function calcLineTax(totalRow: number, taxRateInfo: TaxRateInfo | null): LineTax {
  if (!taxRateInfo) {
    return { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: totalRow }
  }
  if (EXEMPT_CODES.has(taxRateInfo.code)) {
    return { taxCode: taxRateInfo.code, taxRate: 0, taxAmount: 0, taxBase: totalRow }
  }
  if (taxRateInfo.rateType === 'PERCENTAGE' && taxRateInfo.rate > 0) {
    const taxBase = Math.round(totalRow / (1 + taxRateInfo.rate / 100))
    const taxAmount = totalRow - taxBase
    return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount, taxBase }
  }
  return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount: 0, taxBase: totalRow }
}

/**
 * Acumula un conjunto de líneas en un breakdown agrupado por código de
 * impuesto. Recrea el `taxBreakdownMap` que antes se construía a mano
 * dentro de cada ruta.
 */
export function buildTaxBreakdown(lines: TaxableLine[]): TaxBreakdownEntry[] {
  const map = new Map<string, TaxBreakdownEntry>()
  for (const line of lines) {
    if (!line.taxCode) continue
    const existing = map.get(line.taxCode)
    if (existing) {
      existing.base += line.taxBase
      existing.amount += line.taxAmount
    } else {
      map.set(line.taxCode, {
        code: line.taxCode,
        name: line.taxCode,
        base: line.taxBase,
        rate: line.taxRate,
        amount: line.taxAmount,
      })
    }
  }
  return Array.from(map.values())
}

/**
 * REGLA DIAN — Prorrateo de descuento sobre la base de IVA.
 *
 * Un descuento reduce lo que el negocio realmente recibió, por lo que la
 * base de IVA debe contraerse proporcionalmente; de lo contrario la orden
 * (y el reporte DIAN) declararía impuesto sobre dinero que nunca se cobró.
 *
 * `totalRow` y `unitPrice` se conservan intactos (siguen siendo el precio
 * de lista, p. ej. para el ticket); solo `taxBase`/`taxAmount` — las
 * cifras que miran a DIAN — se descuentan.
 */
export function prorateDiscountOverTax(
  lines: TaxableLine[],
  discountAmount: number,
  subtotal: number,
): { lines: TaxableLine[]; totalTax: number } {
  if (discountAmount <= 0 || subtotal <= 0) {
    return { lines, totalTax: lines.reduce((s, l) => s + l.taxAmount, 0) }
  }
  const discountRatio = discountAmount / subtotal
  const adjusted = lines.map((line) => ({
    ...line,
    taxBase: Math.round(line.taxBase * (1 - discountRatio)),
    taxAmount: Math.round(line.taxAmount * (1 - discountRatio)),
  }))
  return { lines: adjusted, totalTax: adjusted.reduce((s, l) => s + l.taxAmount, 0) }
}

/**
 * Calcula el monto de descuento a partir de su tipo y valor, acotado al
 * subtotal (un descuento fijo nunca puede exceder la venta).
 */
export function resolveDiscount(
  type: 'NONE' | 'PERCENTAGE' | 'FIXED',
  value: number,
  subtotal: number,
): number {
  if (type === 'PERCENTAGE' && value > 0) {
    return Math.round(subtotal * (value / 100))
  }
  if (type === 'FIXED') {
    return Math.min(value, subtotal)
  }
  return 0
}
