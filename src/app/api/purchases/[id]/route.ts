import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: Single purchase with items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const purchase = await db.purchase.findUnique({
      where: { id: pid },
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
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      id: purchase.id,
      storeId: purchase.storeId,
      providerId: purchase.providerId,
      provider: purchase.provider
        ? { id: purchase.provider.id, name: purchase.provider.name }
        : null,
      invoiceNumber: purchase.invoiceNumber,
      date: purchase.date.toISOString(),
      notes: purchase.notes,
      total: purchase.total,
      status: purchase.status,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
      purchaseItems: purchase.purchaseItems.map((item) => ({
        id: item.id,
        purchaseId: item.purchaseId,
        productId: item.productId,
        product: { id: item.product.id, name: item.product.name },
        quantity: item.quantity,
        unitCost: item.unitCost,
        total: item.total,
      })),
    })
  } catch (error) {
    console.error('GET /api/purchases/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener compra' }, { status: 500 })
  }
}

// DELETE: Cancel a purchase (soft delete - set status to CANCELLED)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const purchase = await db.purchase.findUnique({
      where: { id: pid },
      include: {
        purchaseItems: true,
      },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    if (purchase.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Esta compra ya fue cancelada' },
        { status: 400 },
      )
    }

    // Cancel purchase in a transaction
    await db.$transaction(async (tx) => {
      // Update purchase status
      await tx.purchase.update({
        where: { id: pid },
        data: { status: 'CANCELLED' },
      })

      // For each item: decrement stock and create adjustment movement
      for (const item of purchase.purchaseItems) {
        // Decrement product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: item.quantity },
          },
        })

        // Create inventory adjustment movement (negative quantity)
        await tx.inventoryMovement.create({
          data: {
            storeId: purchase.storeId,
            productId: item.productId,
            quantity: -item.quantity,
            movementType: 'ADJUSTMENT',
            referenceId: pid,
            notes: `Compra cancelada #${pid}`,
          },
        })
      }
    })

    return NextResponse.json({ message: 'Compra cancelada exitosamente' })
  } catch (error) {
    console.error('DELETE /api/purchases/[id] error:', error)
    return NextResponse.json({ error: 'Error al cancelar compra' }, { status: 500 })
  }
}
