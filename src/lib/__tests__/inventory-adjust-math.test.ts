import { describe, expect, it } from 'vitest'
import {
  currentInPresentation,
  presentationUnitsPerPack,
  resolveBaseDelta,
  toBaseUnits,
  validateAdjust,
} from '../inventory-adjust-math'

describe('presentationUnitsPerPack', () => {
  const pres = [
    { id: 1, unitsPerPack: 6 },
    { id: 2, unitsPerPack: '24' }, // Prisma puede serializar Decimal como string
  ]
  it('base ("Unidad") → 1', () => {
    expect(presentationUnitsPerPack(pres, null)).toBe(1)
    expect(presentationUnitsPerPack(pres, undefined)).toBe(1)
  })
  it('presentación → su unitsPerPack', () => {
    expect(presentationUnitsPerPack(pres, 1)).toBe(6)
    expect(presentationUnitsPerPack(pres, 2)).toBe(24)
  })
  it('id desconocido → 1', () => {
    expect(presentationUnitsPerPack(pres, 99)).toBe(1)
    expect(presentationUnitsPerPack(undefined, 1)).toBe(1)
  })
})

describe('toBaseUnits / currentInPresentation', () => {
  it('toBaseUnits multiplica y redondea a 3 decimales', () => {
    expect(toBaseUnits(3, 6)).toBe(18)
    expect(toBaseUnits(0.333, 3)).toBe(0.999)
  })
  it('currentInPresentation NO pisa (bug histórico del floor)', () => {
    expect(currentInPresentation(25, 6)).toBe(4.167)
    expect(currentInPresentation(24, 6)).toBe(4)
    expect(currentInPresentation(0.5, 1)).toBe(0.5)
  })
})

describe('resolveBaseDelta', () => {
  it('delta → qty (±) × unitsPerPack', () => {
    expect(resolveBaseDelta({ mode: 'delta', qty: 3, unitsPerPack: 6, currentStock: 10 })).toBe(18)
    expect(resolveBaseDelta({ mode: 'delta', qty: -2, unitsPerPack: 6, currentStock: 20 })).toBe(-12)
  })
  it('absolute → (qty × unitsPerPack) − currentStock', () => {
    // El bug histórico: stock 25, "4 six-packs" en modo establecer → −1
    expect(resolveBaseDelta({ mode: 'absolute', qty: 4, unitsPerPack: 6, currentStock: 25 })).toBe(-1)
    // "5 six-packs" con stock 25 → +5
    expect(resolveBaseDelta({ mode: 'absolute', qty: 5, unitsPerPack: 6, currentStock: 25 })).toBe(5)
    // Base: establecer 30 con stock 25 → +5
    expect(resolveBaseDelta({ mode: 'absolute', qty: 30, unitsPerPack: 1, currentStock: 25 })).toBe(5)
  })
})

describe('validateAdjust', () => {
  const base = { unitsPerPack: 1, currentStock: 10 }
  it('rechaza cantidad no numérica', () => {
    expect(validateAdjust({ ...base, mode: 'delta', qty: NaN })).toMatch(/número/)
  })
  it('absolute no acepta negativos', () => {
    expect(validateAdjust({ ...base, mode: 'absolute', qty: -1 })).toMatch(/negativa/)
  })
  it('delta 0 → sin cambio', () => {
    expect(validateAdjust({ ...base, mode: 'delta', qty: 0 })).toMatch(/agregar o quitar/)
  })
  it('absolute al mismo valor → sin cambio', () => {
    expect(validateAdjust({ ...base, mode: 'absolute', qty: 10 })).toMatch(/No hay cambio/)
  })
  it('no deja el stock resultante bajo 0', () => {
    expect(validateAdjust({ ...base, mode: 'delta', qty: -15 })).toMatch(/menor a 0/)
  })
  it('entrada válida → null', () => {
    expect(validateAdjust({ ...base, mode: 'delta', qty: 5 })).toBeNull()
    expect(validateAdjust({ ...base, mode: 'absolute', qty: 3 })).toBeNull()
  })
})
