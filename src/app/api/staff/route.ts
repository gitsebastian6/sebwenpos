import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// GET /api/staff?storeId=3
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeIdNum = parseInt(storeId)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, storeIdNum)
    if (storeAccessError) return storeAccessError
    const permErr = await requirePermission(req, 'manageEmployees')
    if (permErr) return permErr

    // Query employees (not users) — employees belong to a store via Employee model
    const employees = await db.employee.findMany({
      where: { storeId: storeIdNum },
      include: {
        user: { select: { id: true, cedula: true, phone: true, email: true, fullName: true } },
        role: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const staffUsers = employees.map(e => ({
      id: e.id,
      employeeId: e.id,
      userId: e.userId,
      phone: e.user.phone,
      email: e.user.email,
      fullName: e.user.fullName,
      cedula: e.user.cedula,
      position: e.position,
      roleId: e.roleId,
      isActive: e.isActive,
      permissions: e.permissions ? (() => { try { return JSON.parse(e.permissions) } catch { return {} } })() : {},
      createdAt: e.createdAt,
      roleName: e.role?.name ?? null,
      rolePermissions: e.role ? (() => { try { return JSON.parse(e.role.permissions) } catch { return {} } })() : null,
    }))

    const roles = await db.role.findMany({
      where: { storeId: storeIdNum },
      include: { _count: { select: { employees: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    const enrichedRoles = roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: (() => { try { return JSON.parse(r.permissions) } catch { return {} } })(),
      isActive: r.isActive,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      employeeCount: r._count.employees,
    }))

    // Calculate active users from employees
    const activeUsers = employees.filter(e => e.isActive).length

    return NextResponse.json({
      users: staffUsers,
      roles: enrichedRoles,
      stats: {
        totalUsers: staffUsers.length,
        activeUsers,
        totalRoles: enrichedRoles.length,
      },
    })
  } catch (error) {
    console.error('Error fetching staff data:', error)
    return NextResponse.json({ error: 'Error al obtener datos del personal' }, { status: 500 })
  }
}
