import { describe, it, expect } from 'vitest'
import { sortPresentationOptions } from '../product-presentations'
import type { ProductPresentation } from '@/types'

function pres(overrides: Partial<ProductPresentation>): ProductPresentation {
  return {
    id: 1,
    productId: 99,
    name: 'Presentación',
    unitLabel: 'UND',
    barcode: null,
    sku: null,
    unitsPerPack: 1,
    salePrice: 100,
    costPrice: 0,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  }
}

const base = {
  name: 'Producto Base',
  unitLabel: 'UND',
  salePrice: 1200,
}

describe('sortPresentationOptions', () => {
  it('devuelve solo la fila base cuando el producto no tiene presentaciones', () => {
    const rows = sortPresentationOptions(base)
    expect(rows).toHaveLength(1)
    expect(rows[0].presentation).toBeNull()
    expect(rows[0].unitsPerPack).toBe(1)
  })

  it('ordena de menor a mayor precio de venta aunque la registrada primero sea la más cara', () => {
    const global = pres({ id: 1, name: 'Global', unitsPerPack: 24, salePrice: 24000, sortOrder: 0 })
    const intermedia = pres({ id: 2, name: 'Intermedia', unitsPerPack: 12, salePrice: 13000, sortOrder: 1 })
    const rows = sortPresentationOptions({ ...base, presentations: [global, intermedia] })
    expect(rows.map((r) => r.name)).toEqual(['Producto Base', 'Intermedia', 'Global'])
    expect(rows.map((r) => r.unitsPerPack)).toEqual([1, 12, 24])
  })

  it('el precio manda sobre el tamaño: una presentación grande más barata va antes', () => {
    // Caja x24 más barata en valor absoluto que la fracción más pequeña.
    const minima = pres({ id: 1, name: 'Mínima', unitsPerPack: 0.5, salePrice: 25000 })
    const caja = pres({ id: 2, name: 'Caja x24', unitsPerPack: 24, salePrice: 24000 })
    const rows = sortPresentationOptions({ ...base, presentations: [minima, caja] })
    expect(rows.map((r) => r.name)).toEqual(['Producto Base', 'Caja x24', 'Mínima'])
  })

  it('deja las presentaciones fraccionarias (<1 unidad base) antes que la base', () => {
    const minima = pres({ id: 1, name: 'Mínima', unitsPerPack: 0.25, salePrice: 400, sortOrder: 0 })
    const intermedia = pres({ id: 2, name: 'Intermedia', unitsPerPack: 0.5, salePrice: 700, sortOrder: 1 })
    const rows = sortPresentationOptions({ ...base, presentations: [minima, intermedia] })
    expect(rows.map((r) => r.name)).toEqual(['Mínima', 'Intermedia', 'Producto Base'])
  })

  it('excluye presentaciones inactivas', () => {
    const activa = pres({ id: 1, name: 'Caja x24', unitsPerPack: 24, salePrice: 24000 })
    const inactiva = pres({ id: 2, name: 'Six-pack (oculta)', unitsPerPack: 6, isActive: false })
    const rows = sortPresentationOptions({ ...base, presentations: [inactiva, activa] })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.name)).toEqual(['Producto Base', 'Caja x24'])
  })

  it('en empates de precio gana la de menor tamaño', () => {
    const caja = pres({ id: 1, name: 'Caja x24', unitsPerPack: 24, salePrice: 100 })
    const six = pres({ id: 2, name: 'Six-pack', unitsPerPack: 6, salePrice: 100 })
    const rows = sortPresentationOptions({ ...base, presentations: [caja, six] })
    expect(rows.map((r) => r.presentation?.id ?? null)).toEqual([2, 1, null])
  })

  it('mantiene el orden previo en empates de precio y de tamaño (sort estable)', () => {
    const a = pres({ id: 1, name: 'Pack A', unitsPerPack: 6, salePrice: 100, sortOrder: 0 })
    const b = pres({ id: 2, name: 'Pack B', unitsPerPack: 6, salePrice: 100, sortOrder: 1 })
    const rows = sortPresentationOptions({ ...base, presentations: [a, b] })
    expect(rows.map((r) => r.presentation?.id ?? null)).toEqual([1, 2, null])
  })

  it('coerciona unitsPerPack y salePrice recibidos como string (Decimal de Prisma)', () => {
    const caja = pres({ id: 1, name: 'Caja', unitsPerPack: '24' as unknown as number, salePrice: '24000' as unknown as number })
    const rows = sortPresentationOptions({ ...base, presentations: [caja] })
    expect(rows[1].unitsPerPack).toBe(24)
    expect(rows[1].salePrice).toBe(24000)
    expect(rows.map((r) => r.salePrice)).toEqual([1200, 24000])
  })

  it('acepta presentaciones sin campo isActive (API pública del storefront) y las incluye', () => {
    const sinFlag = { id: 1, name: 'Caja x24', unitLabel: 'UND', unitsPerPack: 24, salePrice: 24000 }
    const rows = sortPresentationOptions({ ...base, presentations: [sinFlag] })
    expect(rows).toHaveLength(2)
    expect(rows[1].presentation?.id).toBe(1)
  })

  it('preserva la referencia a la presentación para agregarla al carrito', () => {
    const sixPack = pres({ id: 7, name: 'Six-pack', unitsPerPack: 6, salePrice: 6500 })
    const rows = sortPresentationOptions({ ...base, presentations: [sixPack] })
    expect(rows[1].presentation).toBe(sixPack)
  })
})