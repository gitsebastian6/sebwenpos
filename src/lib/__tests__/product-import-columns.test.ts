import { describe, expect, it } from 'vitest'
import {
  PRODUCT_IMPORT_COLUMNS,
  NUMERIC_IMPORT_FIELDS,
  BOOLEAN_IMPORT_FIELDS,
  TEMPLATE_HEADERS,
  buildColumnMap,
  stripAccents,
} from '../product-import-columns'

describe('stripAccents', () => {
  it('removes diacritics', () => {
    expect(stripAccents('Descripción')).toBe('Descripcion')
    expect(stripAccents('Comisión')).toBe('Comision')
    expect(stripAccents('Presentación 1 Código de Barras')).toBe('Presentacion 1 Codigo de Barras')
  })
})

describe('PRODUCT_IMPORT_COLUMNS / TEMPLATE_HEADERS', () => {
  it('has the full 32-column catalog', () => {
    expect(PRODUCT_IMPORT_COLUMNS).toHaveLength(32)
    expect(TEMPLATE_HEADERS).toHaveLength(32)
  })

  it('has no duplicate internal field names', () => {
    const fields = PRODUCT_IMPORT_COLUMNS.map((c) => c.field)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('splits fields into numeric / boolean / string kinds', () => {
    expect(NUMERIC_IMPORT_FIELDS.has('salePrice')).toBe(true)
    expect(NUMERIC_IMPORT_FIELDS.has('pres1_unitsPerPack')).toBe(true)
    expect(NUMERIC_IMPORT_FIELDS.has('pres2_salePrice')).toBe(true)
    expect(BOOLEAN_IMPORT_FIELDS.has('isActive')).toBe(true)
    expect(BOOLEAN_IMPORT_FIELDS.has('trackInventory')).toBe(true)
    expect(BOOLEAN_IMPORT_FIELDS.has('trackExpiration')).toBe(true)
    expect(NUMERIC_IMPORT_FIELDS.has('name')).toBe(false)
    expect(BOOLEAN_IMPORT_FIELDS.has('name')).toBe(false)
  })
})

describe('buildColumnMap', () => {
  const map = buildColumnMap()

  it('does not throw on catalog authoring conflicts', () => {
    expect(() => buildColumnMap()).not.toThrow()
  })

  it('resolves every canonical header (normalized) to its field', () => {
    for (const col of PRODUCT_IMPORT_COLUMNS) {
      const key = stripAccents(col.header).toLowerCase().trim()
      expect(map[key]).toBe(col.field)
    }
  })

  it('resolves aliases and legacy spellings', () => {
    expect(map['producto']).toBe('name')
    expect(map['precio']).toBe('salePrice')
    expect(map['precio de venta']).toBe('salePrice')
    expect(map['costo']).toBe('costPrice')
    expect(map['ean']).toBe('barcode')
    expect(map['cod barras']).toBe('barcode')
    expect(map['unidad']).toBe('unitLabel')
    expect(map['um']).toBe('unitLabel')
    expect(map['iva']).toBe('taxRateName')
    expect(map['estado']).toBe('isActive')
    expect(map['existencias']).toBe('currentStock')
    expect(map['maneja stock']).toBe('trackInventory')
  })

  it('matches headers case- and accent-insensitively (as the route normalizes them)', () => {
    const norm = (h: string) => stripAccents(h).trim().toLowerCase()
    expect(map[norm('  CATEGORÍA ')]).toBe('categoryName')
    expect(map[norm('Descripción')]).toBe('description')
    expect(map[norm('Presentación 2 Precio Venta')]).toBe('pres2_salePrice')
  })
})
