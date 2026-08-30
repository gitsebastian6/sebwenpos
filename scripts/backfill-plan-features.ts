/**
 * Backfill de `Plan.features` para BDs que ya existían antes de HALLAZGO #2.
 * ---------------------------------------------------------------------------
 * `prisma/default-plans.json` solo afecta seeds nuevos. Los planes que ya
 * están en la BD no tienen las keys nuevas (`onlineStore`, `customRoles`, …)
 * → `storeHasFeature` devuelve false → un cliente Pro pierde esos módulos.
 *
 * Este script, para cada Plan:
 *   1. parsea su `features` actual;
 *   2. rellena las keys faltantes tomando como base el tier homónimo de
 *      default-plans.json (si el nombre coincide), y `false` para el resto
 *      (o `"none"` para `support`, que es string);
 *   3. los valores YA presentes en la BD nunca se pisan.
 * Idempotente: correrlo dos veces no cambia nada la segunda vez.
 *
 * Uso:
 *   npm run db:backfill:plan-features          # usa DATABASE_URL de .env
 *   # en el host (BD local), con la URL de localhost:
 *   DATABASE_URL="postgresql://sebwenpos:sebwenpos_secret_2025@localhost:5432/sebwenpos?schema=public" \
 *     npx tsx scripts/backfill-plan-features.ts
 *   # o dentro de Docker:
 *   docker compose exec app npx tsx scripts/backfill-plan-features.ts
 * ---------------------------------------------------------------------------
 */
import { PrismaClient } from '@prisma/client'
import defaultPlans from '../prisma/default-plans.json'
import { PLAN_FEATURES } from '../src/lib/subscription/constants'

const db = new PrismaClient()
const ALL_KEYS = Object.keys(PLAN_FEATURES)

async function main() {
  const plans = await db.plan.findMany()
  console.log(`[backfill] ${plans.length} plan(es) en la BD`)

  for (const plan of plans) {
    let current: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(plan.features || '{}')
      if (parsed && typeof parsed === 'object') current = parsed
    } catch {
      /* features corrupto → se reconstruye desde cero */
    }

    const seed =
      (defaultPlans.find((d) => d.name === plan.name)?.features as Record<string, unknown> | undefined) ?? {}

    // seed rellena huecos; los valores del DB ganan.
    const merged: Record<string, unknown> = { ...seed, ...current }
    for (const k of ALL_KEYS) {
      if (!(k in merged)) merged[k] = k === 'support' ? 'none' : false
    }

    const next = JSON.stringify(merged)
    if (next === plan.features) {
      console.log(`  · ${plan.name}: sin cambios`)
      continue
    }
    await db.plan.update({ where: { id: plan.id }, data: { features: next } })
    const added = ALL_KEYS.filter((k) => !(k in current))
    console.log(`  ✓ ${plan.name}: +[${added.join(', ')}]`)
  }
}

main()
  .then(() => console.log('[backfill] listo'))
  .catch((e) => {
    console.error('[backfill] error:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
