// ============================================================
// SEBWEN POS — Verificador de integridad de lotes
// ──────────────────────────────────────────────────────────
// Comprueba el invariante del modelo Batch: para cada producto
// con trackExpiration = true y lotes, la suma de quantity de los
// lotes ACTIVE debe igualar Product.currentStock.
//
// Uso:  npx tsx scripts/verify-batches.ts
// ============================================================

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const products = await db.product.findMany({
    where: { trackExpiration: true },
    select: { id: true, name: true, storeId: true, currentStock: true },
  })

  let discrepancies = 0
  for (const product of products) {
    const agg = await db.batch.aggregate({
      where: { productId: product.id, status: 'ACTIVE' },
      _sum: { quantity: true },
    })
    const batchTotal = Number(agg._sum.quantity ?? 0)
    const stock = Number(product.currentStock)
    if (Math.abs(batchTotal - stock) > 0.001) {
      discrepancies++
      console.log(
        `❌ Producto ${product.id} "${product.name}" (tienda ${product.storeId}): ` +
          `currentStock=${stock} vs Σlotes=${batchTotal} (diff=${(stock - batchTotal).toFixed(3)})`,
      )
    }
  }

  const withBatches = await db.batch.count()
  console.log(`\nProductos trackExpiration revisados: ${products.length}`)
  console.log(`Lotes totales: ${withBatches}`)
  if (discrepancies === 0) {
    console.log('✅ Sin discrepancias — invariantes de lotes OK')
  } else {
    console.log(`⚠️  ${discrepancies} producto(s) con discrepancia (probablemente stock legacy sin lote)`)
    process.exitCode = 1
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
