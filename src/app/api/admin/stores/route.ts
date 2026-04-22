import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { calculatePlanDates } from '@/lib/plan-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createStoreSchema = z.object({
  storeName: z.string().min(2, 'Nombre de tienda mínimo 2 caracteres'),
  ownerFullName: z.string().min(2, 'Nombre del propietario mínimo 2 caracteres'),
  ownerCedula: z.string().min(5, 'Cédula mínimo 5 dígitos'),
  ownerDocumentType: z.string().default('CC'),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().email().optional().nullable(),
  ownerPassword: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  nit: z.string().optional(),
  legalName: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  plan: z.enum(['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE']).default('TRIAL'),
})

// ── Helper: seed initial data for a new store ──
async function seedStoreData(storeId: number) {
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
      { storeId, name: 'Cervezas Lager' },
      { storeId, name: 'Cervezas Premium' },
      { storeId, name: 'Cervezas Especiales' },
      { storeId, name: 'Malta y Bebidas' },
      { storeId, name: 'Promociones' },
      { storeId, name: 'Otros' },
    ],
  })

  await db.taxRate.createMany({
    data: [
      { storeId, name: 'IVA 19%', code: `IVA19-${storeId}`, rate: 19, rateType: 'PERCENTAGE', applyTo: 'PRODUCT', category: 'SALES_TAX', isDefault: true, description: 'Impuesto sobre las ventas 19%' },
      { storeId, name: 'IVA 5%', code: `IVA5-${storeId}`, rate: 5, rateType: 'PERCENTAGE', applyTo: 'PRODUCT', category: 'SALES_TAX', description: 'Impuesto reducido 5%' },
      { storeId, name: 'IVA Exento', code: `IVA0-${storeId}`, rate: 0, rateType: 'PERCENTAGE', applyTo: 'PRODUCT', category: 'SALES_TAX', description: 'Productos exentos de IVA' },
      { storeId, name: 'Impoconsumo 8%', code: `IMP8-${storeId}`, rate: 8, rateType: 'PERCENTAGE', applyTo: 'PRODUCT', category: 'CONSUMPTION_TAX', description: 'Impuesto al consumo' },
    ],
  })
}

// GET /api/admin/stores — List all stores with owner info and stats
export async function GET(req: NextRequest) {
  try {
    const stores = await db.store.findMany({
      include: {
        user: {
          select: { id: true, fullName: true, cedula: true, phone: true, email: true, isActive: true },
        },
        staff: {
          where: { role: 'EMPLOYEE' },
          select: { id: true },
        },
        _count: {
          select: {
            orders: true,
            products: true,
            customers: true,
            roles: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const enriched = stores.map(s => {
      return {
        id: s.id,
        name: s.name,
        legalName: s.legalName,
        nit: s.nit,
        city: s.city,
        address: s.address,
        phone: s.phone,
        email: s.email,
        currencyCode: s.currencyCode,
        plan: s.plan,
        planStartDate: s.planStartDate?.toISOString() || null,
        planExpiresAt: s.planExpiresAt?.toISOString() || null,
        isActive: s.user.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        owner: s.user,
        stats: {
          totalOrders: s._count.orders,
          totalStaff: s.staff.length, // Only EMPLOYEE role (excludes OWNER)
          totalProducts: s._count.products,
          totalCustomers: s._count.customers,
          totalRoles: s._count.roles,
        },
      }
    })

    // Summary stats
    const totalStores = enriched.length
    const activeStores = enriched.filter(s => s.isActive).length
    const totalOrders = enriched.reduce((a, s) => a + s.stats.totalOrders, 0)
    const totalUsers = enriched.reduce((a, s) => a + s.stats.totalStaff, 0)

    return NextResponse.json({
      stores: enriched,
      summary: { totalStores, activeStores, inactiveStores: totalStores - activeStores, totalOrders, totalUsers },
    })
  } catch (error) {
    console.error('Error fetching admin stores:', error)
    return NextResponse.json({ error: 'Error al obtener tiendas' }, { status: 500 })
  }
}

// POST /api/admin/stores — Create new store with owner
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createStoreSchema.parse(body)

    // Check cédula uniqueness
    const existingCedula = await db.user.findUnique({ where: { cedula: data.ownerCedula } })
    if (existingCedula) {
      return NextResponse.json({ error: 'Ya existe un usuario con esa cédula' }, { status: 409 })
    }

    // Check phone uniqueness if provided
    if (data.ownerPhone) {
      const existingPhone = await db.user.findUnique({ where: { phone: data.ownerPhone } })
      if (existingPhone) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese teléfono' }, { status: 409 })
      }
    }

    const passwordHash = await hashPassword(data.ownerPassword)

    // Calculate plan dates
    const { planStartDate, planExpiresAt } = calculatePlanDates(data.plan)

    // Create store + owner atomically
    const store = await db.store.create({
      data: {
        name: data.storeName,
        legalName: data.legalName,
        nit: data.nit,
        city: data.city,
        address: data.address,
        plan: data.plan,
        planStartDate,
        planExpiresAt,
        currencyCode: 'COP',
        countryCode: 'CO',
        user: {
          create: {
            phone: data.ownerPhone || `own-${data.ownerCedula}-${Date.now()}`,
            email: data.ownerEmail || null,
            passwordHash,
            fullName: data.ownerFullName,
            cedula: data.ownerCedula,
            documentType: data.ownerDocumentType,
            role: 'OWNER',
          },
        },
      },
      include: { user: true },
    })

    // Set storeId on owner (circular dependency)
    await db.user.update({
      where: { id: store.user.id },
      data: { storeId: store.id },
    })

    // Seed initial data (accounts, categories, taxes)
    await seedStoreData(store.id)

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        legalName: store.legalName,
        nit: store.nit,
        createdAt: store.createdAt,
      },
      owner: {
        id: store.user.id,
        fullName: store.user.fullName,
        cedula: store.user.cedula,
        phone: store.user.phone,
      },
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Error creating store:', error)
    return NextResponse.json({ error: 'Error al crear tienda' }, { status: 500 })
  }
}
