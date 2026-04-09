import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const xmlImportSchema = z.object({
  storeId: z.number().int().positive(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    unitCost: z.number().int().nonnegative(),
    name: z.string().optional(),
  })).min(1, 'Debe haber al menos un producto'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { storeId, notes, items } = xmlImportSchema.parse(body)

    const result = await db.$transaction(async (tx) => {
      let grandTotal = 0
      const purchaseItems: { productId: number; quantity: number; unitCost: number; total: number }[] = []

      for (const item of items) {
        let productId = item.productId

        if (productId === 0 && item.name) {
          const existing = await tx.product.findFirst({
            where: {
              storeId,
              name: { contains: item.name },
              isActive: true,
            },
            orderBy: { createdAt: 'desc' },
          })

          if (existing) {
            productId = existing.id
          } else {
            const newProduct = await tx.product.create({
              data: {
                storeId,
                name: item.name,
                salePrice: Math.round(item.unitCost * 1.3),
                costPrice: item.unitCost,
                currentStock: 0,
                minStock: 5,
                isActive: true,
              },
            })
            productId = newProduct.id
          }
        } else if (productId === 0 && !item.name) {
          continue
        }

        const product = await tx.product.findUnique({ where: { id: productId } })
        if (!product) continue

        const total = item.quantity * item.unitCost
        grandTotal += total

        await tx.product.update({
          where: { id: productId },
          data: { currentStock: { increment: item.quantity } },
        })

        await tx.inventoryMovement.create({
          data: {
            storeId,
            productId,
            quantity: item.quantity,
            movementType: 'PURCHASE',
            notes: 'Importado desde XML factura',
          },
        })

        purchaseItems.push({ productId, quantity: item.quantity, unitCost: item.unitCost, total })
      }

      if (purchaseItems.length === 0) {
        throw new Error('No se pudieron procesar los productos del XML')
      }

      const purchase = await tx.purchase.create({
        data: {
          storeId,
          notes: notes || 'Importado desde factura XML',
          total: grandTotal,
          status: 'COMPLETED',
          date: new Date(),
          purchaseItems: {
            create: purchaseItems.map((pi) => ({
              productId: pi.productId,
              quantity: pi.quantity,
              unitCost: pi.unitCost,
              total: pi.total,
            })),
          },
        },
      })

      return { purchaseId: purchase.id, itemsCreated: purchaseItems.length }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error al importar factura XML'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
