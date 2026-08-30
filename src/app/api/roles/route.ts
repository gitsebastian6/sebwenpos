import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { requireFeature } from '@/lib/subscription-guard'

export const dynamic = 'force-dynamic'

// Todos los permisos disponibles con sus valores por defecto
const ALL_PERMISSIONS: Record<string, boolean> = {
  dashboard: false,
  pos: false,
  tables: false,
  products: false,
  customers: false,
  providers: false,
  purchases: false,
  orders: false,
  onlineOrders: false,
  invoices: false,
  inventory: false,
  accounting: false,
  services: false,
  reports: false,
  settings: false,
  quotations: false,
  manageEmployees: false,
  manageRoles: false,
}

const createRoleSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(2, 'Nombre mínimo 2 caracteres').max(50, 'Nombre máximo 50 caracteres'),
  description: z.string().max(200).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  isDefault: z.boolean().optional(),
})

// GET /api/roles?storeId=X — Listar roles de una tienda
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = parseInt(searchParams.get('storeId') || '0')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(req, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageRoles')
    if (permErr) return permErr

    const roles = await db.role.findMany({
      where: { storeId },
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json(roles)
  } catch (error) {
    logger.error('List roles error:', error)
    return NextResponse.json({ error: 'Error al listar roles' }, { status: 500 })
  }
}

// POST /api/roles — Crear rol
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createRoleSchema.parse(body)

    // Verify store access
    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageRoles')
    if (permErr) return permErr
    const featErr = await requireFeature(data.storeId, 'customRoles')
    if (featErr) return featErr

    // Verificar nombre no exista en la tienda
    const existingRole = await db.role.findFirst({
      where: { storeId: data.storeId, name: data.name },
    })
    if (existingRole) {
      return NextResponse.json({ error: 'Ya existe un rol con ese nombre en esta tienda' }, { status: 400 })
    }

    // Si es default, quitar default a otros roles
    if (data.isDefault) {
      await db.role.updateMany({
        where: { storeId: data.storeId, isDefault: true },
        data: { isDefault: false },
      })
    }

    // Combinar permisos recibidos con los que faltan
    const finalPermissions = { ...ALL_PERMISSIONS, ...data.permissions }

    const role = await db.role.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        description: data.description || null,
        permissions: JSON.stringify(finalPermissions),
        isDefault: data.isDefault || false,
      },
      include: {
        _count: { select: { employees: true } },
      },
    })

    return NextResponse.json(role, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Create role error:', error)
    return NextResponse.json({ error: 'Error al crear rol' }, { status: 500 })
  }
}
