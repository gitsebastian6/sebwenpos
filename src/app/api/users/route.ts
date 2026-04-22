import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess, getAuthStoreId } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const userUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional().nullable(),
  cedula: z.string().max(30).optional().nullable(),
})

// PUT /api/users?userId=1
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = userUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({
      where: { id: parseInt(userId) },
    })

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Store isolation: only allow updating users in the same store
    const authStoreId = getAuthStoreId(request)
    if (authStoreId) {
      // Look up the target user's store via employee record
      const employee = await db.employee.findFirst({
        where: { userId: parseInt(userId) },
        select: { storeId: true },
      })
      if (employee && employee.storeId !== authStoreId) {
        return NextResponse.json({ error: 'No tienes acceso a este usuario' }, { status: 403 })
      }
      const storeAccessErr = requireStoreAccess(request, authStoreId)
      if (storeAccessErr) return storeAccessErr
    }

    const user = await db.user.update({
      where: { id: parseInt(userId) },
      data: {
        ...parsed.data,
        email: parsed.data.email ?? undefined,
        cedula: parsed.data.cedula ?? undefined,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        cedula: true,
        role: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    logger.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
