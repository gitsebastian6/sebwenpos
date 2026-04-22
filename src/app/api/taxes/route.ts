import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Colombian DIAN tax codes
const DIAN_TAX_CODES = [
  '01', // IVA General 19%
  '02', // IVA Reducido 5%
  '03', // IVA Exento 0%
  '04', // IVA Excluido
  '05', // Impoconsumo 8%
  '06', // ICA 0.8%
  '07', // ReteFuente
  '08', // ReteICA
  '09', // ReteIVA
] as const

const RATE_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const
const APPLY_TO_OPTIONS = ['PRODUCT', 'SERVICE', 'BOTH'] as const
const TAX_CATEGORIES = ['SALES_TAX', 'CONSUMPTION_TAX', 'WITHHOLDING', 'MUNICIPAL'] as const

const createTaxRateSchema = z.object({
  storeId: z.number().int().positive('El storeId es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio').max(200, 'El nombre no puede exceder 200 caracteres'),
  code: z.enum(DIAN_TAX_CODES, {
    errorMap: () => ({ message: 'Código DIAN inválido. Debe ser uno de: 01-09' }),
  }),
  rateType: z.enum(RATE_TYPES, {
    errorMap: () => ({ message: 'Tipo de tasa inválido. Use PERCENTAGE o FIXED_AMOUNT' }),
  }),
  rate: z.number().int().min(0, 'La tasa no puede ser negativa').max(1000000, 'La tasa excede el límite permitido'),
  applyTo: z.enum(APPLY_TO_OPTIONS).default('PRODUCT'),
  category: z.enum(TAX_CATEGORIES).default('SALES_TAX'),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional(),
})

// ─── GET: List all tax rates for a store ────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const storeId = searchParams.get('storeId')
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')

    if (!storeId) {
      return NextResponse.json({ error: 'El parámetro storeId es obligatorio' }, { status: 400 })
    }

    const sid = Number(storeId)

    const storeAccessErr = requireStoreAccess(req, sid)
    if (storeAccessErr) return storeAccessErr

    const where: Record<string, unknown> = {
      storeId: sid,
    }

    if (category) {
      where.category = category
    }

    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true'
    }

    const taxRates = await db.taxRate.findMany({
      where,
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { rate: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json(taxRates)
  } catch (error) {
    logger.error('GET /api/taxes error:', error)
    return NextResponse.json({ error: 'Error al obtener las tarifas de impuesto' }, { status: 500 })
  }
}

// ─── POST: Create a new tax rate ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createTaxRateSchema.parse(body)

    // Verify store access
    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr

    // Verify the store exists
    const store = await db.store.findUnique({ where: { id: data.storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 400 })
    }

    // Create the tax rate in a transaction to handle isDefault logic
    const taxRate = await db.$transaction(async (tx) => {
      // If this tax rate is set as default, unset any other default in the same category+store
      if (data.isDefault) {
        await tx.taxRate.updateMany({
          where: {
            storeId: data.storeId,
            category: data.category,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        })
      }

      // Create the new tax rate
      return tx.taxRate.create({
        data: {
          storeId: data.storeId,
          name: data.name,
          code: data.code,
          rateType: data.rateType,
          rate: data.rate,
          applyTo: data.applyTo,
          category: data.category,
          isActive: data.isActive,
          isDefault: data.isDefault,
          description: data.description || null,
        },
      })
    })

    return NextResponse.json(taxRate, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json(
        { error: 'Ya existe una tarifa de impuesto con ese código DIAN' },
        { status: 409 }
      )
    }
    logger.error('POST /api/taxes error:', error)
    return NextResponse.json({ error: 'Error al crear la tarifa de impuesto' }, { status: 500 })
  }
}
