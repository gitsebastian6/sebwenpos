import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const xmlImportSchema = z.object({
  storeId: z.number().int().positive(),
  notes: z.string().optional(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceDate: z.string().optional(),
  providerId: z.number().int().positive().optional(),
  providerName: z.string().optional(),
  providerNit: z.string().optional(),
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
    const {
      storeId,
      notes,
      invoiceNumber,
      invoiceDate,
      providerId,
      providerName,
      providerNit,
      items,
    } = xmlImportSchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, storeId)
    if (storeAccessError) return storeAccessError

    logger.info(`XML import start — store=${storeId}, items=${items.length}, invoice=${invoiceNumber || 'N/A'}`)

    // ---- Provider resolution (before transaction) ----
    let resolvedProviderId: number | null = providerId ?? null
    let providerCreated = false
    let resolvedProviderName: string | null = null

    if (resolvedProviderId) {
      // User manually selected a provider — verify it belongs to the store
      const provider = await db.provider.findFirst({
        where: { id: resolvedProviderId, storeId },
      })
      if (!provider) {
        return NextResponse.json({ error: 'Proveedor no encontrado para esta tienda' }, { status: 400 })
      }
      resolvedProviderName = provider.name
      logger.info(`XML import — provider selected by ID: ${provider.name} (#${provider.id})`)
    } else if (providerNit) {
      // Try to find existing provider by NIT (case-insensitive)
      const existing = await db.provider.findFirst({
        where: {
          storeId,
          nit: { equals: providerNit, mode: 'insensitive' } as any,
        },
      })
      if (existing) {
        resolvedProviderId = existing.id
        resolvedProviderName = existing.name
        logger.info(`XML import — provider matched by NIT: ${existing.name} (#${existing.id})`)
      }
    }

    // If no provider matched yet and providerName is available, try name match
    if (!resolvedProviderId && providerName) {
      const existing = await db.provider.findFirst({
        where: {
          storeId,
          name: { contains: providerName },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) {
        resolvedProviderId = existing.id
        resolvedProviderName = existing.name
        logger.info(`XML import — provider matched by name: ${existing.name} (#${existing.id})`)
      }
    }

    // If still no provider and we have NIT or name data, auto-create
    if (!resolvedProviderId && (providerNit || providerName)) {
      const newProvider = await db.provider.create({
        data: {
          storeId,
          name: providerName || 'Sin nombre',
          nit: providerNit || null,
          isActive: true,
        },
      })
      resolvedProviderId = newProvider.id
      resolvedProviderName = newProvider.name
      providerCreated = true
      logger.info(`XML import — provider auto-created: ${newProvider.name} (#${newProvider.id})`)
    }

    // ---- Purchase creation in transaction ----
    const result = await db.$transaction(async (tx) => {
      let grandTotal = 0
      let productsCreated = 0
      let productsMatched = 0
      const purchaseItems: { productId: number; quantity: number; unitCost: number; total: number }[] = []

      for (const item of items) {
        let productId = item.productId

        if (productId === 0 && item.name) {
          // Try to find existing product by name (case-insensitive contains)
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
            productsMatched++
          } else {
            // Auto-create new product
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
            productsCreated++
          }
        } else if (productId === 0 && !item.name) {
          // No product ID and no name — skip this item
          continue
        } else {
          // Existing product ID provided — verify it exists
          productsMatched++
        }

        const product = await tx.product.findUnique({ where: { id: productId } })
        if (!product) continue

        const total = item.quantity * item.unitCost
        grandTotal += total

        // Update product stock
        await tx.product.update({
          where: { id: productId },
          data: { currentStock: { increment: item.quantity } },
        })

        // Create inventory movement
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

      // Parse invoice date if provided
      const parsedInvoiceDate = invoiceDate ? new Date(invoiceDate) : new Date()

      // Create the purchase
      const purchase = await tx.purchase.create({
        data: {
          storeId,
          providerId: resolvedProviderId,
          invoiceNumber: invoiceNumber || null,
          date: parsedInvoiceDate,
          notes: notes || 'Importado desde factura XML',
          total: grandTotal,
          status: 'COMPLETED',
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

      return {
        purchaseId: purchase.id,
        itemsCreated: purchaseItems.length,
        productsCreated,
        productsMatched,
        providerCreated,
        providerName: resolvedProviderName,
      }
    })

    logger.info(`XML import complete — purchaseId=${result.purchaseId}, items=${result.itemsCreated}, newProducts=${result.productsCreated}, matchedProducts=${result.productsMatched}`)

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      logger.warn('XML import validation error:', error.issues)
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error al importar factura XML'
    logger.error('XML import error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
