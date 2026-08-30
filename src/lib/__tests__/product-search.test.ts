import { describe, it, expect } from 'vitest'
import { resolveScannedCode } from '../product-search'

type P = {
  id: number
  name: string
  sku?: string | null
  barcode?: string | null
  presentations?: Array<{ id: number; name: string; sku?: string | null; barcode?: string | null; isActive?: boolean }> | null
}

const catalog: P[] = [
  { id: 1, name: 'Coca-Cola 400ml', sku: 'COKE-400', barcode: '7702004003508' },
  {
    id: 2,
    name: 'Agua Cristal 600ml',
    sku: 'AGUA-600',
    barcode: '7702090000000',
    presentations: [
      { id: 20, name: 'Six-pack', sku: 'AGUA-6PK', barcode: '7702090000017', isActive: true },
      { id: 21, name: 'Caja x24', sku: 'AGUA-24', barcode: '7702090000024', isActive: false },
    ],
  },
  { id: 3, name: 'Sin códigos', sku: null, barcode: null },
]

describe('resolveScannedCode', () => {
  it('matches a product by exact barcode', () => {
    const { exact, ambiguous } = resolveScannedCode(catalog, '7702004003508')
    expect(ambiguous).toBe(false)
    expect(exact?.product.id).toBe(1)
    expect(exact?.presentation).toBeNull()
  })

  it('matches a product by exact SKU, case-insensitively', () => {
    const { exact } = resolveScannedCode(catalog, 'coke-400')
    expect(exact?.product.id).toBe(1)
  })

  it('matches an active presentation by barcode', () => {
    const { exact } = resolveScannedCode(catalog, '7702090000017')
    expect(exact?.product.id).toBe(2)
    expect(exact?.presentation?.id).toBe(20)
  })

  it('ignores inactive presentations', () => {
    const { exact } = resolveScannedCode(catalog, '7702090000024')
    expect(exact).toBeNull()
  })

  it('returns no match for an unknown code', () => {
    const { exact, ambiguous } = resolveScannedCode(catalog, '0000000000000')
    expect(exact).toBeNull()
    expect(ambiguous).toBe(false)
  })

  it('flags ambiguity when the same code matches two products', () => {
    const dup: P[] = [
      { id: 1, name: 'A', barcode: 'DUP1' },
      { id: 2, name: 'B', barcode: 'dup1' },
    ]
    const { exact, ambiguous } = resolveScannedCode(dup, 'DUP1')
    expect(exact).toBeNull()
    expect(ambiguous).toBe(true)
  })

  it('does not match on empty/whitespace codes', () => {
    expect(resolveScannedCode(catalog, '   ').exact).toBeNull()
    expect(resolveScannedCode(catalog, '').exact).toBeNull()
  })

  it('does not treat null sku/barcode as a match for an empty-ish code', () => {
    const { exact } = resolveScannedCode(catalog, 'null')
    expect(exact).toBeNull()
  })
})
