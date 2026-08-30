import { describe, expect, it } from 'vitest'
import { buildPresentations, parseBool, resolveUnitLabel } from '../product-import-row'

describe('parseBool', () => {
  it('reads Sí/No variants', () => {
    expect(parseBool('Sí', false)).toBe(true)
    expect(parseBool('si', false)).toBe(true)
    expect(parseBool('X', false)).toBe(true)
    expect(parseBool('1', false)).toBe(true)
    expect(parseBool('No', true)).toBe(false)
    expect(parseBool('0', true)).toBe(false)
    expect(parseBool('inactivo', true)).toBe(false)
  })
  it('falls back to the default when blank or unknown', () => {
    expect(parseBool('', true)).toBe(true)
    expect(parseBool('', false)).toBe(false)
    expect(parseBool(undefined, true)).toBe(true)
    expect(parseBool('tal vez', false)).toBe(false)
  })
})

describe('resolveUnitLabel', () => {
  it('blank → UND (valid)', () => {
    expect(resolveUnitLabel('')).toEqual({ code: 'UND', invalid: false })
    expect(resolveUnitLabel(undefined)).toEqual({ code: 'UND', invalid: false })
  })
  it('matches a code regardless of case', () => {
    expect(resolveUnitLabel('kg')).toEqual({ code: 'KG', invalid: false })
    expect(resolveUnitLabel('UND')).toEqual({ code: 'UND', invalid: false })
  })
  it('matches a label regardless of case/accents', () => {
    expect(resolveUnitLabel('Kilogramo')).toEqual({ code: 'KG', invalid: false })
    expect(resolveUnitLabel('caja')).toEqual({ code: 'CAJ', invalid: false })
    expect(resolveUnitLabel('porcion')).toEqual({ code: 'POR', invalid: false })
  })
  it('unknown → UND (invalid)', () => {
    expect(resolveUnitLabel('zzz')).toEqual({ code: 'UND', invalid: true })
  })
})

describe('buildPresentations', () => {
  it('returns nothing when no presentation column is filled', () => {
    const res = buildPresentations({ name: 'Café', salePrice: 3000 })
    expect(res).toEqual({ presentations: [], warnings: [], error: null })
  })

  it('builds one presentation from a complete block 1', () => {
    const res = buildPresentations({
      pres1_name: 'Six-pack',
      pres1_unitLabel: 'PAQ',
      pres1_unitsPerPack: 6,
      pres1_salePrice: 16500,
      pres1_costPrice: 12600,
      pres1_barcode: '7702004003411',
    })
    expect(res.error).toBeNull()
    expect(res.presentations).toEqual([
      {
        name: 'Six-pack',
        unitLabel: 'PAQ',
        barcode: '7702004003411',
        sku: null,
        unitsPerPack: 6,
        salePrice: 16500,
        costPrice: 12600,
        isActive: true,
      },
    ])
  })

  it('builds both blocks with sortOrder 0/1 downstream (array order)', () => {
    const res = buildPresentations({
      pres1_name: 'Six-pack',
      pres1_unitsPerPack: 6,
      pres1_salePrice: 16500,
      pres2_name: 'Canasta',
      pres2_unitsPerPack: 30,
      pres2_salePrice: 78000,
    })
    expect(res.error).toBeNull()
    expect(res.presentations.map((p) => p.name)).toEqual(['Six-pack', 'Canasta'])
    expect(res.presentations[1].costPrice).toBe(0)
  })

  it('rejects a block that has data but no name', () => {
    const res = buildPresentations({ pres1_unitsPerPack: 6, pres1_salePrice: 16500 })
    expect(res.error).toMatch(/Presentación 1/)
    expect(res.presentations).toEqual([])
  })

  it('rejects unitsPerPack below 0.001', () => {
    const res = buildPresentations({ pres1_name: 'X', pres1_unitsPerPack: 0, pres1_salePrice: 1000 })
    expect(res.error).toMatch(/Unidades por Empaque/)
  })

  it('rejects a missing / non-positive sale price', () => {
    expect(buildPresentations({ pres1_name: 'X', pres1_unitsPerPack: 6 }).error).toMatch(/Precio Venta/)
    expect(
      buildPresentations({ pres1_name: 'X', pres1_unitsPerPack: 6, pres1_salePrice: 0 }).error
    ).toMatch(/Precio Venta/)
  })

  it('rejects a negative cost price', () => {
    const res = buildPresentations({
      pres1_name: 'X',
      pres1_unitsPerPack: 6,
      pres1_salePrice: 1000,
      pres1_costPrice: -5,
    })
    expect(res.error).toMatch(/Precio Compra/)
  })

  it('warns (does not fail) on an unrecognized presentation unit', () => {
    const res = buildPresentations({
      pres1_name: 'X',
      pres1_unitLabel: 'zzz',
      pres1_unitsPerPack: 6,
      pres1_salePrice: 1000,
    })
    expect(res.error).toBeNull()
    expect(res.warnings[0]).toMatch(/no reconocida/)
    expect(res.presentations[0].unitLabel).toBe('UND')
  })
})
