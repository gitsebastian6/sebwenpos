import { getAuthUser, requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { add, div, mul, toDec, toNum } from '@/lib/stock-math'
import { receiveBatchFromPurchase } from '@/domain/inventory/batch-receiver'
import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const purchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  // Extra presentation being purchased (e.g. "Caja x24"). Omit for the
  // product's own base "Unidad" — quantity/unitCost are always denominated
  // in whichever of the two this is; stock/CPP convert to base units below.
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unitCost: z.number().int().min(0, 'El costo unitario no puede ser negativo'),
  ivaRate: z.number().int().min(0).max(100).default(19),
  discountAmount: z.number().int().min(0).default(0),
  lotNumber: z.string().max(50).optional(),
  expiryDate: z.string().optional(),       // ISO date string
  manufacturingDate: z.string().optional(), // ISO date string
  // Línea bonificada/gratis (detectada en el XML o marcada a mano) — solo
  // informativa para reportes/Kardex, nunca cambia el cálculo de CPP.
  isBonus: z.boolean().default(false),
  // Código propio del proveedor para este producto (cac:SellersItemIdentification
  // del XML) — si viene, se guarda/actualiza como homologación para que la
  // próxima importación de este mismo proveedor resuelva sola.
  sellerSku: z.string().max(100).optional(),
})

const createPurchaseSchema = z.object({
  storeId: z.number().int().positive(),
  providerId: z.number().int().positive().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Debe haber al menos un producto'),
  documentType: z.enum(['FACTURA_COMPRA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'RECIBO_CAJA', 'ORDEN_COMPRA']).default('FACTURA_COMPRA'),
  date: z.string().optional(),              // ISO date string
  paymentTerms: z.enum(['CONTADO', 'CREDITO_30', 'CREDITO_60', 'CREDITO_90']).default('CONTADO'),
  notes: z.string().max(500).optional(),
  // Impuesto al Consumo (IC) declarado en la factura — a nivel de documento
  // completo, no por línea (a diferencia del IVA). No es descontable, así
  // que solo se suma al total a pagar; nunca afecta el costo del producto.
  consumptionTax: z.number().int().min(0).default(0),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

const RETE_FUENTE_RATE = 0.025
const RETE_FUENTE_THRESHOLD = 2_800_000 // COP
const RETE_ICA_RATE = 0.00966          // Barranquilla 9.66‰
const RETE_ICA_THRESHOLD = 0           // Apply regardless of amount

/** Build "PC-NNNN" consecutive number from the next integer. */
function formatConsecutive(num: number): string {
  return `PC-${String(num).padStart(4, '0')}`
}

/** Parse optional ISO date string to Date or null. */
function parseOptionalDate(str: string | null | undefined): Date | null {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** Return number of credit days from paymentTerms. */
function creditDays(terms: string): number {
  switch (terms) {
    case 'CREDITO_30': return 30
    case 'CREDITO_60': return 60
    case 'CREDITO_90': return 90
    default: return 0
  }
}

/** Add N days to a Date. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Auto-calculate retenciones based on provider regime. */
function calculateRetenciones(subtotal: number, regime: string) {
  let totalReteFuente = 0
  let totalReteIca = 0
  const totalReteIva = 0 // Autoretainer only, complex — handled manually for now

  // ReteFuente: 2.5% when provider is RESPONSABLE and subtotal > threshold
  if (regime === 'RESPONSABLE' && subtotal > RETE_FUENTE_THRESHOLD) {
    totalReteFuente = Math.round(subtotal * RETE_FUENTE_RATE)
  }

  // ReteICA: 9.66‰ for all (Barranquilla). Apply even for small amounts.
  if (subtotal > RETE_ICA_THRESHOLD) {
    totalReteIca = Math.round(subtotal * RETE_ICA_RATE)
  }

  return { totalReteFuente, totalReteIca, totalReteIva }
}

// ─── GET: List purchases ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')
    const q = searchParams.get('q') || ''
    const status = searchParams.get('status')
    const paymentStatus = searchParams.get('paymentStatus')
    const documentType = searchParams.get('documentType')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = Number(searchParams.get('page') || '1')
    const limit = Number(searchParams.get('limit') || '50')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const sid = Number(storeId)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'storeId inválido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, sid)
    if (storeAccessErr) return storeAccessErr

    // Build where clause
    const where: Record<string, unknown> = { storeId: sid }

    if (q) {
      where.OR = [
        { notes: { contains: q } },
        { invoiceNumber: { contains: q } },
        { consecutiveNumber: { contains: q } },
        { provider: { name: { contains: q } } },
      ]
    }
    if (status && status !== 'ALL') {
      where.status = status
    }
    if (paymentStatus && paymentStatus !== 'ALL') {
      where.paymentStatus = paymentStatus
    }
    if (documentType && documentType !== 'ALL') {
      where.documentType = documentType
    }
    if (from || to) {
      const dateFilter: Record<string, unknown> = {}
      if (from) {
        dateFilter.gte = new Date(from)
      }
      if (to) {
        // End of day
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        dateFilter.lte = toDate
      }
      where.date = dateFilter
    }

    const skip = Math.max(0, (page - 1) * limit)
    const take = Math.min(limit, 200) // cap at 200

    const [purchases, total] = await Promise.all([
      db.purchase.findMany({
        where,
        include: {
          provider: true,
          purchaseItems: {
            include: {
              product: {
                select: { id: true, name: true, costPrice: true },
              },
            },
          },
          purchasePayments: {
            select: { id: true, amount: true, paymentMethod: true, createdAt: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      db.purchase.count({ where }),
    ])

    const result = purchases.map((p) => {
      const paymentsCount = p.purchasePayments.length
      const paymentsTotal = p.purchasePayments.reduce((sum, pp) => sum + pp.amount, 0)

      return {
        id: p.id,
        storeId: p.storeId,
        providerId: p.providerId,
        provider: p.provider || null,
        invoiceNumber: p.invoiceNumber,
        documentType: p.documentType,
        consecutiveNumber: p.consecutiveNumber,
        date: p.date.toISOString(),
        dueDate: p.dueDate?.toISOString() || null,
        paymentTerms: p.paymentTerms,
        paymentStatus: p.paymentStatus,
        amountPaid: p.amountPaid,
        subtotal: p.subtotal,
        totalIva: p.totalIva,
        totalReteFuente: p.totalReteFuente,
        totalReteIca: p.totalReteIca,
        totalReteIva: p.totalReteIva,
        totalDiscount: p.totalDiscount,
        totalConsumptionTax: p.totalConsumptionTax,
        notes: p.notes,
        total: p.total,
        status: p.status,
        createdById: p.createdById,
        itemCount: p.purchaseItems.length,
        purchaseItems: p.purchaseItems.map((item) => ({
          id: item.id,
          purchaseId: item.purchaseId,
          productId: item.productId,
          product: item.product
            ? { id: item.product.id, name: item.product.name, costPrice: item.product.costPrice }
            : null,
          presentationName: item.presentationName ?? null,
          unitsPerPack: item.unitsPerPack,
          quantity: item.quantity,
          returnedQuantity: item.returnedQuantity,
          unitCost: item.unitCost,
          ivaRate: item.ivaRate,
          ivaAmount: item.ivaAmount,
          discountAmount: item.discountAmount,
          lotNumber: item.lotNumber,
          expiryDate: item.expiryDate?.toISOString() || null,
          manufacturingDate: item.manufacturingDate?.toISOString() || null,
          isBonus: item.isBonus,
          total: item.total,
        })),
        _payments: {
          count: paymentsCount,
          total: paymentsTotal,
        },
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({
      data: result,
      pagination: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    })
  } catch (error) {
    logger.error('GET /api/purchases error:', error)
    return NextResponse.json({ error: 'Error al obtener compras' }, { status: 500 })
  }
}

// ─── POST: Create purchase ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createPurchaseSchema.parse(body)

    // Auth
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError
    const auth = getAuthUser(req)

    // Verify all products belong to the store
    const productIds = data.items.map((item) => item.productId)
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        storeId: data.storeId,
      },
      select: { id: true, name: true, costPrice: true, currentStock: true, trackExpiration: true },
    })

    const foundIds = new Set(products.map((p) => p.id))
    const missingIds = productIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Productos no encontrados: ${missingIds.join(', ')}` },
        { status: 400 },
      )
    }

    // Resolve presentations (Caja x24, etc.) — always from the DB, and must
    // actually belong to the product they're being purchased under.
    const presentationMap = new Map<number, { id: number; productId: number; name: string; unitLabel: string; unitsPerPack: Prisma.Decimal }>()
    const presentationIds = data.items.map((i) => i.presentationId).filter((id): id is number => !!id)
    if (presentationIds.length > 0) {
      const presentations = await db.productPresentation.findMany({
        where: { id: { in: presentationIds }, isActive: true, product: { storeId: data.storeId } },
        select: { id: true, productId: true, name: true, unitLabel: true, unitsPerPack: true },
      })
      for (const p of presentations) presentationMap.set(p.id, p)
    }
    for (const item of data.items) {
      if (!item.presentationId) continue
      const presentation = presentationMap.get(item.presentationId)
      if (!presentation || presentation.productId !== item.productId) {
        const product = products.find((p) => p.id === item.productId)
        return NextResponse.json(
          { error: `La presentación seleccionada para "${product?.name || item.productId}" ya no existe o fue desactivada` },
          { status: 400 },
        )
      }
    }

    // Verify provider and get regime for retenciones
    let providerRegime = 'NO_RESPONSABLE'
    if (data.providerId) {
      const provider = await db.provider.findFirst({
        where: { id: data.providerId, storeId: data.storeId },
      })
      if (!provider) {
        return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })
      }
      providerRegime = provider.regime
    }

    // Build items with calculated fields
    const itemsWithCalculations = data.items.map((item) => {
      const ivaAmount = Math.round(item.unitCost * item.quantity * item.ivaRate / 100)
      // Redondear a COP entero (quantity puede ser decimal; total es Int)
      const total = Math.round(item.unitCost * item.quantity) + ivaAmount - item.discountAmount
      return {
        ...item,
        ivaAmount,
        total: Math.max(0, total),
      }
    })

    // Calculate purchase totals (redondear a COP entero — quantity puede ser decimal)
    const subtotal = itemsWithCalculations.reduce((sum, item) => sum + Math.round(item.unitCost * item.quantity), 0)
    const totalIva = itemsWithCalculations.reduce((sum, item) => sum + item.ivaAmount, 0)
    const totalDiscount = itemsWithCalculations.reduce((sum, item) => sum + item.discountAmount, 0)

    // Retenciones
    const { totalReteFuente, totalReteIca, totalReteIva } = calculateRetenciones(subtotal, providerRegime)

    // Grand total
    const total = subtotal + totalIva + data.consumptionTax - totalReteFuente - totalReteIca - totalReteIva - totalDiscount

    // Payment status
    const isContado = data.paymentTerms === 'CONTADO'
    const paymentStatus = isContado ? 'PAID' : 'PENDING'
    const amountPaid = isContado ? total : 0

    // Due date
    const purchaseDate = parseOptionalDate(data.date) || new Date()
    const dueDate = isContado ? null : addDays(purchaseDate, creditDays(data.paymentTerms))

    // Create purchase in transaction
    const purchase = await db.$transaction(async (tx) => {
      // Auto-generate consecutive number
      const lastPurchase = await tx.purchase.findFirst({
        where: { storeId: data.storeId },
        orderBy: { id: 'desc' },
        select: { id: true },
      })
      const nextNum = (lastPurchase?.id || 0) + 1
      const consecutiveNumber = formatConsecutive(nextNum)

      // Create purchase
      const createdPurchase = await tx.purchase.create({
        data: {
          storeId: data.storeId,
          providerId: data.providerId || null,
          documentType: data.documentType,
          consecutiveNumber,
          date: purchaseDate,
          dueDate,
          paymentTerms: data.paymentTerms,
          paymentStatus,
          amountPaid,
          subtotal,
          totalIva,
          totalReteFuente,
          totalReteIca,
          totalReteIva,
          totalDiscount,
          totalConsumptionTax: data.consumptionTax,
          notes: data.notes || null,
          total,
          status: 'COMPLETED',
          createdById: auth?.userId || null,
          purchaseItems: {
            create: itemsWithCalculations.map((item) => {
              const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
              return {
                productId: item.productId,
                presentationId: presentation ? presentation.id : null,
                presentationName: presentation ? presentation.name : null,
                unitsPerPack: presentation ? presentation.unitsPerPack : 1,
                quantity: item.quantity,
                unitCost: item.unitCost,
                ivaRate: item.ivaRate,
                ivaAmount: item.ivaAmount,
                discountAmount: item.discountAmount,
                lotNumber: item.lotNumber || null,
                expiryDate: parseOptionalDate(item.expiryDate),
                manufacturingDate: parseOptionalDate(item.manufacturingDate),
                isBonus: item.isBonus,
                total: item.total,
              }
            }),
          },
        },
        include: {
          purchaseItems: true,
        },
      })

      // Update products: stock, cost, cost history, inventory movement
      for (const item of itemsWithCalculations) {
        const productMeta = products.find((p) => p.id === item.productId) // solo para .name — nunca cambia durante la compra
        if (!productMeta) continue

        const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
        const unitsPerPack = presentation ? presentation.unitsPerPack : 1
        const baseUnits = mul(item.quantity, unitsPerPack)

        // Costo Promedio Ponderado (CPP): never overwrite with the latest purchase
        // price alone — that inflates/deflates margin on existing stock. The new
        // unit cost is the weighted average of what's already on hand plus what
        // just came in. item.quantity*item.unitCost is the line's total cost
        // regardless of denomination, so dividing by baseUnits (not item.quantity)
        // correctly reduces it to a per-base-unit weighted average.
        //
        // Lectura en vivo (no desde `products`, que se cargó una sola vez antes
        // de esta transacción): esencial cuando el mismo producto aparece en más
        // de una línea de esta compra (ej. una línea pagada + una bonificada del
        // mismo producto) — sin esto, la segunda línea calcularía su CPP contra
        // el stock/costo de ANTES de la compra, ignorando lo que la primera línea
        // ya escribió, y su update sobrescribiría el resultado correcto.
        const liveProduct = await tx.product.findUnique({
          where: { id: item.productId },
          select: { costPrice: true, currentStock: true },
        })
        // Stock nunca negativo para el CPP (Math.max(0, ...) con Decimal)
        const existingStock = toDec(liveProduct?.currentStock).isNegative()
          ? new Prisma.Decimal(0)
          : toDec(liveProduct?.currentStock)
        const existingCost = liveProduct?.costPrice ?? productMeta.costPrice
        // CPP = (stockActual × costoActual + cantidad × costoNuevo) / (stockActual + unidadesBase)
        // Guard de división por cero: si no hay stock previo ni unidades entrantes,
        // el nuevo costo es simplemente el costo de la línea (evita Infinity/NaN).
        const totalCost = add(mul(existingStock, existingCost), mul(item.quantity, item.unitCost))
        const totalUnits = add(existingStock, baseUnits)
        const newCostPrice = totalUnits.isZero()
          ? item.unitCost
          : Math.round(toNum(div(totalCost, totalUnits)))

        // Update stock (in base units) and cost price
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: baseUnits },
            costPrice: newCostPrice,
          },
        })

        // Keep the presentation's own displayed cost in sync with what was just paid for it
        if (presentation) {
          await tx.productPresentation.update({
            where: { id: presentation.id },
            data: { costPrice: item.unitCost },
          })
        }

        // Create CostHistory if cost changed
        if (existingCost !== newCostPrice) {
          await tx.costHistory.create({
            data: {
              productId: item.productId,
              storeId: data.storeId,
              previousCost: existingCost,
              newCost: newCostPrice,
              purchaseId: createdPurchase.id,
              reason: 'PURCHASE',
            },
          })
        }

        // Create inventory movement (always in base units)
        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            presentationId: presentation ? presentation.id : null,
            presentationName: presentation ? presentation.name : null,
            unitsPerPack: presentation ? presentation.unitsPerPack : 1,
            quantity: baseUnits,
            movementType: 'PURCHASE',
            referenceId: createdPurchase.id,
            notes: presentation
              ? `Compra ${consecutiveNumber} — ${productMeta.name} — ${presentation.name} x${item.quantity} (${baseUnits} uds base)${item.isBonus ? ' (bonificado)' : ''}`
              : `Compra ${consecutiveNumber} — ${productMeta.name} x${item.quantity}${item.isBonus ? ' (bonificado)' : ''}`,
          },
        })

        // Trazabilidad por lote (Vidal): si el producto rastrea vencimiento y la
        // línea trae lotNumber, crea/consolida el Batch correspondiente.
        if (productMeta.trackExpiration && item.lotNumber?.trim()) {
          const createdItem = await tx.purchaseItem.findFirst({
            where: {
              purchaseId: createdPurchase.id,
              productId: item.productId,
              presentationId: presentation ? presentation.id : null,
            },
            select: { id: true },
          })
          await receiveBatchFromPurchase(tx, {
            storeId: data.storeId,
            productId: item.productId,
            purchaseItemId: createdItem?.id ?? null,
            lotNumber: item.lotNumber,
            expiryDate: parseOptionalDate(item.expiryDate),
            manufacturingDate: parseOptionalDate(item.manufacturingDate),
            baseUnits: toNum(baseUnits),
            baseUnitCost: toNum(div(item.unitCost, unitsPerPack || 1)),
          })
        }

        // Homologación por proveedor: si esta línea trae el código propio del
        // proveedor, se guarda/actualiza para que la próxima importación de este
        // mismo proveedor resuelva sola. Corre para cualquier origen de la línea
        // (código de barras, SKU, sugerencia por nombre o selección manual) —
        // idempotente y autocorrectivo: si el usuario corrigió el producto de
        // una línea mal resuelta antes de confirmar, esto sobrescribe la
        // homologación guardada con la corrección.
        if (data.providerId && item.sellerSku?.trim()) {
          const sellerSkuNorm = item.sellerSku.trim().toLowerCase()
          await tx.providerProductMapping.upsert({
            where: { providerId_sellerSku: { providerId: data.providerId, sellerSku: sellerSkuNorm } },
            update: { productId: item.productId, presentationId: presentation ? presentation.id : null },
            create: {
              storeId: data.storeId,
              providerId: data.providerId,
              sellerSku: sellerSkuNorm,
              productId: item.productId,
              presentationId: presentation ? presentation.id : null,
            },
          })
        }
      }

      // Create initial payment for CONTADO
      if (isContado && total > 0) {
        await tx.purchasePayment.create({
          data: {
            purchaseId: createdPurchase.id,
            storeId: data.storeId,
            amount: total,
            paymentMethod: 'CASH',
            notes: 'Pago de contado al registrar compra',
            createdById: auth?.userId || null,
          },
        })
      }

      // Update provider totals
      if (data.providerId) {
        await tx.provider.update({
          where: { id: data.providerId },
          data: {
            totalPurchases: { increment: total },
            // Only increase debt for credit purchases
            ...(isContado ? {} : { totalDebt: { increment: total } }),
          },
        })
      }

      return createdPurchase
    }, { timeout: 15000, maxWait: 5000 })

    return NextResponse.json(
      {
        id: purchase.id,
        consecutiveNumber: purchase.consecutiveNumber,
        message: 'Compra creada exitosamente',
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/purchases error:', error)
    return NextResponse.json({ error: 'Error al crear compra' }, { status: 500 })
  }
}
