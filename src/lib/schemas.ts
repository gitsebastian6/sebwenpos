// ---------------------------------------------------------------------------
// Sebwen POS — Shared Zod Schemas
// ---------------------------------------------------------------------------
// Common validation schemas used across multiple API endpoints.
// Import these in route files instead of defining inline schemas.
// ---------------------------------------------------------------------------

import { z } from 'zod'

// ─── Common Scalars ──────────────────────────────────────────────────────

export const positiveInt = z.coerce.number().int().positive('Debe ser un número positivo')
export const nonNegativeInt = z.coerce.number().int().min(0, 'Debe ser 0 o positivo')
export const positiveDecimal = z.coerce.number().positive('Debe ser un valor positivo')
export const nonNegativeDecimal = z.coerce.number().min(0, 'Debe ser 0 o mayor')

// ─── Colombian-specific ──────────────────────────────────────────────────

export const cedulaSchema = z
  .string()
  .min(6, 'Cédula mínimo 6 caracteres')
  .max(12, 'Cédula máximo 12 caracteres')
  .regex(/^[0-9]+$/, 'Cédula solo puede contener números')

export const nitSchema = z
  .string()
  .min(5, 'NIT mínimo 5 caracteres')
  .max(20, 'NIT máximo 20 caracteres')
  .regex(/^[0-9]+(-?[0-9kK])?$/, 'Formato de NIT inválido (ej: 900123456-1)')

export const phoneSchema = z
  .string()
  .regex(/^(\+57|57)?[3][0-9]{9}$/, 'Formato de celular colombiano inválido (ej: 3001234567)')
  .optional()
  .or(z.literal(''))

export const emailSchema = z.string().email('Email inválido').optional().or(z.literal(''))

// ─── Common Patterns ─────────────────────────────────────────────────────

export const storeIdSchema = z.coerce.number().int().positive('storeId requerido')

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
})

export const moneySchema = z.coerce
  .number()
  .min(0, 'El valor no puede ser negativo')
  .max(99_999_999, 'El valor excede el límite permitido')

export const nameSchema = z
  .string()
  .min(1, 'El nombre es obligatorio')
  .max(150, 'Nombre demasiado largo')
  .trim()

export const notesSchema = z.string().max(1000, 'Las notas son muy largas').optional().default('')

export const statusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'PENDING',
  'COMPLETED',
  'CANCELLED',
  'DRAFT',
  'PAID',
  'PARTIAL',
  'OVERDUE',
])

// ─── Order Item (shared by orders, quotations, purchases) ────────────────

export const orderItemSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  serviceId: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().int().min(1, 'Cantidad mínima 1'),
  unitPrice: positiveDecimal,
  notes: z.string().max(500).optional(),
  discount: nonNegativeDecimal.optional().default(0),
}).refine(
  (d) => d.productId || d.serviceId,
  { message: 'Cada item debe tener productId o serviceId', path: ['productId'] }
)

export const orderItemsArraySchema = z.array(orderItemSchema).min(1, 'Debe haber al menos un item')

// ─── Payment Method ──────────────────────────────────────────────────────

export const paymentMethodSchema = z.enum([
  'CASH',
  'CARD',
  'NEQUI',
  'DAVIPLATA',
  'BANCOLOMBIA',
  'TRANSFER',
  'MIXED',
  'CREDIT',
  'OTHER',
])

// ─── Parse Helper ────────────────────────────────────────────────────────

/**
 * Parse request body with Zod and return typed result or NextResponse error.
 * Usage: const data = await parseBody(request, mySchema)
 */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T; error: Response | null }> {
  try {
    const raw = await request.json()
    const data = schema.parse(raw)
    return { data, error: null }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.issues.map((i) => i.message).join('. ')
      return { data: null as unknown as T, error: new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
    }
    return { data: null as unknown as T, error: new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
  }
}

/**
 * Parse URL search params with Zod schema.
 */
export function parseSearchParams<T>(url: URL, schema: z.ZodType<T>): { data: T; error: Response | null } {
  try {
    const params = Object.fromEntries(url.searchParams.entries())
    const data = schema.parse(params)
    return { data, error: null }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.issues.map((i) => i.message).join('. ')
      return { data: null as unknown as T, error: new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
    }
    return { data: null as unknown as T, error: new Response(JSON.stringify({ error: 'Parámetros inválidos' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
  }
}
