import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { defaultDialCode } from '@/lib/phone'

export const dynamic = 'force-dynamic'

// Config de domicilio expuesta al storefront (para mostrar el costo ANTES de pedir).
function deliveryConfig(store: {
  deliveryEnabled: boolean
  deliveryFee: number
  deliveryFreeAbove: number | null
  deliveryMinOrder: number
  acceptingOrders: boolean
}) {
  return {
    deliveryEnabled: store.deliveryEnabled,
    deliveryFee: store.deliveryFee,
    deliveryFreeAbove: store.deliveryFreeAbove,
    deliveryMinOrder: store.deliveryMinOrder,
    acceptingOrders: store.acceptingOrders,
  }
}

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
        countryCode: true,
        storeDescription: true,
        storeWhatsapp: true,
        storeActive: true,
        storeSlug: true,
        deliveryEnabled: true,
        deliveryFee: true,
        deliveryFreeAbove: true,
        deliveryMinOrder: true,
        acceptingOrders: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const dialCode = defaultDialCode({ countryCode: store.countryCode, currencyCode: store.currencyCode })

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
          dialCode,
          description: store.storeDescription,
          whatsapp: store.storeWhatsapp,
          slug: store.storeSlug,
          active: false,
          ...deliveryConfig(store),
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
            barcode: true,
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
        dialCode,
        description: store.storeDescription,
        whatsapp: store.storeWhatsapp,
        slug: store.storeSlug,
        active: true,
        ...deliveryConfig(store),
      },
      categories,
      services,
    })
  } catch (error) {
    console.error('Public store API error:', error)
    return NextResponse.json({ error: 'Error al cargar la tienda' }, { status: 500 })
  }
}
