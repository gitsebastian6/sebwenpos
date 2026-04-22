import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { logStoreEvent } from '@/lib/event-logger'

export const dynamic = 'force-dynamic'

const createBranchSchema = z.object({
  name: z.string().min(2, 'Nombre de sucursal requerido (mín. 2 caracteres)'),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  legalName: z.string().optional().or(z.literal('')),
  nit: z.string().optional().or(z.literal('')),
})

/**
 * GET /api/super-admin/stores/[id]/branches
 * Lista todas las sucursales de una tienda
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const parentStoreId = parseInt(storeId, 10)
    if (isNaN(parentStoreId)) {
      return NextResponse.json({ error: 'ID de tienda inválido' }, { status: 400 })
    }

    const parentStore = await db.store.findUnique({
      where: { id: parentStoreId },
      select: {
        id: true, name: true,
        subscription: {
          include: { plan: { select: { id: true, name: true, maxStores: true, features: true } } },
        },
      },
    })
    if (!parentStore) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const branches = await db.store.findMany({
      where: { parentStoreId },
      select: {
        id: true, name: true, legalName: true, nit: true,
        address: true, phone: true, createdAt: true,
        user: { select: { id: true, cedula: true, fullName: true, email: true, phone: true } },
        _count: { select: { employees: true, products: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Centralized subscription: branches inherit parent's subscription
    const planFeatures = parentStore.subscription?.plan
      ? JSON.parse(parentStore.subscription?.plan.features || '{}')
      : {}

    return NextResponse.json({
      branches,
      parentSubscription: {
        planName: parentStore.subscription?.plan?.name || null,
        status: parentStore.subscription?.status || null,
        maxStores: parentStore.subscription?.plan?.maxStores ?? 1,
        multiStoreEnabled: planFeatures.multiStore === true,
      },
    })
  } catch (error) {
    logger.error('Error listing branches:', error)
    return NextResponse.json({ error: 'Error al listar sucursales' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/stores/[id]/branches
 * Crea una nueva sucursal para la tienda indicada.
 *
 * REGLAS DE NEGOCIO:
 * 1. Solo planes con multiStore=true pueden crear sucursales (Empresarial).
 * 2. No se puede exceder maxStores del plan.
 * 3. Las sucursales NO crean suscripción independiente — heredan la del padre.
 * 4. El OWNER del padre puede acceder a todas las sucursales con las mismas credenciales.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const parentStoreId = parseInt(storeId, 10)
    if (isNaN(parentStoreId)) {
      return NextResponse.json({ error: 'ID de tienda inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = createBranchSchema.parse(body)

    // ── Fetch parent store with plan features ──
    const parentStore = await db.store.findUnique({
      where: { id: parentStoreId },
      include: {
        user: true,
        subscription: {
          include: { plan: true },
        },
      },
    })
    if (!parentStore) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // ── GATE 1: Check multiStore feature ──
    const planFeatures = parentStore.subscription?.plan
      ? JSON.parse(parentStore.subscription?.plan.features || '{}')
      : {}

    if (planFeatures.multiStore !== true) {
      return NextResponse.json({
        error: 'La funcionalidad Multi-Tienda requiere el plan Empresarial. El plan actual no permite crear sucursales.',
        currentPlan: parentStore.subscription?.plan?.name || 'Sin plan',
        requiredPlan: 'Empresarial',
        code: 'MULTI_STORE_REQUIRED',
      }, { status: 403 })
    }

    // ── GATE 2: Check maxStores limit ──
    const maxStores = parentStore.subscription?.plan?.maxStores ?? 1
    const existingBranches = await db.store.count({
      where: { parentStoreId },
    })
    if (existingBranches >= maxStores) {
      return NextResponse.json({
        error: `Límite de sucursales alcanzado. Tu plan permite máximo ${maxStores} tienda${maxStores !== 1 ? 's' : ''} (ya tienes ${existingBranches}).`,
        currentCount: existingBranches,
        maxStores,
        code: 'MAX_STORES_REACHED',
      }, { status: 403 })
    }

    // ── Create branch (NO independent subscription) ──
    const adminPermissions = JSON.stringify({
      dashboard: true, pos: true, tables: true, products: true,
      customers: true, providers: true, orders: true, invoices: true,
      inventory: true, accounting: true, services: true, reports: true,
      settings: true, quotations: true, manageEmployees: true, manageRoles: true,
    })
    const cajeroPermissions = JSON.stringify({
      dashboard: true, pos: true, orders: true, quotations: true,
      customers: true, products: false, providers: false,
      invoices: false, inventory: false, accounting: false,
      services: false, reports: false, settings: false,
      manageEmployees: false, manageRoles: false, tables: true,
    })

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          cedula: `${parentStore.user.cedula}-S`,
          phone: parentStore.user.phone,
          email: parentStore.user.email,
          passwordHash: parentStore.user.passwordHash,
          fullName: parentStore.user.fullName,
          role: 'OWNER',
          store: {
            create: {
              name: data.name,
              legalName: data.legalName || parentStore.legalName || null,
              nit: data.nit || parentStore.nit || null,
              address: data.address || null,
              phone: data.phone || null,
              currencyCode: parentStore.currencyCode || 'COP',
              countryCode: parentStore.countryCode || 'CO',
              parentStoreId,
            },
          },
        },
        include: { store: true },
      })

      const sid = user.store!.id

      await tx.ledgerAccount.createMany({ data: [
        { storeId: sid, name: 'Caja General', type: 'ASSET', isDefault: true },
        { storeId: sid, name: 'Banco', type: 'ASSET', isDefault: false },
        { storeId: sid, name: 'Ventas', type: 'INCOME', isDefault: false },
        { storeId: sid, name: 'Comisiones', type: 'INCOME', isDefault: false },
        { storeId: sid, name: 'Compras', type: 'EXPENSE', isDefault: false },
        { storeId: sid, name: 'Gastos Generales', type: 'EXPENSE', isDefault: false },
        { storeId: sid, name: 'Inventario', type: 'ASSET', isDefault: false },
        { storeId: sid, name: 'Cuentas por Cobrar', type: 'ASSET', isDefault: false },
        { storeId: sid, name: 'Capital', type: 'EQUITY', isDefault: false },
      ]})

      await tx.category.createMany({ data: [
        { storeId: sid, name: 'General' }, { storeId: sid, name: 'Bebidas' },
        { storeId: sid, name: 'Alimentos' }, { storeId: sid, name: 'Servicios' },
        { storeId: sid, name: 'Otros' },
      ]})

      await tx.taxRate.createMany({ data: [
        { storeId: sid, name: 'IVA 19%', code: '01', rateType: 'PERCENTAGE', rate: 19, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: true, description: 'IVA Tarifa general' },
        { storeId: sid, name: 'IVA 5%', code: '02', rateType: 'PERCENTAGE', rate: 5, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false, description: 'IVA Tarifa reducida' },
        { storeId: sid, name: 'IVA 0% Exento', code: '03', rateType: 'PERCENTAGE', rate: 0, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false, description: 'Bienes exentos de IVA' },
        { storeId: sid, name: 'IVA Excluido', code: '04', rateType: 'PERCENTAGE', rate: 0, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false, description: 'Servicios excluidos de IVA' },
      ]})

      await tx.role.create({ data: { storeId: sid, name: 'Administrador', description: 'Acceso completo', permissions: adminPermissions, isDefault: false, isActive: true } })
      await tx.role.create({ data: { storeId: sid, name: 'Cajero', description: 'Punto de venta', permissions: cajeroPermissions, isDefault: true, isActive: true } })

      // ⚠️ NO subscription created — branches inherit parent's subscription

      return user
    })

    // ─── Event logging (fire-and-forget) ───
    await logStoreEvent(result.store!.id, 'BRANCH_CREATED', { metadata: { branchName: data.name, parentStoreId } })

    return NextResponse.json({
      branch: result.store,
      message: `Sucursal "${data.name}" creada exitosamente. Hereda la suscripción "${parentStore.subscription?.plan?.name || '—'}" de la tienda principal.`,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    logger.error('Create branch error:', error)
    return NextResponse.json({ error: 'Error al crear sucursal' }, { status: 500 })
  }
}
