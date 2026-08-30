// ─── Helpers puros del importador de productos por Excel ───────────────────
// Sin imports de Prisma ni de `next` → testeable en entorno node.

import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/constants'
import { PRESENTATION_BLOCKS, stripAccents } from '@/lib/product-import-columns'

// ─── Sí / No ───────────────────────────────────────────────────────────────
const TRUE_SET = new Set(['si', 'sí', 's', 'yes', 'y', 'true', '1', 'activo', 'activa', 'x'])
const FALSE_SET = new Set(['no', 'n', 'false', '0', 'inactivo', 'inactiva'])

/** Interpreta un valor "Sí/No". Vacío o desconocido → `dflt`. */
export function parseBool(raw: unknown, dflt: boolean): boolean {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return dflt
  if (TRUE_SET.has(v)) return true
  if (FALSE_SET.has(v)) return false
  return dflt
}

// ─── Unidad de medida ─────────────────────────────────────────────────────
const UNIT_BY_LABEL = new Map(
  UNIT_OF_MEASURE_OPTIONS.map((u) => [stripAccents(u.label).toLowerCase(), u.value])
)
const UNIT_CODES = new Set(UNIT_OF_MEASURE_OPTIONS.map((u) => u.value))

/**
 * Resuelve el código de unidad de medida a partir de un código (`UND`, `KG`…)
 * o de una etiqueta (`Kilogramo`, `Caja`), sin distinguir mayúsculas ni tildes.
 * Vacío → `UND` válido. Sin coincidencia → `UND` marcado como inválido.
 */
export function resolveUnitLabel(raw: unknown): { code: string; invalid: boolean } {
  const s = String(raw ?? '').trim()
  if (!s) return { code: 'UND', invalid: false }
  const upper = s.toUpperCase()
  if (UNIT_CODES.has(upper)) return { code: upper, invalid: false }
  const byLabel = UNIT_BY_LABEL.get(stripAccents(s).toLowerCase())
  if (byLabel) return { code: byLabel, invalid: false }
  return { code: 'UND', invalid: true }
}

// ─── Presentaciones adicionales (bloques planos "Presentación N ...") ──────
export interface ParsedPresentation {
  name: string
  unitLabel: string
  barcode: string | null
  sku: string | null
  unitsPerPack: number
  salePrice: number
  costPrice: number
  isActive: boolean
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Extrae las presentaciones adicionales de una fila ya mapeada (los campos
 * numéricos vienen como `number`, los de texto como `string`).
 *
 * - Un bloque sin ninguna celda → se ignora.
 * - Un bloque con datos pero incompleto/ inválido → `error` (la fila completa
 *   se omite en el route).
 * - `warnings` recoge avisos no fatales (unidad de medida no reconocida).
 */
export function buildPresentations(row: Record<string, unknown>): {
  presentations: ParsedPresentation[]
  warnings: string[]
  error: string | null
} {
  const presentations: ParsedPresentation[] = []
  const warnings: string[] = []

  for (const n of PRESENTATION_BLOCKS) {
    const p = `pres${n}_`
    const name = String(row[`${p}name`] ?? '').trim()
    const unitRaw = String(row[`${p}unitLabel`] ?? '').trim()
    const barcode = String(row[`${p}barcode`] ?? '').trim()
    const sku = String(row[`${p}sku`] ?? '').trim()
    const unitsPerPack = row[`${p}unitsPerPack`] as number | undefined
    const salePrice = row[`${p}salePrice`] as number | undefined
    const costPrice = row[`${p}costPrice`] as number | undefined

    const hasAny =
      !!name ||
      !!unitRaw ||
      !!barcode ||
      !!sku ||
      typeof unitsPerPack === 'number' ||
      typeof salePrice === 'number' ||
      typeof costPrice === 'number'
    if (!hasAny) continue

    if (!name) {
      return { presentations: [], warnings, error: `Presentación ${n} incompleta: falta el nombre` }
    }
    if (name.length > 100) {
      return { presentations: [], warnings, error: `Presentación ${n}: el nombre supera 100 caracteres` }
    }
    if (typeof unitsPerPack !== 'number' || isNaN(unitsPerPack) || unitsPerPack < 0.001) {
      return {
        presentations: [],
        warnings,
        error: `Presentación ${n} incompleta: "Unidades por Empaque" debe ser 0.001 o más`,
      }
    }
    if (typeof salePrice !== 'number' || isNaN(salePrice)) {
      return { presentations: [], warnings, error: `Presentación ${n} incompleta: falta "Precio Venta"` }
    }
    const sp = Math.round(salePrice)
    if (sp < 1) {
      return {
        presentations: [],
        warnings,
        error: `Presentación ${n}: "Precio Venta" debe ser mayor a 0`,
      }
    }
    const cp = typeof costPrice === 'number' && !isNaN(costPrice) ? Math.round(costPrice) : 0
    if (cp < 0) {
      return {
        presentations: [],
        warnings,
        error: `Presentación ${n}: "Precio Compra" no puede ser negativo`,
      }
    }
    if (barcode.length > 100) {
      return { presentations: [], warnings, error: `Presentación ${n}: el código de barras supera 100 caracteres` }
    }
    if (sku.length > 100) {
      return { presentations: [], warnings, error: `Presentación ${n}: el SKU supera 100 caracteres` }
    }

    const unit = resolveUnitLabel(unitRaw)
    if (unit.invalid) {
      warnings.push(`Presentación ${n}: unidad de medida "${unitRaw}" no reconocida, se usó UND`)
    }

    presentations.push({
      name,
      unitLabel: unit.code,
      barcode: barcode || null,
      sku: sku || null,
      unitsPerPack: round3(unitsPerPack),
      salePrice: sp,
      costPrice: cp,
      isActive: true,
    })
  }

  return { presentations, warnings, error: null }
}
