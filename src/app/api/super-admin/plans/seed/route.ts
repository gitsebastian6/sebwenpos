import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const DEFAULT_PLANS = [
  {
    name: 'Trial',
    description: 'Plan de prueba gratuito por 7 días. Evalúa el sistema completo sin compromiso.',
    price: 0,
    maxStores: 1,
    maxEmployees: 3,
    maxProducts: 50,
    features: {
      electronicInvoicing: false,
      multiStore: false,
      reports: false,
      support: 'none',
      priority: false,
    },
    sortOrder: 1,
    isActive: true,
  },
  {
    name: 'Pro',
    description: 'Para negocios en crecimiento. Facturación electrónica DIAN, inventario avanzado y reportes.',
    price: 89900,
    maxStores: 1,
    maxEmployees: 15,
    maxProducts: 500,
    features: {
      electronicInvoicing: true,
      multiStore: false,
      reports: true,
      support: 'email',
      priority: false,
      advancedInventory: true,
    },
    sortOrder: 2,
    isActive: true,
  },
  {
    name: 'Empresarial',
    description: 'Multi-tienda, productos ilimitados, API personalizada y soporte prioritario dedicado.',
    price: 249000,
    maxStores: 10,
    maxEmployees: -1,
    maxProducts: -1,
    features: {
      electronicInvoicing: true,
      multiStore: true,
      reports: true,
      support: 'dedicated',
      priority: true,
      advancedInventory: true,
      api: true,
      customBranding: true,
      multiCurrency: true,
    },
    sortOrder: 3,
    isActive: true,
  },
]

/**
 * POST /api/super-admin/plans/seed
 * Seed default plans if they don't already exist
 */
export async function POST() {
  try {
    const existingPlans = await db.plan.findMany({
      select: { name: true },
    })

    const existingNames = new Set(existingPlans.map(p => p.name))
    const plansToCreate = DEFAULT_PLANS.filter(p => !existingNames.has(p.name))

    if (plansToCreate.length === 0) {
      return NextResponse.json({
        message: 'Todos los planes por defecto ya existen. No se crearon nuevos planes.',
        created: 0,
        total: existingPlans.length,
      })
    }

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

    return NextResponse.json({
      message: `${result.count} plan(es) creado(s) exitosamente`,
      created: result.count,
      plans: plansToCreate.map(p => p.name),
      total: existingPlans.length + result.count,
    })
  } catch (error) {
    logger.error('Seed plans error:', error)
    return NextResponse.json({ error: 'Error al sembrar planes' }, { status: 500 })
  }
}
