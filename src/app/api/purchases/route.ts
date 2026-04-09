import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const purchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0'),
  unitCost: z.number().int().min(0, 'El costo unitario no puede ser negativo'),
})

const createPurchaseSchema = z.object({
  storeId: z.number().int().positive(),
  providerId: z.number().int().positive().optional(),
  invoiceNumber: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(purchaseItemSchema)
    .min(1, 'Debe haber al menos un producto'),
})

// GET: List purchases
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')
    const q = searchParams.get('q') || ''
    const status = searchParams.get('status')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const sid = Number(storeId)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'storeId inválido' }, { status: 400 })
    }

    const where: Record<string, unknown> = { storeId: sid }

    if (q) {
      where.OR = [
        { notes: { contains: q } },
        { provider: { name: { contains: q } } },
      ]
    }
    if (status && status !== 'ALL') {
      where.status = status
    }

    const purchases = await db.purchase.findMany({
      where,
      include: {
        provider: {
          select: { id: true, name: true },
        },
        purchaseItems: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    const result = purchases.map((p) => ({
      id: p.id,
      storeId: p.storeId,
      providerId: p.providerId,
      provider: p.provider ? { id: p.provider.id, name: p.provider.name } : null,
      invoiceNumber: p.invoiceNumber,
      date: p.date.toISOString(),
      notes: p.notes,
      total: p.total,
      status: p.status,
      itemCount: p.purchaseItems.length,
      purchaseItems: p.purchaseItems.map((item) => ({
        id: item.id,
        purchaseId: item.purchaseId,
        productId: item.productId,
        product: { id: item.product.id, name: item.product.name },
        quantity: item.quantity,
        unitCost: item.unitCost,
        total: item.total,
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/purchases error:', error)
    return NextResponse.json({ error: 'Error al obtener compras' }, { status: 500 })
  }
}

// POST: Create purchase with items
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createPurchaseSchema.parse(body)

    // Verify all products belong to the store
    const productIds = data.items.map((item) => item.productId)
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        storeId: data.storeId,
      },
      select: { id: true },
    })

    const foundIds = new Set(products.map((p) => p.id))
    const missingIds = productIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Productos no encontrados: ${missingIds.join(', ')}` },
        { status: 400 },
      )
    }

    // Verify provider belongs to store if provided
    if (data.providerId) {
      const provider = await db.provider.findFirst({
        where: { id: data.providerId, storeId: data.storeId },
      })
      if (!provider) {
        return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })
      }
    }

    // Create purchase and items in a transaction
    const purchase = await db.$transaction(async (tx) => {
      // Calculate totals for each item
      const itemsWithTotals = data.items.map((item) => ({
        ...item,
        total: item.quantity * item.unitCost,
      }))

      const purchaseTotal = itemsWithTotals.reduce((sum, item) => sum + item.total, 0)

      // Create purchase
      const createdPurchase = await tx.purchase.create({
        data: {
          storeId: data.storeId,
          providerId: data.providerId || null,
          invoiceNumber: data.invoiceNumber || null,
          notes: data.notes || null,
          total: purchaseTotal,
          status: 'COMPLETED',
          purchaseItems: {
            create: itemsWithTotals.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              total: item.total,
            })),
          },
        },
        include: {
          purchaseItems: true,
        },
      })

      // Update product stock and create inventory movements
      for (const item of itemsWithTotals) {
        // Increment product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity },
          },
        })

        // Create inventory movement
        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            quantity: item.quantity,
            movementType: 'PURCHASE',
            referenceId: createdPurchase.id,
            notes: `Compra #${createdPurchase.id}`,
          },
        })
      }

      return createdPurchase
    })

    return NextResponse.json(
      { id: purchase.id, message: 'Compra creada exitosamente' },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/purchases error:', error)
    return NextResponse.json({ error: 'Error al crear compra' }, { status: 500 })
  }
}
