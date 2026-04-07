import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, sanitizeUser } from '@/lib/auth'
import { z } from 'zod'

const registerSchema = z.object({
  phone: z.string().min(10, 'Teléfono mínimo 10 dígitos'),
  password: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  fullName: z.string().min(2, 'Nombre es requerido'),
  storeName: z.string().min(2, 'Nombre de tienda es requerido'),
  email: z.string().email().optional().or(z.literal('')),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = registerSchema.parse(body)

    const existing = await db.user.findUnique({ where: { phone: data.phone } })
    if (existing) {
      return NextResponse.json({ error: 'El teléfono ya está registrado' }, { status: 400 })
    }

    const passwordHash = await hashPassword(data.password)

    const user = await db.user.create({
      data: {
        phone: data.phone,
        email: data.email || null,
        passwordHash,
        fullName: data.fullName,
        role: 'OWNER',
        store: {
          create: {
            name: data.storeName,
            currencyCode: 'MXN',
            countryCode: 'MX',
          },
        },
      },
      include: { store: true },
    })

    const storeId = user.store!.id
    await db.ledgerAccount.createMany({
      data: [
        { storeId, name: 'Caja General', type: 'ASSET', isDefault: true },
        { storeId, name: 'Banco', type: 'ASSET', isDefault: false },
        { storeId, name: 'Ventas', type: 'INCOME', isDefault: false },
        { storeId, name: 'Compras', type: 'EXPENSE', isDefault: false },
        { storeId, name: 'Gastos Generales', type: 'EXPENSE', isDefault: false },
        { storeId, name: 'Inventario', type: 'ASSET', isDefault: false },
        { storeId, name: 'Cuentas por Cobrar', type: 'ASSET', isDefault: false },
        { storeId, name: 'Capital', type: 'EQUITY', isDefault: false },
      ],
    })

    await db.category.createMany({
      data: [
        { storeId, name: 'Abarrotes' },
        { storeId, name: 'Bebidas' },
        { storeId, name: 'Lácteos' },
        { storeId, name: 'Limpieza' },
        { storeId, name: 'Snacks' },
        { storeId, name: 'Otros' },
      ],
    })

    const safeUser = sanitizeUser(user)
    const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64')

    return NextResponse.json({ user: safeUser, store: user.store, token })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Error al registrar usuario' }, { status: 500 })
  }
}
