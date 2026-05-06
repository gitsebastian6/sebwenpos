import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, sanitizeUser } from '@/lib/auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logStoreEvent, logSubscriptionChange } from '@/lib/event-logger'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'

export const dynamic = 'force-dynamic'

const receiptSchema = z.object({
  fileData: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  fileType: z.string().min(1),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(['NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'BANCARY', 'EFFECTIVE', 'OTHER']),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
}).optional()

const createStoreSchema = z.object({
  ownerCedula: z.string().min(5, 'Cédula del propietario mín. 5 dígitos'),
  ownerPassword: z.string().min(6, 'Contraseña mín. 6 caracteres'),
  ownerFullName: z.string().min(2, 'Nombre del propietario requerido'),
  ownerEmail: z.string().email().optional().or(z.literal('')),
  ownerPhone: z.string().optional().or(z.literal('')),
  storeName: z.string().min(2, 'Nombre de tienda requerido'),
  nit: z.string().optional().or(z.literal('')),
  legalName: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  planId: z.number().int().positive().optional(),
  billingPeriod: z.enum(['TRIAL', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']).optional(),
  receipt: receiptSchema,
})

/**
 * GET /api/super-admin/stores
 * Lista todas las tiendas con estadísticas completas
 */
export async function GET() {
  try {
    const stores = await db.store.findMany({
      select: {
        id: true,
        userId: true,
        name: true,
        legalName: true,
        nit: true,
        address: true,
        phone: true,
        currencyCode: true,
        countryCode: true,
        invoicePrefix: true,
        resolutionNumber: true,
        resolutionStartDate: true,
        resolutionEndDate: true,
        resolutionStartNumber: true,
        resolutionEndNumber: true,
        invoiceTestMode: true,
        invoiceProvider: true,
        invoiceEnabled: true,
        certificateUploaded: true,
        divipolaCode: true,
        cityName: true,
        parentStoreId: true,
        createdAt: true,
        updatedAt: true,
        parentStore: {
          select: {
            name: true,
            subscription: {
              include: {
                plan: { select: { id: true, name: true, price: true } },
              },
            },
          },
        },
        user: {
          select: { id: true, cedula: true, fullName: true, email: true, phone: true, role: true, createdAt: true },
        },
        subscription: {
          include: {
            plan: { select: { id: true, name: true, price: true } },
          },
        },
        _count: {
          select: {
            employees: true,
            products: true,
            orders: true,
            customers: true,
            categories: true,
            taxRates: true,
            roles: true,
            invoices: true,
            quotations: true,
            expenses: true,
            services: true,
            providers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // For branches without their own subscription, inherit parent's subscription
    const enrichedStores = stores.map(store => {
      if (!store.subscription && store.parentStore?.subscription) {
        return {
          ...store,
          subscription: {
            ...store.parentStore.subscription,
            inheritedFrom: store.parentStore.name,
          },
        }
      }
      return store
    })

    return NextResponse.json(enrichedStores)
  } catch (error) {
    logger.error('Error listing stores:', error)
    return NextResponse.json({ error: 'Error al listar tiendas' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/stores
 * Crea una nueva tienda con su usuario Owner — todo en una transacción
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createStoreSchema.parse(body)

    const existing = await db.user.findUnique({ where: { cedula: data.ownerCedula } })
    if (existing) {
      return NextResponse.json({ error: 'La cédula del propietario ya está registrada' }, { status: 400 })
    }

    const existingStore = await db.store.findFirst({ where: { name: data.storeName } })
    if (existingStore) {
      return NextResponse.json({ error: 'Ya existe una tienda con ese nombre' }, { status: 400 })
    }

    // ─── Pre-transaction validation for paid plans ───
    if (data.planId) {
      const selectedPlan = await db.plan.findFirst({ where: { id: data.planId } })
      if (!selectedPlan) {
        return NextResponse.json({ error: 'Plan no encontrado' }, { status: 422 })
      }
      const billingPeriod = data.billingPeriod || 'MONTHLY'
      const isTrial = selectedPlan.price === 0 || billingPeriod === 'TRIAL'
      if (!isTrial && !data.receipt) {
        return NextResponse.json(
          { error: 'Para planes de pago debe adjuntar el comprobante de pago' },
          { status: 400 },
        )
      }
    }

    const passwordHash = await hashPassword(data.ownerPassword)

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
          cedula: data.ownerCedula,
          phone: data.ownerPhone || null,
          email: data.ownerEmail || null,
          passwordHash,
          fullName: data.ownerFullName,
          role: 'OWNER',
          store: {
            create: {
              name: data.storeName,
              nit: data.nit || null,
              legalName: data.legalName || null,
              address: data.address || null,
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

      // ─── Subscription creation with plan selection support ───
      const now = new Date()

      if (data.planId) {
        const selectedPlan = await tx.plan.findFirst({ where: { id: data.planId } })
        if (!selectedPlan) throw new Error('PLAN_NOT_FOUND')

        // CRITICAL: If the plan is free (Trial), ALWAYS force billingPeriod = 'TRIAL'
        // This prevents assigning a Trial plan with MONTHLY billing (which would give 30 days instead of 7)
        const isTrial = selectedPlan.price === 0
        const billingPeriod = isTrial ? 'TRIAL' : (data.billingPeriod || 'MONTHLY')

        // Calculate end date based on billing period
        const periodDays: Record<string, number> = {
          TRIAL: 7, MONTHLY: 30, QUARTERLY: 90, SEMI_ANNUAL: 180, ANNUAL: 365,
        }
        const days = periodDays[billingPeriod] || 30
        const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

        // Calculate billing price with volume discount
        const periodMonths: Record<string, number> = {
          TRIAL: 0, MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12,
        }
        const discounts: Record<string, number> = {
          TRIAL: 0, MONTHLY: 0, QUARTERLY: 5, SEMI_ANNUAL: 10, ANNUAL: 15,
        }
        const months = periodMonths[billingPeriod] || 1
        const discount = discounts[billingPeriod] || 0
        const billingPrice = Math.round(selectedPlan.price * months * (1 - discount / 100))

        // Calculate nextBillingAt for paid plans
        const nextBillingAt = (!isTrial && data.receipt)
          ? new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
          : null

        const subscription = await tx.subscription.create({
          data: {
            storeId,
            planId: selectedPlan.id,
            status: isTrial ? 'TRIAL' : (data.receipt ? 'ACTIVE' : 'TRIAL'),
            startDate: now,
            endDate: isTrial ? endDate : (data.receipt ? endDate : null),
            trialEndDate: isTrial ? endDate : null,
            billingPeriod: billingPeriod,
            billingPrice: billingPrice,
            nextBillingAt,
          },
        })

        // Create receipt if provided (for paid plans)
        if (data.receipt && !isTrial) {
          await tx.paymentReceipt.create({
            data: {
              subscriptionId: subscription.id,
              storeId,
              fileName: data.receipt.fileName,
              fileSize: data.receipt.fileSize,
              fileType: data.receipt.fileType,
              fileData: data.receipt.fileData,
              amount: data.receipt.amount,
              reference: data.receipt.reference || null,
              paymentMethod: data.receipt.paymentMethod,
              notes: data.receipt.notes || null,
              status: 'APPROVED',
              reviewedBy: 'SUPER_ADMIN',
              reviewedAt: now,
              reviewNotes: 'Registro durante creación de tienda',
            },
          })
        }
      } else {
        // Default: Trial subscription (7 days, $0)
        const trialPlan = await tx.plan.findFirst({ where: { name: 'Trial' } })
        if (!trialPlan) throw new Error('PLAN_TRIAL_NOT_FOUND')
        const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        await tx.subscription.create({
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
      }

      return user
    })

    // ─── Event logging (fire-and-forget) ───
    const newStoreId = result.store!.id
    const createdSubscription = await db.subscription.findUnique({
      where: { storeId: newStoreId },
      include: { plan: { select: { id: true, name: true } } },
    })
    const planName = createdSubscription?.plan?.name || 'Trial'
    await logStoreEvent(newStoreId, 'STORE_CREATED', { metadata: { storeName: data.storeName, plan: planName } })
    if (createdSubscription?.status === 'TRIAL') {
      await logStoreEvent(newStoreId, 'TRIAL_STARTED', { metadata: { plan: planName } })
      // Also log to SubscriptionHistory for accurate Trial → Pago tracking
      await logSubscriptionHistory({
        storeId: newStoreId,
        subscriptionId: createdSubscription.id,
        eventType: 'TRIAL_STARTED',
        newStatus: 'TRIAL',
        newPlanId: createdSubscription.plan.id,
        newPlanName: createdSubscription.plan.name,
        description: 'Período de prueba iniciado',
      }).catch(() => {})
    } else if (createdSubscription?.status === 'ACTIVE') {
      await logSubscriptionChange(newStoreId, null, 'ACTIVE', { plan: planName })
      // Log to SubscriptionHistory for accurate tracking
      await logSubscriptionHistory({
        storeId: newStoreId,
        subscriptionId: createdSubscription.id,
        eventType: 'CREATED',
        newStatus: 'ACTIVE',
        newPlanId: createdSubscription.plan.id,
        newPlanName: createdSubscription.plan.name,
        description: `Suscripción activada directamente en plan ${createdSubscription.plan.name}`,
      }).catch(() => {})
    }

    const safeUser = sanitizeUser(result)

    return NextResponse.json({
      user: safeUser,
      store: result.store,
      message: `Tienda "${data.storeName}" creada exitosamente`,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'PLAN_TRIAL_NOT_FOUND') {
      return NextResponse.json({
        error: 'No se puede crear la tienda: el plan Trial no existe. Ejecute el seed de planes primero.',
      }, { status: 422 })
    }
    if (error instanceof Error && error.message === 'PLAN_NOT_FOUND') {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 422 })
    }
    logger.error('Create store error:', error)
    return NextResponse.json({ error: 'Error al crear tienda' }, { status: 500 })
  }
}
