import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { requireFeature } from '@/lib/subscription-guard'
import { emptyPermissions } from '@/lib/permissions-catalog'

export const dynamic = 'force-dynamic'

const updateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional().nullable(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// GET /api/roles/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const role = await db.role.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: { select: { employees: true } },
        employees: {
          include: {
            user: { select: { id: true, cedula: true, fullName: true } },
          },
        },
      },
    })
    if (!role) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, role.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageRoles')
    if (permErr) return permErr

    return NextResponse.json(role)
  } catch (error) {
    logger.error('Get role error:', error)
    return NextResponse.json({ error: 'Error al obtener rol' }, { status: 500 })
  }
}

// PUT /api/roles/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const roleId = parseInt(id)
    const body = await req.json()
    const data = updateRoleSchema.parse(body)

    const role = await db.role.findUnique({ where: { id: roleId } })
    if (!role) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, role.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageRoles')
    if (permErr) return permErr
    const featErr = await requireFeature(role.storeId, 'customRoles')
    if (featErr) return featErr

    const updateData: Record<string, unknown> = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.permissions !== undefined) {
      updateData.permissions = JSON.stringify({ ...emptyPermissions(), ...data.permissions })
    }

    // Si se marca como default, quitar default a otros
    if (data.isDefault === true) {
      await db.role.updateMany({
        where: { storeId: role.storeId, isDefault: true, id: { not: roleId } },
        data: { isDefault: false },
      })
      updateData.isDefault = true
    } else if (data.isDefault === false) {
      updateData.isDefault = false
    }

    const updated = await db.role.update({
      where: { id: roleId },
      data: updateData,
      include: {
        _count: { select: { employees: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Update role error:', error)
    return NextResponse.json({ error: 'Error al actualizar rol' }, { status: 500 })
  }
}

// DELETE /api/roles/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const roleId = parseInt(id)

    const role = await db.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { employees: true } } },
    })
    if (!role) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, role.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'manageRoles')
    if (permErr) return permErr

    if (role._count.employees > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: ${role._count.employees} empleado(s) tienen este rol asignado. Reasigna los empleados primero.` },
        { status: 400 }
      )
    }

    await db.role.delete({ where: { id: roleId } })

    return NextResponse.json({ message: 'Rol eliminado correctamente' })
  } catch (error) {
    logger.error('Delete role error:', error)
    return NextResponse.json({ error: 'Error al eliminar rol' }, { status: 500 })
  }
}
