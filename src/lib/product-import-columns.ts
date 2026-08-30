// ─── Catálogo de columnas del importador de productos por Excel ─────────────
// Fuente ÚNICA de verdad para tres consumidores:
//   1. src/app/api/products/import/route.ts  → construye su COLUMN_MAP
//   2. src/lib/product-import-template.ts     → encabezados de la plantilla
//   3. src/components/products/import-products-dialog.tsx → lista en pantalla
// Es data pura (sin React, sin Prisma, sin `server-only`) para que compile
// igual en el bundle de Node y en el del navegador.

export type ImportFieldGroup = 'required' | 'product' | 'presentation'

export interface ImportColumn {
  /** Encabezado canónico tal como se escribe en la plantilla. */
  header: string
  /** Campo interno al que se mapea. */
  field: string
  group: ImportFieldGroup
  /** Alias aceptados (además del header canónico). Se normalizan igual. */
  aliases: string[]
  kind: 'string' | 'number' | 'boolean'
  /** Nota corta para la UI / plantilla. */
  note?: string
}

// Quita tildes/diacríticos: "Descripción" → "Descripcion"
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeKey(s: string): string {
  return stripAccents(s).toLowerCase().trim()
}

// ─── Grupo A: obligatorias ─────────────────────────────────────────────────
const REQUIRED_COLUMNS: ImportColumn[] = [
  {
    header: 'Nombre',
    field: 'name',
    group: 'required',
    aliases: ['producto', 'name'],
    kind: 'string',
    note: 'Obligatorio. Único por tienda.',
  },
  {
    header: 'Precio Venta',
    field: 'salePrice',
    group: 'required',
    aliases: ['precio', 'precio de venta'],
    kind: 'number',
    note: 'Obligatorio. Entero en pesos, sin $ ni separador de miles. Mayor a 0.',
  },
]

// ─── Grupo B: opcionales del producto ──────────────────────────────────────
const PRODUCT_COLUMNS: ImportColumn[] = [
  { header: 'SKU', field: 'sku', group: 'product', aliases: ['codigo sku'], kind: 'string' },
  {
    header: 'Código de Barras',
    field: 'barcode',
    group: 'product',
    aliases: ['cod barras', 'barcode', 'ean'],
    kind: 'string',
    note: 'Código de barras del producto (unidad base).',
  },
  {
    header: 'Descripción',
    field: 'description',
    group: 'product',
    aliases: ['descripcion corta'],
    kind: 'string',
  },
  {
    header: 'Categoría',
    field: 'categoryName',
    group: 'product',
    aliases: [],
    kind: 'string',
    note: 'Se crea automáticamente si no existe (por nombre).',
  },
  {
    header: 'Proveedor',
    field: 'providerName',
    group: 'product',
    aliases: [],
    kind: 'string',
    note: 'Se crea automáticamente si no existe (por nombre).',
  },
  {
    header: 'Impuesto',
    field: 'taxRateName',
    group: 'product',
    aliases: ['tasa impuesto', 'iva'],
    kind: 'string',
    note: 'Debe existir previamente. Por nombre o código (ej. "IVA 19%" o "IVA19").',
  },
  {
    header: 'Unidad de Medida',
    field: 'unitLabel',
    group: 'product',
    aliases: ['unidad', 'medida', 'um'],
    kind: 'string',
    note: 'Código (UND, KG, CAJ, L…) o etiqueta (Kilogramo, Caja). Vacío o inválido → UND.',
  },
  { header: 'INVIMA', field: 'invima', group: 'product', aliases: ['registro invima'], kind: 'string' },
  {
    header: 'Precio Compra',
    field: 'costPrice',
    group: 'product',
    aliases: ['precio de compra', 'costo', 'precio costo'],
    kind: 'number',
    note: 'Entero en pesos. Por defecto 0.',
  },
  {
    header: 'Comisión',
    field: 'commission',
    group: 'product',
    aliases: ['% comision'],
    kind: 'number',
    note: 'Porcentaje entero, se limita a 0–100.',
  },
  {
    header: 'Stock',
    field: 'currentStock',
    group: 'product',
    aliases: ['stock actual', 'inventario', 'existencias'],
    kind: 'number',
    note: 'Cantidad inicial. Admite hasta 3 decimales.',
  },
  {
    header: 'Stock Mínimo',
    field: 'minStock',
    group: 'product',
    aliases: ['stock minimo', 'minimo stock'],
    kind: 'number',
    note: 'Por defecto 5.',
  },
  {
    header: 'Maneja Inventario',
    field: 'trackInventory',
    group: 'product',
    aliases: ['controla inventario', 'maneja stock'],
    kind: 'boolean',
    note: 'Sí / No. Por defecto Sí.',
  },
  {
    header: 'Maneja Vencimiento',
    field: 'trackExpiration',
    group: 'product',
    aliases: ['controla vencimiento', 'fecha de vencimiento'],
    kind: 'boolean',
    note: 'Sí / No. Por defecto No.',
  },
  {
    header: 'Activo',
    field: 'isActive',
    group: 'product',
    aliases: ['estado'],
    kind: 'boolean',
    note: 'Sí / No. Por defecto Sí.',
  },
  {
    header: 'Imagen URL',
    field: 'imgUrl',
    group: 'product',
    aliases: ['img url', 'imagen', 'url imagen'],
    kind: 'string',
  },
]

// ─── Grupo C: presentaciones adicionales (bloques 1 y 2) ────────────────────
export const PRESENTATION_BLOCKS = [1, 2] as const

function presentationColumns(n: number): ImportColumn[] {
  const p = `pres${n}_`
  const h = `Presentación ${n} `
  return [
    {
      header: `${h}Nombre`,
      field: `${p}name`,
      group: 'presentation',
      aliases: [],
      kind: 'string',
      note: 'Requerido si se usa el bloque. 1–100 caracteres.',
    },
    {
      header: `${h}Unidad`,
      field: `${p}unitLabel`,
      group: 'presentation',
      aliases: [],
      kind: 'string',
      note: 'Código o etiqueta. Vacío → UND.',
    },
    {
      header: `${h}Unidades por Empaque`,
      field: `${p}unitsPerPack`,
      group: 'presentation',
      aliases: [],
      kind: 'number',
      note: 'Requerido si se usa el bloque. Cuántas unidades base contiene (≥ 0.001).',
    },
    {
      header: `${h}Precio Venta`,
      field: `${p}salePrice`,
      group: 'presentation',
      aliases: [],
      kind: 'number',
      note: 'Requerido si se usa el bloque. Entero ≥ 1.',
    },
    {
      header: `${h}Precio Compra`,
      field: `${p}costPrice`,
      group: 'presentation',
      aliases: [],
      kind: 'number',
      note: 'Opcional. Entero ≥ 0, por defecto 0.',
    },
    {
      header: `${h}Código de Barras`,
      field: `${p}barcode`,
      group: 'presentation',
      aliases: [],
      kind: 'string',
      note: 'Opcional. Máx. 100 caracteres.',
    },
    {
      header: `${h}SKU`,
      field: `${p}sku`,
      group: 'presentation',
      aliases: [],
      kind: 'string',
      note: 'Opcional. Máx. 100 caracteres.',
    },
  ]
}

export const PRODUCT_IMPORT_COLUMNS: ImportColumn[] = [
  ...REQUIRED_COLUMNS,
  ...PRODUCT_COLUMNS,
  ...PRESENTATION_BLOCKS.flatMap((n) => presentationColumns(n)),
]

// Encabezados canónicos en orden (para la fila 1 de la plantilla).
export const TEMPLATE_HEADERS: string[] = PRODUCT_IMPORT_COLUMNS.map((c) => c.header)

// Campos que deben parsearse como número / booleano en el route.
export const NUMERIC_IMPORT_FIELDS: ReadonlySet<string> = new Set(
  PRODUCT_IMPORT_COLUMNS.filter((c) => c.kind === 'number').map((c) => c.field)
)
export const BOOLEAN_IMPORT_FIELDS: ReadonlySet<string> = new Set(
  PRODUCT_IMPORT_COLUMNS.filter((c) => c.kind === 'boolean').map((c) => c.field)
)

/**
 * Mapa `encabezado normalizado → campo interno`. Normaliza cada header canónico
 * y cada alias con `normalizeKey` (trim → minúsculas → sin tildes). Lanza si dos
 * entradas distintas chocan en la misma clave (error de autoría del catálogo).
 */
export function buildColumnMap(): Record<string, string> {
  const map: Record<string, string> = {}
  const add = (raw: string, field: string) => {
    const key = normalizeKey(raw)
    if (!key) return
    if (map[key] && map[key] !== field) {
      throw new Error(`[product-import-columns] clave duplicada "${key}": ${map[key]} vs ${field}`)
    }
    map[key] = field
  }
  for (const col of PRODUCT_IMPORT_COLUMNS) {
    add(col.header, col.field)
    for (const alias of col.aliases) add(alias, col.field)
  }
  return map
}
