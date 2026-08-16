import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import DEFAULT_PLANS from '@data/default-plans.json'

export const dynamic = 'force-dynamic'

/**
 * SEBWEN POS — Plan Marketing Configuration
 *
 * Plan hierarchy: Trial → Básico → Pro → Empresarial
 * Each higher tier includes ALL features from lower tiers plus extras.
 * Canonical plan data lives in prisma/default-plans.json — the single
 * source of truth also used by prisma/seed.ts and scripts/docker-entrypoint.sh.
 *
 * Feature keys (must match PLAN_FEATURES in subscription-helpers.ts):
 *   electronicInvoicing  — DIAN Facturación Electrónica
 *   multiStore           — Sucursales (múltiples tiendas)
 *   reports              — Reportes Avanzados
 *   advancedInventory    — Inventario Avanzado (kardex, lotes, costeo FIFO/AVG)
 *   api                  — Acceso API REST
 *   customBranding       — Branding Personalizado (logo, colores)
 *   multiCurrency        — Multi-Moneda
 *   support              — Soporte: 'none' | 'email' | 'dedicated'
 *   priority             — Soporte Prioritario
 */

/**
 * POST /api/super-admin/plans/seed
 * Seed default plans if they don't already exist.
 * If plans exist, updates their features/description to match current defaults.
 */
export async function POST() {
  try {
    const existingPlans = await db.plan.findMany({
      select: { name: true, id: true },
    })

    const existingNames = new Set(existingPlans.map(p => p.name))
    const plansToCreate = DEFAULT_PLANS.filter(p => !existingNames.has(p.name))
    const plansToUpdate = DEFAULT_PLANS.filter(p => existingNames.has(p.name))

    let created = 0
    let updated = 0

    if (plansToCreate.length > 0) {
      const result = await db.plan.createMany({
        data: plansToCreate.map(plan => ({
          name: plan.name,
          description: plan.description,
          price: plan.price,
          maxStores: plan.maxStores,
          maxEmployees: plan.maxEmployees,
          maxProducts: plan.maxProducts,
          features: JSON.stringify(plan.features),
          sortOrder: plan.sortOrder,
          isActive: plan.isActive,
        })),
      })
      created = result.count
    }

    // Update existing plans to match current feature definitions
    for (const planDef of plansToUpdate) {
      const existing = existingPlans.find(p => p.name === planDef.name)
      if (existing) {
        await db.plan.update({
          where: { id: existing.id },
          data: {
            description: planDef.description,
            price: planDef.price,
            maxStores: planDef.maxStores,
            maxEmployees: planDef.maxEmployees,
            maxProducts: planDef.maxProducts,
            features: JSON.stringify(planDef.features),
            sortOrder: planDef.sortOrder,
            isActive: planDef.isActive,
          },
        })
        updated++
      }
    }

    // Deactivate orphan plans (not in DEFAULT_PLANS and no active subscriptions)
    const canonicalNames = new Set(DEFAULT_PLANS.map(p => p.name))
    const orphanPlans = existingPlans.filter(p => !canonicalNames.has(p.name))
    let deactivated = 0
    for (const orphan of orphanPlans) {
      // Check if any active subscriptions use this plan
      const activeSubs = await db.subscription.count({
        where: { planId: orphan.id, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
      })
      if (activeSubs === 0) {
        await db.plan.delete({ where: { id: orphan.id } })
        deactivated++
      } else {
        // Deactivate but don't delete (has active subscriptions)
        await db.plan.update({ where: { id: orphan.id }, data: { isActive: false } })
        deactivated++
      }
    }

    return NextResponse.json({
      message: `Planes sincronizados: ${created} creado(s), ${updated} actualizado(s), ${deactivated} eliminado(s)/desactivado(s)`,
      created,
      updated,
      deactivated,
      plans: DEFAULT_PLANS.map(p => p.name),
      total: (existingPlans.length + created - deactivated),
    })
  } catch (error) {
    logger.error('Seed plans error:', error)
    return NextResponse.json({ error: 'Error al sembrar planes' }, { status: 500 })
  }
}
