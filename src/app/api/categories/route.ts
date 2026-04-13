import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createCategorySchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  icon: z.string().max(100).nullable().optional(),
})

// GET /api/categories?storeId=X
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const categories = await db.category.findMany({
      where: { storeId: Number(storeId) },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(categories)
  } catch (error) {
    console.error('GET /api/categories error:', error)
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 })
  }
}

// POST /api/categories
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createCategorySchema.parse(body)

    const category = await db.category.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        icon: data.icon || null,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }
    console.error('POST /api/categories error:', error)
    return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 })
  }
}
