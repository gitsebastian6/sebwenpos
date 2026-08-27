import { describe, it, expect } from 'vitest'
import {
  calcReorderPoint,
  buildReorderSuggestions,
  classifyAbc,
} from '../analytics'

// ── Punto de reorden (Vidal) ─────────────────────────────────────

describe('calcReorderPoint', () => {
  it('ROP = demanda × leadTime cuando σ = 0', () => {
    const { safetyStock, reorderPoint } = calcReorderPoint(10, 0, 7)
    expect(safetyStock).toBe(0)
    expect(reorderPoint).toBe(70)
  })

  it('incluye stock de seguridad con demanda variable: SS = 1.65·σ·√LT', () => {
    // SS = 1.65 * 4 * sqrt(9) = 1.65*4*3 = 19.8 → ceil 20
    const { safetyStock, reorderPoint } = calcReorderPoint(5, 4, 9)
    expect(safetyStock).toBe(20)
    expect(reorderPoint).toBe(45 + 20)
  })

  it('leadTime mínimo de 1 día', () => {
    const { reorderPoint } = calcReorderPoint(10, 0, 0)
    expect(reorderPoint).toBe(10)
  })
})

describe('buildReorderSuggestions', () => {
  it('sugiere compra solo para productos bajo el ROP o minStock', () => {
    // Producto 1: vende 100 uds en 90 días ≈ 1.11/día; ROP con LT=7 ≈ 8
    const demandRows = [{ productId: 1, quantity: 100 }]
    const suggestions = buildReorderSuggestions(
      demandRows,
      90,
      [
        { productId: 1, currentStock: 2, minStock: 5, leadTimeDays: 7 },
        { productId: 2, currentStock: 500, minStock: 5, leadTimeDays: 7 },
      ],
    )
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].productId).toBe(1)
    expect(suggestions[0].suggestedQty).toBeGreaterThan(0)
  })

  it('producto sin ventas usa demanda 0 y solo sugiere si está bajo minStock', () => {
    const suggestions = buildReorderSuggestions(
      [],
      90,
      [{ productId: 1, currentStock: 2, minStock: 5, leadTimeDays: 7 }],
    )
    expect(suggestions[0].avgDailyDemand).toBe(0)
    expect(suggestions[0].reorderPoint).toBeGreaterThanOrEqual(0)
    expect(suggestions[0].suggestedQty).toBeGreaterThan(0)
  })
})

// ── Clasificación ABC ────────────────────────────────────────────

describe('classifyAbc', () => {
  it('clasifica A/B/C por valor acumulado 80/95', () => {
    const rows = [
      { productId: 1, name: 'P1', revenue: 800 }, // 80%
      { productId: 2, name: 'P2', revenue: 150 }, // acumulado 95%
      { productId: 3, name: 'P3', revenue: 50 }, // resto
    ]
    const result = classifyAbc(rows)
    expect(result.map((r) => r.class)).toEqual(['A', 'B', 'C'])
    expect(result[0].cycleCountFrequency).toBe('Mensual')
    expect(result[2].cycleCountFrequency).toBe('Semestral')
    // Orden descendente por ingreso
    expect(result[0].revenue).toBe(800)
  })

  it('devuelve vacío si no hay ingresos', () => {
    expect(classifyAbc([{ productId: 1, name: 'X', revenue: 0 }])).toEqual([])
  })
})
