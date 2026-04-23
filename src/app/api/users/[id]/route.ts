import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// DELETE /api/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const auth = requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const userId = parseInt(id)

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        store: true,
        employee: true,
        _count: {
          select: { cashRegisters: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Don't delete owners
    if (user.role === 'OWNER') {
      return NextResponse.json({ error: 'No se puede eliminar el propietario' }, { status: 403 })
    }

    // SUPER_ADMIN cannot be deleted via this endpoint
    if (user.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'No se puede eliminar el super administrador' }, { status: 403 })
    }

    // Check for open cash registers
    if (user._count.cashRegisters > 0) {
      const openRegisters = await db.cashRegister.count({
        where: { userId, status: 'OPEN' },
      })
      if (openRegisters > 0) {
        return NextResponse.json(
          { error: 'El usuario tiene cajas registradoras abiertas. Ciérrelas primero.' },
          { status: 409 }
        )
      }
    }

    // Deactivate the employee record (roleId lives on Employee, not User)
    if (user.employee) {
      await db.employee.update({
        where: { id: user.employee.id },
        data: { isActive: false },
      })
    }

    return NextResponse.json({ message: 'Usuario desactivado correctamente' })
  } catch (error: unknown) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Error al desactivar usuario' }, { status: 500 })
  }
}

// GET /api/users/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const auth = requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const userId = parseInt(id)

    // Query user with their employee relation to get role/position data
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        employee: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const emp = user.employee

    return NextResponse.json({
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      cedula: user.cedula,
      role: user.role,
      storeId: emp?.storeId ?? null,
      createdAt: user.createdAt,
      // Employee-specific fields (null if not an employee)
      employeeId: emp?.id ?? null,
      position: emp?.position ?? null,
      isActive: emp?.isActive ?? true,
      roleId: emp?.roleId ?? null,
      roleName: emp?.role?.name ?? null,
      permissions: emp?.permissions ? (() => { try { return JSON.parse(emp.permissions) } catch { return {} } })() : null,
    })
  } catch (error: unknown) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Error al obtener usuario' }, { status: 500 })
  }
}
