import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, sanitizeUser } from '@/lib/auth'
import { generateToken } from '@/lib/auth-helpers'
import { generateCsrfToken } from '@/lib/csrf'
import { withRateLimit, SIGNUP_RATE_LIMIT } from '@/lib/rate-limiter'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logStoreEvent } from '@/lib/event-logger'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/quickstart
 * 
 * Quick Start: crea Usuario + Tienda + Trial en un solo paso.
 * Solo pide lo esencial: nombre, cédula, nombre de tienda y contraseña.
 * Lo demás se configura después desde Settings.
 */
const quickStartSchema = z.object({
  fullName: z.string().min(2, 'Tu nombre es requerido'),
  cedula: z.string().min(5, 'Cédula mín. 5 dígitos').max(20),
  password: z.string().min(6, 'Contraseña mín. 6 caracteres'),
  storeName: z.string().min(2, 'Nombre de tienda requerido'),
  phone: z.string().optional().or(z.literal('')),
})

export async function POST(req: NextRequest) {
  // Rate limit: 3 por hora por IP
  const rl = withRateLimit(req, 'quickstart', SIGNUP_RATE_LIMIT)
  if (!rl.allowed) {
    return (rl as { allowed: false; response: NextResponse }).response
  }

  try {
    const body = await req.json()
    const data = quickStartSchema.parse(body)

    const existing = await db.user.findUnique({ where: { cedula: data.cedula } })
    if (existing) {
      return NextResponse.json(
        { error: 'Esta cédula ya está registrada. Inicia sesión con tus credenciales.' },
        { status: 400 },
      )
    }

    const existingStore = await db.store.findFirst({ where: { name: data.storeName } })
    if (existingStore) {
      return NextResponse.json(
        { error: 'Ya existe una tienda con ese nombre. Elige otro nombre.' },
        { status: 400 },
      )
    }

    const passwordHash = await hashPassword(data.password)

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
      const user = await tx.user.create({
        data: {
          cedula: data.cedula,
          phone: data.phone || null,
          email: null,
          passwordHash,
          fullName: data.fullName,
          role: 'OWNER',
          store: {
            create: {
              name: data.storeName,
              nit: null,
              legalName: null,
              address: null,
              phone: data.phone || null,
              currencyCode: 'COP',
              countryCode: 'CO',
            },
          },
        },
        include: { store: true },
      })

      const storeId = user.store!.id

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

      await tx.category.createMany({
        data: [
          { storeId, name: 'General' },
          { storeId, name: 'Bebidas' },
          { storeId, name: 'Alimentos' },
          { storeId, name: 'Servicios' },
          { storeId, name: 'Otros' },
        ],
      })

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

      return { user, store: user.store!, subscription }
    })

    await logStoreEvent(result.store.id, 'STORE_CREATED', {
      metadata: { storeName: data.storeName, plan: 'Trial', source: 'QUICKSTART' },
    })
    await logStoreEvent(result.store.id, 'TRIAL_STARTED', {
      metadata: { plan: 'Trial' },
    })
    await logSubscriptionHistory({
      storeId: result.store.id,
      subscriptionId: result.subscription.id,
      eventType: 'TRIAL_STARTED',
      newStatus: 'TRIAL',
      newPlanId: result.subscription.planId,
      newPlanName: 'Trial',
      description: 'Período de prueba iniciado via Quick Start',
    }).catch(() => {})

    const token = await generateToken({
      userId: result.user.id,
      storeId: result.store.id,
      role: 'OWNER',
    })
    const csrfToken = generateCsrfToken()
    const safeUser = sanitizeUser(result.user)

    const permissions = {
      dashboard: true, pos: true, tables: true, products: true,
      customers: true, providers: true, orders: true, invoices: true,
      inventory: true, accounting: true, services: true, reports: true,
      settings: true, quotations: true, manageEmployees: true, manageRoles: true,
    }

    const response = NextResponse.json({
      user: safeUser,
      store: result.store,
      token,
      csrfToken,
      isSuperAdmin: false,
      permissions,
      subscription: {
        hasSubscription: true,
        subscriptionStatus: 'TRIAL',
        subscriptionId: result.subscription.id,
        planId: result.subscription.planId,
        planName: 'Trial',
        planPrice: 0,
        startDate: result.subscription.startDate.toISOString(),
        endDate: result.subscription.endDate?.toISOString(),
        trialEndDate: result.subscription.trialEndDate?.toISOString(),
        graceEndDate: null,
        graceDaysRemaining: null,
        billingPeriod: 'TRIAL',
        daysRemaining: 7,
        planLimits: { maxStores: 1, maxEmployees: 2, maxProducts: 50, features: {} },
      },
      availableStores: [{ id: result.store.id, name: result.store.name, isMain: true }],
      message: '¡Cuenta creada! Ya puedes empezar a vender.',
      quickStart: true,
    }, { status: 201 })

    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60,
    })

    return response
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'PLAN_TRIAL_NOT_FOUND') {
      return NextResponse.json({
        error: 'No se puede crear la cuenta en este momento. Intenta más tarde.',
      }, { status: 422 })
    }
    logger.error('QuickStart error:', error)
    return NextResponse.json({ error: 'Error al crear la cuenta' }, { status: 500 })
  }
}
