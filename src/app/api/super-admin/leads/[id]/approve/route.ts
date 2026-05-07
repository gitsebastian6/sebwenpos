import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { logStoreEvent } from '@/lib/event-logger'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/super-admin/leads/[id]/approve
 * Convert an APPROVED lead into a full Store account (User + Store + Subscription).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthUser(_req)
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 })
    }

    const { id: idStr } = await params
    const leadId = parseInt(idStr, 10)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    if (lead.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Solo se pueden convertir leads en estado APPROVED. Estado actual: ${lead.status}` },
        { status: 409 },
      )
    }

    // Check cedula not already a user
    const existingUser = await db.user.findUnique({ where: { cedula: lead.ownerCedula } })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Ya existe un usuario con esta cédula. El lead no puede ser convertido.' },
        { status: 409 },
      )
    }

    // Check NIT not already a store
    const existingStore = await db.store.findFirst({ where: { nit: lead.nit } })
    if (existingStore) {
      return NextResponse.json(
        { error: 'Ya existe una tienda con este NIT. El lead no puede ser convertido.' },
        { status: 409 },
      )
    }

    // Use the hashed password from the lead, or generate one
    const { hashPassword } = await import('@/lib/auth')
    const passwordHash = lead.ownerPassword || await hashPassword('TempPass123!')

    const adminPermissions = JSON.stringify({
      dashboard: true, pos: true, tables: true, products: true,
      customers: true, providers: true, orders: true, invoices: true,
      inventory: true, accounting: true, services: true, reports: true,
      settings: true, quotations: true, manageEmployees: true, manageRoles: true,
    })

    const cajeroPermissions = JSON.stringify({
      dashboard: true, pos: true, orders: true, quotations: true,
      customers: true, products: false, providers: false,
      invoices: false, inventory: false, accounting: false,
      services: false, reports: false, settings: false,
      manageEmployees: false, manageRoles: false, tables: true,
    })

    const result = await db.$transaction(async (tx) => {
      // 1. Create User + Store
      const user = await tx.user.create({
        data: {
          cedula: lead.ownerCedula,
          phone: lead.ownerPhone,
          email: lead.ownerEmail,
          passwordHash,
          fullName: lead.ownerFullName,
          role: 'OWNER',
          store: {
            create: {
              name: lead.storeName,
              nit: lead.nit,
              legalName: lead.legalName,
              address: lead.address,
              phone: lead.storePhone,
              currencyCode: 'COP',
              countryCode: 'CO',
              cityName: lead.cityName,
              divipolaCode: null,
            },
          },
        },
        include: { store: true },
      })

      const storeId = user.store!.id

      // 2. Create default ledger accounts
      await tx.ledgerAccount.createMany({
        data: [
          { storeId, name: 'Caja General', type: 'ASSET', isDefault: true },
          { storeId, name: 'Banco', type: 'ASSET', isDefault: false },
          { storeId, name: 'Ventas', type: 'INCOME', isDefault: false },
          { storeId, name: 'Comisiones', type: 'INCOME', isDefault: false },
          { storeId, name: 'Compras', type: 'EXPENSE', isDefault: false },
          { storeId, name: 'Gastos Generales', type: 'EXPENSE', isDefault: false },
          { storeId, name: 'Inventario', type: 'ASSET', isDefault: false },
          { storeId, name: 'Cuentas por Cobrar', type: 'ASSET', isDefault: false },
          { storeId, name: 'Capital', type: 'EQUITY', isDefault: false },
        ],
      })

      // 3. Create default categories
      await tx.category.createMany({
        data: [
          { storeId, name: 'General' },
          { storeId, name: 'Bebidas' },
          { storeId, name: 'Alimentos' },
          { storeId, name: 'Servicios' },
          { storeId, name: 'Otros' },
        ],
      })

      // 4. Create default tax rates
      await tx.taxRate.createMany({
        data: [
          {
            storeId, name: 'IVA 19%', code: '01', rateType: 'PERCENTAGE', rate: 19,
            applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: true,
            description: 'Impuesto al Valor Agregado - Tarifa general',
          },
          {
            storeId, name: 'IVA 5%', code: '02', rateType: 'PERCENTAGE', rate: 5,
            applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false,
            description: 'IVA Tarifa reducida',
          },
          {
            storeId, name: 'IVA 0% Exento', code: '03', rateType: 'PERCENTAGE', rate: 0,
            applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false,
            description: 'Bienes y servicios exentos de IVA',
          },
          {
            storeId, name: 'IVA Excluido', code: '04', rateType: 'PERCENTAGE', rate: 0,
            applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false,
            description: 'Servicios excluidos de IVA',
          },
        ],
      })

      // 5. Create default roles
      await tx.role.create({
        data: {
          storeId, name: 'Administrador',
          description: 'Acceso completo a todos los módulos del sistema',
          permissions: adminPermissions, isDefault: false, isActive: true,
        },
      })

      await tx.role.create({
        data: {
          storeId, name: 'Cajero',
          description: 'Acceso a punto de venta y ventas básicas',
          permissions: cajeroPermissions, isDefault: true, isActive: true,
        },
      })

      // 6. Create Trial subscription
      const trialPlan = await tx.plan.findFirst({ where: { name: 'Trial' } })
      if (!trialPlan) throw new Error('PLAN_TRIAL_NOT_FOUND')

      const now = new Date()
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const subscription = await tx.subscription.create({
        data: {
          storeId,
          planId: trialPlan.id,
          status: 'TRIAL',
          startDate: now,
          endDate: trialEnd,
          trialEndDate: trialEnd,
          billingPeriod: 'TRIAL',
          billingPrice: 0,
        },
      })

      // 7. Mark lead as CONVERTED
      await tx.lead.update({
        where: { id: leadId },
        data: {
          status: 'CONVERTED',
          convertedStoreId: storeId,
          reviewedBy: 'SUPER_ADMIN',
          reviewedAt: now,
        },
      })

      return { user, store: user.store, subscription, storeId }
    })

    // Event logging (fire-and-forget)
    await logStoreEvent(result.storeId, 'STORE_CREATED', {
      metadata: { storeName: lead.storeName, source: 'LEAD_CONVERSION', leadId },
    }).catch(() => {})
    await logStoreEvent(result.storeId, 'TRIAL_STARTED', {
      metadata: { plan: 'Trial' },
    }).catch(() => {})

    const createdSubscription = await db.subscription.findUnique({
      where: { storeId: result.storeId },
      include: { plan: { select: { id: true, name: true } } },
    })
    if (createdSubscription) {
      await logSubscriptionHistory({
        storeId: result.storeId,
        subscriptionId: createdSubscription.id,
        eventType: 'CREATED',
        newStatus: 'TRIAL',
        newPlanId: createdSubscription.plan.id,
        newPlanName: createdSubscription.plan.name,
        description: `Cuenta creada desde lead #${leadId} — ${lead.storeName}`,
      }).catch(() => {})
    }

    logger.info(`[SuperAdmin] Lead #${leadId} (${lead.storeName}) → Store #${result.storeId}`)

    return NextResponse.json({
      storeId: result.storeId,
      storeName: result.store.name,
      message: `Lead convertido exitosamente. Tienda "${lead.storeName}" creada con prueba gratuita de 7 días.`,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'PLAN_TRIAL_NOT_FOUND') {
      return NextResponse.json(
        { error: 'No se puede crear la tienda: el plan Trial no existe. Ejecute el seed de planes primero.' },
        { status: 422 },
      )
    }
    logger.error('[SuperAdmin] Error converting lead:', error)
    return NextResponse.json({ error: 'Error al convertir lead en cuenta' }, { status: 500 })
  }
}
