import { describe, expect, it } from 'vitest'
import {
  buildProductPayload,
  emptyProductForm,
  profitMarginPct,
  suggestedSalePrice,
  validateProductForm,
  type PresentationFormRow,
  type ProductFormData,
} from '../product-form-math'

function form(over: Partial<ProductFormData> = {}): ProductFormData {
  return { ...emptyProductForm, name: 'Café', salePrice: '10000', ...over }
}

function presentation(over: Partial<PresentationFormRow> = {}): PresentationFormRow {
  return {
    key: 'k1', name: 'Six-pack', unitLabel: 'UND', barcode: '', sku: '',
    unitsPerPack: '6', salePrice: '55000', costPrice: '', isActive: true, ...over,
  }
}

describe('suggestedSalePrice', () => {
  it('applies the commission over the cost and rounds', () => {
    expect(suggestedSalePrice('1000', '25')).toBe(1250)
    expect(suggestedSalePrice('999', '10')).toBe(1099) // 1098.9 → 1099
  })
  it('returns null when cost or commission is missing / non-positive', () => {
    expect(suggestedSalePrice('', '10')).toBeNull()
    expect(suggestedSalePrice('1000', '0')).toBeNull()
    expect(suggestedSalePrice('0', '10')).toBeNull()
  })
})

describe('profitMarginPct', () => {
  it('is (sale - cost) / sale as a percentage', () => {
    expect(profitMarginPct('6000', '10000')).toBeCloseTo(40)
    expect(profitMarginPct('8000', '10000')).toBeCloseTo(20)
  })
  it('returns null unless both cost and sale are positive', () => {
    expect(profitMarginPct('0', '10000')).toBeNull()
    expect(profitMarginPct('6000', '')).toBeNull()
  })
})

describe('validateProductForm', () => {
  it('passes a well-formed product with no presentations', () => {
    expect(validateProductForm(form(), [])).toBeNull()
  })
  it('requires a name', () => {
    expect(validateProductForm(form({ name: '  ' }), [])).toMatch(/nombre/i)
  })
  it('requires a positive sale price', () => {
    expect(validateProductForm(form({ salePrice: '0' }), [])).toMatch(/precio de venta/i)
  })
  it('validates each presentation (name, unitsPerPack, price)', () => {
    expect(validateProductForm(form(), [presentation({ name: '' })])).toMatch(/nombre/i)
    expect(validateProductForm(form(), [presentation({ unitsPerPack: '0' })])).toMatch(/0\.001/)
    expect(validateProductForm(form(), [presentation({ salePrice: '0' })])).toMatch(/precio de venta/i)
  })
  it('rejects duplicate barcodes across the product and its presentations', () => {
    const err = validateProductForm(
      form({ barcode: '770111' }),
      [presentation({ barcode: '770111' })],
    )
    expect(err).toMatch(/repetidos/i)
  })
})

describe('buildProductPayload', () => {
  it('rounds prices to whole COP and clamps commission to 0–100', () => {
    const payload = buildProductPayload(
      form({ costPrice: '1234.7', salePrice: '9999.4', commission: '150' }),
      [],
      42,
    )
    expect(payload).toMatchObject({ storeId: 42, costPrice: 1235, salePrice: 9999, commission: 100 })
  })

  it('maps "none" selects to undefined and empty optionals to undefined/null', () => {
    const payload = buildProductPayload(form({ sku: '  ', barcode: '', imgUrl: '' }), [], 1)
    expect(payload.sku).toBeUndefined()
    expect(payload.barcode).toBeUndefined()
    expect(payload.categoryId).toBeUndefined()
    expect(payload.imgUrl).toBeNull()
  })

  it('serializes presentations with numeric unitsPerPack and rounded prices', () => {
    const payload = buildProductPayload(form(), [presentation({ unitsPerPack: '6', salePrice: '54999.6', costPrice: '30000.2' })], 1)
    expect(payload.presentations[0]).toMatchObject({ unitsPerPack: 6, salePrice: 55000, costPrice: 30000, name: 'Six-pack' })
  })

  it('defaults minStock to 5 when blank', () => {
    expect(buildProductPayload(form({ minStock: '' }), [], 1).minStock).toBe(5)
  })
})
