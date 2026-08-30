import { requireAuthStoreId } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  BOOLEAN_IMPORT_FIELDS,
  NUMERIC_IMPORT_FIELDS,
  buildColumnMap,
  stripAccents,
} from '@/lib/product-import-columns'
import { buildPresentations, parseBool, resolveUnitLabel } from '@/lib/product-import-row'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

// Encabezado normalizado (trim → minúsculas → sin tildes) → campo interno.
// El catálogo completo de columnas vive en src/lib/product-import-columns.ts
const COLUMN_MAP = buildColumnMap()

interface ExcelRow {
  sku?: string
  name?: string
  barcode?: string
  description?: string
  categoryName?: string
  providerName?: string
  taxRateName?: string
  invima?: string
  unitLabel?: string
  costPrice?: number
  salePrice?: number
  commission?: number
  currentStock?: number
  minStock?: number
  trackInventory?: string
  trackExpiration?: string
  isActive?: string
  imgUrl?: string
  // Columnas de presentaciones adicionales ("pres1_*" / "pres2_*"): numéricas
  // ya parseadas a number, de texto como string.
  [key: string]: string | number | undefined
}

// ─── Normalize column header ────────────────────────────────────────────────
function normalizeHeader(header: string): string {
  const key = stripAccents(header).trim().toLowerCase()
  return COLUMN_MAP[key] || ''
}

// ─── Parse an Excel row into our internal format ────────────────────────────
function parseRow(raw: Record<string, unknown>): ExcelRow | null {
  const mapped: ExcelRow = {}

  for (const [header, value] of Object.entries(raw)) {
    const field = normalizeHeader(header)
    if (!field) continue

    const strVal = String(value ?? '').trim()
    if (field === 'name') {
      if (!strVal) return null // name is required
      mapped.name = strVal
    } else if (BOOLEAN_IMPORT_FIELDS.has(field)) {
      mapped[field] = strVal
    } else if (NUMERIC_IMPORT_FIELDS.has(field)) {
      const numVal = parseFloat(strVal.replace(/[,$\s]/g, ''))
      if (!isNaN(numVal)) {
        // Precisión QTY_PRECISION=3 (0.001) para stock/cantidades; precios se redondean a COP entero al crear
        mapped[field] = Math.round(numVal * 1000) / 1000
      }
    } else if (strVal) {
      mapped[field] = strVal
    }
  }

  return mapped.name ? mapped : null
}

// ─── Parse "activo" field ───────────────────────────────────────────────────
function parseActive(val: string | undefined): boolean {
  if (!val) return true
  const v = val.trim().toLowerCase()
  if (['si', 'sí', 's', 'yes', 'y', 'true', '1', 'activo', 'activa', 'x'].includes(v)) return true
  if (['no', 'n', 'false', '0', 'inactivo', 'inactiva', ''].includes(v)) return false
  return true // default to active
}

// ─── POST /api/products/import ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const storeIdOrErr = requireAuthStoreId(req)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeIdNum = storeIdOrErr

    // Parse multipart form
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se adjuntó ningún archivo' }, { status: 400 })
    }

    // Validate file type
    const acceptedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    const fileName = file.name.toLowerCase()
    if (!acceptedTypes.includes(file.type) && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Formato no soportado. Use .xlsx, .xls o .csv' },
        { status: 400 }
      )
    }

    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo no puede superar 5MB' }, { status: 400 })
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Parse Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
    }

    const worksheet = workbook.Sheets[sheetName]
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 })
    }

    if (rawData.length > 1000) {
      return NextResponse.json(
        { error: 'Máximo 1,000 productos por importación. Divida su archivo en lotes más pequeños.' },
        { status: 400 }
      )
    }

    // ─── Parse rows FIRST to discover categories & providers needed ───────
    const parsed: ExcelRow[] = []
    const parseErrors: { row: number; message: string }[] = []

    rawData.forEach((rawRow, index) => {
      const row = parseRow(rawRow)
      if (!row) {
        parseErrors.push({ row: index + 2, message: 'Fila vacía o sin nombre de producto' })
        return
      }
      parsed.push(row)
    })

    // Collect unique category and provider names from the Excel
    const excelCategoryNames = [...new Set(parsed.map(r => r.categoryName).filter((n): n is string => !!n))]
    const excelProviderNames = [...new Set(parsed.map(r => r.providerName).filter((n): n is string => !!n))]

    // ─── Preload store references (categories, providers, tax rates) ────────
    const [categories, providers, taxRates] = await Promise.all([
      db.category.findMany({ where: { storeId: storeIdNum }, select: { id: true, name: true } }),
      db.provider.findMany({ where: { storeId: storeIdNum }, select: { id: true, name: true } }),
      db.taxRate.findMany({ where: { storeId: storeIdNum }, select: { id: true, name: true, code: true } }),
    ])

    // Create lookup maps (case-insensitive)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const providerMap = new Map(providers.map(p => [p.name.toLowerCase(), p.id]))
    const taxRateMap = new Map(taxRates.map(t => [t.name.toLowerCase(), t.id]))
    const taxRateCodeMap = new Map(taxRates.map(t => [t.code.toLowerCase(), t.id]))

    // ─── AUTO-CREATE missing categories ────────────────────────────────────
    const createdCategories: string[] = []
    const missingCategories = excelCategoryNames.filter(name => !categoryMap.has(name.toLowerCase()))
    if (missingCategories.length > 0) {
      // Check subscription employee limit (categories don't have limits, but be safe)
      for (const catName of missingCategories) {
        try {
          const created = await db.category.create({
            data: { storeId: storeIdNum, name: catName.trim() },
          })
          categoryMap.set(catName.trim().toLowerCase(), created.id)
          createdCategories.push(catName.trim())
        } catch (err: unknown) {
          // Duplicate race condition or DB error — log and skip
          const msg = err instanceof Error ? err.message : String(err)
          logger.warn(`[Import] Failed to create category "${catName}": ${msg}`)
        }
      }
    }

    // ─── AUTO-CREATE missing providers ────────────────────────────────────
    const createdProviders: string[] = []
    const missingProviders = excelProviderNames.filter(name => !providerMap.has(name.toLowerCase()))
    if (missingProviders.length > 0) {
      for (const provName of missingProviders) {
        try {
          const created = await db.provider.create({
            data: { storeId: storeIdNum, name: provName.trim(), phone: null, email: null, address: null, nit: null, contactName: null },
          })
          providerMap.set(provName.trim().toLowerCase(), created.id)
          createdProviders.push(provName.trim())
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.warn(`[Import] Failed to create provider "${provName}": ${msg}`)
        }
      }
    }

    // ─── Check subscription plan limit ─────────────────────────────────────
    const subscription = await db.subscription.findUnique({
      where: { storeId: storeIdNum },
      include: { plan: { select: { name: true, maxProducts: true } } },
    })

    let remainingSlots = Infinity
    let planLimit: number | null = null
    let planName: string | null = null
    let currentCount = 0
    if (subscription) {
      planName = subscription.plan.name
      if (subscription.plan.maxProducts !== -1) {
        planLimit = subscription.plan.maxProducts
        currentCount = await db.product.count({ where: { storeId: storeIdNum } })
        remainingSlots = Math.max(0, planLimit - currentCount)
      }
    }

    // ─── Validate and create products ──────────────────────────────────────
    const created: string[] = []
    const skipped: { row: number; name: string; reason: string }[] = []
    const warnings: { row: number; name: string; message: string }[] = []
    const errors: { row: number; message: string }[] = parseErrors
    let createdPresentations = 0

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]
      const rowNum = i + 2 // +2 for Excel header + 0-index

      // Check plan limit
      if (created.length >= remainingSlots) {
        skipped.push({
          row: rowNum,
          name: row.name!,
          reason: `Límite del plan alcanzado. Se importaron ${created.length} productos.`,
        })
        break
      }

      // Validate sale price
      if (row.salePrice === undefined || row.salePrice === null || row.salePrice <= 0) {
        skipped.push({ row: rowNum, name: row.name!, reason: 'Precio de venta inválido o faltante' })
        continue
      }

      // Validate lengths (mirror the .max() rules of POST /api/products)
      if (row.name!.trim().length > 200) {
        skipped.push({ row: rowNum, name: row.name!, reason: 'El nombre supera 200 caracteres' })
        continue
      }
      const baseBarcode = row.barcode?.trim() || null
      if (baseBarcode && baseBarcode.length > 100) {
        skipped.push({ row: rowNum, name: row.name!, reason: 'El código de barras supera 100 caracteres' })
        continue
      }

      // Resolve category / provider by name (auto-created above if missing)
      const categoryId = row.categoryName ? categoryMap.get(row.categoryName.toLowerCase()) : undefined
      const providerId = row.providerName ? providerMap.get(row.providerName.toLowerCase()) : undefined

      // Resolve tax rate by name OR code
      let taxRateId: number | undefined
      if (row.taxRateName) {
        const key = row.taxRateName.toLowerCase()
        taxRateId = taxRateMap.get(key) ?? taxRateCodeMap.get(key)
      }

      // Unit of measure — code or label; blank/invalid → UND (+ warning)
      const unit = resolveUnitLabel(row.unitLabel)
      if (unit.invalid) {
        warnings.push({
          row: rowNum,
          name: row.name!,
          message: `Unidad de medida "${String(row.unitLabel).trim()}" no reconocida, se usó UND`,
        })
      }

      // Additional presentations (flat "Presentación N ..." columns)
      const pres = buildPresentations(row)
      if (pres.error) {
        skipped.push({ row: rowNum, name: row.name!, reason: pres.error })
        continue
      }
      for (const w of pres.warnings) {
        warnings.push({ row: rowNum, name: row.name!, message: w })
      }

      // Barcode must be unique within the row (base vs its presentations)
      const rowBarcodes = [baseBarcode, ...pres.presentations.map(p => p.barcode)].filter(Boolean) as string[]
      if (new Set(rowBarcodes).size !== rowBarcodes.length) {
        skipped.push({ row: rowNum, name: row.name!, reason: 'Códigos de barras repetidos entre las presentaciones' })
        continue
      }

      // Parse boolean flags
      const isActive = parseActive(row.isActive)
      const trackInventory = parseBool(row.trackInventory, true)
      const trackExpiration = parseBool(row.trackExpiration, false)

      try {
        await db.product.create({
          data: {
            storeId: storeIdNum,
            name: row.name!.trim(),
            sku: row.sku?.trim() || null,
            barcode: baseBarcode,
            unitLabel: unit.code,
            categoryId: categoryId || null,
            providerId: providerId || null,
            taxRateId: taxRateId || null,
            description: row.description?.trim() || null,
            imgUrl: row.imgUrl?.trim() || null,
            invima: row.invima?.trim() || null,
            costPrice: Math.round(row.costPrice || 0),
            salePrice: Math.round(row.salePrice || 0),
            commission: Math.round(row.commission || 0),
            currentStock: row.currentStock || 0,
            minStock: row.minStock ?? 5,
            trackInventory,
            trackExpiration,
            isActive,
            ...(pres.presentations.length > 0 && {
              presentations: {
                create: pres.presentations.map((p, idx) => ({ ...p, sortOrder: idx })),
              },
            }),
          },
        })
        created.push(row.name!)
        createdPresentations += pres.presentations.length
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        if (message.includes('Unique')) {
          skipped.push({ row: rowNum, name: row.name!, reason: 'Ya existe un producto con ese nombre' })
        } else {
          skipped.push({ row: rowNum, name: row.name!, reason: message.slice(0, 80) })
        }
      }
    }

    logger.info(
      `[Import] Store ${storeIdNum}: ${created.length} created (${createdPresentations} presentations), ${skipped.length} skipped, ${warnings.length} warnings`
    )

    const newTotal = planLimit !== null ? Math.min(currentCount + created.length, planLimit) : currentCount + created.length
    const limitReached = planLimit !== null && newTotal >= planLimit

    return NextResponse.json({
      success: true,
      imported: created.length,
      importedPresentations: createdPresentations,
      created,
      skipped,
      ...(warnings.length > 0 && { warnings }),
      totalInFile: rawData.length,
      createdCategories,
      createdProviders,
      subscription: {
        planName,
        planLimit,
        currentCount,
        newTotal,
        remainingSlots: planLimit !== null ? Math.max(0, planLimit - currentCount - created.length) : null,
        limitReached,
      },
    })
  } catch (error: unknown) {
    logger.error('POST /api/products/import error:', error)
    return NextResponse.json({ error: 'Error al procesar la importación' }, { status: 500 })
  }
}
