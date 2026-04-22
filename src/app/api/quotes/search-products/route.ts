import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/quotes/search-products?storeId=X&q=QUERY&type=products|services|all
// Dedicated product/service search endpoint for the quotations creation flow.
// Searches by product name, SKU, and service name. Filtered by storeId.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = Number(searchParams.get('storeId'))
    const q = searchParams.get('q')?.trim() || ''
    const type = searchParams.get('type') || 'all' // products, services, or all

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const results: { products: any[]; services: any[] } = { products: [], services: [] }

    // Search products (by name or SKU)
    if ((type === 'all' || type === 'products') && q.length >= 1) {
      const productWhere: Record<string, unknown> = {
        storeId,
        isActive: true,
      }

      if (q) {
        productWhere.OR = [
          { name: { contains: q } },
          { sku: { contains: q } },
        ]
      }

      const products = await db.product.findMany({
        where: productWhere,
        select: {
          id: true,
          name: true,
          sku: true,
          salePrice: true,
          currentStock: true,
          category: { select: { name: true } },
          taxRate: { select: { code: true, rate: true, rateType: true } },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        take: 20,
      })
      results.products = products.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku ?? null,
        salePrice: Number(p.salePrice),
        currentStock: p.currentStock,
        category: p.category ? { name: p.category.name } : null,
        taxRate: p.taxRate ? { code: p.taxRate.code, rate: p.taxRate.rate, rateType: p.taxRate.rateType } : null,
      }))
    }

    // Search services (by name)
    if ((type === 'all' || type === 'services') && q.length >= 1) {
      const serviceWhere: Record<string, unknown> = {
        storeId,
        isActive: true,
      }

      if (q) {
        serviceWhere.name = { contains: q }
      }

      const services = await db.service.findMany({
        where: serviceWhere,
        select: {
          id: true,
          name: true,
          price: true,
        },
        orderBy: { name: 'asc' },
        take: 10,
      })
      results.services = services.map(s => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
      }))
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('GET /api/quotes/search-products error:', error)
    return NextResponse.json({ error: 'Error al buscar productos' }, { status: 500 })
  }
}
