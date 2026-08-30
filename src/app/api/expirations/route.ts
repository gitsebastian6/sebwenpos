import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { lt, sub, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/expirations?storeId=X
//
// Surfaces every recorded lot (PurchaseItem.expiryDate) for the store, most
// urgent first. IMPORTANT caveat baked into this design: stock is a single
// shared counter per product (not tracked per lot), so "quantity received in
// this lot minus what was returned from it" is the best available signal —
// it is NOT necessarily "units of this exact lot still on the shelf" if the
// product has multiple overlapping lots. Good enough for a heads-up; not a
// substitute for physically checking the shelf.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }
    const storeIdNum = Number(storeId)

    const storeAccessError = requireStoreAccess(req, storeIdNum)
    if (storeAccessError) return storeAccessError
    const permErr = await requirePermission(req, 'inventory')
    if (permErr) return permErr

    const items = await db.purchaseItem.findMany({
      where: {
        expiryDate: { not: null },
        purchase: { storeId: storeIdNum, status: { not: 'CANCELLED' } },
      },
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        manufacturingDate: true,
        quantity: true,
        returnedQuantity: true,
        presentationName: true,
        product: {
          select: { id: true, name: true, sku: true, barcode: true, currentStock: true, isActive: true },
        },
        purchase: {
          select: {
            id: true,
            consecutiveNumber: true,
            date: true,
            provider: { select: { name: true } },
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    })

    // A lot that was returned to the supplier in full is no longer on hand.
    const result = items
      .filter((item) => lt(item.returnedQuantity, item.quantity))
      .map((item) => ({
        id: item.id,
        productId: item.product.id,
        productName: item.product.name,
        productSku: item.product.sku,
        productBarcode: item.product.barcode,
        productCurrentStock: toNum(item.product.currentStock),
        productIsActive: item.product.isActive,
        presentationName: item.presentationName,
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate!.toISOString(),
        manufacturingDate: item.manufacturingDate?.toISOString() || null,
        quantityReceived: toNum(item.quantity),
        returnedQuantity: toNum(item.returnedQuantity),
        remainingInLot: toNum(sub(item.quantity, item.returnedQuantity)),
        purchaseId: item.purchase.id,
        purchaseConsecutive: item.purchase.consecutiveNumber,
        purchaseDate: item.purchase.date.toISOString(),
        providerName: item.purchase.provider?.name || null,
      }))

    return NextResponse.json({ data: result })
  } catch (error) {
    logger.error('GET /api/expirations error:', error)
    return NextResponse.json({ error: 'Error al obtener vencimientos' }, { status: 500 })
  }
}
