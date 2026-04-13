import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const comandaItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1),
  notes: z.string().max(200).optional(),
}).refine((d) => d.productId || d.serviceId, {
  message: 'Debe especificar productId o serviceId',
}).refine((d) => !(d.productId && d.serviceId), {
  message: 'Solo puede especificar productId o serviceId, no ambos',
})

const addComandaItemsSchema = z.object({
  storeId: z.number().int().positive(),
  items: z
    .array(comandaItemSchema)
    .min(1, 'Debe agregar al menos un item'),
})

const updateComandaItemsSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1, 'Debe seleccionar al menos un item'),
  status: z.enum(['SERVED', 'PAID', 'CANCELLED']),
})

// ─── GET: List comanda items for session ──────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID de sesión inválido' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = { tableSessionId: sid }

    if (status && ['PENDING', 'SERVED', 'PAID', 'CANCELLED'].includes(status)) {
      where.status = status
    }

    const items = await db.comandaItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: { id: true, name: true, imgUrl: true },
        },
        service: {
          select: { id: true, name: true, icon: true },
        },
      },
    })

    const result = items.map((item) => ({
      id: item.id,
      storeId: item.storeId,
      tableSessionId: item.tableSessionId,
      productId: item.productId ?? null,
      serviceId: item.serviceId ?? null,
      productName: item.productName,
      product: item.product ?? null,
      service: item.service ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      status: item.status,
      createdAt: item.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json({ error: 'Error al obtener la comanda' }, { status: 500 })
  }
}

// ─── POST: Add items to comanda ───────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID de sesión inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = addComandaItemsSchema.parse(body)

    // Verify session exists and is OPEN
    const session = await db.tableSession.findUnique({ where: { id: sid } })
    if (!session) {
      console.error(`[COMANDA] Session ${sid} not found`)
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }
    if (session.status !== 'OPEN') {
      console.error(`[COMANDA] Session ${sid} is ${session.status}, not OPEN`)
      return NextResponse.json({ error: 'La sesión está cerrada' }, { status: 400 })
    }
    if (session.storeId !== data.storeId) {
      console.error(`[COMANDA] Store mismatch: session.storeId=${session.storeId} vs data.storeId=${data.storeId}`)
      return NextResponse.json(
        { error: 'La sesión no pertenece a esta tienda' },
        { status: 400 },
      )
    }

    // Separate product items and service items
    const productItems = data.items.filter((i) => i.productId)
    const serviceItems = data.items.filter((i) => i.serviceId)

    // Resolve products
    const productMap = new Map<number, { id: number; name: string; salePrice: number; currentStock: number }>()
    if (productItems.length > 0) {
      const productIds = productItems.map((i) => i.productId!)
      const products = await db.product.findMany({
        where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, salePrice: true, currentStock: true },
      })
      for (const p of products) {
        productMap.set(p.id, p)
      }
    }

    // Resolve services
    const serviceMap = new Map<number, { id: number; name: string; price: number }>()
    if (serviceItems.length > 0) {
      const serviceIds = serviceItems.map((i) => i.serviceId!)
      const services = await db.service.findMany({
        where: { id: { in: serviceIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, price: true },
      })
      for (const s of services) {
        serviceMap.set(s.id, s)
      }
    }

    // Validate all items exist
    for (const item of productItems) {
      const product = productMap.get(item.productId!)
      if (!product) {
        return NextResponse.json(
          { error: `Producto con ID ${item.productId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
    }

    for (const item of serviceItems) {
      const service = serviceMap.get(item.serviceId!)
      if (!service) {
        return NextResponse.json(
          { error: `Servicio con ID ${item.serviceId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
    }

    // Create comanda items
    const comandaItemsData = data.items.map((item) => {
      if (item.productId) {
        const product = productMap.get(item.productId)!
        return {
          storeId: data.storeId,
          tableSessionId: sid,
          productId: item.productId,
          serviceId: null,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.salePrice,
          total: product.salePrice * item.quantity,
          notes: item.notes || null,
          status: 'PENDING',
        }
      } else {
        const service = serviceMap.get(item.serviceId!)!
        return {
          storeId: data.storeId,
          tableSessionId: sid,
          productId: null,
          serviceId: item.serviceId,
          productName: service.name,
          quantity: item.quantity,
          unitPrice: service.price,
          total: service.price * item.quantity,
          notes: item.notes || null,
          status: 'PENDING',
        }
      }
    })

    const comandaItems = await db.comandaItem.createMany({
      data: comandaItemsData,
    })

    return NextResponse.json(
      { count: comandaItems.count },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json({ error: 'Error al agregar items a la comanda' }, { status: 500 })
  }
}

// ─── PATCH: Update comanda items status ───────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID de sesión inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateComandaItemsSchema.parse(body)

    // Verify session exists and is OPEN
    const session = await db.tableSession.findUnique({ where: { id: sid } })
    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }
    if (session.status !== 'OPEN') {
      return NextResponse.json({ error: 'La sesión está cerrada' }, { status: 400 })
    }

    // Verify all items belong to this session
    const existingItems = await db.comandaItem.findMany({
      where: { id: { in: data.itemIds }, tableSessionId: sid },
      select: { id: true },
    })
    const existingIds = new Set(existingItems.map((i) => i.id))

    const notFound = data.itemIds.filter((id) => !existingIds.has(id))
    if (notFound.length > 0) {
      return NextResponse.json(
        { error: `Item(s) con ID(s) ${notFound.join(', ')} no pertenecen a esta sesión` },
        { status: 400 },
      )
    }

    // Update item statuses
    await db.comandaItem.updateMany({
      where: { id: { in: data.itemIds } },
      data: { status: data.status },
    })

    return NextResponse.json({ updated: existingItems.length, status: data.status })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('PATCH /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar items de la comanda' },
      { status: 500 },
    )
  }
}
