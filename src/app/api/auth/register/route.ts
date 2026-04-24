import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, sanitizeUser } from '@/lib/auth'
import { generateToken } from '@/lib/auth-helpers'
import { withRateLimit, REGISTER_RATE_LIMIT, attachRateLimitHeaders } from '@/lib/rate-limiter'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const registerSchema = z.object({
  cedula: z.string().min(5, 'Cédula mínimo 5 dígitos'),
  password: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  fullName: z.string().min(2, 'Nombre es requerido'),
  storeName: z.string().min(2, 'Nombre de tienda es requerido'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  nit: z.string().optional().or(z.literal('')),
  legalName: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
})

export async function POST(req: NextRequest) {
  // ─── Rate Limiting: 3 registros por 5 minutos por IP ───
  const rl = withRateLimit(req, 'register', REGISTER_RATE_LIMIT)
  if (rl.allowed === false) return rl.response

  try {
    const body = await req.json()
    const data = registerSchema.parse(body)

    // Verificar que la cédula no esté registrada
    const existing = await db.user.findUnique({ where: { cedula: data.cedula } })
    if (existing) {
      return NextResponse.json({ error: 'La cédula ya está registrada' }, { status: 400 })
    }

    const passwordHash = await hashPassword(data.password)

    const user = await db.user.create({
      data: {
        cedula: data.cedula,
        phone: data.phone || null,
        email: data.email || null,
        passwordHash,
        fullName: data.fullName,
        role: 'OWNER',
        store: {
          create: {
            name: data.storeName,
            nit: data.nit || null,
            legalName: data.legalName || null,
            address: data.address || null,
            currencyCode: 'COP',
            countryCode: 'CO',
          },
        },
      },
      include: { store: true },
    })

    const storeId = user.store!.id
    await db.ledgerAccount.createMany({
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

    await db.category.createMany({
      data: [
        { storeId, name: 'General' },
        { storeId, name: 'Bebidas' },
        { storeId, name: 'Alimentos' },
        { storeId, name: 'Servicios' },
        { storeId, name: 'Otros' },
      ],
    })

    // Crear tasa IVA 19% por defecto
    await db.taxRate.create({
      data: {
        storeId,
        name: 'IVA 19%',
        code: '01',
        rateType: 'PERCENTAGE',
        rate: 19,
        applyTo: 'BOTH',
        category: 'SALES_TAX',
        isActive: true,
        isDefault: true,
        description: 'Impuesto al Valor Agregado - Tarifa general',
      },
    })

    // ─── Mandatory: create Trial subscription (7 days) ───
    const trialPlan = await db.plan.findFirst({ where: { name: 'Trial' } })
    if (!trialPlan) {
      // Rollback: delete the user + store we just created
      await db.user.delete({ where: { id: user.id } })
      return NextResponse.json({
        error: 'El sistema no está configurado para registros nuevos. Contacte al soporte.',
      }, { status: 503 })
    }

    const now = new Date()
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days
    await db.subscription.create({
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

    const safeUser = sanitizeUser(user)
    const token = await generateToken({
      userId: user.id,
      storeId: user.store!.id,
      role: 'OWNER',
    })

    const permissions: Record<string, boolean> = {
      dashboard: true, pos: true, tables: true, products: true,
      customers: true, providers: true, orders: true, invoices: true,
      inventory: true, accounting: true, services: true, reports: true,
      settings: true, quotations: true, manageEmployees: true,
    }

    return attachRateLimitHeaders(
      NextResponse.json({ user: safeUser, store: user.store, token, permissions }),
      rl.result,
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Register error:', error)
    return NextResponse.json({ error: 'Error al registrar usuario' }, { status: 500 })
  }
}
