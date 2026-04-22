import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DELETE /api/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = parseInt(id)

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
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

    // Deactivate instead of hard delete
    await db.user.update({
      where: { id: userId },
      data: { isActive: false, roleId: null },
    })

    return NextResponse.json({ message: 'Usuario desactivado correctamente' })
  } catch (error) {
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
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id: parseInt(id) },
      include: { roleRef: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      cedula: user.cedula,
      documentType: user.documentType,
      role: user.role,
      roleId: user.roleId,
      isActive: user.isActive,
      storeId: user.storeId,
      createdAt: user.createdAt,
      roleName: user.roleRef?.name ?? null,
      permissions: user.roleRef ? JSON.parse(user.roleRef.permissions) : null,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Error al obtener usuario' }, { status: 500 })
  }
}
