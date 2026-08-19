import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET: Homologaciones guardadas de un proveedor — usado por la importación
// XML para auto-resolver líneas cuyo sellerSku ya se asoció una vez a un
// producto/presentación en una compra anterior de este mismo proveedor.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const providerId = Number(id)
    if (isNaN(providerId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const storeId = Number(new URL(request.url).searchParams.get('storeId'))
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const provider = await db.provider.findFirst({ where: { id: providerId, storeId } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const rows = await db.providerProductMapping.findMany({
      where: { providerId, storeId },
      select: { sellerSku: true, productId: true, presentationId: true },
    })

    return NextResponse.json({ data: rows })
  } catch (error) {
    logger.error('GET /api/providers/[id]/product-mappings error:', error)
    return NextResponse.json({ error: 'Error al obtener homologaciones' }, { status: 500 })
  }
}
