// ─── Plantilla .xlsx para el importador masivo de productos ────────────────
// Se genera en el navegador (botón "Descargar plantilla" del diálogo de
// importación). Usa los mismos primitivos de SheetJS que src/lib/export-excel.ts,
// pero con dos hojas (Productos + Instrucciones), por lo que va en su propio
// helper. Debe ser .xlsx: un CSV no admite varias hojas.

import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/constants'
import { PRODUCT_IMPORT_COLUMNS, TEMPLATE_HEADERS } from '@/lib/product-import-columns'
import * as XLSX from 'xlsx'

type Cell = string | number

// Fila de ejemplo declarada por `field`; se ordena luego según TEMPLATE_HEADERS.
function rowFromFields(values: Record<string, Cell>): Cell[] {
  return PRODUCT_IMPORT_COLUMNS.map((c) => values[c.field] ?? '')
}

const EXAMPLE_FULL: Record<string, Cell> = {
  name: 'Coca-Cola 400ml',
  salePrice: 3000,
  sku: 'CC-400',
  barcode: '7702004003404',
  description: 'Gaseosa personal 400 ml',
  categoryName: 'Bebidas',
  providerName: 'Distribuidora XYZ',
  taxRateName: 'IVA 19%',
  unitLabel: 'UND',
  costPrice: 2200,
  commission: 10,
  currentStock: 48,
  minStock: 12,
  trackInventory: 'Sí',
  trackExpiration: 'No',
  isActive: 'Sí',
  // Presentación 1 completa
  pres1_name: 'Six-pack',
  pres1_unitLabel: 'PAQ',
  pres1_unitsPerPack: 6,
  pres1_salePrice: 16500,
  pres1_costPrice: 12600,
  pres1_barcode: '7702004003411',
  // Presentación 2 (mínima: nombre + unidades + precio venta)
  pres2_name: 'Canasta',
  pres2_unitLabel: 'CAJ',
  pres2_unitsPerPack: 30,
  pres2_salePrice: 78000,
}

const EXAMPLE_MINIMAL: Record<string, Cell> = {
  name: 'Empanada de carne',
  salePrice: 2500,
  categoryName: 'Comidas',
  unitLabel: 'UND',
  trackInventory: 'No',
}

function buildInstructionsLines(): string[] {
  const lines: string[] = [
    'PLANTILLA DE IMPORTACIÓN DE PRODUCTOS',
    '',
    'La hoja "Productos" contiene tus datos. Borra las filas de ejemplo antes de importar.',
    'Solo se procesa la primera hoja. Esta hoja "Instrucciones" se ignora.',
    '',
    'OBLIGATORIAS:',
    '  • Nombre — único por tienda.',
    '  • Precio Venta — mayor a 0.',
    '',
    'FORMATO:',
    '  • Precios en pesos colombianos, sin símbolo $ ni separador de miles (ej. 3000, no $3.000).',
    '    Se redondean a números enteros.',
    '  • Stock y Stock Mínimo admiten hasta 3 decimales.',
    '  • Categoría y Proveedor: si no existen, se crean automáticamente por nombre.',
    '  • Impuesto: debe existir previamente. Se busca por nombre o por código',
    '    (ej. "IVA 19%" o "IVA19"). Nunca se crea automáticamente.',
    '  • Activo / Maneja Inventario / Maneja Vencimiento: escribe "Sí" o "No".',
    '    Por defecto: Activo = Sí, Maneja Inventario = Sí, Maneja Vencimiento = No.',
    '  • Unidad de Medida: usa el código (UND, KG, CAJ…) o el nombre (Unidad, Kilogramo, Caja).',
    '    Si va vacía o no se reconoce, se usa UND.',
    '',
    'PRESENTACIONES ADICIONALES (máximo 2 por producto):',
    '  • Llena "Presentación N Nombre", "Presentación N Unidades por Empaque" y',
    '    "Presentación N Precio Venta" para crear el bloque N.',
    '  • Comparten el mismo stock del producto base (se convierte con "Unidades por Empaque").',
    '  • Si llenas un bloque a medias, se omite la fila completa y se informa el motivo.',
    '',
    'LÍMITES: máximo 1.000 filas por archivo, tamaño máximo 5 MB.',
    '',
    'CÓDIGOS DE UNIDAD DE MEDIDA VÁLIDOS (código = nombre):',
  ]
  for (const u of UNIT_OF_MEASURE_OPTIONS) {
    lines.push(`  ${u.value} = ${u.label}`)
  }
  return lines
}

/** Construye el workbook de la plantilla (puro, sin I/O — testeable en node). */
export function buildProductImportTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const productos = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    rowFromFields(EXAMPLE_FULL),
    rowFromFields(EXAMPLE_MINIMAL),
  ])
  productos['!cols'] = PRODUCT_IMPORT_COLUMNS.map((c) => ({ wch: Math.max(12, c.header.length + 2) }))
  XLSX.utils.book_append_sheet(wb, productos, 'Productos')

  const instrucciones = XLSX.utils.aoa_to_sheet(buildInstructionsLines().map((l) => [l]))
  instrucciones['!cols'] = [{ wch: 92 }]
  XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones')

  return wb
}

/** Descarga `plantilla-productos.xlsx`. Llamar solo desde un handler de UI. */
export function downloadProductImportTemplate(): void {
  XLSX.writeFile(buildProductImportTemplateWorkbook(), 'plantilla-productos.xlsx')
}
