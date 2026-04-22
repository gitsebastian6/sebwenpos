import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const assignSchema = z.object({
  employeeIds: z.array(z.number().int().positive()).min(1, 'Selecciona al menos un empleado'),
})

// POST /api/roles/[id]/assign — Assign role to multiple employees
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const roleId = parseInt(id)
    const body = await req.json()
    const data = assignSchema.parse(body)

    const role = await db.role.findUnique({ where: { id: roleId } })
    if (!role) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 })
    }

    // Verify store access
    const storeAccessErr = requireStoreAccess(req, role.storeId)
    if (storeAccessErr) return storeAccessErr

    // Update all employees to have this role
    const result = await db.employee.updateMany({
      where: { id: { in: data.employeeIds } },
      data: { roleId },
    })

    return NextResponse.json({
      message: `Rol asignado a ${result.count} empleado(s)`,
      count: result.count,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Assign role error:', error)
    return NextResponse.json({ error: 'Error al asignar rol' }, { status: 500 })
  }
}
