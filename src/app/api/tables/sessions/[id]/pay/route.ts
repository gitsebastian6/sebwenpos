import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateOrderNumber } from '@/lib/auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const paySessionSchema = z.object({
  storeId: z.number().int().positive(),
  itemIds: z.array(z.number().int().positive()).min(1, 'Debe seleccionar al menos un item'),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO']),
 customerId: z.number().int().positive().nullable().optional(),
  tipAmount: z.number().int().min(0).default(0),
})

// ─── POST: Process payment for comanda items ──────────────────────

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
    const data = paySessionSchema.parse(body)

    // Verify session exists and is OPEN
    const session = await db.tableSession.findUnique({
      where: { id: sid },
      include: {
        barTable: { select: { number: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    })
    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }
    if (session.status !== 'OPEN') {
      return NextResponse.json({ error: 'La sesión está cerrada' }, { status: 400 })
    }
    if (session.storeId !== data.storeId) {
      return NextResponse.json(
        { error: 'La sesión no pertenece a esta tienda' },
        { status: 400 },
      )
    }

    // Get comanda items to pay — must be SERVED or PENDING (not already PAID or CANCELLED)
    const comandaItems = await db.comandaItem.findMany({
      where: {
        id: { in: data.itemIds },
        tableSessionId: sid,
        status: { in: ['PENDING', 'SERVED'] },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            salePrice: true,
            costPrice: true,
            currentStock: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    })

    if (comandaItems.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron items elegibles para pagar (deben estar PENDIENTES o SERVIDOS)' },
        { status: 400 },
      )
    }

    // Check all requested item IDs were found
    const foundIds = new Set(comandaItems.map((i) => i.id))
    const missingIds = data.itemIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Item(s) con ID(s) ${missingIds.join(', ')} no encontrados o no son elegibles para pago` },
        { status: 400 },
      )
    }

    // Verify customer belongs to store if provided (for CREDIT payment)
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, storeId: data.storeId },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
      }
    }

    // Calculate totals
    const subtotal = comandaItems.reduce((sum, item) => sum + Number(item.total), 0)
    const tipAmount = data.tipAmount || 0
    const total = subtotal + tipAmount

    // Tip is only allowed for non-credit orders
    if (tipAmount > 0 && (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO')) {
      return NextResponse.json(
        { error: 'No se puede agregar propina a una venta fiada' },
        { status: 400 },
      )
    }

    // Separate product and service items
    const productComandaItems = comandaItems.filter((i) => i.productId)
    const serviceComandaItems = comandaItems.filter((i) => i.serviceId)

    // Build order item data
    const orderItemsData = comandaItems.map((item) => ({
      productId: item.productId ?? null,
      serviceId: item.serviceId ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalRow: Number(item.total),
    }))

    const orderNumber = generateOrderNumber()
    const tableLabel = session.barTable.name || `Mesa ${session.barTable.number}`

    const order = await db.$transaction(async (tx) => {
      // 1. Create the order linked to this table session
      const createdOrder = await tx.order.create({
        data: {
          storeId: data.storeId,
          customerId: data.customerId ?? session.customerId ?? null,
          tableSessionId: sid,
          orderNumber,
          subtotal: subtotal,
          tipAmount,
          total,
          status: (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') ? 'CREDIT' : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          notes: `Pago ${tableLabel} - Sesión #${sid}`,
          orderItems: { create: orderItemsData },
        },
        include: {
          customer: { select: { id: true, name: true } },
          orderItems: {
            include: {
              product: { select: { name: true } },
              service: { select: { name: true } },
            },
          },
        },
      })

      // 2. Mark comanda items as PAID
      await tx.comandaItem.updateMany({
        where: { id: { in: comandaItems.map((i) => i.id) } },
        data: { status: 'PAID' },
      })

      // 3. Create inventory movements and decrement stock (only for product items)
      for (const item of productComandaItems) {
        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            quantity: -item.quantity,
            movementType: 'SALE',
            referenceId: createdOrder.id,
            notes: `Venta ${orderNumber} - ${tableLabel}`,
          },
        })
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        })
      }

      // 4. Create ServiceTransactions for service items
      for (const item of serviceComandaItems) {
        await tx.serviceTransaction.create({
          data: {
            storeId: data.storeId,
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            totalAmount: Number(item.total),
            notes: `Venta ${orderNumber} - ${tableLabel}`,
            status: 'COMPLETED',
          },
        })
      }

      // 5. Create journal entries (double-entry: DEBIT caja, CREDIT ventas)
      if (data.paymentMethod !== 'CREDIT' && data.paymentMethod !== 'FIADO') {
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'ASSET', isDefault: true },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })

        // DEBIT Caja for full total (subtotal + tip)
        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cajaAccount.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta ${orderNumber} - ${tableLabel}${tipAmount > 0 ? ` + Propina $${tipAmount.toLocaleString()}` : ''}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Ventas for subtotal
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Propina for tip amount (if any)
        if (tipAmount > 0) {
          const propinaAccount = await tx.ledgerAccount.findFirst({
            where: { storeId: data.storeId, name: 'Propina' },
          })
          if (propinaAccount) {
            await tx.journalEntry.create({
              data: {
                storeId: data.storeId,
                ledgerAccountId: propinaAccount.id,
                amount: tipAmount,
                direction: 'CREDIT',
                description: `Propina venta ${orderNumber} - ${tableLabel}`,
                referenceType: 'ORDER',
                referenceId: createdOrder.id,
              },
            })
          }
        }
      } else {
        // CREDIT payment: create accounts receivable journal entry
        const customerId = data.customerId ?? session.customerId
        const cuentasPorCobrar = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: { contains: 'Cuentas por Cobrar' } },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })

        if (cuentasPorCobrar) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cuentasPorCobrar.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta fiada ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: total,
              direction: 'CREDIT',
              description: `Venta fiada ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }

        // Update customer debt if customerId is provided
        if (customerId) {
          await tx.customer.update({
            where: { id: customerId },
            data: { totalDebt: { increment: subtotal } },
          })
        }
      }

      return createdOrder
    })

    // Calculate profitability (only for product items — services have no costPrice)
    const profitability = productComandaItems.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      costPrice: Number(item.product?.costPrice ?? 0),
      revenue: Number(item.total),
      cogs: Number(item.product?.costPrice ?? 0) * item.quantity,
      grossProfit: (Number(item.unitPrice) - Number(item.product?.costPrice ?? 0)) * item.quantity,
    }))

    const totalCogs = profitability.reduce((sum, p) => sum + p.cogs, 0)
    const totalGrossProfit = profitability.reduce((sum, p) => sum + p.grossProfit, 0)

    return NextResponse.json(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        subtotal: Number(order.subtotal),
        tipAmount: Number(order.tipAmount),
        total: Number(order.total),
        tableSessionId: sid,
        customer: order.customer,
        orderItems: order.orderItems.map((item) => ({
          id: item.id,
          productId: item.productId ?? null,
          serviceId: item.serviceId ?? null,
          productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalRow: Number(item.totalRow),
          isService: !!item.serviceId,
        })),
        profitability,
        totalCogs,
        totalGrossProfit,
        createdAt: order.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/tables/sessions/[id]/pay error:', error)
    return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 })
  }
}
