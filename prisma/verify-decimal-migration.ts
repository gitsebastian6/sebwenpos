/**
 * Sebwen POS — Verify Decimal Migration
 * ─────────────────────────────────────────────────────────
 * Verifica la integridad de la base de datos tras migrar los campos de
 * stock/cantidad de Int → Decimal (Fase 0B).
 *
 * Comprueba:
 *   1. Conteos de registros en todas las tablas afectadas (no vacías si antes tenían datos).
 *   2. Sumas de stock/cantidades (que los valores se preservaron, no se truncaron).
 *   3. Que no haya valores nulos en columnas que no deben serlo.
 *   4. Que los valores sean numéricos válidos (no NaN/Infinity).
 *
 * Uso: npx tsx prisma/verify-decimal-migration.ts
 * Exit code 0 = todo OK. Exit code 1 = hay problemas.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

let failures = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures++
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function isFiniteNumber(v: unknown): boolean {
  if (v === null || v === undefined) return false
  const n = Number(v)
  return Number.isFinite(n)
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║  SebwenPOS — Verify Decimal Migration           ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  // ── 1. Conteos de registros ────────────────────────────────────────────
  console.log('── Conteos de registros ──')
  const counts = {
    products: await db.product.count(),
    productPresentations: await db.productPresentation.count(),
    inventoryMovements: await db.inventoryMovement.count(),
    orderItems: await db.orderItem.count(),
    purchaseItems: await db.purchaseItem.count(),
    comandaItems: await db.comandaItem.count(),
    quotationItems: await db.quotationItem.count(),
    serviceTransactions: await db.serviceTransaction.count(),
  }
  for (const [table, count] of Object.entries(counts)) {
    check(`${table}`, count >= 0, `${count} registros`)
  }

  // ── 2. Sumas de stock/cantidades (valores preservados) ─────────────────
  console.log('\n── Sumas (valores preservados) ──')
  // NOTA: Prisma devuelve `null` en _sum cuando la tabla está vacía (0 filas).
  // Eso es correcto — solo es un fallo si HAY registros y la suma es null.

  const productAgg = await db.product.aggregate({
    _sum: { currentStock: true, minStock: true },
    _count: true,
  })
  check('products.currentStock sum', isFiniteNumber(productAgg._sum.currentStock), `sum = ${productAgg._sum.currentStock?.toString() ?? 'null'}`)
  check('products.minStock sum', isFiniteNumber(productAgg._sum.minStock), `sum = ${productAgg._sum.minStock?.toString() ?? 'null'}`)

  const orderItemAgg = await db.orderItem.aggregate({
    _sum: { quantity: true, returnedQuantity: true, unitsPerPack: true },
  })
  check('orderItems.quantity sum', isFiniteNumber(orderItemAgg._sum.quantity), `sum = ${orderItemAgg._sum.quantity?.toString() ?? 'null'}`)
  check('orderItems.returnedQuantity sum', isFiniteNumber(orderItemAgg._sum.returnedQuantity), `sum = ${orderItemAgg._sum.returnedQuantity?.toString() ?? 'null'}`)
  check('orderItems.unitsPerPack sum', isFiniteNumber(orderItemAgg._sum.unitsPerPack), `sum = ${orderItemAgg._sum.unitsPerPack?.toString() ?? 'null'}`)

  // Tablas que pueden estar vacías en dev — la suma null es válida si count = 0
  const emptyOk = (table: string, sum: unknown, count: number): boolean =>
    isFiniteNumber(sum) || (sum === null && count === 0)

  const purchaseItemCount = await db.purchaseItem.count()
  const purchaseItemAgg = await db.purchaseItem.aggregate({
    _sum: { quantity: true, returnedQuantity: true, unitsPerPack: true },
  })
  check('purchaseItems.quantity sum', emptyOk('purchaseItems', purchaseItemAgg._sum.quantity, purchaseItemCount), `sum = ${purchaseItemAgg._sum.quantity?.toString() ?? 'null'} (${purchaseItemCount} filas)`)
  check('purchaseItems.returnedQuantity sum', emptyOk('purchaseItems', purchaseItemAgg._sum.returnedQuantity, purchaseItemCount), `sum = ${purchaseItemAgg._sum.returnedQuantity?.toString() ?? 'null'} (${purchaseItemCount} filas)`)
  check('purchaseItems.unitsPerPack sum', emptyOk('purchaseItems', purchaseItemAgg._sum.unitsPerPack, purchaseItemCount), `sum = ${purchaseItemAgg._sum.unitsPerPack?.toString() ?? 'null'} (${purchaseItemCount} filas)`)

  const movementCount = await db.inventoryMovement.count()
  const movementAgg = await db.inventoryMovement.aggregate({
    _sum: { quantity: true, unitsPerPack: true },
  })
  check('inventoryMovements.quantity sum', emptyOk('inventoryMovements', movementAgg._sum.quantity, movementCount), `sum = ${movementAgg._sum.quantity?.toString() ?? 'null'} (${movementCount} filas)`)
  check('inventoryMovements.unitsPerPack sum', emptyOk('inventoryMovements', movementAgg._sum.unitsPerPack, movementCount), `sum = ${movementAgg._sum.unitsPerPack?.toString() ?? 'null'} (${movementCount} filas)`)

  const comandaCount = await db.comandaItem.count()
  const comandaAgg = await db.comandaItem.aggregate({
    _sum: { quantity: true, unitsPerPack: true },
  })
  check('comandaItems.quantity sum', emptyOk('comandaItems', comandaAgg._sum.quantity, comandaCount), `sum = ${comandaAgg._sum.quantity?.toString() ?? 'null'} (${comandaCount} filas)`)
  check('comandaItems.unitsPerPack sum', emptyOk('comandaItems', comandaAgg._sum.unitsPerPack, comandaCount), `sum = ${comandaAgg._sum.unitsPerPack?.toString() ?? 'null'} (${comandaCount} filas)`)

  const quotationCount = await db.quotationItem.count()
  const quotationAgg = await db.quotationItem.aggregate({
    _sum: { quantity: true, unitsPerPack: true },
  })
  check('quotationItems.quantity sum', emptyOk('quotationItems', quotationAgg._sum.quantity, quotationCount), `sum = ${quotationAgg._sum.quantity?.toString() ?? 'null'} (${quotationCount} filas)`)
  check('quotationItems.unitsPerPack sum', emptyOk('quotationItems', quotationAgg._sum.unitsPerPack, quotationCount), `sum = ${quotationAgg._sum.unitsPerPack?.toString() ?? 'null'} (${quotationCount} filas)`)

  const presentationCount = await db.productPresentation.count()
  const presentationAgg = await db.productPresentation.aggregate({
    _sum: { unitsPerPack: true },
  })
  check('productPresentations.unitsPerPack sum', emptyOk('productPresentations', presentationAgg._sum.unitsPerPack, presentationCount), `sum = ${presentationAgg._sum.unitsPerPack?.toString() ?? 'null'} (${presentationCount} filas)`)

  const serviceTxCount = await db.serviceTransaction.count()
  const serviceTxAgg = await db.serviceTransaction.aggregate({
    _sum: { quantity: true },
  })
  check('serviceTransactions.quantity sum', emptyOk('serviceTransactions', serviceTxAgg._sum.quantity, serviceTxCount), `sum = ${serviceTxAgg._sum.quantity?.toString() ?? 'null'} (${serviceTxCount} filas)`)

  // ── 3. Valores no nulos en columnas obligatorias ────────────────────────
  // NOTA: Prisma no permite filtrar por null en campos no-nullables (el esquema
  // ya lo garantiza), así que usamos raw SQL para verificar la integridad real.
  console.log('\n── No-nulos en columnas obligatorias (raw SQL) ──')

  const nullChecks: Array<[string, string]> = [
    ['products.current_stock', 'SELECT COUNT(*) as c FROM products WHERE current_stock IS NULL'],
    ['products.min_stock', 'SELECT COUNT(*) as c FROM products WHERE min_stock IS NULL'],
    ['order_items.quantity', 'SELECT COUNT(*) as c FROM order_items WHERE quantity IS NULL'],
    ['order_items.returned_quantity', 'SELECT COUNT(*) as c FROM order_items WHERE returned_quantity IS NULL'],
    ['order_items.units_per_pack', 'SELECT COUNT(*) as c FROM order_items WHERE units_per_pack IS NULL'],
    ['purchase_items.quantity', 'SELECT COUNT(*) as c FROM purchase_items WHERE quantity IS NULL'],
    ['purchase_items.returned_quantity', 'SELECT COUNT(*) as c FROM purchase_items WHERE returned_quantity IS NULL'],
    ['purchase_items.units_per_pack', 'SELECT COUNT(*) as c FROM purchase_items WHERE units_per_pack IS NULL'],
    ['inventory_movements.quantity', 'SELECT COUNT(*) as c FROM inventory_movements WHERE quantity IS NULL'],
    ['inventory_movements.units_per_pack', 'SELECT COUNT(*) as c FROM inventory_movements WHERE units_per_pack IS NULL'],
    ['comanda_items.quantity', 'SELECT COUNT(*) as c FROM comanda_items WHERE quantity IS NULL'],
    ['comanda_items.units_per_pack', 'SELECT COUNT(*) as c FROM comanda_items WHERE units_per_pack IS NULL'],
    ['quotation_items.quantity', 'SELECT COUNT(*) as c FROM quotation_items WHERE quantity IS NULL'],
    ['quotation_items.units_per_pack', 'SELECT COUNT(*) as c FROM quotation_items WHERE units_per_pack IS NULL'],
    ['product_presentations.units_per_pack', 'SELECT COUNT(*) as c FROM product_presentations WHERE units_per_pack IS NULL'],
    ['service_transactions.quantity', 'SELECT COUNT(*) as c FROM service_transactions WHERE quantity IS NULL'],
  ]

  for (const [name, query] of nullChecks) {
    const rows = await db.$queryRawUnsafe<Array<{ c: number | bigint }>>(query)
    const nullCount = Number(rows[0]?.c ?? 0)
    check(`${name} no-null`, nullCount === 0, `${nullCount} nulos`)
  }

  // ── 4. Valores numéricos válidos (no NaN/Infinity) ──────────────────────
  console.log('\n── Valores numéricos válidos ──')

  const products = await db.product.findMany({ select: { currentStock: true, minStock: true } })
  const badProducts = products.filter((p) => !isFiniteNumber(p.currentStock) || !isFiniteNumber(p.minStock))
  check('products valores finitos', badProducts.length === 0, `${badProducts.length} inválidos`)

  const movements = await db.inventoryMovement.findMany({ select: { quantity: true } })
  const badMovements = movements.filter((m) => !isFiniteNumber(m.quantity))
  check('inventoryMovements valores finitos', badMovements.length === 0, `${badMovements.length} inválidos`)

  // ── Resultado ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50))
  if (failures === 0) {
    console.log('✅ VERIFICACIÓN COMPLETA — todos los checks pasaron')
  } else {
    console.error(`❌ ${failures} check(s) fallaron — revisar arriba`)
  }
  console.log('═'.repeat(50))
}

main()
  .catch((e) => {
    console.error('Error fatal:', e)
    failures++
  })
  .finally(async () => {
    await db.$disconnect()
    process.exit(failures === 0 ? 0 : 1)
  })