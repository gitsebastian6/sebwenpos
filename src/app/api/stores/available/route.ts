import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stores/available
 * Returns the list of stores available to the current OWNER user
 * (their main store + any branches/sucursales).
 * Used by the AppShell on mount to populate the store switcher
 * without requiring re-login.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })
    }

    if (auth.role !== 'OWNER') {
      return NextResponse.json({ stores: [] })
    }

    // Fetch user with their store relation (User has store: Store?, not storeId)
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: {
        store: {
          select: { id: true, name: true },
        },
      },
    })

    const mainStore = user?.store
    if (!mainStore) {
      return NextResponse.json({ stores: [] })
    }

    const branches = await db.store.findMany({
      where: { parentStoreId: mainStore.id },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })

    const stores = [
      { id: mainStore.id, name: mainStore.name, isMain: true },
      ...branches.map(b => ({ id: b.id, name: b.name, isMain: false })),
    ]

    return NextResponse.json({ stores })
  } catch (error) {
    logger.error('Error fetching available stores:', error)
    return NextResponse.json({ stores: [] })
  }
}
