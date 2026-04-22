import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { calculatePlanDates } from '@/lib/plan-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  // Store fields
  storeName: z.string().min(2).optional(),
  nit: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  plan: z.enum(['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE']).optional(),
  // Owner fields
  ownerFullName: z.string().min(2).optional(),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().email().nullable().optional(),
  ownerPassword: z.string().min(6).optional(), // Reset owner password
  // Toggle
  isActive: z.boolean().optional(),
})

// GET /api/admin/stores/[id] — Store details with full stats
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const store = await db.store.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: { id: true, fullName: true, cedula: true, phone: true, email: true, isActive: true, createdAt: true },
        },
        staff: {
          select: { id: true, fullName: true, cedula: true, phone: true, role: true, roleId: true, isActive: true, roleRef: { select: { name: true } } },
          where: { role: 'EMPLOYEE' },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            orders: true,
            products: true,
            customers: true,
            roles: true,
            categories: true,
            barTables: true,
            providers: true,
            invoices: true,
            expenses: true,
          },
        },
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Get recent orders count (today)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayOrders = await db.order.count({
      where: { storeId: store.id, createdAt: { gte: today } },
    })

    const todaySales = await db.order.aggregate({
      where: { storeId: store.id, createdAt: { gte: today }, status: 'COMPLETED' },
      _sum: { total: true },
    })

    return NextResponse.json({
      id: store.id,
      name: store.name,
      legalName: store.legalName,
      nit: store.nit,
      city: store.city,
      address: store.address,
      phone: store.phone,
      email: store.email,
      currencyCode: store.currencyCode,
      plan: store.plan,
      planStartDate: store.planStartDate?.toISOString() || null,
      planExpiresAt: store.planExpiresAt?.toISOString() || null,
      isActive: store.user.isActive,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
      owner: store.user,
      staff: store.staff,
      stats: {
        ...store._count,
        totalStaff: store.staff.length, // Only EMPLOYEE role (excludes OWNER)
        todayOrders,
        todaySales: todaySales._sum.total || 0,
      },
    })
  } catch (error) {
    console.error('Error fetching store:', error)
    return NextResponse.json({ error: 'Error al obtener tienda' }, { status: 500 })
  }
}

// PUT /api/admin/stores/[id] — Update store and/or owner
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = updateSchema.parse(body)

    const store = await db.store.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Build store update data
    const storeUpdate: Record<string, unknown> = {}
    if (data.storeName !== undefined) storeUpdate.name = data.storeName
    if (data.nit !== undefined) storeUpdate.nit = data.nit
    if (data.legalName !== undefined) storeUpdate.legalName = data.legalName
    if (data.city !== undefined) storeUpdate.city = data.city
    if (data.address !== undefined) storeUpdate.address = data.address
    if (data.plan !== undefined) {
      storeUpdate.plan = data.plan
      // Auto-calculate plan expiration dates
      const { planStartDate, planExpiresAt } = calculatePlanDates(data.plan)
      storeUpdate.planStartDate = planStartDate
      storeUpdate.planExpiresAt = planExpiresAt
    }

    if (Object.keys(storeUpdate).length > 0) {
      await db.store.update({
        where: { id: parseInt(id) },
        data: storeUpdate,
      })
    }

    // Build owner update data
    const ownerUpdate: Record<string, unknown> = {}
    if (data.ownerFullName !== undefined) ownerUpdate.fullName = data.ownerFullName
    if (data.ownerPhone !== undefined) ownerUpdate.phone = data.ownerPhone
    if (data.ownerEmail !== undefined) ownerUpdate.email = data.ownerEmail
    if (data.isActive !== undefined) ownerUpdate.isActive = data.isActive

    // Reset owner password
    if (data.ownerPassword) {
      const hash = await hashPassword(data.ownerPassword)
      ownerUpdate.passwordHash = hash
    }

    if (Object.keys(ownerUpdate).length > 0) {
      await db.user.update({
        where: { id: store.userId },
        data: ownerUpdate,
      })
    }

    return NextResponse.json({ message: 'Tienda actualizada correctamente' })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Error updating store:', error)
    return NextResponse.json({ error: 'Error al actualizar tienda' }, { status: 500 })
  }
}
