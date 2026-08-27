// ============================================================
// SEBWEN POS — Inventory Analytics (Vidal Holguín)
// ──────────────────────────────────────────────────────────
// Funciones puras para:
//   - Punto de reorden (ROP) y stock de seguridad
//   - Clasificación ABC por valor de ventas
//
// Sin dependencias de DB: reciben filas ya consultadas y
// devuelven resultados — así son directamente testeables.
// ============================================================

/** Z = 1.65 → nivel de servicio ≈ 95% (distribución normal). */
const SERVICE_LEVEL_Z = 1.65

export interface DailyDemandRow {
  productId: number
  /** Cantidad vendida en unidades base en un día. */
  quantity: number
}

export interface ReorderInput {
  productId: number
  currentStock: number
  minStock: number
  leadTimeDays: number
  providerId?: number | null
  /** Metadatos opcionales que viajan intactos hasta la sugerencia. */
  productName?: string
  providerName?: string | null
}

export interface ReorderSuggestion extends ReorderInput {
  avgDailyDemand: number
  demandStdDev: number
  safetyStock: number
  reorderPoint: number
  suggestedQty: number
}

/**
 * Punto de reorden según Vidal:
 *   ROP = demanda promedio × lead time + stock de seguridad
 *   SS  = Z × σ_demanda × √lead time
 */
export function calcReorderPoint(
  avgDailyDemand: number,
  demandStdDev: number,
  leadTimeDays: number,
): { safetyStock: number; reorderPoint: number } {
  const lt = Math.max(1, leadTimeDays)
  const safetyStock = Math.ceil(SERVICE_LEVEL_Z * Math.max(0, demandStdDev) * Math.sqrt(lt))
  const reorderPoint = Math.ceil(avgDailyDemand * lt + safetyStock)
  return { safetyStock, reorderPoint }
}

/**
 * A partir de la serie de demanda diaria (una fila por producto-día con
 * venta, incluyendo días sin venta como ceros vía daysCovered) y los datos
 * maestros, calcula sugerencias de compra para cada producto.
 *
 * @param demandRows   filas (productId, cantidad) por día con ventas
 * @param daysCovered  número de días del período (p.ej. 90) — los días sin
 *                     ventas cuentan como demanda 0
 * @param products     datos maestros por producto
 */
export function buildReorderSuggestions(
  demandRows: DailyDemandRow[],
  daysCovered: number,
  products: ReorderInput[],
): ReorderSuggestion[] {
  // Agrupar por producto
  const byProduct = new Map<number, number[]>()
  for (const row of demandRows) {
    let arr = byProduct.get(row.productId)
    if (!arr) byProduct.set(row.productId, (arr = []))
    arr.push(row.quantity)
  }

  return products.map((product) => {
    const sales = byProduct.get(product.productId) ?? []
    const totalSold = sales.reduce((s, q) => s + q, 0)
    const period = Math.max(1, daysCovered)
    const avgDailyDemand = totalSold / period

    // σ muestral sobre `period` días: los días SIN venta cuentan como 0.
    // Σx² se calcula solo con los días que tuvieron venta.
    const sumSq = sales.reduce((s, q) => s + q * q, 0)
    const variance = Math.max(0, sumSq / period - avgDailyDemand * avgDailyDemand)
    const demandStdDev = Math.sqrt(variance)

    const { safetyStock, reorderPoint } = calcReorderPoint(
      avgDailyDemand,
      demandStdDev,
      product.leadTimeDays,
    )

    const needsReorder = product.currentStock <= reorderPoint || product.currentStock <= product.minStock
    // Sugerencia: llegar a ROP + un ciclo de cobertura (leadTime de demanda extra)
    const target = reorderPoint + avgDailyDemand * product.leadTimeDays
    const suggestedQty = needsReorder ? Math.max(1, Math.ceil(target - product.currentStock)) : 0

    return {
      ...product,
      avgDailyDemand: Math.round(avgDailyDemand * 1000) / 1000,
      demandStdDev: Math.round(demandStdDev * 1000) / 1000,
      safetyStock,
      reorderPoint,
      suggestedQty,
    }
  }).filter((s) => s.suggestedQty > 0)
}

// ── Clasificación ABC ────────────────────────────────────────────

export interface AbcRow {
  productId: number
  name: string
  revenue: number // ingreso total en el período (COP)
}

export interface AbcClassification extends AbcRow {
  class: 'A' | 'B' | 'C'
  revenueSharePct: number // % del total que representa este producto
  cumulativePct: number // % acumulado hasta este producto (orden descendente)
  cycleCountFrequency: string
}

/**
 * Análisis ABC por valor (ingreso): A ≈ productos que concentran el primer
 * 80% del valor acumulado, B hasta 95%, C el resto. Frecuencia de conteo
 * cíclico recomendada: A mensual, B trimestral, C semestral.
 */
export function classifyAbc(rows: AbcRow[]): AbcClassification[] {
  const total = rows.reduce((s, r) => s + r.revenue, 0)
  if (total === 0) return []

  let cumulative = 0
  return [...rows]
    .sort((a, b) => b.revenue - a.revenue)
    .map((row) => {
      cumulative += row.revenue
      const cumulativePct = Math.round((cumulative / total) * 10000) / 100
      const cls: 'A' | 'B' | 'C' = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C'
      return {
        ...row,
        class: cls,
        revenueSharePct: Math.round((row.revenue / total) * 10000) / 100,
        cumulativePct,
        cycleCountFrequency:
          cls === 'A' ? 'Mensual' : cls === 'B' ? 'Trimestral' : 'Semestral',
      }
    })
}
