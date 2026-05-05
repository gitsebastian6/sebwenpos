import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { emitComandaItemsAdded, emitComandaItemsUpdated, emitComandaItemsRemoved } from '@/lib/tables-sync'

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
  status: z.enum(['SERVED', 'PAID', 'CANCELLED']).optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().max(200).optional(),
}).refine(d => d.status || d.quantity !== undefined || d.notes !== undefined, {
  message: 'Debe especificar al menos un campo para actualizar (status, quantity o notes)',
})

const deleteComandaItemsSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1, 'Debe seleccionar al menos un item'),
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
      notes: item.notes ?? null,
      createdAt: item.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    logger.error('GET /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json({ error: 'Error al obtener la comanda' }, { status: 500 })
  }
}

// ─── POST: Add items to comanda (with smart-merge for duplicates) ─

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
      logger.error(`[COMANDA] Session ${sid} not found`)
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }
    if (session.status !== 'OPEN') {
      logger.error(`[COMANDA] Session ${sid} is ${session.status}, not OPEN`)
      return NextResponse.json({ error: 'La sesión está cerrada' }, { status: 400 })
    }
    if (session.storeId !== data.storeId) {
      logger.error(`[COMANDA] Store mismatch: session.storeId=${session.storeId} vs data.storeId=${data.storeId}`)
      return NextResponse.json(
        { error: 'La sesión no pertenece a esta tienda' },
        { status: 400 },
      )
    }

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr

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

    // Smart-merge: check for existing PENDING items with same productId/serviceId AND same notes
    const mergeResults: { merged: boolean; itemId: number }[] = []
    const itemsToCreate: {
      storeId: number
      tableSessionId: number
      productId: number | null
      serviceId: number | null
      productName: string
      quantity: number
      unitPrice: number
      total: number
      notes: string | null
      status: string
    }[] = []

    for (const item of data.items) {
      const itemNotes = item.notes || null
      const itemId = item.productId || item.serviceId!

      // Build where clause for duplicate detection
      const duplicateWhere: Record<string, unknown> = {
        tableSessionId: sid,
        status: 'PENDING',
      }

      if (item.productId) {
        duplicateWhere.productId = item.productId
        duplicateWhere.serviceId = null
      } else {
        duplicateWhere.serviceId = item.serviceId
        duplicateWhere.productId = null
      }

      if (itemNotes === null) {
        duplicateWhere.notes = null
      } else {
        duplicateWhere.notes = itemNotes
      }

      const existingItem = await db.comandaItem.findFirst({
        where: duplicateWhere,
      })

      if (existingItem) {
        const newQuantity = existingItem.quantity + item.quantity
        const unitPrice = Number(existingItem.unitPrice)
        await db.comandaItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: newQuantity,
            total: unitPrice * newQuantity,
          },
        })
        mergeResults.push({ merged: true, itemId: existingItem.id })
      } else {
        if (item.productId) {
          const product = productMap.get(item.productId)!
          itemsToCreate.push({
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
          })
        } else {
          const service = serviceMap.get(item.serviceId!)!
          itemsToCreate.push({
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
          })
        }
        mergeResults.push({ merged: false, itemId: 0 }) // placeholder, will be filled after createMany
      }
    }

    // Create items that were not merged
    let createdCount = 0
    if (itemsToCreate.length > 0) {
      const result = await db.comandaItem.createMany({
        data: itemsToCreate,
      })
      createdCount = result.count

      // Fetch created items to get their IDs (they are the last createdCount items for this session)
      if (createdCount > 0) {
        const createdItems = await db.comandaItem.findMany({
          where: { tableSessionId: sid, status: 'PENDING' },
          orderBy: { id: 'desc' },
          take: createdCount,
          select: { id: true },
        })
        // Fill in the itemIds for non-merged results
        let createdIdx = 0
        for (let i = 0; i < mergeResults.length; i++) {
          if (!mergeResults[i].merged && createdIdx < createdItems.length) {
            mergeResults[i].itemId = createdItems[createdIdx].id
            createdIdx++
          }
        }
      }
    }

    const mergedCount = mergeResults.filter(r => r.merged).length
    const createdItemsList = mergeResults.filter(r => !r.merged)

    // Broadcast real-time event
    emitComandaItemsAdded(data.storeId, sid, session.barTableId)

    return NextResponse.json(
      {
        mergedCount,
        createdCount,
        results: mergeResults,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json({ error: 'Error al agregar items a la comanda' }, { status: 500 })
  }
}

// ─── PATCH: Update comanda items (status, quantity, notes) ────────

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
      select: { id: true, status: true, unitPrice: true },
    })
    const existingIds = new Set(existingItems.map((i) => i.id))

    const notFound = data.itemIds.filter((itemId) => !existingIds.has(itemId))
    if (notFound.length > 0) {
      return NextResponse.json(
        { error: `Item(s) con ID(s) ${notFound.join(', ')} no pertenecen a esta sesión` },
        { status: 400 },
      )
    }

    // If quantity is being updated, validate items are PENDING or SERVED
    if (data.quantity !== undefined) {
      const lockedItems = existingItems.filter(
        (i) => i.status === 'PAID' || i.status === 'CANCELLED',
      )
      if (lockedItems.length > 0) {
        return NextResponse.json(
          {
            error: `No se puede cambiar la cantidad de items pagados o cancelados (IDs: ${lockedItems.map(i => i.id).join(', ')})`,
          },
          { status: 400 },
        )
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (data.status) {
      updateData.status = data.status
    }

    // Update items individually if quantity is provided (need unitPrice per item)
    if (data.quantity !== undefined) {
      for (const item of existingItems) {
        const unitPrice = Number(item.unitPrice)
        await db.comandaItem.update({
          where: { id: item.id },
          data: {
            ...updateData,
            quantity: data.quantity,
            total: unitPrice * data.quantity,
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
          },
        })
      }

      return NextResponse.json({
        updated: existingItems.length,
        ...(data.status ? { status: data.status } : {}),
        quantity: data.quantity,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      })
    }

    // Bulk update for status and/or notes (no quantity change)
    if (data.notes !== undefined) {
      updateData.notes = data.notes
    }

    await db.comandaItem.updateMany({
      where: { id: { in: data.itemIds } },
      data: updateData,
    })

    // Broadcast real-time event
    emitComandaItemsUpdated(session.storeId, sid, session.barTableId, data.status)

    return NextResponse.json({
      updated: existingItems.length,
      ...(data.status ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PATCH /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar items de la comanda' },
      { status: 500 },
    )
  }
}

// ─── DELETE: Remove comanda items (only PENDING allowed) ──────────

export async function DELETE(
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
    const data = deleteComandaItemsSchema.parse(body)

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
      select: { id: true, status: true },
    })
    const existingIds = new Set(existingItems.map((i) => i.id))

    const notFound = data.itemIds.filter((itemId) => !existingIds.has(itemId))
    if (notFound.length > 0) {
      return NextResponse.json(
        { error: `Item(s) con ID(s) ${notFound.join(', ')} no pertenecen a esta sesión` },
        { status: 400 },
      )
    }

    // Only allow deleting PENDING items
    const nonPendingItems = existingItems.filter((i) => i.status !== 'PENDING')
    if (nonPendingItems.length > 0) {
      return NextResponse.json(
        {
          error: `Solo se pueden eliminar items pendientes. Los siguientes no son pendientes (IDs: ${nonPendingItems.map(i => i.id).join(', ')})`,
        },
        { status: 400 },
      )
    }

    // Delete all PENDING items
    await db.comandaItem.deleteMany({
      where: { id: { in: data.itemIds } },
    })

    // Broadcast real-time event
    emitComandaItemsRemoved(session.storeId, sid, session.barTableId)

    return NextResponse.json({ deleted: existingItems.length })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('DELETE /api/tables/sessions/[id]/comanda error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar items de la comanda' },
      { status: 500 },
    )
  }
}
