import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { rateLimit, getClientIp } from '@/lib/rate-limiter'
import { generateOnlineOrderNumber } from '@/lib/auth'
import { normalizePhone, defaultDialCode } from '@/lib/phone'
import { emitOnlineOrderCreated } from '@/lib/tables-sync'

export const dynamic = 'force-dynamic'

// Ruta PÚBLICA (cubierta por PUBLIC_PATHS = /api/public/): el middleware NO la
// autentica ni la rate-limita → el rate-limit se aplica aquí, por IP y por
// teléfono. Un pedido es solo una SOLICITUD: no toca stock ni contabilidad.

const MAX_LINES = 50
const MAX_QTY_PER_LINE = 999
const DEDUPE_WINDOW_MIN = 10

const itemSchema = z.object({
  productId: z.number().int().positive(),
  presentationId: z.number().int().positive().optional().nullable(),
  quantity: z.number().positive().max(MAX_QTY_PER_LINE),
})

const bodySchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(5).max(30),
  countryCode: z.string().trim().max(4).optional(),
  fulfillmentType: z.enum(['DELIVERY', 'PICKUP']),
  deliveryAddress: z.string().trim().max(200).optional().nullable(),
  deliveryNotes: z.string().trim().max(300).optional().nullable(),
  items: z.array(itemSchema).min(1).max(MAX_LINES),
})

function money(n: number) {
  return Math.max(0, Math.round(n))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId: storeIdParam } = await params

    // ── Rate limit por IP ──
    const ip = getClientIp(req)
    if (!rateLimit('online-order-ip', ip, { maxRequests: 5, windowSeconds: 60 }).success) {
      return NextResponse.json({ error: 'Demasiados pedidos seguidos. Espera un momento.' }, { status: 429 })
    }

    const raw = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400 })
    }
    const data = parsed.data

    if (data.fulfillmentType === 'DELIVERY' && !data.deliveryAddress) {
      return NextResponse.json({ error: 'La dirección es obligatoria para domicilio' }, { status: 400 })
    }

    // ── Resolver tienda (por id numérico o slug) ──
    const numId = parseInt(storeIdParam)
    const store = await db.store.findFirst({
      where: isNaN(numId) ? { storeSlug: storeIdParam } : { id: numId },
      select: {
        id: true, storeActive: true, acceptingOrders: true, countryCode: true, currencyCode: true,
        deliveryEnabled: true, deliveryFee: true, deliveryFreeAbove: true, deliveryMinOrder: true,
      },
    })
    if (!store || !store.storeActive) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }
    if (!store.acceptingOrders) {
      return NextResponse.json({ error: 'La tienda no está recibiendo pedidos en este momento.' }, { status: 409 })
    }

    // ── Rate limit por teléfono normalizado ──
    const dialCode = data.countryCode?.replace(/\D/g, '') || defaultDialCode({ countryCode: store.countryCode, currencyCode: store.currencyCode })
    const phoneNormalized = normalizePhone(data.customerPhone, dialCode)
    if (!phoneNormalized) {
      return NextResponse.json({ error: 'El número de teléfono no es válido' }, { status: 400 })
    }
    if (!rateLimit('online-order-phone', phoneNormalized, { maxRequests: 3, windowSeconds: 600 }).success) {
      return NextResponse.json({ error: 'Ya enviaste varios pedidos. Espera unos minutos.' }, { status: 429 })
    }

    // ── Resolver productos y presentaciones desde la BD (NUNCA precios del cliente) ──
    const productIds = [...new Set(data.items.map((i) => i.productId))]
    const presentationIds = [...new Set(data.items.map((i) => i.presentationId).filter((v): v is number => !!v))]

    const [products, presentations] = await Promise.all([
      db.product.findMany({
        where: { id: { in: productIds }, storeId: store.id, isActive: true },
        select: { id: true, name: true, salePrice: true, unitLabel: true },
      }),
      presentationIds.length
        ? db.productPresentation.findMany({
            where: { id: { in: presentationIds }, isActive: true, product: { storeId: store.id } },
            select: { id: true, productId: true, name: true, salePrice: true, unitsPerPack: true },
          })
        : Promise.resolve([] as { id: number; productId: number; name: string; salePrice: number; unitsPerPack: import('@prisma/client').Prisma.Decimal }[]),
    ])
    const productMap = new Map(products.map((p) => [p.id, p]))
    const presentationMap = new Map(presentations.map((p) => [p.id, p]))

    const invalid: number[] = []
    const itemsData = data.items.map((item) => {
      const product = productMap.get(item.productId)
      if (!product) { invalid.push(item.productId); return null }
      let unitPrice = product.salePrice
      let presentationName: string | null = null
      let unitsPerPack = 1
      if (item.presentationId) {
        const pres = presentationMap.get(item.presentationId)
        if (!pres || pres.productId !== item.productId) { invalid.push(item.productId); return null }
        unitPrice = pres.salePrice
        presentationName = pres.name
        unitsPerPack = Number(pres.unitsPerPack)
      }
      return {
        productId: product.id,
        presentationId: item.presentationId ?? null,
        productName: product.name,
        presentationName,
        unitsPerPack,
        quantity: item.quantity,
        unitPrice,
        totalRow: money(unitPrice * item.quantity),
      }
    })
    if (invalid.length || itemsData.some((i) => i === null)) {
      return NextResponse.json(
        { error: 'Algunos productos ya no están disponibles. Actualiza la página e inténtalo de nuevo.' },
        { status: 400 },
      )
    }
    const lines = itemsData as NonNullable<(typeof itemsData)[number]>[]

    const subtotal = lines.reduce((s, l) => s + l.totalRow, 0)

    // ── Domicilio (recalculado server-side desde la config de la tienda) ──
    let deliveryFee = 0
    if (data.fulfillmentType === 'DELIVERY' && store.deliveryEnabled) {
      if (store.deliveryMinOrder > 0 && subtotal < store.deliveryMinOrder) {
        return NextResponse.json(
          { error: `El pedido mínimo para domicilio es ${store.deliveryMinOrder}. Te faltan ${store.deliveryMinOrder - subtotal}.`, code: 'MIN_ORDER', missing: store.deliveryMinOrder - subtotal },
          { status: 400 },
        )
      }
      const freeAbove = store.deliveryFreeAbove
      deliveryFee = freeAbove != null && subtotal >= freeAbove ? 0 : money(store.deliveryFee)
    }
    const total = subtotal + deliveryFee

    // ── Dedupe: mismo carrito + total + teléfono en ventana corta → replay ──
    const itemsHash = crypto
      .createHash('sha1')
      .update(JSON.stringify(lines.map((l) => [l.productId, l.presentationId, l.quantity]).sort()))
      .digest('hex')
      .slice(0, 16)
    const dedupeKey = `${itemsHash}:${total}:${phoneNormalized}`
    const since = new Date(Date.now() - DEDUPE_WINDOW_MIN * 60_000)
    const dup = await db.onlineOrder.findFirst({
      where: { storeId: store.id, dedupeKey, createdAt: { gte: since } },
      select: { id: true, orderNumber: true, subtotal: true, deliveryFee: true, total: true, status: true },
      orderBy: { createdAt: 'desc' },
    })
    if (dup) {
      return NextResponse.json({ onlineOrder: dup, deduped: true }, { status: 200 })
    }

    const feeConfigSnapshot = JSON.stringify({
      deliveryEnabled: store.deliveryEnabled,
      deliveryFee: store.deliveryFee,
      deliveryFreeAbove: store.deliveryFreeAbove,
      deliveryMinOrder: store.deliveryMinOrder,
    })

    const created = await db.onlineOrder.create({
      data: {
        storeId: store.id,
        orderNumber: generateOnlineOrderNumber(),
        status: 'PENDING',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerPhoneNormalized: phoneNormalized,
        fulfillmentType: data.fulfillmentType,
        deliveryAddress: data.fulfillmentType === 'DELIVERY' ? data.deliveryAddress ?? null : null,
        deliveryNotes: data.deliveryNotes ?? null,
        subtotal,
        deliveryFee,
        total,
        feeConfigSnapshot,
        dedupeKey,
        items: { create: lines },
      },
      select: { id: true, orderNumber: true, subtotal: true, deliveryFee: true, total: true, status: true },
    })

    emitOnlineOrderCreated(store.id, created)

    return NextResponse.json({ onlineOrder: created }, { status: 201 })
  } catch (error) {
    logger.error('POST /api/public/store/[storeId]/orders error:', error)
    return NextResponse.json({ error: 'No pudimos registrar tu pedido. Intenta de nuevo.' }, { status: 500 })
  }
}
