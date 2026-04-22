import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/staff?storeId=3
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const users = await db.user.findMany({
      where: { storeId: parseInt(storeId) },
      include: { roleRef: true },
      orderBy: { createdAt: 'desc' },
    })

    const staffUsers = users.map(u => ({
      id: u.id,
      phone: u.phone,
      email: u.email,
      fullName: u.fullName,
      cedula: u.cedula,
      documentType: u.documentType,
      role: u.role,
      roleId: u.roleId,
      isActive: u.isActive,
      createdAt: u.createdAt,
      roleName: u.roleRef?.name ?? null,
      permissions: u.roleRef ? JSON.parse(u.roleRef.permissions) : null,
    }))

    const roles = await db.role.findMany({
      where: { storeId: parseInt(storeId) },
      include: { _count: { select: { users: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    const enrichedRoles = roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: JSON.parse(r.permissions),
      isActive: r.isActive,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      userCount: r._count.users,
    }))

    return NextResponse.json({
      users: staffUsers,
      roles: enrichedRoles,
      stats: {
        totalUsers: staffUsers.length,
        activeUsers: staffUsers.filter(u => u.isActive).length,
        totalRoles: enrichedRoles.length,
      },
    })
  } catch (error) {
    console.error('Error fetching staff data:', error)
    return NextResponse.json({ error: 'Error al obtener datos del personal' }, { status: 500 })
  }
}
