import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, sanitizeUser } from '@/lib/auth'
import { generateToken } from '@/lib/auth-helpers'
import { withRateLimit, attachRateLimitHeaders } from '@/lib/rate-limiter'
import { logStoreEvent } from '@/lib/event-logger'
import { logSubscriptionHistory } from '@/lib/subscription-helpers'
import { generateCsrfToken } from '@/lib/csrf'
import { auditLog, getClientContext } from '@/lib/audit-logger'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Rate limit: 3 per hour per IP ───
const TRIAL_SIGNUP_RATE_LIMIT = {
  maxRequests: 3,
  windowSeconds: 3600,
}

// ─── Schema validation ───
const trialSignupSchema = z.object({
  ownerCedula: z.string().min(5, 'Cédula mínimo 5 caracteres').max(20),
  ownerPassword: z.string().min(6, 'Contraseña mínimo 6 caracteres').max(64),
  ownerFullName: z.string().min(2, 'Nombre completo mínimo 2 caracteres').max(100),
  ownerEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  ownerPhone: z.string().min(7, 'Teléfono mínimo 7 caracteres').optional().or(z.literal('')),
  storeName: z.string().min(2, 'Nombre de la tienda mínimo 2 caracteres').max(100),
  nit: z.string().min(5, 'NIT/RUT mínimo 5 caracteres').max(20),
  legalName: z.string().min(2, 'Razón social mínimo 2 caracteres').max(150),
  address: z.string().optional().or(z.literal('')),
  cityName: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  storePhone: z.string().optional().or(z.literal('')),
  businessType: z.enum(['NATURAL', 'JURIDICA']).default('NATURAL'),
  hasCamaraComercio: z.boolean().optional(),
  registrationNumber: z.string().optional().or(z.literal('')),
})

/**
 * POST /api/auth/trial-signup
 * Public self-service endpoint for starting a free trial.
 * Creates: User (OWNER) → Store → Trial subscription (7 days, $0).
 * Returns an auth token so the user is auto-logged in.
 */
export async function POST(req: NextRequest) {
  // ─── Rate Limiting: 3 intentos por hora por IP ───
  const rl = withRateLimit(req, 'trial-signup', TRIAL_SIGNUP_RATE_LIMIT)
  if (rl.allowed === false) return rl.response

  try {
    // ─── Validate payload ───
    const body = await req.json()
    const data = trialSignupSchema.parse(body)

    // ─── Gate 1: Check cedula not already registered ───
    const existingUser = await db.user.findUnique({
      where: { cedula: data.ownerCedula },
    })
    if (existingUser) {
      return NextResponse.json({
        error: 'Esta identificación ya está registrada. Si ya tienes una cuenta, inicia sesión.',
      }, { status: 409 })
    }

    // ─── Gate 2: Check store name not taken ───
    const existingStore = await db.store.findFirst({
      where: { name: data.storeName },
    })
    if (existingStore) {
      return NextResponse.json({
        error: 'Ya existe una tienda con ese nombre. Elige otro nombre.',
      }, { status: 409 })
    }

    // ─── Gate 3: Check Trial plan exists and is active ───
    const trialPlan = await db.plan.findFirst({
      where: { name: 'Trial', isActive: true },
    })
    if (!trialPlan) {
      return NextResponse.json({
        error: 'El plan Trial no está disponible en este momento. Contacta a soporte.',
      }, { status: 422 })
    }

    // ─── Hash password ───
    const passwordHash = await hashPassword(data.ownerPassword)

    // ─── Default permissions ───
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

    // ─── Transaction: Create User + Store + all defaults ───
    const result = await db.$transaction(async (tx) => {
      // Create User with role OWNER and Store
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
              nit: data.nit,
              legalName: data.legalName,
              address: data.address || null,
              phone: data.storePhone || null,
              cityName: data.cityName || null,
              currencyCode: 'COP',
              countryCode: 'CO',
            },
          },
        },
        include: { store: true },
      })

      const storeId = user.store!.id

      // Create default ledger accounts
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

      // Create default categories
      await tx.category.createMany({
        data: [
          { storeId, name: 'General' },
          { storeId, name: 'Bebidas' },
          { storeId, name: 'Alimentos' },
          { storeId, name: 'Servicios' },
          { storeId, name: 'Otros' },
        ],
      })

      // Create default tax rates
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

      // Create default roles
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

      // Create Trial subscription (7 days, $0)
      const now = new Date()
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const subscriptionNotes = [
        `Trial auto-registro. NIT: ${data.nit}.`,
        `Tipo: ${data.businessType === 'NATURAL' ? 'Persona Natural' : 'Persona Jurídica'}.`,
        data.hasCamaraComercio
          ? `Cámara de comercio: Sí. Matrícula: ${data.registrationNumber || 'No proporcionada'}.`
          : 'Cámara de comercio: No registrada.',
        data.department || data.cityName
          ? `Ubicación: ${data.cityName || ''}${data.department ? ` (${data.department})` : ''}.`
          : '',
      ].filter(Boolean).join(' ')

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

      // Create CRM lead record in PaymentReceipt table
      const leadNotes = JSON.stringify({
        source: 'SELF_SERVICE_TRIAL',
        ownerFullName: data.ownerFullName,
        ownerCedula: data.ownerCedula,
        ownerPhone: data.ownerPhone || null,
        ownerEmail: data.ownerEmail || null,
        storeName: data.storeName,
        nit: data.nit,
        legalName: data.legalName,
        businessType: data.businessType,
        hasCamaraComercio: data.hasCamaraComercio || false,
        registrationNumber: data.registrationNumber || null,
        department: data.department || null,
        cityName: data.cityName || null,
        address: data.address || null,
        storePhone: data.storePhone || null,
      })

      await tx.paymentReceipt.create({
        data: {
          subscriptionId: subscription.id,
          storeId,
          fileName: 'auto-registro-trial.txt',
          fileSize: 0,
          fileType: 'text/plain',
          fileData: null,
          amount: 0,
          paymentMethod: 'OTHER',
          status: 'LEAD',
          notes: leadNotes,
        },
      })

      return { user, store: user.store!, subscriptionId: subscription.id }
    })

    // ─── Event logging (fire-and-forget) ───
    const storeId = result.store.id

    await logStoreEvent(storeId, 'STORE_CREATED', {
      metadata: { storeName: data.storeName, plan: 'Trial', source: 'SELF_SERVICE' },
    }).catch(() => {})

    await logStoreEvent(storeId, 'TRIAL_STARTED', {
      metadata: { plan: 'Trial', source: 'SELF_SERVICE' },
    }).catch(() => {})

    await logSubscriptionHistory({
      storeId,
      subscriptionId: result.subscriptionId,
      eventType: 'TRIAL_STARTED',
      newStatus: 'TRIAL',
      newPlanId: trialPlan.id,
      newPlanName: trialPlan.name,
      description: 'Trial iniciado via auto-registro',
    }).catch(() => {})

    // ─── Audit log ───
    const clientCtx = getClientContext(req)
    auditLog({
      userId: result.user.id,
      storeId,
      action: 'TRIAL_SIGNUP',
      entity: 'Store',
      entityId: storeId,
      ipAddress: clientCtx.ipAddress,
      userAgent: clientCtx.userAgent,
      metadata: {
        cedula: data.ownerCedula,
        storeName: data.storeName,
        nit: data.nit,
        businessType: data.businessType,
        source: 'SELF_SERVICE',
      },
    }).catch(() => {})

    logger.info(`[TrialSignup] New trial: store=${data.storeName}, user=${data.ownerCedula}`)

    // ─── Generate auth token (8h) and CSRF token ───
    const token = await generateToken({
      userId: result.user.id,
      storeId: storeId,
      role: 'OWNER',
      expiryMs: 8 * 60 * 60 * 1000, // 8 hours
    })

    const csrfToken = generateCsrfToken()

    const permissions: Record<string, boolean> = {
      dashboard: true, pos: true, tables: true, products: true,
      customers: true, providers: true, orders: true, invoices: true,
      inventory: true, accounting: true, services: true, reports: true,
      settings: true, quotations: true, manageEmployees: true, manageRoles: true,
    }

    const safeUser = sanitizeUser(result.user)

    const response = attachRateLimitHeaders(
      NextResponse.json({
        user: safeUser,
        store: result.store,
        token,
        csrfToken,
        isSuperAdmin: false,
        permissions,
        subscription: {
          plan: { name: 'Trial', price: 0 },
          subscriptionStatus: 'TRIAL',
          hasSubscription: true,
          trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        availableStores: [{ id: storeId, name: data.storeName, isMain: true }],
        message: 'Cuenta creada exitosamente. Tu prueba gratuita de 7 días ha comenzado.',
      }, { status: 201 }),
      rl.result,
    )

    // Set CSRF cookie
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours — matches token expiry
    })

    return response
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      )
    }
    logger.error('[TrialSignup] Error creating trial:', error)
    return NextResponse.json(
      { error: 'Error al crear la cuenta de prueba. Por favor intenta de nuevo.' },
      { status: 500 },
    )
  }
}
