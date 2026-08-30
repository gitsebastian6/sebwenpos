import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { UNIT_OF_MEASURE_OPTIONS } from '../constants'
import { TEMPLATE_HEADERS } from '../product-import-columns'
import { buildProductImportTemplateWorkbook } from '../product-import-template'

describe('buildProductImportTemplateWorkbook', () => {
  const wb = buildProductImportTemplateWorkbook()

  it('has a Productos sheet and an Instrucciones sheet', () => {
    expect(wb.SheetNames).toEqual(['Productos', 'Instrucciones'])
  })

  it('row 1 of Productos is exactly the canonical header list', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Productos'], { header: 1 })
    expect(rows[0]).toEqual(TEMPLATE_HEADERS)
  })

  it('ships two example rows aligned to the headers', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Productos'])
    expect(rows).toHaveLength(2)
    expect(rows[0]['Nombre']).toBe('Coca-Cola 400ml')
    expect(rows[0]['Presentación 1 Nombre']).toBe('Six-pack')
    expect(rows[0]['Presentación 2 Precio Venta']).toBe(78000)
    expect(rows[1]['Nombre']).toBe('Empanada de carne')
  })

  it('lists every valid unit-of-measure code in the Instrucciones sheet', () => {
    const text = XLSX.utils
      .sheet_to_json<string[]>(wb.Sheets['Instrucciones'], { header: 1 })
      .flat()
      .join('\n')
    for (const u of UNIT_OF_MEASURE_OPTIONS) {
      expect(text).toContain(`${u.value} = ${u.label}`)
    }
  })
})
