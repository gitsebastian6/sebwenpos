import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const editStoreSchema = z.object({
  // Datos de la tienda
  name: z.string().min(2).max(200).optional(),
  legalName: z.string().max(200).optional().nullable(),
  nit: z.string().max(50).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  // Datos del owner
  ownerFullName: z.string().min(2).max(200).optional(),
  ownerEmail: z.string().email().optional().nullable(),
  ownerPhone: z.string().max(30).optional().nullable(),
})

/**
 * PATCH /api/super-admin/stores/[id]
 * Editar datos de la tienda y/o del owner
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const storeId = Number(id)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = editStoreSchema.parse(body)

    const store = await db.store.findUnique({
      where: { id: storeId },
      include: { user: true },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Actualizar datos de la tienda
    const storeUpdate: Record<string, unknown> = {}
    if (data.name !== undefined) storeUpdate.name = data.name
    if (data.legalName !== undefined) storeUpdate.legalName = data.legalName
    if (data.nit !== undefined) storeUpdate.nit = data.nit
    if (data.address !== undefined) storeUpdate.address = data.address
    if (data.phone !== undefined) storeUpdate.phone = data.phone

    const updatedStore = await db.store.update({
      where: { id: storeId },
      data: storeUpdate,
    })

    // Actualizar datos del owner
    const userUpdate: Record<string, unknown> = {}
    if (data.ownerFullName !== undefined) userUpdate.fullName = data.ownerFullName
    if (data.ownerEmail !== undefined) userUpdate.email = data.ownerEmail
    if (data.ownerPhone !== undefined) userUpdate.phone = data.ownerPhone

    let updatedUser = null
    if (Object.keys(userUpdate).length > 0) {
      updatedUser = await db.user.update({
        where: { id: store.userId },
        data: userUpdate,
      })
    }

    return NextResponse.json({
      store: updatedStore,
      user: updatedUser || store.user,
      message: 'Tienda actualizada exitosamente',
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Error updating store:', error)
    return NextResponse.json({ error: 'Error al actualizar tienda' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/stores/[id]
 * Eliminar una tienda y todos sus datos en cascada
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const storeId = Number(id)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      include: { user: true, employees: true },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const storeName = store.name

    await db.$transaction(async (tx) => {
      // 1. Collect all user IDs to delete (before removing FK references)
      const employeeUsers = await tx.employee.findMany({
        where: { storeId },
        select: { userId: true },
      })
      const userIdsToDelete = [
        ...employeeUsers.map((e) => e.userId),
        store.userId, // store owner
      ]

      // 2. Delete all Employees first (removes Employee→User FK references,
      //    avoiding Restrict errors from Employee and CashRegister FKs)
      await tx.employee.deleteMany({
        where: { storeId },
      })
      // 3. Delete the Store (cascades to its own children via Store FKs)
      await tx.store.delete({ where: { id: storeId } })
      // 4. Now safe to delete the Users (Employee records are gone,
      //    CashRegister userId is SetNull so it won't block)
      for (const userId of userIdsToDelete) {
        await tx.user.delete({ where: { id: userId } })
      }
    })

    return NextResponse.json({ message: `Tienda "${storeName}" eliminada exitosamente` })
  } catch (error) {
    logger.error('Error deleting store:', error)
    return NextResponse.json({ error: 'Error al eliminar tienda' }, { status: 500 })
  }
}
