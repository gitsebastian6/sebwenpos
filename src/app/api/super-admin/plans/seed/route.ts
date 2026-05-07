import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * VENTIFY POS — Plan Marketing Configuration
 *
 * Plan hierarchy: Trial → Básico → Pro → Empresarial
 * Each higher tier includes ALL features from lower tiers plus extras.
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
const DEFAULT_PLANS = [
  {
    name: 'Trial',
    description: 'Plan de prueba gratuito por 7 días. Evalúa el sistema completo sin compromiso. Incluye punto de venta, productos, clientes y ventas básicas.',
    price: 0,
    maxStores: 1,
    maxEmployees: 3,
    maxProducts: 50,
    features: {
      electronicInvoicing: false,
      multiStore: false,
      reports: false,
      advancedInventory: false,
      api: false,
      customBranding: false,
      multiCurrency: false,
      support: 'none',
      priority: false,
    },
    sortOrder: 1,
    isActive: true,
  },
  {
    name: 'Básico',
    description: 'Ideal para negocios que inician. Punto de venta, inventario básico y facturación manual. Todo lo esencial para comenzar.',
    price: 49900,
    maxStores: 1,
    maxEmployees: 3,
    maxProducts: 100,
    features: {
      electronicInvoicing: false,
      multiStore: false,
      reports: false,
      advancedInventory: false,
      api: false,
      customBranding: false,
      multiCurrency: false,
      support: 'email',
      priority: false,
    },
    sortOrder: 2,
    isActive: true,
  },
  {
    name: 'Pro',
    description: 'Para negocios en crecimiento. Facturación electrónica DIAN, inventario avanzado, reportes detallados y hasta 5 sucursales.',
    price: 89900,
    maxStores: 5,
    maxEmployees: 15,
    maxProducts: 500,
    features: {
      electronicInvoicing: true,
      multiStore: true,
      reports: true,
      advancedInventory: true,
      api: false,
      customBranding: false,
      multiCurrency: false,
      support: 'email',
      priority: false,
    },
    sortOrder: 3,
    isActive: true,
  },
  {
    name: 'Empresarial',
    description: 'Solución completa para empresas que escalan. Hasta 25 sucursales, productos ilimitados, API, branding propio y soporte dedicado.',
    price: 249000,
    maxStores: 25,
    maxEmployees: -1,
    maxProducts: -1,
    features: {
      electronicInvoicing: true,
      multiStore: true,
      reports: true,
      advancedInventory: true,
      api: true,
      customBranding: true,
      multiCurrency: true,
      support: 'dedicated',
      priority: true,
    },
    sortOrder: 4,
    isActive: true,
  },
]

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
