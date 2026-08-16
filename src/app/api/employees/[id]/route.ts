import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const updateEmployeeSchema = z.object({
  position: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  isActive: z.boolean().optional(),
  fullName: z.string().min(2).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  roleId: z.number().int().positive().optional().nullable(),
  commissionRate: z.number().int().min(0).max(100).optional().nullable(),
})

// GET /api/employees/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const employee = await db.employee.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { id: true, cedula: true, fullName: true, phone: true, email: true, role: true, createdAt: true } },
        store: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, description: true, permissions: true } },
      },
    })
    if (!employee) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    }
    const storeAccessErr = requireStoreAccess(req, Number(employee.storeId))
    if (storeAccessErr) return storeAccessErr
    return NextResponse.json(employee)
  } catch (error) {
    logger.error('Get employee error:', error)
    return NextResponse.json({ error: 'Error al obtener empleado' }, { status: 500 })
  }
}

// PUT /api/employees/[id] — Actualizar empleado
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const employeeId = parseInt(id)
    const body = await req.json()
    const data = updateEmployeeSchema.parse(body)

    const employee = await db.employee.findUnique({ where: { id: employeeId } })
    if (!employee) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, Number(employee.storeId))
    if (storeAccessErr) return storeAccessErr

    // Verificar rol existe si se proporcionó
    if (data.roleId !== undefined && data.roleId !== null) {
      const roleExists = await db.role.findFirst({
        where: { id: data.roleId, storeId: employee.storeId },
      })
      if (!roleExists) {
        return NextResponse.json({ error: 'Rol no encontrado en esta tienda' }, { status: 404 })
      }
    }

    const updateData: Record<string, unknown> = {}
    const userUpdateData: Record<string, unknown> = {}

    if (data.position !== undefined) updateData.position = data.position
    if (data.roleId !== undefined) updateData.roleId = data.roleId
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.permissions !== undefined) updateData.permissions = JSON.stringify(data.permissions)
    if (data.commissionRate !== undefined) updateData.commissionRate = data.commissionRate
    if (data.fullName !== undefined) userUpdateData.fullName = data.fullName
    if (data.phone !== undefined) userUpdateData.phone = data.phone
    if (data.email !== undefined) userUpdateData.email = data.email

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: {
        ...updateData,
        user: data.fullName || data.phone || data.email
          ? { update: userUpdateData }
          : undefined,
      },
      include: {
        user: { select: { id: true, cedula: true, fullName: true, phone: true, email: true, role: true, createdAt: true } },
        role: { select: { id: true, name: true, description: true, permissions: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Update employee error:', error)
    return NextResponse.json({ error: 'Error al actualizar empleado' }, { status: 500 })
  }
}

// DELETE /api/employees/[id] — Eliminar empleado
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const employeeId = parseInt(id)

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    })
    if (!employee) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, Number(employee.storeId))
    if (storeAccessErr) return storeAccessErr

    await db.$transaction(async (tx) => {
      await tx.employee.delete({ where: { id: employeeId } })
      await tx.user.delete({ where: { id: employee.userId } })
    })

    return NextResponse.json({ message: 'Empleado eliminado correctamente' })
  } catch (error) {
    logger.error('Delete employee error:', error)
    return NextResponse.json({ error: 'Error al eliminar empleado' }, { status: 500 })
  }
}
