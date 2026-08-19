import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/store/[storeId]
 * 
 * Información pública de una tienda para la tienda virtual.
 * Soporta ID numérico o slug (texto).
 * Solo expone datos seguros (sin config interna, sin DIAN, sin suscripción).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    const numId = parseInt(storeId)

    // Buscar por ID numérico o por slug
    const storeWhere = isNaN(numId)
      ? { storeSlug: storeId }
      : { id: numId }

    const store = await db.store.findFirst({
      where: storeWhere,
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        cityName: true,
        currencyCode: true,
        storeDescription: true,
        storeWhatsapp: true,
        storeActive: true,
        storeSlug: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Si la tienda virtual no está activa, mostrar página básica
    if (!store.storeActive) {
      return NextResponse.json({
        store: {
          id: store.id,
          name: store.name,
          phone: store.storeWhatsapp || store.phone,
          address: store.address,
          cityName: store.cityName,
          currencyCode: store.currencyCode,
          description: store.storeDescription,
          whatsapp: store.storeWhatsapp,
          slug: store.storeSlug,
          active: false,
        },
        categories: [],
        services: [],
      })
    }

    // Obtener categorías con productos activos que tengan stock
    const categories = await db.category.findMany({
      where: {
        storeId: store.id,
        products: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
        icon: true,
        products: {
          where: { isActive: true, currentStock: { gt: 0 } },
          select: {
            id: true,
            name: true,
            salePrice: true,
            unitLabel: true,
            description: true,
            imgUrl: true,
            sku: true,
            presentations: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                unitLabel: true,
                unitsPerPack: true,
                salePrice: true,
                barcode: true,
                sku: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Obtener servicios activos
    const services = await db.service.findMany({
      where: { storeId: store.id, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        phone: store.storeWhatsapp || store.phone,
        address: store.address,
        cityName: store.cityName,
        currencyCode: store.currencyCode,
        description: store.storeDescription,
        whatsapp: store.storeWhatsapp,
        slug: store.storeSlug,
        active: true,
      },
      categories,
      services,
    })
  } catch (error) {
    console.error('Public store API error:', error)
    return NextResponse.json({ error: 'Error al cargar la tienda' }, { status: 500 })
  }
}
