import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const createEmployeeSchema = z.object({
  storeId: z.number().int().positive(),
  cedula: z.string().min(5, 'Cédula mínimo 5 dígitos'),
  password: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  fullName: z.string().min(2, 'Nombre es requerido'),
  position: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  roleId: z.number().int().positive().optional(),
})

// GET /api/employees?storeId=X — Listar empleados de una tienda
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = parseInt(searchParams.get('storeId') || '0')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(req, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageEmployees')
    if (permErr) return permErr

    const employees = await db.employee.findMany({
      where: { storeId },
      include: {
        user: { select: { id: true, cedula: true, fullName: true, phone: true, email: true, role: true, createdAt: true } },
        role: { select: { id: true, name: true, description: true, permissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(employees)
  } catch (error) {
    logger.error('List employees error:', error)
    return NextResponse.json({ error: 'Error al listar empleados' }, { status: 500 })
  }
}

// POST /api/employees — Crear empleado
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createEmployeeSchema.parse(body)

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageEmployees')
    if (permErr) return permErr

    // Verificar cédula no registrada
    const existingUser = await db.user.findUnique({ where: { cedula: data.cedula } })
    if (existingUser) {
      return NextResponse.json({ error: 'La cédula ya está registrada en el sistema' }, { status: 400 })
    }

    // Verificar tienda existe
    const store = await db.store.findUnique({ where: { id: data.storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Verificar rol existe si se proporcionó
    if (data.roleId) {
      const roleExists = await db.role.findFirst({
        where: { id: data.roleId, storeId: data.storeId },
      })
      if (!roleExists) {
        return NextResponse.json({ error: 'Rol no encontrado en esta tienda' }, { status: 404 })
      }
    }

    // ---- CHECK SUBSCRIPTION PLAN LIMIT ----
    const subscription = await db.subscription.findUnique({
      where: { storeId: data.storeId },
      include: { plan: { select: { maxEmployees: true } } },
    })

    if (subscription) {
      const maxEmployees = subscription.plan.maxEmployees
      if (maxEmployees !== -1) {
        const currentCount = await db.employee.count({
          where: { storeId: data.storeId },
        })
        if (currentCount >= maxEmployees) {
          return NextResponse.json({
            error: `Límite de empleados alcanzado (${maxEmployees}). Actualice su plan para agregar más empleados.`,
            limitReached: true,
            current: currentCount,
            max: maxEmployees,
          }, { status: 403 })
        }
      }
    }

    const passwordHash = await hashPassword(data.password)

    // Permisos vacíos (se obtendrán del rol asignado en login)
    const permissions = '{}'

    // Crear usuario primero, luego empleado
    const newUser = await db.user.create({
      data: {
        cedula: data.cedula,
        phone: data.phone || null,
        email: data.email || null,
        fullName: data.fullName,
        passwordHash,
        role: 'EMPLOYEE',
      },
    })

    const employee = await db.employee.create({
      data: {
        storeId: data.storeId,
        userId: newUser.id,
        roleId: data.roleId || null,
        position: data.position || null,
        permissions,
      },
      include: {
        user: { select: { id: true, cedula: true, fullName: true, phone: true, email: true, role: true, createdAt: true } },
        role: { select: { id: true, name: true, description: true, permissions: true } },
      },
    })

    return NextResponse.json(employee, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Create employee error:', error)
    return NextResponse.json({ error: 'Error al crear empleado' }, { status: 500 })
  }
}
