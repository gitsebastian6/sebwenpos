import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/super-admin/stores/[id]/seed
 * Crea los datos iniciales (IVA, categorías, roles) para una tienda existente
 * que no los tenga.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const storeId = Number(id)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

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

    let created = 0

    // Create missing tax rates (check by code)
    const existingTaxCodes = (await db.taxRate.findMany({
      where: { storeId },
      select: { code: true },
    })).map(t => t.code)

    const taxRatesToCreate = [
      {
        storeId, name: 'IVA 19%', code: '01', rateType: 'PERCENTAGE' as const, rate: 19,
        applyTo: 'BOTH' as const, category: 'SALES_TAX' as const, isActive: true, isDefault: true,
        description: 'Impuesto al Valor Agregado - Tarifa general (bienes y servicios gravados)',
      },
      {
        storeId, name: 'IVA 5%', code: '02', rateType: 'PERCENTAGE' as const, rate: 5,
        applyTo: 'BOTH' as const, category: 'SALES_TAX' as const, isActive: true, isDefault: false,
        description: 'IVA Tarifa reducida - Actividades económicas de interés social',
      },
      {
        storeId, name: 'IVA 0% Exento', code: '03', rateType: 'PERCENTAGE' as const, rate: 0,
        applyTo: 'BOTH' as const, category: 'SALES_TAX' as const, isActive: true, isDefault: false,
        description: 'Bienes y servicios exentos de IVA (art. 477-478 ET)',
      },
      {
        storeId, name: 'IVA Excluido', code: '04', rateType: 'PERCENTAGE' as const, rate: 0,
        applyTo: 'BOTH' as const, category: 'SALES_TAX' as const, isActive: true, isDefault: false,
        description: 'Servicios excluidos de IVA (art. 476 ET) - No son hechos gravados',
      },
    ].filter(t => !existingTaxCodes.includes(t.code))

    if (taxRatesToCreate.length > 0) {
      await db.taxRate.createMany({ data: taxRatesToCreate })
      created += taxRatesToCreate.length
    }

    // Create missing roles
    const existingRoles = (await db.role.findMany({
      where: { storeId },
      select: { name: true },
    })).map(r => r.name)

    const rolesToCreate = [
      { storeId, name: 'Administrador', description: 'Acceso completo a todos los módulos del sistema', permissions: adminPermissions, isDefault: false, isActive: true },
      { storeId, name: 'Cajero', description: 'Acceso a punto de venta y ventas básicas', permissions: cajeroPermissions, isDefault: true, isActive: true },
    ].filter(r => !existingRoles.includes(r.name))

    if (rolesToCreate.length > 0) {
      for (const role of rolesToCreate) {
        await db.role.create({ data: role })
        created++
      }
    }

    // Create missing categories
    const existingCats = (await db.category.findMany({
      where: { storeId },
      select: { name: true },
    })).map(c => c.name)

    const catsToCreate = [
      { storeId, name: 'General' },
      { storeId, name: 'Bebidas' },
      { storeId, name: 'Alimentos' },
      { storeId, name: 'Servicios' },
      { storeId, name: 'Otros' },
    ].filter(c => !existingCats.includes(c.name))

    if (catsToCreate.length > 0) {
      await db.category.createMany({ data: catsToCreate })
      created += catsToCreate.length
    }

    return NextResponse.json({
      message: `Seed completado: ${created} registros creados para "${store.name}"`,
      created,
    })
  } catch (error) {
    logger.error('Seed store error:', error)
    return NextResponse.json({ error: 'Error al sembrar datos' }, { status: 500 })
  }
}
